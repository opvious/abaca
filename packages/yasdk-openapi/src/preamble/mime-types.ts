import {Lookup, Has, KeysOfValues, Values} from './common.js';
import {
  MimeType,
  OperationDefinition,
  OperationTypes,
  ResponseCode,
  ResponsesType,
} from './operations.js';

export type WithGlobs<M> = M | MimeTypePrefixes<M> | '*/*';

export const JSON_MIME_TYPE = 'application/json';
export const TEXT_MIME_TYPE = 'text/*';
export const PLAIN_MIME_TYPE = 'text/plain';
export const FALLBACK_MIME_TYPE = '*/*';

export type MimeTypePrefixes<M> = M extends `${infer P}/${infer _S}`
  ? `${P}/*`
  : never;

export type ValuesMatchingMimeType<O, G> = Values<{
  [M in keyof O]: G extends WithGlobs<M> ? O[M] : never;
}>;

export function contentTypeMatches(exact: MimeType, glob: MimeType): boolean {
  if (exact === glob || glob === FALLBACK_MIME_TYPE) {
    return true;
  }
  const got = exact.split('/');
  const want = glob.split('/');
  return got[0] === want[0] && (got[1] === want[1] || want[1] === '*');
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
}>;

export type BodiesMatchingMimeType<O extends OperationTypes, G> = Values<{
  [K in keyof O]: ValuesMatchingMimeType<
    Lookup<O[K]['requestBody'], 'content'>,
    G
  >;
}>;

export type AllResponseMimeTypes<O extends OperationTypes<keyof O & string>> = Values<{
  [K in keyof O]: ResponseMimeTypes<O[K]['responses']>;
}>;

export type ResponseMimeTypes<R extends ResponsesType> = KeysOfValues<{
  [C in keyof R]: R[C] extends Has<'content', infer O> ? O : never;
}>;

export type AllResponsesMatchingMimeType<O extends OperationTypes, G> = Values<{
  [K in keyof O]: ResponsesMatchingMimeType<O[K]['responses'], G>;
}>;

export type ResponsesMatchingMimeType<R extends ResponsesType, G> = Values<{
  [C in keyof R]: R[C] extends Has<'content', infer O>
    ? ValuesMatchingMimeType<O, G>
    : never;
}>;

export class ResponseClauseMatcher<S = null> {
  private constructor(
    private readonly data: ReadonlyMap<ResponseCode, ReadonlyMap<MimeType, S>>
  ) {}

  static create<S>(
    responses: OperationDefinition<S>['responses']
  ): ResponseClauseMatcher<S> {
    const data = new Map<ResponseCode, Map<MimeType, S>>();
    for (const [code, mtypes] of Object.entries(responses)) {
      const ncode = +code;
      data.set(isNaN(ncode) ? code : ncode, new Map(Object.entries(mtypes)));
    }
    return new ResponseClauseMatcher(data);
  }

  getBest(args: {
    readonly status: number;
    readonly accepted: MimeType;
    readonly proposed: MimeType | '';
    readonly coerce: (eligible: ReadonlySet<MimeType>) => MimeType | undefined;
  }): ResponseClause<S> {
    const {status, accepted, proposed, coerce} = args;
    const code = this.getBestCode(status);
    const declared = this.data.get(code);
    const exact = declared?.get(proposed);
    if (
      proposed &&
      exact !== undefined &&
      contentTypeMatches(proposed, accepted)
    ) {
      return {code, contentType: proposed, schema: exact};
    }
    const eligible = new Set<MimeType>();
    if (declared) {
      for (const [mtype] of declared) {
        if (contentTypeMatches(mtype, accepted)) {
          eligible.add(mtype);
        }
      }
    }
    if (!eligible.size && !proposed) {
      return {code};
    }
    const coerced = coerce(eligible);
    return {
      code,
      contentType: coerced,
      schema: coerced == null ? undefined : declared?.get(coerced),
    };
  }

  declaredMimeTypes(status: number): ReadonlySet<MimeType> {
    return new Set(this.data.get(this.getBestCode(status))?.keys());
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

export interface ResponseClause<S = null> {
  readonly code: ResponseCode;
  readonly contentType?: MimeType;
  readonly schema?: S;
}
