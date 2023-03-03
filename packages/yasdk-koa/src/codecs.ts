import * as coBody from 'co-body';
import Koa from 'koa';
import {AsyncOrSync, ResponseCode} from 'yasdk-openapi/preamble';

export type Decoder<B, S = {}> = (
  ctx: Koa.ParameterizedContext<S>
) => AsyncOrSync<B>;

export type Encoder<D, S = {}> = (
  data: D,
  ctx: Koa.ParameterizedContext<S>
) => AsyncOrSync<void>;

const JSON_MIME_TYPE = 'application/json';

const jsonDecoder: Decoder<any> = (ctx) => coBody.json(ctx.req)

const jsonEncoder: Encoder<any> = (data, ctx) => {
  ctx.body = JSON.stringify(data);
};

const TEXT_MIME_TYPE = 'text/*';

const textDecoder: Decoder<any> = (ctx) => coBody.text(ctx.req);

const textEncoder: Encoder<any> = (data, ctx) => {
  ctx.body = data;
};

const FALLBACK_MIME_TYPE = '*/*';

const fallbackDecoder: Decoder<any> = (ctx) => {
  throw new Error('Unsupported request content-type: ' + ctx.request.type);
};

const fallbackEncoder: Encoder<any> = (_data, ctx) => {
  throw new Error('Unsupported response content-type: ' + ctx.type);
};
