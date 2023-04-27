import {assert} from '@opvious/stl-errors';
import {PosixPath, ResourceLoader} from '@opvious/stl-utils/files';
import {ifPresent} from '@opvious/stl-utils/functions';
import {Resolver} from '@stoplight/json-ref-resolver';
import derefSync from 'json-schema-deref-sync';
import URI from 'urijs'; // Needed because of the resolver library.
import YAML from 'yaml';

import {errors} from './index.errors.js';

/** Loads and fully resolves a schema. Only `resource:` refs are supported. */
export async function loadResolvableResource(
  pp: PosixPath,
  opts?: {
    /** Custom resource loader. */
    readonly loader?: ResourceLoader;
    /**
     * Remove all keys starting with `$` in the final output. This can be useful
     * when parsing OpenAPI schemas which do not accept them.
     */
    readonly stripDollarKeys?: boolean;
  }
): Promise<LoadedResolvableResource> {
  const loader = opts?.loader ?? ResourceLoader.create({root: process.cwd()});

  const {url: rootUrl, contents} = await loader.load(pp);
  const parsed = YAML.parse(contents);
  const rootId = resourceUrl(parsed.$id);
  const resolvables: Resolvable[] = [
    {authority: '' + (rootId ?? rootUrl), contents},
  ];

  const resolver = new Resolver({
    dereferenceInline: true,
    resolvers: {
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
      const target = ifPresent(ref, resourceUrl);
      if (target == null) {
        return ref;
      }
      const base = resourceUrl(uri);
      assert(base, 'Unexpected base URI:', uri);
      for (const dep of base.searchParams.getAll(DEPENDENCY_QUERY_KEY)) {
        target.searchParams.append(DEPENDENCY_QUERY_KEY, dep);
      }
      const name = packageName(target);
      if (name !== packageName(base)) {
        target.searchParams.append(DEPENDENCY_QUERY_KEY, name);
      }
      return new URI('' + target);
    },
    parseResolveResult: async (p) => {
      if (p.result !== resourceSymbol) {
        return p;
      }
      const target = resourceUrl(p.targetAuthority);
      assert(target, 'Unexpected target URI:', target);
      let scoped = loader;
      for (const dep of target.searchParams.getAll(DEPENDENCY_QUERY_KEY)) {
        scoped = scoped.scopedToDependency(dep);
      }
      const {contents} = await scoped.load(target.pathname.slice(1));
      resolvables.push({authority: '' + target, contents});
      return {result: parseReferenceContents(target, contents)};
    },
  });

  const resolved = await resolver.resolve(parsed, {baseUri: '' + rootId});
  if (resolved.errors.length) {
    throw errors.unresolvableResource(rootUrl, resolved.errors);
  }
  const doc = new YAML.Document(resolved.result);
  if (opts?.stripDollarKeys) {
    YAML.visit(doc.contents, {
      Pair: (_, pair) => {
        const key = (pair.key as any)?.value;
        return typeof key == 'string' && key.startsWith('$')
          ? YAML.visit.REMOVE
          : undefined;
      },
    });
  }
  return {resolved: doc, resolvables};
}

/** A resolved resource which may contain references to other resources. */
export interface LoadedResolvableResource {
  /** The assembled and fully resolved root value. */
  readonly resolved: YAML.Document;

  /**
   * All resources which were referenced (directly or indirectly) by the root
   * value. The root is always the first. This field may be passed into
   * `combineResolvables` to reproduce the final `resolved` result
   * synchronously.
   */
  readonly resolvables: ReadonlyArray<Resolvable>;
}

/** A part of a resource resolution graph. */
export interface Resolvable {
  /** The resource's reference, or ID for the root. */
  readonly authority: string;

  /** The resource's contents. */
  readonly contents: string;
}

/** Protocol used for resolvable references. */
export const RESOURCE_PROTOCOL = 'resource:';

type ResourceUrl = URL;

// Key used to store dependency information in authorities
const DEPENDENCY_QUERY_KEY = 'd';

function parseReferenceContents(ru: ResourceUrl, contents: string): unknown {
  const parsed = YAML.parse(contents);
  const id = parsed.$id;
  try {
    const declared = resourceUrl(id);
    assert(declared != null, 'ID %s is not a valid resource URL', id);
    const expected = new URL(ru);
    expected.search = '';
    assert('' + declared === '' + expected, 'ID %s doesn\'t match', id);
  } catch (cause) {
    throw errors.invalidResolvedResource(ru, cause);
  }
  delete parsed.$id;
  return parsed;
}

// Sentinel used to detect resource references
const resourceSymbol = Symbol('resolvableResource');

function resourceUrl(u: unknown): ResourceUrl | undefined {
  let ret;
  try {
    ret = new URL('' + u);
  } catch (_err) {
    return undefined;
  }
  return ret.protocol === RESOURCE_PROTOCOL ? ret : undefined;
}

function packageName(ru: ResourceUrl): string {
  const scope = ru.username;
  const name = ru.hostname;
  return scope ? `@${scope}/${name}` : name;
}

function dependencyNames(ru: ResourceUrl): ReadonlyArray<string> {
  return ru.searchParams.getAll(DEPENDENCY_QUERY_KEY);
}

/**
 * Combines all resolvables into a fully resolved result. This function should
 * only be passed in the `resolvables` output of `loadResolvableResource`, in
 * which case it is guaranteed to produce the same final resolved output.
 */
export function combineResolvables<V = unknown>(
  arr: ReadonlyArray<Resolvable>
): V {
  const [root] = arr;
  assert(root, 'Empty resources');
  if (!root.authority.startsWith(RESOURCE_PROTOCOL)) {
    // This is not a resolvable resource.
    return YAML.parse(root.contents);
  }

  const node = resourceTree(arr);
  return read(root.authority, node);

  function read(ref: string, node: ResourceNode): V {
    const ru = resourceUrl(ref);
    assert(ru, 'Unexpected reference %s', ref);
    const name = packageName(ru);
    const refNode =
      packageName(ru) === node.packageName ? node : node.dependencies.get(name);
    assert(refNode, 'Missing dependency for %s', ref);
    ru.hash = '';
    const contents = refNode.contents.get('' + ru);
    assert(contents, 'Missing contents for %s', ref);
    return derefSync(YAML.parse(contents), {
      failOnMissing: true,
      removeIds: true,
      loaders: {file: (ref: string) => read(ref, refNode)},
    });
  }
}

function resourceTree(arr: ReadonlyArray<Resolvable>): ResourceNode {
  const rootRu = ifPresent(arr[0], (r) => resourceUrl(r.authority));
  assert(rootRu, 'Unexpected or missing resolvable root');
  const rootNode = new MutableResourceNode(packageName(rootRu));
  for (const {authority, contents} of arr) {
    const ru = resourceUrl(authority);
    assert(ru, 'Unexpected reference %s', authority);
    let node = rootNode;
    for (const name of dependencyNames(ru)) {
      node = node.dependency(name);
    }
    ru.search = '';
    node.contents.set('' + ru, contents);
  }
  return rootNode;
}

interface ResourceNode {
  readonly packageName: string;
  readonly contents: ReadonlyMap<string, string>; // By trimmed authority
  readonly dependencies: ReadonlyMap<string, ResourceNode>; // By package name
}

class MutableResourceNode implements ResourceNode {
  contents = new Map();
  dependencies = new Map();
  constructor(readonly packageName: string) {}

  dependency(name: string): MutableResourceNode {
    let node = this.dependencies.get(name);
    if (!node) {
      node = new MutableResourceNode(name);
      this.dependencies.set(name, node);
    }
    return node;
  }
}
