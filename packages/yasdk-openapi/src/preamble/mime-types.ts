import {Has, KeysOfValues, Lookup, Values} from './common.js';
import {
  MimeType,
  OperationDefinition,
  OperationTypes,
  ResponseCode,
  ResponsesType,
} from './operations.js';

export type WithMimeTypeGlobs<M extends MimeType> =
  | M
  | MimeTypePrefixes<M>
  | '*/*';

export const JSON_MIME_TYPE = 'application/json';
export const JSON_SEQ_MIME_TYPE = 'application/json-seq';
export const TEXT_MIME_TYPE = 'text/*';
export const PLAIN_MIME_TYPE = 'text/plain';
export const FALLBACK_MIME_TYPE = '*/*';

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

function contentTypeMatches(
  exact: MimeType,
  accepted: Iterable<MimeType>
): boolean {
  for (const item of accepted) {
    if (exact === item || item === FALLBACK_MIME_TYPE) {
      return true;
    }
    const got = exact.split('/');
    const want = item.split('/');
    if (got[0] === want[0] && (got[1] === want[1] || want[1] === '*')) {
      return true;
    }
  }
  return false;
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

export type AllBodyMimeTypes<O extends OperationTypes> = Values<{
  [K in keyof O]: keyof Lookup<O[K]['requestBody'], 'content'>;
}> &
  MimeType;

export type BodiesMatchingMimeType<
  O extends OperationTypes,
  G extends MimeType
> = Values<{
  [K in keyof O]: ValuesMatchingMimeTypes<
    Lookup<O[K]['requestBody'], 'content'>,
    G
  >;
}>;

export type AllResponseMimeTypes<O extends OperationTypes<keyof O & string>> =
  Values<{
    [K in keyof O]: ResponseMimeTypes<O[K]['responses']>;
  }> &
    MimeType;

export type ResponseMimeTypes<R extends ResponsesType> = KeysOfValues<{
  [C in keyof R]: R[C] extends Has<'content', infer O> ? O : never;
}> &
  MimeType;

export type AllResponsesMatchingMimeType<
  O extends OperationTypes,
  G extends MimeType
> = Values<{
  [K in keyof O]: ResponsesMatchingMimeType<O[K]['responses'], G>;
}>;

export type ResponsesMatchingMimeType<
  R extends ResponsesType,
  G extends MimeType
> = Values<{
  [C in keyof R]: R[C] extends Has<'content', infer O>
    ? ValuesMatchingMimeTypes<O, G>
    : never;
}>;

export class ResponseClauseMatcher {
  private constructor(
    private readonly data: ReadonlyMap<ResponseCode, ReadonlySet<MimeType>>
  ) {}

  static create(
    responses: OperationDefinition['responses']
  ): ResponseClauseMatcher {
    const data = new Map<ResponseCode, ReadonlySet<MimeType>>();
    for (const [code, mtypes] of Object.entries(responses)) {
      const ncode = +code;
      data.set(isNaN(ncode) ? code : ncode, new Set(mtypes));
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
      for (const mtype of mtypes) {
        if (contentTypeMatches(mtype, accepted)) {
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

export function isResponseTypeValid(args: {
  readonly value: MimeType | undefined;
  readonly declared: ReadonlySet<MimeType> | undefined;
  readonly accepted: ReadonlySet<MimeType>;
}): boolean {
  const {value, declared, accepted} = args;
  if (declared == null) {
    return value == null || contentTypeMatches(value, accepted);
  }
  if (!declared.size) {
    return value == null;
  }
  if (value == null || !declared.has(value)) {
    return false;
  }
  return contentTypeMatches(value, accepted);
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
  readonly declared?: ReadonlySet<MimeType>;
}
