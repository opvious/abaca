import {assert, unexpected} from '@opvious/stl-errors';
import {
  localPath,
  localUrl,
  PathLike,
  ResourceLoader,
} from '@opvious/stl-utils/files';
import {ifPresent} from '@opvious/stl-utils/functions';
import {readFile} from 'fs/promises';
import YAML from 'yaml';

import {ReferenceResolvers,resolvingReferences} from '../resolvable/index.js';
import {OpenapiDocuments, OpenapiVersion} from './common.js';
import {assertIsOpenapiDocument} from './parse.js';

const DOCUMENT_FILE = 'openapi.yaml';

/**
 * Loads a fully-resolved OpenAPI specification stored locally. Top-level
 * references can use the `embed=*` search parameter to have all `$defs` in the
 * referenced resource embedded as schemas. All keys starting with `$` are
 * stripped from the final output.
 */
export async function loadOpenapiDocument<
  V extends OpenapiVersion = OpenapiVersion
>(opts?: {
  /**
   * Resource path, defaults to `resources/openapi.yaml` (from the loader's
   * root if present).
   */
  readonly path?: PathLike;
  /** Defaults to a loader for the CWD */
  readonly loader?: ResourceLoader;
  /** Defaults to all versions */
  readonly versions?: ReadonlyArray<V>;
  /** Additional resolvers */
  readonly resolvers?: ReferenceResolvers;
  /** Bypass schema compatibility check */
  readonly bypassSchemaValidation?: boolean;
}): Promise<OpenapiDocuments[V]> {
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
  opts?: {
    /** Defaults to a loader for the CWD */
    readonly loader?: ResourceLoader;
    /** Defaults to all versions */
    readonly versions?: ReadonlyArray<V>;
    /** Additional resolvers */
    readonly resolvers?: ReferenceResolvers;
    /** Bypass schema compatibility check */
    readonly bypassSchemaValidation?: boolean;
  }
): Promise<OpenapiDocuments[V]> {
  let refno = 1;
  const embeddings = new Map<string, string>();
  const resolved = await resolvingReferences(data, {
    loader: opts?.loader,
    onResolvedReference: (r) => {
      if (r.url.protocol !== 'resource:') {
        return;
      }

      const doc = r.document;

      // Generate a unique ID for this reference so we can locate it later.
      const url = new URL(r.url);
      url.search = '';
      url.searchParams.set(QueryKey.REFNO, '' + refno++);
      const id = '' + url;
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
  });

  // We use a YAML document to mutate the tree since shared nodes are otherwise
  // frozen. The parser is smart enough to respect identical nodes.
  const doc = new YAML.Document(resolved);

  // We now add embedded nodes.
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

  // Finally we strip special keys and check that the schema validates.
  YAML.visit(doc.contents, {
    Pair: (_, pair) => {
      const key = (pair.key as any)?.value;
      return typeof key == 'string' && key.startsWith('$')
        ? YAML.visit.REMOVE
        : undefined;
    },
  });
  const stripped = doc.toJS();
  assertIsOpenapiDocument(stripped, {
    versions: opts?.versions,
    bypassSchemaValidation: opts?.bypassSchemaValidation,
  });
  return stripped;
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
