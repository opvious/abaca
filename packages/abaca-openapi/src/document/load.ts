import {assert, unexpected} from '@opvious/stl-errors';
import {noopTelemetry, Telemetry} from '@opvious/stl-telemetry';
import {SetMultimap} from '@opvious/stl-utils/collections';
import {
  localPath,
  localUrl,
  PathLike,
  ResourceLoader,
} from '@opvious/stl-utils/files';
import {ifPresent} from '@opvious/stl-utils/functions';
import {commaSeparated} from '@opvious/stl-utils/strings';
import {readFile} from 'fs/promises';
import YAML from 'yaml';

import {createPointer, JsonPointer, packageInfo} from '../common.js';
import {ReferenceResolvers, resolvingReferences} from '../resolvable/index.js';
import {OpenapiDocuments, OpenapiVersion} from './common.js';
import {assertIsOpenapiDocument} from './parse.js';

const DOCUMENT_FILE = 'openapi.yaml';

/**
 * Loads a fully-resolved OpenAPI specification stored locally. See
 * `resolveOpenapiDocument` for more information.
 */
export async function loadOpenapiDocument<
  V extends OpenapiVersion = OpenapiVersion
>(
  opts?: ResolveOpenapiDocumentOptions<V> & {
    /**
     * Resource path, defaults to `resources/openapi.yaml` (from the loader's
     * root if present).
     */
    readonly path?: PathLike;
  }
): Promise<OpenapiDocuments[V]> {
  const pl =
    ifPresent(opts?.path, (pl) => localUrl(pl)) ??
    ifPresent(opts?.loader, (l) => l.localUrl(DOCUMENT_FILE)) ??
    localPath('resources', DOCUMENT_FILE);
  const data = await readFile(localPath(pl), 'utf8');
  return resolveOpenapiDocument(data, opts);
}

/**
 * Fully resolves an OpenAPI specification. Top-level references can use the
 * `embed=*` search parameter to have all `$defs` in the referenced resource
 * embedded as schemas. All keys starting with `$` are stripped from the final
 * output.
 */
export async function resolveOpenapiDocument<
  V extends OpenapiVersion = OpenapiVersion
>(
  data: string,
  opts?: ResolveOpenapiDocumentOptions<V>
): Promise<OpenapiDocuments[V]> {
  const tel = opts?.telemetry?.via(packageInfo) ?? noopTelemetry();
  tel.logger.debug('Resolving OpenAPI document...');

  const {$id, ...parsed} = YAML.parse(data);
  tel.logger.debug('Parsed original document.');

  // Validate before resolving since it will otherwise hide certain errors (e.g.
  // objects with both `$ref` and other properties will have the latter erased).
  assertIsOpenapiDocument(parsed, {
    versions: opts?.versions,
    skipSchemaValidation: opts?.skipSchemaValidation,
  });

  if (opts?.ignoreWebhooks) {
    delete (parsed as any).webhooks;
  }

  const embedder = new Embedder();
  const resolved = await resolvingReferences(
    {$id, ...parsed},
    {
      loader: opts?.loader,
      onResolvedResource: (r) => {
        const id = r.result.$id;
        assert(typeof id == 'string', 'Unexpected ID in %s: %s', r.url, id);
        for (const [key, val] of r.url.searchParams) {
          switch (key) {
            case QueryKey.EMBED: {
              assert(!r.parents.length, 'Nested embedding: %s', r.url);
              assert(r.result.$defs, 'No definitions to embed in %s', r.url);
              embedder.register(id, val);
              break;
            }
            default:
              throw unexpected(key);
          }
        }
      },
    }
  );
  tel.logger.debug('Resolved all references.');

  // We need to strip metadata added for resource reference handling and
  // potentially handle embeddings. We use a YAML document to mutate the tree
  // since shared nodes are otherwise frozen. The parser is smart enough to
  // respect identical nodes.
  const doc = new YAML.Document(resolved);

  // We now add embedded nodes if any.
  embedder.embedSchemas(doc);
  tel.logger.debug('Processed embeddings.');

  // Transform aliases into component references where possible. This leads to
  // more robust deduplication and speeds up the following step.
  const consolidator = new Consolidator(doc);
  consolidator.consolidate();
  tel.logger.debug('Consolidated aliases.');

  // Strip special keys (in particular `$defs` and `$id`).
  YAML.visit(doc.contents, {
    Pair: (_key, pair) => {
      const key = (pair.key as any)?.value;
      return typeof key == 'string' && key.startsWith('$')
        ? YAML.visit.REMOVE
        : undefined;
    },
  });
  tel.logger.debug('Stripped special keys.');

  // Note: this step is slow. Currently suspecting it is due to the aliases
  // which traverse the tree each time to `resolve` themselves.
  const stripped = doc.toJS({maxAliasCount: -1});
  tel.logger.debug('Generated stripped document.');

  // Check the schema again now that all references have been resolved
  assertIsOpenapiDocument(stripped, {
    versions: opts?.versions,
    skipSchemaValidation: opts?.skipSchemaValidation,
  });

  tel.logger.info('Resolved OpenAPI document.');
  return stripped;
}

export interface ResolveOpenapiDocumentOptions<V> {
  /** Defaults to a loader for the CWD */
  readonly loader?: ResourceLoader;
  /** Defaults to all versions */
  readonly versions?: ReadonlyArray<V>;
  /** Additional resolvers */
  readonly resolvers?: ReferenceResolvers;
  /** Bypass schema compatibility check */
  readonly skipSchemaValidation?: boolean;
  /** Skip any defined webhook operations */
  readonly ignoreWebhooks?: boolean;
  /** Telemetry instance */
  readonly telemetry?: Telemetry;
}

/** Injects imported definitions into the target */
class Embedder {
  private readonly embeddings = new SetMultimap<string, string>();

  register(id: string, value: string): void {
    this.embeddings.addAll(id, commaSeparated(value));
  }

  embedSchemas(doc: YAML.Document): void {
    if (!this.embeddings.size) {
      return;
    }
    YAML.visit(doc.contents, {
      Pair: (_key, pair, ancestors) => {
        if ((pair.key as any)?.value !== '$id') {
          return;
        }
        const id = (pair.value as any)?.value;
        assert(typeof id == 'string', 'Invalid ID: %s', id);
        const values = this.embeddings.get(id);
        if (values.size) {
          const node = ancestors[ancestors.length - 1];
          assert(YAML.isMap(node), 'Unexpected embedded node: %j', node);
          this.embed(doc, node, values);
        }
        this.embeddings.delete(id);
      },
    });
  }

  private embed(
    doc: YAML.Document,
    src: YAML.YAMLMap,
    values: ReadonlySet<string>
  ): void {
    let defs = src.get('$defs');
    if (YAML.isAlias(defs)) {
      defs = defs.resolve(doc);
    }
    assert(YAML.isMap(defs), 'Unexpected definitions: %j', defs);

    for (const pair of defs.items) {
      const name = (pair.key as any)?.value;
      assert(
        typeof name == 'string',
        'Unexpected embedded definition name in %j',
        pair
      );
      if (values.has(name) || (values.has('*') && !name.startsWith('_'))) {
        const dst = ['components', 'schemas', name];
        assert(!doc.hasIn(dst), 'Embedding name collision: %j', pair);
        doc.setIn(dst, pair.value);
      }
    }
  }
}

enum QueryKey {
  /** Flag a reference for embedding. */
  EMBED = 'embed',
}

/**
 * Transforms aliases into references when possible. This is useful to reduce
 * generated file sizes (types and also when specifications are combined via a
 * tool which doesn't handle aliases well). Note that references can be present
 * in the resolved input too, for example due to circular definitions.
 */
class Consolidator {
  constructor(private readonly document: YAML.Document) {}

  /** Mutates the consolidator's document, transforming aliases */
  consolidate(): void {
    const components = this.aliasedComponents();
    const consolidated = new Set<string>();
    YAML.visit(this.document, {
      Node: (_key, node, ancestors) => {
        const anchor = node instanceof YAML.Alias ? node.source : node.anchor;
        if (anchor == null) {
          return undefined;
        }
        const component = components.get(anchor);
        if (!component) {
          // This anchor does not have a corresponding component
          return undefined;
        }
        if (componentPointer(ancestors) != null) {
          // This is the component's definition
          if (consolidated.has(anchor)) {
            // We already replaced the definition. This is used to avoid
            // infinite recursion when visiting the node which was just used as
            // replacement.
            return undefined;
          }
          consolidated.add(anchor);
          return component.value;
        }
        const ref = new YAML.YAMLMap();
        ref.set('$ref', component.reference);
        return ref;
      },
    });
  }

  /** Returns aliases which are created or referenced from a component */
  private aliasedComponents(): ReadonlyMap<string, AliasedComponent> {
    const aliased = new Map<string, YAML.Node>();
    const ret = new Map<string, AliasedComponent>();
    YAML.visit(this.document, {
      Node: (_key, node, ancestors) => {
        const anchor = node instanceof YAML.Alias ? node.source : node.anchor;
        if (anchor == null) {
          // Not an alias or aliased node
          return undefined;
        }
        if (node.anchor != null) {
          // Aliased node
          assert(!(node instanceof YAML.Alias), 'Aliased alias %j', node);
          assert(!aliased.has(node.anchor), 'Duplicate alias %s', node.anchor);
          aliased.set(node.anchor, node);
        }
        const pointer = componentPointer(ancestors);
        if (pointer == null) {
          // Not a top-level component
          return undefined;
        }
        const value = aliased.get(anchor);
        assert(value != null, 'Missing value for alias %s', node.anchor);
        ret.set(anchor, {reference: '#' + pointer, value});
        return undefined;
      },
    });
    return ret;
  }
}

const COMPONENTS_KEY = 'components';

function componentPointer(
  ancestors: ReadonlyArray<unknown>
): JsonPointer | undefined {
  if (ancestors.length !== 7 || pairKey(ancestors[2]) !== COMPONENTS_KEY) {
    return undefined;
  }
  const subsection = pairKey(ancestors[4]);
  assert(subsection != null, 'Missing subsection in %j', ancestors[4]);
  const name = pairKey(ancestors[6]);
  assert(name != null, 'Missing name in %j', ancestors[6]);
  return createPointer([COMPONENTS_KEY, subsection, name]);
}

function pairKey(node: unknown): string | undefined {
  return node instanceof YAML.Pair
    ? node.key instanceof YAML.Scalar
      ? node.key.value
      : typeof node.key == 'string'
      ? node.key
      : undefined
    : undefined;
}

interface AliasedComponent {
  readonly reference: string;
  readonly value: YAML.Node;
}
