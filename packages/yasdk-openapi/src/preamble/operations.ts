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

export type ResponseCode = number | ResponseCodeRange | 'default' | string;

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

// Reified definitions

export type OperationDefinitions<O> = {
  readonly [K in keyof O]: OperationDefinition;
};

export interface OperationDefinition {
  readonly path: string;
  readonly method: string;
  readonly parameters: Record<string, ParameterLocation>;
  readonly codes: Record<ResponseCode, ReadonlyArray<MimeType>>;
}

export type ParameterLocation = 'header' | 'path' | 'query';
