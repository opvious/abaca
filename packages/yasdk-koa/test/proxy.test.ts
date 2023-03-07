import {assert} from '@opvious/stl-errors';
import http from 'http';
import Koa from 'koa';

import * as sut from '../src/proxy.js';
import {createOperationsRouter} from '../src/router/index.js';
import {loadDocument, serverAddress, startApp} from './helpers.js';
import {createSdk, operations, Sdk, types} from './tables-sdk.gen.js';

describe('operation proxy', () => {
  let sdk: Sdk<typeof fetch>;
  let server, readServer, writeServer: http.Server;
  let table: types['Table'] | undefined;

  beforeAll(async () => {
    const doc = await loadDocument('tables.openapi.yaml');

    const readRouter = createOperationsRouter<operations>({
      doc,
      handlers: {getTable: () => (table ? {data: table} : 404)},
    });
    readServer = await startApp(new Koa().use(readRouter.routes()));

    const writeRouter = createOperationsRouter<operations>({
      doc,
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
      doc,
      upstreams: {
        read: {target: serverAddress(readServer)},
        write: {target: serverAddress(writeServer)},
      },
      dispatch: (op) => (op.operationId === 'getTable' ? 'read' : 'write'),
    });
    server = await startApp(new Koa().use(proxy));
    sdk = createSdk(serverAddress(server), {fetch});
  });

  afterAll(() => {
    server.close();
    readServer.close();
    writeServer.close();
  });

  test('dispatches', async () => {
    const table: types['Table'] = {rows: [['a', 'one']]};
    const setRes = await sdk.setTable({parameters: {id: '1'}, body: table});
    expect(setRes).toMatchObject({code: 204});
    const getRes = await sdk.getTable({parameters: {id: '1'}});
    expect(getRes).toMatchObject({code: 200, data: table});
  });
});
