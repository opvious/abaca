import {
  assert,
  extractStatusError,
  failure,
  statusProtocolCode,
  unreachable,
} from '@opvious/stl-errors';
import {
  fromAsyncIterable,
  mapAsyncIterable,
  toAsyncIterable,
} from '@opvious/stl-utils/collections';
import http from 'http';
import jsonSeq from 'json-text-sequence';
import Koa from 'koa';
import fetch from 'node-fetch';
import stream from 'stream';

import * as sut from '../../src/router/index.js';
import {loadResourceDocument, serverAddress, startApp} from '../helpers.js';
import {createSdk, Operations, Schema, Sdk} from '../tables-sdk.gen.js';

describe('tables', async () => {
  const handler = new Handler();
  let sdk: Sdk<typeof fetch>;
  let server: http.Server;

  beforeAll(async () => {
    const doc = await loadResourceDocument('tables.openapi.yaml');
    const router = sut.createOperationsRouter<Operations>({
      document: doc,
      handlers: handler,
      decoders: {
        'application/json-seq': (ctx) => {
          const decoder = new jsonSeq.Parser();
          ctx.req.pipe(decoder);
          return decoder;
        },
      },
      encoders: {
        'application/json-seq': (iter, ctx) => {
          const encoder = new jsonSeq.Generator();
          stream.Readable.from(iter).pipe(encoder);
          ctx.body = encoder;
        },
      },
    });

    const app = new Koa<any, any>()
      .use(async (ctx, next) => {
        try {
          await next();
        } catch (err) {
          const serr = extractStatusError(err);
          ctx.status = statusProtocolCode('http', serr);
          ctx.body = failure(serr);
        }
      })
      .use(router.allowedMethods())
      .use(router.routes());
    server = await startApp(app);
    sdk = createSdk<typeof fetch>({
      address: serverAddress(server),
      fetch,
      encoders: {
        'application/json-seq': (iter) => {
          const encoder = new jsonSeq.Generator();
          return stream.Readable.from(iter).pipe(encoder);
        },
      },
      decoders: {
        'application/json-seq': (res) => {
          const decoder = new jsonSeq.Parser();
          res.body!.pipe(decoder);
          return decoder;
        },
      },
    });
  });

  beforeEach(() => {
    handler.reset();
  });

  afterAll(() => {
    server?.close();
  });

  test('set and get', async () => {
    const id = 'id1';

    const createRes = await sdk.setTable({
      params: {id},
      headers: {'content-type': 'text/csv'},
      body: 'a,1\nb,2',
    });
    expect(createRes).toMatchObject({code: 201, raw: {status: 201}});

    const getRes1 = await sdk.getTable({
      headers: {accept: 'application/json'},
      params: {id},
    });
    assert(getRes1.code === 200, '');

    const updateRes = await sdk.setTable({
      params: {id},
      body: {rows: getRes1.data.rows.slice(1)},
    });
    expect(updateRes).toMatchObject({code: 204, raw: {status: 204}});

    const getRes2 = await sdk.getTable({
      params: {id},
      headers: {accept: 'text/csv'},
    });
    expect(getRes2).toMatchObject({code: 200, data: 'b,2'});
  });

  test('get missing', async () => {
    const res = await sdk.getTable({params: {id: 'unknown'}});
    expect(res).toMatchObject({code: 404, data: undefined});
  });

  test('set invalid', async () => {
    const res = await sdk.setTable({
      params: {id: 'unused'},
      body: {rows: 123} as any,
    });
    expect(res).toMatchObject({
      code: 'default',
      data: {error: {code: 'ERR_INVALID_REQUEST'}},
      raw: {status: 400},
    });
  });

  test('set and get stream', async () => {
    const id = 'id3';
    const rows = [
      ['a', '11'],
      ['b', '222'],
    ];

    const createRes = await sdk.setTable({
      params: {id},
      headers: {'content-type': 'application/json-seq'},
      body: toAsyncIterable(rows),
    });
    expect(createRes).toMatchObject({code: 201});

    const getRes = await sdk.getTable({
      headers: {accept: 'application/json-seq'},
      params: {id},
    });
    assert(getRes.code === 200, '');
    const got = await fromAsyncIterable(getRes.data);
    expect(got).toEqual(rows.map((r) => ({kind: 'row', row: r})));
  });
});

type Contexts = sut.KoaContextsFor<Operations>;

type Values = sut.KoaValuesFor<Operations>;

class Handler implements sut.KoaHandlersFor<Operations> {
  private readonly tables = new Map<string, Schema<'Table'>>();

  reset(): void {
    this.tables.clear();
  }

  getTable(ctx: Contexts['getTable']): Values['getTable'] {
    const table = this.tables.get(ctx.params.id);
    if (!table) {
      return 404;
    }
    switch (
      ctx.accepts(['application/json', 'application/json-seq', 'text/csv'])
    ) {
      case 'application/json':
        return {data: table};
      case 'application/json-seq':
        return {
          type: 'application/json-seq',
          data: mapAsyncIterable(toAsyncIterable(table.rows), (r) => ({
            kind: 'row',
            row: r,
          })),
        };
      case 'text/csv':
        return {
          type: 'text/csv',
          data: Buffer.from(
            table.rows?.map((r) => r.join(',')).join('\n') ?? ''
          ),
        };
      default:
        throw unreachable();
    }
  }

  async setTable(ctx: Contexts['setTable']): Promise<Values['setTable']> {
    let table: Schema<'Table'>;
    switch (ctx.request.type) {
      case 'application/json':
        table = ctx.request.body;
        break;
      case 'application/json-seq': {
        const rows = await fromAsyncIterable(ctx.request.body);
        table = {rows};
        break;
      }
      case 'text/csv':
        table = {rows: ctx.request.body.split('\n').map((r) => r.split(','))};
    }
    const {id} = ctx.params;
    const created = !this.tables.has(id);
    this.tables.set(id, table);
    return created ? 201 : 204;
  }
}
