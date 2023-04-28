import {assert, unexpected} from '@opvious/stl-errors';
import {PosixPath, ResourceLoader} from '@opvious/stl-utils/files';
import YAML from 'yaml';

import {loadResolvableResource} from '../resolvable/index.js';
import {OpenapiDocuments, OpenapiVersion} from './common.js';
import {assertIsOpenapiDocument} from './parse.js';

/** Default file name for OpenAPI documents. */
export const OPENAPI_DOCUMENT_FILE = 'openapi.yaml';

/**
 * Loads a fully-resolved OpenAPI specification. Top-level references can use
 * the `embed=schemas` search parameter to have all `$defs` in the referenced
 * resource embedded as schemas. All keys starting with `$` are also stripped.
 */
export async function loadOpenapiDocument<V extends OpenapiVersion>(opts?: {
  readonly path?: PosixPath;
  readonly loader?: ResourceLoader;
  readonly versions?: ReadonlyArray<V>;
}): Promise<OpenapiDocuments[V]> {
  const pp = opts?.path ?? OPENAPI_DOCUMENT_FILE;

  let refno = 1;
  const embeddings = new Map<string, string>();
  const resolved = await loadResolvableResource(pp, {
    loader: opts?.loader,
    onResolvedReference: (r) => {
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
            assert(val === 'schemas', 'Unsupported embedding value: %s', val);
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
        embedder.embed(node, embedding);
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
  assertIsOpenapiDocument(stripped, {versions: opts?.versions});
  return stripped;
}

class Embedder {
  constructor(private readonly document: YAML.Document) {}

  embed(src: YAML.YAMLMap, key: string): void {
    const doc = this.document;
    const defs = src.get('$defs');
    assert(YAML.isMap(defs), 'Unexpected definitions: %j', defs);
    for (const pair of defs.items) {
      const name = (pair.key as any)?.value;
      assert(typeof name, 'Unexpected embedded definition name in %j', pair);
      const def = pair.value;
      assert(YAML.isAlias(def), 'Unexpected embedded definition: %j', def);
      const dst = ['components', key, name];
      assert(!doc.hasIn(dst), 'Embedding name collision: %j', pair);
      doc.setIn(dst, def);
    }
  }
}

enum QueryKey {
  /** Flag a reference for embedding. */
  EMBED = 'embed',

  /** Special internal value used make references unique. */
  REFNO = '_',
}
