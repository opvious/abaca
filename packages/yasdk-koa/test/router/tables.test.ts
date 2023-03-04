import {assert, unreachable} from '@opvious/stl-errors';
import http from 'http';
import Koa from 'koa';
import fetch from 'node-fetch';
import {afterAll, beforeAll, beforeEach, describe, expect, test} from 'vitest';

import * as sut from '../../src/router/index.js';
import {loadDocument, startApp} from '../helpers.js';
import {createSdk, operations, Sdk, types} from '../tables-sdk.gen.js';

describe('tables', async () => {
  const handler = new Handler();
  let sdk: Sdk<typeof fetch>;
  let server: http.Server;

  beforeAll(async () => {
    const doc = await loadDocument('tables.openapi.yaml');
    const router = sut.operationsRouter<operations>({doc, handlers: handler});

    const app = new Koa<any, any>()
      .use(router.allowedMethods())
      .use(router.routes());
    server = await startApp(app);

    const addr = server.address();
    assert(addr, 'Missing server address');
    const root =
      typeof addr == 'string' ? addr : `http://localhost:${addr.port}`;
    sdk = createSdk(root, {fetch});
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
      parameters: {id},
      headers: {'content-type': 'text/csv'},
      body: 'a,1\nb,2',
    });
    expect(createRes).toMatchObject({code: 201, raw: {status: 201}});

    const getRes1 = await sdk.getTable({parameters: {id}});
    assert(getRes1.code === 200, '');

    const updateRes = await sdk.setTable({
      parameters: {id},
      body: {rows: getRes1.data.rows.slice(1)},
    });
    expect(updateRes).toMatchObject({code: 204, raw: {status: 204}});

    const getRes2 = await sdk.getTable({
      parameters: {id},
      headers: {accept: 'text/csv'},
    });
    expect(getRes2).toMatchObject({code: 200, data: 'b,2'});
  });

  test('get missing', async () => {
    const res = await sdk.getTable({parameters: {id: 'unknown'}});
    expect(res).toMatchObject({code: 404, data: undefined});
  });

  test('set invalid', async () => {
    const res = await sdk.setTable({
      parameters: {id: 'unused'},
      body: {rows: 123} as any,
    });
    expect(res).toMatchObject({
      code: 'default',
      data: {code: 'ERR_REQUEST_INVALID_BODY'},
      raw: {status: 400},
    });
  });
});

type Contexts = sut.KoaContextsFor<operations>;

type Values = sut.KoaValuesFor<operations>;

class Handler implements sut.KoaHandlersFor<operations> {
  private readonly tables = new Map<string, types['Table']>();

  reset(): void {
    this.tables.clear();
  }

  getTable(ctx: Contexts['getTable']): Values['getTable'] {
    const table = this.tables.get(ctx.params.id);
    if (!table) {
      return 404;
    }
    switch (ctx.accepts(['application/json', 'text/csv'])) {
      case 'application/json':
        return {data: table};
      case 'text/csv':
        return {
          data: table.rows?.map((r) => r.join(',')).join('\n') ?? '',
          type: 'text/csv',
        };
      default:
        throw unreachable();
    }
  }

  setTable(ctx: Contexts['setTable']): Values['setTable'] {
    let table: types['Table'];
    switch (ctx.request.type) {
      case 'application/json':
        table = ctx.request.body;
        break;
      case 'text/csv':
        table = {rows: ctx.request.body.split('\n').map((r) => r.split(','))};
    }
    const {id} = ctx.params;
    const created = !this.tables.has(id);
    this.tables.set(id, table);
    return created ? 201 : 204;
  }
}
