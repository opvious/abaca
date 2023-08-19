import {assert, unexpected} from '@opvious/stl-errors';
import {noopTelemetry, Telemetry} from '@opvious/stl-telemetry';
import {
  localPath,
  localUrl,
  PathLike,
  ResourceLoader,
} from '@opvious/stl-utils/files';
import {ifPresent} from '@opvious/stl-utils/functions';
import {readFile} from 'fs/promises';
import YAML from 'yaml';

import {packageInfo} from '../common.js';
import {ReferenceResolvers, resolvingReferences} from '../resolvable/index.js';
import {OpenapiDocument, OpenapiDocuments, OpenapiVersion} from './common.js';
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

  let resourceRefCount = 0;
  const embeddings = new Map<string, string>();
  const resolved = await resolvingReferences(
    {$id, ...parsed},
    {
      loader: opts?.loader,
      onResolvedReference: (r) => {
        if (r.url.protocol !== 'resource:') {
          return;
        }

        // Generate a unique ID for this reference so we can locate it later.
        const url = new URL(r.url);
        url.search = '';
        url.searchParams.set(QueryKey.REFNO, '' + ++resourceRefCount);
        const id = '' + url;
        const doc = r.document;
        doc.set('$id', id);

        // Apply any parameters.
        for (const [key, val] of r.url.searchParams) {
          switch (key) {
            case QueryKey.EMBED: {
              assert(!r.parents.length, 'Nested embedding: %s', r.url);
              assert(doc.get('$defs'), 'No definitions to embed in %s', r.url);
              embeddings.set(id, val);
              break;
            }
            default:
              throw unexpected(key);
          }
        }
      },
    }
  );
  tel.logger.debug('Resolved all references. [resources=%s]', resourceRefCount);

  let stripped: OpenapiDocument;
  if (resourceRefCount > 0) {
    // We need to strip metadata added for resource reference handling and
    // potentially handle embeddings. We use a YAML document to mutate the tree
    // since shared nodes are otherwise frozen. The parser is smart enough to
    // respect identical nodes.
    const doc = new YAML.Document(resolved);

    // We now add embedded nodes if any.
    if (embeddings.size) {
      const embedder = new Embedder(doc);
      YAML.visit(doc.contents, {
        Pair: (_, pair, path) => {
          if ((pair.key as any)?.value !== '$id') {
            return;
          }
          const id = (pair.value as any)?.value;
          assert(typeof id == 'string', 'Invalid ID: %s', id);
          const embedding = embeddings.get(id);
          if (embedding) {
            const node = path[path.length - 1];
            assert(YAML.isMap(node), 'Unexpected embedded node: %j', node);
            embedder.embedSchemas(node, embedding);
          }
        },
      });
      tel.logger.debug('Processed %s embedding(s).', embeddings.size);
    }

    // Strip special keys (in particular IDs added during resolution)
    YAML.visit(doc.contents, {
      Pair: (_, pair) => {
        const key = (pair.key as any)?.value;
        return typeof key == 'string' && key.startsWith('$')
          ? YAML.visit.REMOVE
          : undefined;
      },
    });
    tel.logger.debug('Stripped special keys.');

    // Note: this step is slow. Currently suspecting it is due to the aliases
    // which traverse the tree each time to `resolve` themselves.
    stripped = doc.toJS({maxAliasCount: -1});
  } else {
    const {$id: _$id, ...rest} = resolved as any;
    stripped = rest;
  }
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

class Embedder {
  constructor(private readonly document: YAML.Document) {}

  embedSchemas(src: YAML.YAMLMap, filter: string): void {
    const doc = this.document;
    const defs = src.get('$defs');
    assert(YAML.isMap(defs), 'Unexpected definitions: %j', defs);

    const pred = embeddingPredicate(filter);
    for (const pair of defs.items) {
      const name = (pair.key as any)?.value;
      assert(typeof name, 'Unexpected embedded definition name in %j', pair);
      if (!pred(name)) {
        continue;
      }

      const dst = ['components', 'schemas', name];
      assert(!doc.hasIn(dst), 'Embedding name collision: %j', pair);
      doc.setIn(dst, pair.value);
    }
  }
}

function embeddingPredicate(filter: string): (name: string) => boolean {
  if (filter === '*') {
    return (n) => !n.startsWith('_');
  }
  const names = new Set(filter.split(','));
  return (n) => names.has(n);
}

enum QueryKey {
  /** Flag a reference for embedding. */
  EMBED = 'embed',

  /** Special internal value used make references unique. */
  REFNO = '_',
}
