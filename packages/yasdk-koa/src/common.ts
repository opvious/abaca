// Generic helpers

export type Has<N extends number | string | symbol, V> = {
  readonly [K in N]: V;
};

export type Get<O, N extends keyof O | string, D = never> = O extends Has<N, infer V>
  ? V & {}
  : D;

export type Lookup<O, N extends keyof O | string, D = undefined> = O extends Has<
  N,
  infer V
>
  ? V & {}
  : O extends Partial<Has<N, infer V>>
  ? (V & {}) | undefined
  : D;

export type Exact<T, V> = T extends V
  ? Exclude<keyof T, keyof V> extends never
    ? T
    : never
  : never;

type ValueOf<O> = O[keyof O];

type KeysOfValues<O> = ValueOf<{
  [K in keyof O]: keyof O[K];
}>;

// Operation types

export type OperationTypes<N extends string = string> = {
  readonly [K in N]: OperationType;
};

export interface OperationType<
  R extends ResponsesType = {},
  P extends ParametersType = {}
> {
  readonly parameters?: P;
  readonly requestBody?: {readonly content: ContentTypes};
  readonly responses: R;
}

export interface ParametersType<P = {}, Q = {}, H = {}> {
  readonly path?: P;
  readonly query?: Q;
  readonly headers?: H;
}

export type ResponsesType = {
  readonly [C in ResponseCode]?:
    | never
    | {
        readonly content: ContentTypes;
      };
}

export type ResponseCodeRange = '2XX' | '3XX' | '4XX' | '5XX';

export type ResponseCode = number | ResponseCodeRange | 'default';

export interface ContentTypes {
  readonly [M: MimeType]: ContentType;
}

export type MimeType = string;

export type ContentType = unknown;

// Response code matching

type Prefix = '2' | '3' | '4' | '5';

type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

type ResponseCodeString<
  P extends Prefix = Prefix,
  D1 extends Digit = Digit,
  D2 extends Digit = Digit
> = `${P}${D1}${D2}`;

type ResponseCodeRangeFor<P extends Prefix> = `${P}XX`;

export type ResponseCodesMatching<C extends ResponseCode> = C extends number
  ? `${C}` extends ResponseCodeString
    ? C
    : never
  : C extends ResponseCodeRangeFor<infer P>
  ? ResponseCodeString<P> extends `${infer N extends number}`
    ? N
    : never
  : never;
