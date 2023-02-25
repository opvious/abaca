import {errorFactories, unexpected} from '@opvious/stl-errors';
import {ifPresent} from '@opvious/stl-utils/functions';
import {Resolver} from '@stoplight/json-ref-resolver';
import {readFile} from 'fs/promises';
import {
  default as validation,
  OpenAPISchemaValidatorResult,
} from 'openapi-schema-validator';
import {OpenAPIV2, OpenAPIV3, OpenAPIV3_1} from 'openapi-types';
import path from 'path';
import YAML from 'yaml';

import {resolveAll} from './resolve.js';

const [errors] = errorFactories({
  definitions: {
    invalidSchema: (issues: ReadonlyArray<ValidationIssue>) => ({
      message:
        'OpenAPI schema is invalid: ' +
        issues.map(formatValidationIssue).join(', '),
      tags: {issues},
    }),
    unexpectedVersion: (got: string, want: ReadonlyArray<OpenapiVersion>) => ({
      message: `OpenAPI version ${got} is not acceptable`,
      tags: {got, want},
    }),
  },
});

type ValidationIssue = OpenAPISchemaValidatorResult['errors'][number];

function formatValidationIssue(i: ValidationIssue): string {
  return `[${i.instancePath}] ${i.message}`;
}

const SchemaValidator = validation.default ?? validation; // Hack.

/** Reads and validates an OpenAPI schema from a path. */
export async function loadOpenapiDocument<V extends OpenapiVersion>(
  /** File path or URL. */
  fp: string | URL,
  opts?: {
    /** Acceptable document versions. */
    readonly versions?: ReadonlyArray<V>;
    /** Custom decoding reviver. */
    readonly reviver?: (k: unknown, v: unknown) => unknown;
    /** Resolve all inline references. */
    readonly resolveAllReferences?: boolean;
  }
): Promise<OpenapiDocuments[V]> {
  const str = await readFile(fp, 'utf8');

  let obj;
  const ext = path.extname('' + fp);
  switch (ext) {
    case '.json':
      obj =
        ifPresent(opts?.reviver, (r) => JSON.parse(str, r)) ?? JSON.parse(str);
      break;
    case '.yml':
    case '.yaml':
      obj =
        ifPresent(opts?.reviver, (r) => YAML.parse(str, r)) ?? YAML.parse(str);
      break;
    default:
      throw unexpected(ext);
  }

  const version =
    typeof obj?.openapi == 'string'
      ? obj.openapi.trim().slice(0, 3)
      : obj.swagger;
  const allowed = opts?.versions ?? allVersions;
  if (!allowed.includes(version)) {
    throw errors.unexpectedVersion(version, allowed);
  }

  const validator = new SchemaValidator({version});
  const validated = validator.validate(obj);
  if (validated.errors.length) {
    throw errors.invalidSchema(validated.errors);
  }

  return opts?.resolveAllReferences ? resolveAll(obj) :obj;
}

export interface OpenapiDocuments {
  '2.0': OpenAPIV2.Document;
  '3.0': OpenAPIV3.Document;
  '3.1': OpenAPIV3_1.Document;
}

export type OpenapiVersion = keyof OpenapiDocuments;

export type OpenapiDocument = OpenapiDocuments[OpenapiVersion];

const allVersions = ['2.0', '3.0', '3.1'] as const;
