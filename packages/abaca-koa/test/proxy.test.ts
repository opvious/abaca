import {assert} from '@mtth/stl-errors';
import http from 'http';
import Koa from 'koa';
import fetch from 'node-fetch';

import * as sut from '../src/proxy.js';
import {createOperationsRouter} from '../src/router/index.js';
import {loadResourceDocument, serverAddress, startApp} from './helpers.js';
import {createSdk, Operations, Schema, Sdk} from './tables-sdk.gen.js';

describe('operation proxy', () => {
  let sdk: Sdk<typeof fetch>;
  let server, readServer, writeServer: http.Server;
  let address: string;
  let table: Schema<'Table'> | undefined;

  beforeAll(async () => {
    const document = await loadResourceDocument('tables.openapi.yaml');

    const readRouter = createOperationsRouter<Operations>({
      document,
      handlers: {getTable: () => (table ? {body: table} : 404)},
    });
    readServer = await startApp(new Koa().use(readRouter.routes()));

    const writeRouter = createOperationsRouter<Operations>({
      document,
      handlers: {
        setTable: (ctx) => {
          assert(ctx.request.type === 'application/json', 'Bad request type');
          table = ctx.request.body;
          return 204;
        },
      },
    });
    writeServer = await startApp(new Koa().use(writeRouter.routes()));

    const proxy = sut.createOperationsProxy({
      document,
      upstreams: {
        read: {target: serverAddress(readServer)},
        write: {target: serverAddress(writeServer)},
      },
      dispatch: (op) => (op.operationId === 'getTable' ? 'read' : 'write'),
      prepare: async (ctx, op) => {
        ctx.set('oid', op.operationId);
      },
    });
    server = await startApp(new Koa().use(proxy));
    address = serverAddress(server);
    sdk = createSdk({address, fetch});
  });

  afterAll(() => {
    server.close();
    readServer.close();
    writeServer.close();
  });

  beforeEach(() => {
    table = undefined;
  });

  test('dispatches', async () => {
    const table: Schema<'Table'> = {rows: [['a', 'one']]};
    const setRes = await sdk.setTable({params: {id: '1'}, body: table});
    expect(setRes).toMatchObject({code: 204});
    const getRes = await sdk.getTable({params: {id: '1'}});
    expect(getRes).toMatchObject({code: 200, body: table});
  });

  test('calls prepare', async () => {
    const res = await sdk.getTable({params: {id: '100'}});
    expect(res.raw.headers.get('oid')).toEqual('getTable');
  });
});
