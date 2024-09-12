import {AsyncOrSync, Lookup} from './common.js';
import {ContentFormat, MimeType, ResponseCode} from './operations.js';

// Configuration

export interface SdkConfig<F extends BaseFetch = BaseFetch> {
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
  readonly encoders?: Encoders<F>;

  /** Global response decoders. */
  readonly decoders?: Decoders<F>;

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
  blob(): Promise<Blob>;
  json(): Promise<any>;
  text(): Promise<string>;
}

export type BaseFetch = (url: string, init?: BaseInit) => Promise<BaseResponse>;

export type FetchOption<F extends BaseFetch = BaseFetch> = (
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

export interface Encoders<F extends BaseFetch> {
  readonly [mimeType: MimeType]: Encoder<F>;
}

export type Encoder<F extends BaseFetch = BaseFetch> = (
  body: unknown,
  ctx: EncoderContext<F>
) => AsyncOrSync<BodyInitFor<F>>;

export type BodyInitFor<F> = Lookup<RequestInitFor<F>, 'body', unknown>;

export interface EncoderContext<F> {
  readonly operationId: string;
  readonly content: ContentFormat;
  readonly headers: RequestHeaders;
  readonly options?: RequestOptions<F>;
}

export interface Decoders<F extends BaseFetch> {
  readonly [mimeType: MimeType]: Decoder<F>;
}

export type Decoder<F extends BaseFetch = BaseFetch> = (
  res: ResponseFor<F>,
  ctx: DecoderContext<F>
) => AsyncOrSync<unknown>;

export type ResponseFor<F> = F extends (
  url: any,
  init?: any
) => Promise<infer R>
  ? R
  : never;

export interface DecoderContext<F> {
  readonly operationId: string;
  readonly content: ContentFormat;
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
  readonly declared: ReadonlyMap<MimeType, ContentFormat> | undefined; // undefined if implicit
}

// Execution

export type SdkFunction<F extends BaseFetch = BaseFetch> = (
  op: string,
  req: SdkRequest<F>
) => Promise<SdkResponse<F>>;

export interface SdkRequest<F extends BaseFetch = BaseFetch> {
  readonly headers?: RequestHeaders;
  readonly params?: unknown;
  readonly body?: unknown;
  readonly options?: RequestOptions<F>;
}

export interface SdkResponse<F extends BaseFetch = BaseFetch> {
  readonly code: ResponseCode;
  readonly body?: unknown;
  readonly raw: ResponseFor<F>;
  readonly debug?: string;
}
