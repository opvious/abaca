import {assert} from '@opvious/stl-errors';
import {EventProducer} from '@opvious/stl-utils/events';
import {ifPresent} from '@opvious/stl-utils/functions';
import {KindAmong} from '@opvious/stl-utils/objects';
import {GlobMapper} from '@opvious/stl-utils/strings';
import {
  BodyDefinition,
  MimeType,
  OperationDefinition,
  ParameterDefinition,
  ResponseCode,
} from 'abaca-runtime';
import {OpenAPIV3, OpenAPIV3_1} from 'openapi-types';
import {DeepReadonly} from 'ts-essentials';

import {createPointer, dereferencePointer, JsonPointer} from './common.js';
import {
  OpenapiDocument,
  OpenapiDocuments,
  OpenapiVersion,
} from './document/index.js';
import {resolvingReferences} from './resolvable/index.js';

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
export async function extractPathOperationDefinitions(args: {
  readonly document: OpenapiDocument;
  readonly producer?: EventProducer<OperationListeners>;
  readonly idGlob?: GlobMapper<boolean>;
  readonly generateIds?: boolean;
}): Promise<Record<string, OperationDefinition>> {
  const {document: doc, generateIds, producer, idGlob} = args;
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

    const paramDefs: Record<string, ParameterDefinition> = {};
    for (const [ix, paramOrRef] of (val.parameters ?? []).entries()) {
      const param =
        '$ref' in paramOrRef ? dereference(paramOrRef, doc) : paramOrRef;
      const required = !!param.required;
      const location: any = param.in;
      paramDefs[param.name] = {location, required};
      if (producer) {
        const schema = await resolvingReferences(doc, {
          pointer: createPointer([...prefix, 'parameters', '' + ix]),
        });
        producer.emit('parameter', schema, oid, param.name);
      }
    }

    let bodyDef: BodyDefinition | undefined;
    if (val.requestBody) {
      const body =
        '$ref' in val.requestBody
          ? dereference(val.requestBody, doc)
          : val.requestBody;
      if (producer) {
        for (const [mime, val] of Object.entries<any>(body.content)) {
          const schema = await resolvingReferences(doc, {
            pointer: createPointer([...prefix, 'requestBody', 'content', mime]),
          });
          producer.emit('requestBody', schema, oid, mime);
        }
      }
      bodyDef = {
        required: !!body.required,
        types: Object.keys(body.content),
      };
    }

    const resDefs: Record<string, ReadonlyArray<MimeType>> = {};
    for (const [code, resOrRef] of Object.entries<any>(val.responses ?? {})) {
      const res = '$ref' in resOrRef ? dereference(resOrRef, doc) : resOrRef;
      const content = res.content ?? {};
      if (producer) {
        for (const [mime, val] of Object.entries<any>(content)) {
          const schema = await resolvingReferences(doc, {
            pointer: createPointer([
              ...prefix,
              'responses',
              code,
              'content',
              mime,
            ]),
          });
          producer.emit('response', schema, oid, mime, code);
        }
      }
      resDefs[code] = Object.keys(content);
    }

    defs[oid] = {
      path,
      method,
      parameters: paramDefs,
      body: bodyDef,
      responses: resDefs,
    };
  }
  return defs;
}

/** Inline dereference */
function dereference(obj: {readonly $ref: string}, doc: unknown): any {
  const ref = obj.$ref;
  assert(ref.startsWith('#'), 'Unsupported reference: %s', ref);
  return dereferencePointer(ref.slice(1), doc);
}

export type OperationSchema = any;

export interface OperationListeners {
  parameter(schema: OperationSchema, oid: string, name: string): void;
  requestBody(schema: OperationSchema, oid: string, mime: MimeType): void;
  response(
    schema: OperationSchema,
    oid: string,
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
