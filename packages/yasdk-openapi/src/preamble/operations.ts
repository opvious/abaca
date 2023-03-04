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
};

export type ResponseCodeRange = '2XX' | '3XX' | '4XX' | '5XX';

export type ResponseCode = number | ResponseCodeRange | 'default' | string;

export interface ContentTypes {
  readonly [M: MimeType]: ContentType;
}

export type MimeType = string;

export type ContentType = unknown;

export type OperationDefinitions<O, S = null> = {
  readonly [K in keyof O]: OperationDefinition<S>;
};

type OperationMethod =
  | 'get'
  | 'put'
  | 'post'
  | 'delete'
  | 'options'
  | 'head'
  | 'patch'
  | 'trace';

export interface OperationDefinition<S = null> {
  readonly path: string;
  readonly method: OperationMethod;
  readonly parameters: Record<string, ParameterDefinition<S>>;
  readonly body?: BodyDefinition<S>;
  readonly responses: Record<ResponseCode, Record<MimeType, S>>;
}

export interface ParameterDefinition<S> {
  readonly location: ParameterLocation;
  readonly required: boolean;
  readonly schema: S;
}

export type ParameterLocation = 'header' | 'path' | 'query';

export interface BodyDefinition<S> {
  readonly required: boolean;
  readonly schemas: Record<MimeType, S>;
}
