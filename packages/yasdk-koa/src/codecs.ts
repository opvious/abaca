import * as coBody from 'co-body';
import Koa from 'koa';
import {AsyncOrSync, ValueOf} from 'ts-essentials';

import {MimeType} from './common.js';

class ByMimeType<V> {
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

type WithGlobs<M> = M | MimeTypePrefixes<M> | '*/*';

type MimeTypePrefixes<M> = M extends `${infer P}/${infer _S}`
  ? `${P}/*`
  : never;

type ValuesMatchingMimeType<O, G> = ValueOf<{
  [M in keyof O]: G extends WithGlobs<M> ? O[M] : never;
}>;

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
