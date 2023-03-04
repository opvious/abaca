import { assert, unexpected} from '@opvious/stl-errors';
import http from 'http';
import Koa from 'koa';
import fetch from 'node-fetch';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';

import * as sut from '../../src/router/index.js';
import {loadDocument, startApp} from '../helpers.js';
import {createSdk, operations, Sdk, types} from '../pets-sdk.gen.js';

describe('pets', async () => {
  let sdk: Sdk<typeof fetch>;
  let server: http.Server;

  beforeAll(async () => {
    const doc = await loadDocument('pets.openapi.yaml');
    const pets = new Map<number, types['Pet']>();
    const router = sut.operationsRouter<operations>({
      doc,
      handlers: {
        listPets: async (ctx) => {
          const limit = ctx.params.limit ?? 2;
          if (limit! > 2) {
            return {status: 400, data: {code: 400, message: 'Limit too high'}};
          }
          return {data: [...pets.values()]};
        },
        createPet: async (ctx) => {
          if (ctx.get('boom')) {
            return {status: 400, data: {code: 400, message: ''}};
          }
          const id = pets.size + 1;
          pets.set(id, {...ctx.request.body, id});
          if (ctx.accepts('text/plain')) {
            return {status: 201, type: 'text/plain', data: '' + id};
          }
          return 201;
        },
        showPetById: async (ctx) => {
          const {petId} = ctx.params;
          const pet = pets.get(+petId);
          return pet ? {data: pet} : 404;
        },
        updatePetTag: async (ctx) => {
          const pet = pets.get(+ctx.params.petId);
          if (!pet) {
            return 404;
          }
          Object.assign(pet, ctx.request.body);
          return {data: pet};
        },
      },
    });

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
    const res = await sdk.listPets();
    switch (res.code) {
      case 200:
        expect(res.data).toEqual([]);
        break;
      default:
        throw unexpected(res);
    }
  });
});
