import {
  assert,
  extractStatusError,
  failure,
  statusProtocolCode,
  unreachable,
} from '@mtth/stl-errors';
import {
  fromAsyncIterable,
  mapAsyncIterable,
  toAsyncIterable,
} from '@mtth/stl-utils/collections';
import {jsonSeqDecoder, jsonSeqEncoder} from 'abaca/codecs/node/json-seq';
import http from 'http';
import Koa from 'koa';
import fetch from 'node-fetch';

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
      encoders: {'application/json-seq': jsonSeqEncoder()},
      decoders: {'application/json-seq': jsonSeqDecoder()},
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
      body: {rows: getRes1.body.rows.slice(1)},
    });
    expect(updateRes).toMatchObject({code: 204, raw: {status: 204}});

    const getRes2 = await sdk.getTable({
      params: {id},
      headers: {accept: 'text/csv'},
    });
    expect(getRes2).toMatchObject({code: 200, body: 'b,2'});
  });

  test('get missing', async () => {
    const res = await sdk.getTable({params: {id: 'unknown'}});
    expect(res).toMatchObject({code: 404, body: undefined});
  });

  test('set invalid', async () => {
    const res = await sdk.setTable({
      params: {id: 'unused'},
      // @ts-expect-error rows should be array
      body: {rows: {}},
    });
    expect(res).toMatchObject({
      code: 'default',
      body: {error: {code: 'ERR_INVALID_REQUEST'}},
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
    const got = await fromAsyncIterable(getRes.body);
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
        return {body: table};
      case 'application/json-seq':
        return {
          type: 'application/json-seq',
          body: mapAsyncIterable(toAsyncIterable(table.rows), (r) => ({
            kind: 'row',
            row: r,
          })),
        };
      case 'text/csv':
        return {
          type: 'text/csv',
          body: table.rows?.map((r) => r.join(',')).join('\n') ?? '',
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
