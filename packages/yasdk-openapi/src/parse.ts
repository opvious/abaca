import {assert, errorFactories} from '@opvious/stl-errors';
import {PosixPath, ResourceLoader} from '@opvious/stl-utils/files';
import {ifPresent} from '@opvious/stl-utils/functions';
import {KindAmong} from '@opvious/stl-utils/objects';
import {
  default as validation,
  OpenAPISchemaValidatorResult,
} from 'openapi-schema-validator';
import {OpenAPIV2, OpenAPIV3, OpenAPIV3_1} from 'openapi-types';
import {
  MimeType,
  OperationDefinition,
  ParameterDefinition,
  ResponseCode,
} from 'yasdk-runtime';

import {
  OpenapiDocument,
  OpenapiDocuments,
  OpenapiVersion,
  openapiVersions,
} from './common.js';
import {
  combineResolvables,
  loadResolvableResource,
  Resolvable,
} from './resolvable/index.js';

const [errors, codes] = errorFactories({
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
  prefix: 'ERR_OPENAPI_',
});

export const errorCodes = codes;

type ValidationIssue = OpenAPISchemaValidatorResult['errors'][number];

function formatValidationIssue(i: ValidationIssue): string {
  return `[${i.instancePath}] ${i.message}`;
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
    throw errors.unexpectedVersion(version, allowed);
  }
  const validator = new SchemaValidator({version});
  const validated = validator.validate(schema);
  if (validated.errors.length) {
    throw errors.invalidSchema(validated.errors);
  }
  return schema;
}

/** Default file name for OpenAPI documents. */
export const OPENAPI_DOCUMENT_FILE = 'openapi.yaml';

/** Convenience method for loading a fully-resolved OpenAPI specification. */
export async function loadOpenapiDocument<V extends OpenapiVersion>(opts?: {
  readonly path?: PosixPath;
  readonly loader?: ResourceLoader;
  readonly versions?: ReadonlyArray<V>;
}): Promise<OpenapiDocuments[V]> {
  const pp = opts?.path ?? OPENAPI_DOCUMENT_FILE;
  const {resolved} = await loadResolvableResource(pp, {
    loader: opts?.loader,
    stripDollarKeys: true,
  });
  const doc = resolved.toJS();
  assertIsOpenapiDocument(doc, {versions: opts?.versions});
  return doc;
}

/**
 * Convenience method for combining resolvables forming an OpenAPI specification
 * into a (fully resolved) document. These resolvables should be created with
 * `loadResolvableResource`.
 */
export function assembleOpenapiDocument<V extends OpenapiVersion>(
  resolvables: ReadonlyArray<Resolvable>,
  opts?: {
    readonly versions?: ReadonlyArray<V>;
  }
): OpenapiDocuments[V] {
  const combined = combineResolvables(resolvables);
  assertIsOpenapiDocument(combined, {versions: opts?.versions});
  return combined;
}

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
