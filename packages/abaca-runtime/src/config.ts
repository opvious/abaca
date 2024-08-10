import {AsyncOrSync, Lookup} from './common.js';
import {
  AllBodyMimeTypes,
  AllResponseMimeTypes,
  AllResponsesMatchingMimeType,
  BodiesMatchingMimeType,
  WithMimeTypeGlobs,
} from './mime-types.js';
import {MimeType, OperationTypes} from './operations.js';

export interface SdkConfigFor<
  O extends OperationTypes<keyof O & string>,
  F extends BaseFetch = typeof fetch,
> {
  /** API server address. */
  readonly address: Address;

  /** Global request headers, overridable in individual requests. */
  readonly headers?: RequestHeaders;

  /**
   * Other global request options. These can similarly be overriden in
   * individual fetch calls.
   */
  readonly options?: RequestOptions<F>;

  /** Underlying fetch method. */
  readonly fetch?: FetchOption<F>;

  /** Global request body encoders. */
  readonly encoders?: EncodersFor<O, F>;

  /** Global response decoders. */
  readonly decoders?: DecodersFor<O, F>;

  /**
   * Unexpected response coercion. The default will ignore bodies of responses
   * which do not have any declared content and throw an error otherwise.
   */
  readonly coercer?: Coercer<F>;
}

type Address = string | URL | AddressInfo;

interface AddressInfo {
  // net.AddressInfo
  readonly address: string;
  readonly port: number;
}

export type RequestHeaders = Record<string, string>;

export interface BaseInit<B = any> {
  readonly body?: B;
  readonly headers: RequestHeaders;
  readonly method: string;
}

export interface BaseResponse {
  readonly status: number;
  readonly headers: {
    get(name: string): string | null | undefined;
  };
  text(): Promise<string>;
}

export type BaseFetch = (url: string, init: BaseInit) => Promise<BaseResponse>;

export type FetchOption<F extends BaseFetch = typeof fetch> = (
  url: string,
  init: BaseInit<BodyInitFor<F>> & RequestOptions<F>
) => Promise<ResponseFor<F>>;

export type RequestOptions<F> = Omit<
  RequestInitFor<F>,
  'body' | 'headers' | 'method'
>;

type RequestInitFor<F> = F extends (url: any, init?: infer R) => any
  ? R
  : never;

export type EncodersFor<O extends OperationTypes, F extends BaseFetch> = {
  readonly [K in WithMimeTypeGlobs<AllBodyMimeTypes<O>>]?: Encoder<
    BodiesMatchingMimeType<O, K>,
    F
  >;
};

export type Encoder<B = any, F extends BaseFetch = typeof fetch> = (
  body: B,
  ctx: EncoderContext<F>
) => AsyncOrSync<BodyInitFor<F>>;

export type BodyInitFor<F> = Lookup<RequestInitFor<F>, 'body', unknown>;

export interface EncoderContext<F> {
  readonly operationId: string;
  readonly contentType: string;
  readonly headers: RequestHeaders;
  readonly options?: RequestOptions<F>;
}

export type DecodersFor<O extends OperationTypes, F extends BaseFetch> = {
  readonly [K in WithMimeTypeGlobs<AllResponseMimeTypes<O>>]?: Decoder<
    AllResponsesMatchingMimeType<O, K>,
    F
  >;
};

export type Decoder<R = any, F extends BaseFetch = typeof fetch> = (
  res: ResponseFor<F>,
  ctx: DecoderContext<F>
) => AsyncOrSync<R>;

export type ResponseFor<F> = F extends (
  url: any,
  init?: any
) => Promise<infer R>
  ? R
  : never;

export interface DecoderContext<F> {
  readonly operationId: string;
  readonly contentType: string;
  readonly headers: RequestHeaders;
  readonly options?: RequestOptions<F>;
}

export type Coercer<F extends BaseFetch> = (
  res: ResponseFor<F>,
  ctx: CoercerContext
) => AsyncOrSync<MimeType | undefined>;

export interface CoercerContext {
  readonly path: string;
  readonly method: string;
  readonly received: MimeType | undefined;
  readonly accepted: ReadonlySet<MimeType>;
  readonly declared: ReadonlySet<MimeType> | undefined; // undefined if implicit
}
