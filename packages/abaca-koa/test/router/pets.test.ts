import {OpenapiDocument} from 'abaca-openapi';
import http from 'http';
import Koa from 'koa';
import fetch from 'node-fetch';

import * as sut from '../../src/router/index.js';
import {loadResourceDocument, serverAddress, startApp} from '../helpers.js';
import {createSdk, Operations, Schema, Sdk} from '../pets-sdk.gen.js';

describe('pets', async () => {
  let document: OpenapiDocument;
  let sdk: Sdk<typeof fetch>;
  let server: http.Server;

  async function resetHandlers(
    handlers: sut.KoaHandlersFor<Operations>
  ): Promise<void> {
    const router = sut.createOperationsRouter<Operations>({
      document,
      handlers,
      handleInvalidRequests: true,
    });
    const app = new Koa<any, any>()
      .use(router.allowedMethods())
      .use(router.routes());
    server = await startApp(app);
    sdk = createSdk({address: serverAddress(server), fetch});
  }

  beforeAll(async () => {
    document = await loadResourceDocument('pets.openapi.yaml');
  });

  afterEach(() => {
    server?.close();
  });

  test('lists pets', async () => {
    const pets: Schema<'Pet'>[] = [];
    await resetHandlers({
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

    const res2 = await sdk.listPets({params: {limit: 3}});
    expect(res2).toMatchObject({
      code: 'default',
      data: {code: 400},
      raw: {status: 400},
    });
  });

  test('creates pet ', async () => {
    let pet: Schema<'Pet'> | undefined;
    await resetHandlers({
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

    const res2 = await sdk.createPet({
      body: {name: 'n1', tag: 't2'},
      headers: {accept: 'application/json;q=1'},
    });
    expect(res2).toMatchObject({
      code: 'default',
      raw: {status: 406},
    });

    expect(pet).toEqual({id: 11, name: 'n1', tag: 't1'});
  });
});
