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

export type OperationDefinitions<O> = {
  readonly [K in keyof O]: OperationDefinition;
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

export interface OperationDefinition {
  readonly path: string;
  readonly method: OperationMethod;
  readonly parameters: {readonly [name: string]: ParameterDefinition};
  readonly body?: BodyDefinition;
  readonly responses: {readonly [code: ResponseCode]: ReadonlyArray<MimeType>};
}

export interface ParameterDefinition {
  readonly location: ParameterLocation;
  readonly required: boolean;
}

export type ParameterLocation = 'header' | 'path' | 'query';

export interface BodyDefinition {
  readonly required: boolean;
  readonly types: ReadonlyArray<MimeType>;
}
