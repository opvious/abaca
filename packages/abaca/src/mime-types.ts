import {Get, Has, KeysOfValues, Lookup, Values} from './common.js';
import {
  ContentFormat,
  MimeType,
  OperationDefinition,
  OperationType,
  OperationTypes,
  ResponseCode,
  ResponsesType,
} from './operations.js';

export type WithMimeTypeGlobs<M extends MimeType> =
  | M
  | MimeTypePrefixes<M>
  | '*/*';

export const FALLBACK_MIME_TYPE = '*/*';

export const FORM_MIME_TYPE = 'application/x-www-form-urlencoded';
export const JSON_MIME_TYPE = 'application/json';
export const JSON_SEQ_MIME_TYPE = 'application/json-seq';
export const OCTET_STREAM_MIME_TIME = 'application/octet-stream';

export const MULTIPART_MIME_TYPE = 'multipart/*';
export const MULTIPART_FORM_MIME_TYPE = 'multipart/form-data';

export const PLAIN_MIME_TYPE = 'text/plain';
export const TEXT_MIME_TYPE = 'text/*';

export type MimeTypePrefixes<M extends MimeType> =
  M extends `${infer P}/${infer _S}` ? `${P}/*` : never;

export type SplitMimeTypes<G extends MimeType> =
  G extends `${infer G1}, ${infer G2}`
    ? ExtractMimeType<G1> | SplitMimeTypes<G2>
    : ExtractMimeType<G>;

type ExtractMimeType<G extends MimeType> = G extends `${infer M};${string}`
  ? M
  : G;

export type ValuesMatchingMimeTypes<O, G extends MimeType> = Values<{
  [M in keyof O & MimeType]: SplitMimeTypes<G> &
    WithMimeTypeGlobs<M> extends never
    ? never
    : O[M];
}>;

export function matchingContentType(
  exact: MimeType,
  accepted: Iterable<MimeType>
): MimeType | undefined {
  for (const elem of accepted) {
    if (exact === elem || elem === FALLBACK_MIME_TYPE) {
      return elem;
    }
    const got = exact.split('/');
    const want = elem.split('/');
    if (got[0] === want[0] && (got[1] === want[1] || want[1] === '*')) {
      return elem;
    }
  }
  return undefined;
}

export class ByMimeType<V> {
  private constructor(private readonly entries: Map<MimeType, V>) {}

  static create<V>(fallback: V): ByMimeType<V> {
    return new ByMimeType(new Map([[FALLBACK_MIME_TYPE, fallback]]));
  }

  add(key: MimeType, val: V): void {
    this.entries.set(key, val);
  }

  addAll(items: Record<MimeType, V> | undefined): void {
    for (const [key, val] of Object.entries(items ?? {})) {
      this.add(key, val);
    }
  }

  getBest(key: MimeType): V {
    const exact = this.entries.get(key);
    if (exact) {
      return exact;
    }
    const partial = this.entries.get(key.replace(/\/.+/, '/*'));
    if (partial) {
      return partial;
    }
    return this.entries.get(FALLBACK_MIME_TYPE)!;
  }
}

export type BodyContent<O extends OperationType> = Exclude<
  Lookup<O, 'requestBody'>,
  undefined
>['content'];

export type BodyMimeTypes<O extends OperationType> =
  BodyContent<O> extends never ? never : keyof BodyContent<O> & MimeType;

export type AllBodyMimeTypes<O extends OperationTypes> = Values<{
  [K in keyof O]: BodyMimeTypes<O[K]>;
}>;

export type BodiesMatchingMimeType<
  O extends OperationTypes<keyof O & string>,
  G extends MimeType,
> = Values<{
  [K in keyof O]: ValuesMatchingMimeTypes<BodyContent<O[K]>, G>;
}>;

export type AllResponseMimeTypes<O extends OperationTypes<keyof O & string>> =
  Values<{
    [K in keyof O]: ResponseMimeTypes<O[K]['responses']>;
  }> &
    MimeType;

export type ResponseMimeTypes<
  R extends ResponsesType,
  C extends keyof R = keyof R,
> = KeysOfValues<{
  [P in C]: Get<R[P], 'content'>;
}> &
  MimeType;

export type AllResponsesMatchingMimeType<
  O extends OperationTypes,
  G extends MimeType,
> = Values<{
  [K in keyof O]: ResponsesMatchingMimeType<O[K]['responses'], G>;
}>;

export type ResponsesMatchingMimeType<
  R extends ResponsesType,
  G extends MimeType,
> = Values<{
  [C in keyof R]: R[C] extends Has<'content', infer O>
    ? ValuesMatchingMimeTypes<O, G>
    : never;
}>;

export class ResponseClauseMatcher {
  private constructor(
    private readonly data: ReadonlyMap<
      ResponseCode,
      ReadonlyMap<MimeType, ContentFormat>
    >
  ) {}

  static create(
    responses: OperationDefinition['responses']
  ): ResponseClauseMatcher {
    const data = new Map<ResponseCode, ReadonlyMap<MimeType, ContentFormat>>();
    for (const [code, defs] of Object.entries(responses)) {
      const ncode = +code;
      const formats = new Map<MimeType, ContentFormat>();
      for (const def of defs) {
        formats.set(def.mimeType, def);
      }
      data.set(isNaN(ncode) ? code : ncode, formats);
    }
    return new ResponseClauseMatcher(data);
  }

  getBest(status: number): ResponseClause {
    const code = this.getBestCode(status);
    return {code, declared: this.data.get(code)};
  }

  private getBestCode(status: number): ResponseCode {
    const {data} = this;
    if (data.has(status)) {
      return status;
    }
    const partial = ((status / 100) | 0) + 'XX';
    if (data.has(partial)) {
      return partial;
    }
    return 'default';
  }

  acceptable(accepted: Iterable<MimeType>): boolean {
    for (const mtypes of this.data.values()) {
      if (!mtypes.size) {
        continue;
      }
      let overlap = false;
      for (const mtype of mtypes.keys()) {
        if (matchingContentType(mtype, accepted) !== undefined) {
          overlap = true;
          break;
        }
      }
      if (!overlap) {
        return false;
      }
    }
    return true;
  }
}

/**
 * If returns true and `value` is not-null, it is guaranteed that `value` is a
 * key in `declared`.
 */
export function isResponseTypeValid(args: {
  readonly value: MimeType | undefined;
  readonly declared: ReadonlyMap<MimeType, ContentFormat> | undefined;
  readonly accepted: ReadonlySet<MimeType>;
}): boolean {
  const {value, declared, accepted} = args;
  if (declared == null) {
    return value == null || matchingContentType(value, accepted) != null;
  }
  if (!declared.size) {
    return value == null;
  }
  if (value == null || !declared.has(value)) {
    return false;
  }
  return matchingContentType(value, accepted) != null;
}

export function acceptedMimeTypes(header: string): ReadonlySet<MimeType> {
  const mtypes = new Set<MimeType>();
  for (const item of header.split(',')) {
    const mtype = item.split(';')[0]!.trim();
    if (mtype && !mtypes.has(mtype)) {
      mtypes.add(mtype);
    }
  }
  return mtypes;
}

export interface ResponseClause {
  readonly code: ResponseCode;
  readonly declared?: ReadonlyMap<MimeType, ContentFormat>;
}
