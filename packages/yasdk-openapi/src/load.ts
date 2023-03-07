import {assert, errorFactories, unexpected} from '@opvious/stl-errors';
import {ifPresent} from '@opvious/stl-utils/functions';
import {KindAmong} from '@opvious/stl-utils/objects';
import {readFile} from 'fs/promises';
import {
  default as validation,
  OpenAPISchemaValidatorResult,
} from 'openapi-schema-validator';
import {OpenAPIV2, OpenAPIV3, OpenAPIV3_1} from 'openapi-types';
import path from 'path';
import YAML from 'yaml';

import {
  MimeType,
  OperationDefinition,
  ParameterDefinition,
  ResponseCode,
} from './preamble/operations.js';
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

  return opts?.resolveAllReferences ? resolveAll(obj) : obj;
}

export interface OpenapiDocuments {
  '2.0': OpenAPIV2.Document;
  '3.0': OpenAPIV3.Document;
  '3.1': OpenAPIV3_1.Document;
}

export type OpenapiVersion = keyof OpenapiDocuments;

export type OpenapiDocument = OpenapiDocuments[OpenapiVersion];

const allVersions = ['2.0', '3.0', '3.1'] as const;

export type OpenapiOperation<D extends OpenapiDocument> =
  D extends OpenapiDocuments['2.0']
    ? OpenAPIV2.OperationObject
    : D extends OpenapiDocuments['3.0']
    ? OpenAPIV3.OperationObject
    : OpenAPIV3_1.OperationObject;

/** The input document must be fully resolved. */
export function extractOperationDefinitions(
  doc: OpenapiDocument,
  hook?: (schema: any, env: OperationHookEnv) => void
): Record<string, OperationDefinition> {
  const defs: Record<string, OperationDefinition> = {};
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    for (const method of allOperationMethods) {
      const op = item?.[method];
      const operationId = op?.operationId;
      if (!operationId) {
        continue;
      }
      const responses: Record<string, ReadonlyArray<MimeType>> = {};
      for (const [code, res] of Object.entries<any>(op.responses)) {
        assert(!('$ref' in res), 'Unexpected reference', res);
        responses[code] = contentTypes(res.content ?? {}, operationId, {
          kind: 'response',
          code,
        });
      }
      const parameters: Record<string, ParameterDefinition> = {};
      for (const param of op.parameters ?? []) {
        assert(!('$ref' in param), 'Unexpected reference', param);
        const required = !!param.required;
        const location = param.in;
        parameters[param.name] = {location, required};
        if (hook) {
          hook(param.schema, {
            operationId,
            target: {kind: 'parameter', name: param.name},
          });
        }
      }
      defs[operationId] = {
        path,
        method,
        parameters,
        body: ifPresent(op.requestBody, (b) => ({
          required: !!b.required,
          types: contentTypes(b.content, operationId, {kind: 'requestBody'}),
        })),
        responses,
      };
    }
  }
  return defs;

  function contentTypes(
    obj: any,
    operationId: string,
    target: any
  ): ReadonlyArray<MimeType> {
    const ret: MimeType[] = [];
    for (const [key, val] of Object.entries<any>(obj)) {
      ret.push(key);
      if (hook) {
        hook(val.schema, {operationId, target: {...target, type: key}});
      }
    }
    return ret;
  }
}

export interface OperationHookEnv {
  readonly operationId: string;
  readonly target: OperationHookTarget;
}

export type OperationHookTarget = KindAmong<{
  requestBody: {readonly type: MimeType};
  response: {readonly type: MimeType; readonly code: ResponseCode};
  parameter: {readonly name: string};
}>;

export const allOperationMethods = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
] as const;
