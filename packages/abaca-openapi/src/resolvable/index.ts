import {assert, check} from '@opvious/stl-errors';
import {PosixPath, ResourceLoader} from '@opvious/stl-utils/files';
import {ifPresent} from '@opvious/stl-utils/functions';
import {mapValues} from '@opvious/stl-utils/objects';
import {Resolver} from '@stoplight/json-ref-resolver';
import {AsyncOrSync} from 'ts-essentials';
import URI from 'urijs'; // Needed because of the resolver library.
import YAML from 'yaml';

import {errors} from './index.errors.js';

/** Loads and fully resolves a schema */
export async function loadResolvableResource<V = unknown>(
  pp: PosixPath,
  opts?: {
    /** Custom resource loader. */
    readonly loader?: ResourceLoader;

    /**
     * Additional reference resolvers. By default only `resource` refs are
     * supported.
     */
    readonly resolvers?: ReferenceResolvers;

    /** Optional function called each time a referenced resource is resolved. */
    readonly onResolvedReference?: (r: ResolvedResource) => void;
  }
): Promise<V> {
  const loader = opts?.loader ?? ResourceLoader.create({root: process.cwd()});

  const {url: rootUrl, contents} = await loader.load(pp);
  const parsed = YAML.parse(contents);
  const rootId = resourceUrl(parsed.$id);

  let seqno = 1;
  const refUrls = new Map<number, ResourceUrl>();

  const resolver = new Resolver({
    dereferenceInline: true,
    resolvers: {
      ...ifPresent(opts?.resolvers, (r) =>
        mapValues(r, (fn) => ({resolve: fn}))
      ),
      resource: {
        resolve: async () => {
          if (!rootId) {
            throw errors.missingResolvableId(rootUrl);
          }
          return resourceSymbol;
        },
      },
    },
    transformRef: (p) => {
      const {ref, uri} = p;
      const base = resourceUrl(uri);
      const parents = base?.searchParams.getAll(QueryKey.PARENT) ?? [];
      if (base) {
        base.search = '';
      }

      const target = ifPresent(ref, (r) => resourceUrl(r, base));
      if (target == null) {
        return ref;
      }
      assert(base, 'Unexpected or missing base URI:', uri);

      const n = seqno++;
      refUrls.set(n, new URL(target));
      target.search = '';
      target.searchParams.set(QueryKey.SEQNO, '' + n);

      for (const p of parents) {
        target.searchParams.append(QueryKey.PARENT, p);
      }
      const name = packageName(target);
      if (name !== packageName(base)) {
        target.searchParams.append(QueryKey.PARENT, name);
      }
      return new URI('' + target);
    },
    parseResolveResult: async (p) => {
      if (p.result !== resourceSymbol) {
        // Custom resolver, expected to return a YAML string
        assert(
          typeof p.result == 'string',
          'Unexpected resolver result: %j',
          p.result
        );
        return {result: YAML.parse(p.result)};
      }

      const target = resourceUrl(p.targetAuthority);
      assert(target, 'Unexpected target URI:', p.targetAuthority);

      let scoped = loader;
      const parents = target.searchParams.getAll(QueryKey.PARENT);
      for (const p of parents) {
        scoped = scoped.scopedToDependency(p);
      }
      const {contents} = await scoped.load(target.pathname.slice(1));
      const doc = parseReferenceContents(target, contents);

      const n = +check.isNumeric(target.searchParams.get(QueryKey.SEQNO));
      const ru = refUrls.get(n);
      assert(ru, 'Missing resource URL');
      opts?.onResolvedReference?.({url: ru, document: doc, parents});
      refUrls.delete(n);

      return {result: doc.toJS()};
    },
  });

  const resolved = await resolver.resolve(parsed, {baseUri: '' + rootId});
  if (resolved.errors.length) {
    throw errors.unresolvableResource(rootUrl, resolved.errors);
  }
  return resolved.result;
}

/** Resolvers, keyed by scheme (e.g. `http`, `https`) */
export interface ReferenceResolvers {
  readonly [scheme: string]: (url: URL) => AsyncOrSync<string>;
}

export interface ResolvedResource {
  readonly url: ResourceUrl;
  readonly parents: ReadonlyArray<string>;
  readonly document: YAML.Document;
}

/** Protocol used for resolvable references. */
export const RESOURCE_PROTOCOL = 'resource:';

type ResourceUrl = URL;

enum QueryKey {
  // Key used to identify each reference
  SEQNO = 'n',
  // Key used to store dependency information in authorities
  PARENT = 'p',
}

function parseReferenceContents(
  ru: ResourceUrl,
  contents: string
): YAML.Document {
  const doc = YAML.parseDocument(contents);
  const id = doc.get('$id');
  try {
    const declared = resourceUrl(id);
    assert(declared != null, 'ID %s is not a valid resource URL', id);
    const expected = new URL(ru);
    expected.search = '';
    assert('' + declared === '' + expected, 'ID %s doesn\'t match', id);
  } catch (cause) {
    throw errors.invalidResolvedResource(ru, cause);
  }
  return doc;
}

// Sentinel used to detect resource references
const resourceSymbol = Symbol('resolvableResource');

function resourceUrl(u: unknown, base?: ResourceUrl): ResourceUrl | undefined {
  assert(!base?.search && !base?.hash, 'Unexpected base: %s', base);
  const s = '' + u; // Convert URI to string
  if (s.startsWith('#')) {
    return undefined; // Use default local pointer logic
  }
  let ret;
  try {
    ret = new URL(s, base);
  } catch (_err) {
    return undefined;
  }
  if (ret.protocol !== RESOURCE_PROTOCOL) {
    return undefined;
  }
  if (!ret.hostname && base) {
    ret.hostname = base.hostname;
    ret.username = base.username;
  }
  return ret;
}

function packageName(ru: ResourceUrl): string {
  const scope = ru.username;
  const name = ru.hostname;
  return scope ? `@${scope}/${name}` : name;
}
