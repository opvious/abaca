import {default as validation} from 'openapi-schema-validator';
import YAML from 'yaml';

import {
  errors,
  OpenapiDocuments,
  OpenapiVersion,
  openapiVersions,
} from './common.js';

/** Parses a document from a YAML (or JSON) string. */
export function parseOpenapiDocument<V extends OpenapiVersion>(
  arg: string,
  opts?: {
    /** Acceptable document versions. */
    readonly versions?: ReadonlyArray<V>;
  }
): OpenapiDocuments[V] {
  const doc = YAML.parse(arg);
  assertIsOpenapiDocument(doc, opts);
  return doc;
}

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
