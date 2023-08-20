import {assert} from '@opvious/stl-errors';
import {ifPresent} from '@opvious/stl-utils/functions';
import {KindAmong} from '@opvious/stl-utils/objects';
import {
  MimeType,
  OperationDefinition,
  ParameterDefinition,
  ResponseCode,
} from 'abaca-runtime';
import {OpenAPIV2, OpenAPIV3, OpenAPIV3_1} from 'openapi-types';

import {OpenapiDocument, OpenapiDocuments} from './document/index.js';

export type OpenapiOperation<D extends OpenapiDocument> =
  D extends OpenapiDocuments['2.0']
    ? OpenAPIV2.OperationObject
    : D extends OpenapiDocuments['3.0']
    ? OpenAPIV3.OperationObject
    : OpenAPIV3_1.OperationObject;

/** The input document must be fully resolved. */
export function extractOperationDefinitions(args: {
  readonly document: OpenapiDocument;
  readonly onSchema?: (schema: any, env: OperationHookEnv) => void;
  readonly generateIds?: boolean;
}): Record<string, OperationDefinition> {
  const {generateIds, onSchema} = args;
  const defs: Record<string, OperationDefinition> = {};
  for (const [path, item] of Object.entries(args.document.paths ?? {})) {
    for (const method of allOperationMethods) {
      const op = item?.[method];
      const operationId =
        op?.operationId ??
        (op && generateIds ? `${path}#${method}` : undefined);
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
      const params: Record<string, ParameterDefinition> = {};
      for (const param of op.parameters ?? []) {
        assert(!('$ref' in param), 'Unexpected reference', param);
        const required = !!param.required;
        const location = param.in;
        params[param.name] = {location, required};
        if (onSchema) {
          onSchema(param.schema, {
            operationId,
            target: {kind: 'parameter', name: param.name},
          });
        }
      }
      defs[operationId] = {
        path,
        method,
        parameters: params,
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
      if (onSchema) {
        onSchema(val.schema, {operationId, target: {...target, type: key}});
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
