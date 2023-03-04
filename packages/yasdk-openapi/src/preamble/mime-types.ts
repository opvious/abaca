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
export const TEXT_MIME_TYPE = 'text/*';
export const PLAIN_MIME_TYPE = 'text/plain';
export const FALLBACK_MIME_TYPE = '*/*';

export type MimeTypePrefixes<M extends MimeType> =
  M extends `${infer P}/${infer _S}` ? `${P}/*` : never;

type SplitMimeTypes<G extends MimeType> = G extends `${infer G1}, ${infer G2}`
  ? G1 | SplitMimeTypes<G2>
  : G;

export type ValuesMatchingMimeTypes<O, G extends MimeType> = Values<{
  [M in keyof O & MimeType]: SplitMimeTypes<G> &
    WithMimeTypeGlobs<M> extends never
    ? never
    : O[M];
}>;

function contentTypeMatches(
  exact: MimeType,
  globs: ReadonlyArray<MimeType>
): boolean {
  for (const glob of globs) {
    if (exact === glob || glob === FALLBACK_MIME_TYPE) {
      return true;
    }
    const got = exact.split('/');
    const want = glob.split('/');
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

  getBest(args: {
    readonly status: number;
    readonly accepted: ReadonlyArray<MimeType>;
    readonly proposed: MimeType | '';
    readonly coerce: (
      declared: ReadonlySet<MimeType> | undefined
    ) => MimeType | undefined;
  }): ResponseClause {
    const {status, accepted, proposed, coerce} = args;
    const code = this.getBestCode(status);
    const declared = this.data.get(code);
    if (
      proposed &&
      declared?.has(proposed) &&
      contentTypeMatches(proposed, accepted)
    ) {
      return {code, contentType: proposed};
    }
    if (!declared?.size && !proposed) {
      return {code};
    }
    const coerced = coerce(declared);
    return {code, contentType: coerced};
  }

  declaredMimeTypes(status?: number): ReadonlySet<MimeType> {
    if (status != null) {
      return this.data.get(this.getBestCode(status)) ?? new Set();
    }
    const ret = new Set<MimeType>();
    for (const mtypes of this.data.values()) {
      for (const mtype of mtypes.keys()) {
        ret.add(mtype);
      }
    }
    return ret;
  }

  acceptable(accepted: ReadonlyArray<MimeType>): boolean {
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
}

export interface ResponseClause {
  readonly code: ResponseCode;
  readonly contentType?: MimeType;
}