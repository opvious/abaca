import {assert, unexpected} from '@opvious/stl-errors';
import {PosixPath, ResourceLoader} from '@opvious/stl-utils/files';
import {default as validation} from 'openapi-schema-validator';
import YAML from 'yaml';

import {loadResolvableResource} from '../resolvable/index.js';
import {
  errors,
  OpenapiDocuments,
  OpenapiVersion,
  openapiVersions,
} from './common.js';

const SchemaValidator = validation.default ?? validation; // Hack.

/** Checks that the input argument is a valid OpenAPI document. */
export function assertIsOpenapiDocument<V extends OpenapiVersion>(
  arg: unknown,
  opts?: {
    /** Acceptable document versions. */
    readonly versions?: ReadonlyArray<V>;
  }
): asserts arg is OpenapiDocuments[V] {
  // TODO: Check that it is fully resolved (potentially gated by an option).

  const schema: any = arg;
  const version =
    typeof schema?.openapi == 'string'
      ? schema.openapi.trim().slice(0, 3)
      : schema.swagger;
  const allowed = opts?.versions ?? openapiVersions;
  if (!allowed.includes(version)) {
    throw errors.unexpectedDocumentVersion(version, allowed);
  }
  const validator = new SchemaValidator({version});
  const validated = validator.validate(schema);
  if (validated.errors.length) {
    throw errors.invalidDocument(validated.errors);
  }
  return schema;
}

/** Default file name for OpenAPI documents. */
export const OPENAPI_DOCUMENT_FILE = 'openapi.yaml';

/**
 * Loads a fully-resolved OpenAPI specification. Top-level references can use
 * the `embed=*` search parameter to call all `$defs` in the referenced resource
 * to be embedded as schemas.
 *
 * All keys starting with `$` are stripped.
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
    onResolvedResource: (r) => {
      const doc = r.document;

      const url = new URL(r.url);
      url.search = '';
      url.searchParams.set(QueryKey.REFNO, '' + refno++);
      const id = '' + url;

      for (const [key, val] of r.url.searchParams) {
        switch (key) {
          case QueryKey.EMBED: {
            assert(!r.parents.length, 'Nested embedding: %s', r.url);
            assert(doc.get('$defs'), 'No definitions to embed in %s', r.url);
            doc.set('$id', id);
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
  EMBED = 'embed',
  REFNO = '_refno',
}
