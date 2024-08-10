import {assert} from '@opvious/stl-errors';
import {EventProducer} from '@opvious/stl-utils/events';
import {ifPresent} from '@opvious/stl-utils/functions';
import {GlobMapper} from '@opvious/stl-utils/strings';
import {
  MimeType,
  OperationDefinition,
  ParameterDefinition,
  ResponseCode,
  ResponseContentDefinition,
} from 'abaca-runtime';
import {OpenAPIV3, OpenAPIV3_1} from 'openapi-types';
import {DeepReadonly} from 'ts-essentials';

import {
  createPointer,
  dereferencePointer,
  JsonPointer,
  splitPointer,
} from './common.js';
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
 * only contain inline references.
 */
export function extractPathOperationDefinitions(args: {
  readonly document: OpenapiDocument;
  readonly producer?: EventProducer<OperationListeners>;
  readonly idGlob?: GlobMapper<boolean>;
  readonly generateIds?: boolean;
}): Record<string, OperationDefinition> {
  const {document: doc, generateIds, producer, idGlob} = args;

  const deref = <V extends object>(
    obj: V | HasRef,
    fb: ReadonlyArray<string>
  ): [Exclude<V, HasRef>, ReadonlyArray<string>] => {
    if ('$ref' in obj) {
      const ptr = refPointer(obj);
      return [dereferencePointer(ptr, doc), splitPointer(ptr)];
    }
    return [obj as any, fb];
  };

  const schemaPointer = (parts: ReadonlyArray<string>): JsonPointer => {
    const ptr = createPointer([...parts, 'schema']);
    const obj = dereferencePointer(ptr, doc);
    return '$ref' in obj ? refPointer(obj) : ptr;
  };

  const defs: Record<string, OperationDefinition> = {};
  for (const op of documentPathOperations(doc)) {
    const {path, method, value: val} = op;

    const oid =
      val?.operationId ??
      (val && generateIds ? `${path}#${method}` : undefined);
    if (!oid || (idGlob && !idGlob.map(oid))) {
      continue;
    }

    const prefix = ['paths', path, method];

    const params: Record<string, ParameterDefinition> = {};
    for (const [ix, paramOrRef] of (val.parameters ?? []).entries()) {
      const [param, parts] = deref(paramOrRef, [
        ...prefix,
        'parameters',
        '' + ix,
      ]);
      const required = !!param.required;
      const location: any = param.in;
      params[param.name] = {location, required};
      if (producer) {
        producer.emit('parameter', oid, schemaPointer(parts), param.name);
      }
    }

    const body = ifPresent(val.requestBody, (bodyOrRef) => {
      const [body, parts] = deref(bodyOrRef, [...prefix, 'requestBody']);
      const types = Object.keys(body.content ?? {});
      if (producer) {
        for (const key of types) {
          const ptr = schemaPointer([...parts, 'content', key]);
          producer.emit('requestBody', oid, ptr, key);
        }
      }
      return {required: !!body.required, types};
    });

    const responses: Record<
      string,
      ReadonlyArray<ResponseContentDefinition>
    > = {};
    for (const [code, resOrRef] of Object.entries<any>(val.responses ?? {})) {
      const [res, parts] = deref(resOrRef, [...prefix, 'responses', code]);
      const defs: ResponseContentDefinition[] = [];
      for (const [key, val] of Object.entries<any>(res.content ?? {})) {
        const schema = val?.schema;
        defs.push({
          mimeType: key,
          isBlob: schema?.type === 'string' && schema?.format === 'binary',
        });
      }
      if (producer) {
        for (const def of defs) {
          const ptr = schemaPointer([...parts, 'content', def.mimeType]);
          producer.emit('response', oid, ptr, def.mimeType, code);
        }
      }
      responses[code] = defs;
    }

    defs[oid] = {path, method, parameters: params, body, responses};
  }
  return defs;
}

interface HasRef {
  readonly $ref: string;
}

function refPointer(obj: HasRef): JsonPointer {
  const ref = obj.$ref;
  assert(ref.startsWith('#'), 'Unsupported reference: %s', ref);
  return ref.slice(1);
}

export interface OperationListeners {
  parameter(oid: string, ptr: JsonPointer, name: string): void;
  requestBody(oid: string, ptr: JsonPointer, mime: MimeType): void;
  response(
    oid: string,
    ptr: JsonPointer,
    mime: MimeType,
    code: ResponseCode
  ): void;
}

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
