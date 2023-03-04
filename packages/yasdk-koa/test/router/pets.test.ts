import {assert} from '@opvious/stl-errors';
import http from 'http';
import Koa from 'koa';
import fetch from 'node-fetch';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';

import * as sut from '../../src/router/index.js';
import {loadDocument, startApp} from '../helpers.js';
import {createSdk, operations, Sdk, types} from '../pets-sdk.gen.js';

describe('pets', async () => {
  const handlers: sut.KoaHandlersFor<operations> = {};
  let sdk: Sdk<typeof fetch>;
  let server: http.Server;

  function setHandlers(obj: sut.KoaHandlersFor<operations>): void {
    for (const key of Object.keys(handlers)) {
      delete handlers[key];
    }
    Object.assign(handlers, obj);
  }

  beforeAll(async () => {
    const doc = await loadDocument('pets.openapi.yaml');
    const router = sut.operationsRouter<operations>({doc, handlers});

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

  afterAll(() => {
    server?.close();
  });

  test('lists pets', async () => {
    const pets: types['Pet'][] = [];
    setHandlers({
      listPets: async (ctx) => {
        const limit = ctx.params.limit ?? 2;
        if (limit! > 2) {
          return {status: 400, data: {code: 400, message: 'Limit too high'}};
        }
        return {data: pets};
      },
    });

    const res1 = await sdk.listPets();
    expect(res1).toMatchObject({code: 200, data: []});

    const res2 = await sdk.listPets({parameters: {limit: 3}});
    expect(res2).toMatchObject({
      code: 'default',
      data: {code: 400},
      raw: {status: 400},
    });
  });

  test('creates pet ', async () => {
    let pet: types['Pet'] | undefined;
    setHandlers({
      createPet: (ctx) => {
        pet = {id: 11, ...ctx.request.body};
        return {status: 201, type: 'text/plain', data: 'ok'};
      },
    });

    const res1 = await sdk.createPet({
      body: {name: 'n1', tag: 't1'},
      headers: {accept: '*/*'},
    });
    expect(res1).toMatchObject({code: 201, data: 'ok'});

    const res2 = await sdk.createPet({body: {name: 'n1', tag: 't2'}});
    expect(res2).toMatchObject({
      code: 'default',
      raw: {status: 406},
    });

    expect(pet).toEqual({id: 11, name: 'n1', tag: 't1'});
  });
});
