import {assert} from '@opvious/stl-errors';
import {ifPresent} from '@opvious/stl-utils/functions';
import {KindAmong} from '@opvious/stl-utils/objects';
import {GlobMapper} from '@opvious/stl-utils/strings';
import {
  MimeType,
  OperationDefinition,
  ParameterDefinition,
  ResponseCode,
} from 'abaca-runtime';
import { OpenAPIV3, OpenAPIV3_1} from 'openapi-types';
import {DeepReadonly} from 'ts-essentials';

import {
  OpenapiDocument,
  OpenapiDocuments,
  OpenapiVersion,
} from './document/index.js';

export interface OpenapiOperations {
  '3.0': DeepReadonly<OpenAPIV3.OperationObject>;
  '3.1': DeepReadonly<OpenAPIV3_1.OperationObject>;
}

/** Iterates over all operations defined under a document's paths */
export function* documentPathOperations<V extends OpenapiVersion>(
  doc: OpenapiDocuments[V]
): Iterable<DocumentOperation<V>> {
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    for (const method of allOperationMethods) {
      const op = item?.[method];
      if (op) {
        yield {path, method, value: op};
      }
    }
  }
}

export interface DocumentOperation<V extends OpenapiVersion = OpenapiVersion> {
  readonly path: string;
  readonly method: OperationMethod;
  readonly value: OpenapiOperations[V];
}

/**
 * Extracts all operations under the document's paths. The input document must
 * be fully resolved.
 */
export function extractPathOperationDefinitions(args: {
  readonly document: OpenapiDocument;
  readonly onSchema?: (schema: any, env: OperationHookEnv) => void;
  readonly idGlob?: GlobMapper<boolean>;
  readonly generateIds?: boolean;
}): Record<string, OperationDefinition> {
  const {generateIds, onSchema, idGlob} = args;
  const defs: Record<string, OperationDefinition> = {};
  for (const op of documentPathOperations(args.document)) {
    const {path, method, value: val} = op;

    const id =
      val?.operationId ??
      (val && generateIds ? `${path}#${method}` : undefined);
    if (!id || (idGlob && !idGlob.map(id))) {
      continue;
    }

    const params: Record<string, ParameterDefinition> = {};
    for (const param of val.parameters ?? []) {
      assert(!('$ref' in param), 'Unexpected reference', param);
      const required = !!param.required;
      const location: any = param.in;
      params[param.name] = {location, required};
      if (onSchema) {
        onSchema(param.schema, {
          operationId: id,
          target: {kind: 'parameter', name: param.name},
        });
      }
    }

    const body = ifPresent(val.requestBody, (b) => {
      assert(!('$ref' in b), 'Unexpected reference', b);
      return {
        required: !!b.required,
        types: contentTypes(b.content, id, {kind: 'requestBody'}),
      };
    });

    const responses: Record<string, ReadonlyArray<MimeType>> = {};
    for (const [code, res] of Object.entries<any>(val.responses ?? {})) {
      assert(!('$ref' in res), 'Unexpected reference', res);
      responses[code] = contentTypes(res.content ?? {}, id, {
        kind: 'response',
        code,
      });
    }

    defs[id] = {path, method, parameters: params, body, responses};
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

export type OperationMethod = (typeof allOperationMethods)[number];
