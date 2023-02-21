import Router from '@koa/router';
import {absurd, assert, unexpected, unreachable} from '@opvious/stl-errors';
import http from 'http';
import Koa from 'koa';
import koaBody from 'koa-body';
import fetch from 'node-fetch';
import {Writable} from 'ts-essentials';

import {startApp, touch} from './helpers';
import {createSdk, RequestBody, ResponseData, Sdk, types} from './pets-sdk.gen';

describe('pets', () => {
  let sdk: Sdk<typeof fetch>;
  let app: Koa<any, any>;
  let server: http.Server;

  beforeAll(async () => {
    const router = newRouter();
    app = new Koa().use(router.allowedMethods()).use(router.routes());
    server = await startApp(app);
    const addr = server.address();
    assert(addr, 'Missing server address');
    sdk = createSdk(
      typeof addr == 'string' ? addr : `http://localhost:${addr.port}`,
      {fetch}
    );
  });

  afterAll(() => {
    server?.close();
  });

  test('empty argument 200 code', async () => {
    const res = await sdk.listPets({});
    switch (res.code) {
      case 200:
        expect<ReadonlyArray<types['Pet']>>(res.data).toEqual([]);
        break;
      default:
        throw unexpected(res);
    }
  });

  test('query parameter', async () => {
    const res = await sdk.listPets({
      parameters: {limit: 5},
    });
    switch (res.code) {
      case 200:
      case '2XX':
        throw unexpected(res);
      default:
        expect<number>(res.data.code).toEqual(400);
    }
  });

  test('unexpected code no matching accept', async () => {
    const res = await sdk.listPets({
      headers: {accept: 'text/plain'},
    });
    switch (res.code) {
      case '2XX':
        throw unexpected(res);
      default:
        expect(res.code).toEqual('default');
        expect(res.raw.status).toEqual(406);
        expect<undefined>(res.data).toBeUndefined();
    }
  });

  test('unexpected code', async () => {
    const res = await sdk.listPets({
      headers: {accept: '*/*'},
    });
    switch (res.code) {
      case 200:
      case '2XX':
        throw unexpected(res);
      default:
        expect(res.code).toEqual('default');
        expect(res.raw.status).toEqual(406);
        expect<types['Error']>(res.data).toBeUndefined();
    }
  });

  test('no-argument 200 request', async () => {
    const res = await sdk.listPets();
    switch (res.code) {
      case 200:
        expect<ReadonlyArray<types['Pet']>>(res.data).toEqual([]);
        break;
      default:
        throw unexpected(res);
    }
  });

  test('required path parameter', async () => {
    const res = await sdk.showPetById({
      parameters: {petId: '12'},
    });
    switch (res.code) {
      case 200:
        throw unexpected(res);
      default:
        expect(res.code).toEqual('default');
        expect(res.raw.status).toEqual(404);
    }
  });

  test('optional query parameter', async () => {
    const res = await sdk.listPets({parameters: {limit: 1}});
    let data: ResponseData<'listPets', 200> | undefined;
    switch (res.code) {
      case 200:
        data = res.data;
        break;
      default:
        throw unexpected(res);
    }
    expect(data).toEqual([]);
  });

  test('required body', async () => {
    const cres = await sdk.createPet({
      body: {name: 'n', tag: 't'},
      headers: {accept: 'text/plain'},
    });
    if (cres.code !== 201) {
      throw unreachable();
    }
    const id: string = cres.data;
    const body: RequestBody<'updatePetTag'> = {name: 'a'};
    const res = await sdk.updatePetTag({body, parameters: {petId: id}});
    switch (res.code) {
      case 200:
        expect<types['Pet']>(res.data).toEqual({id, name: 'a', tag: 't'});
        break;
      default:
        throw unexpected(res);
    }
  });

  test('explicit decoder', async () => {
    const res = await sdk.listPets({
      headers: {
        accept: 'application/json',
      },
      decoder: () => [],
    });
    switch (res.code) {
      case 200:
        expect(res.data).toEqual([]);
        break;
      default:
        throw unexpected(res);
    }
  });

  test('empty response content type', async () => {
    const res = await sdk.getPetAge({parameters: {petId: 'hi'}});
    switch (res.code) {
      case 200:
        touch<number>(res.data);
        throw unexpected(res);
      case 400:
        touch<undefined>(res.data);
        throw unexpected(res);
      case 404:
        break;
      case 'default':
        throw unexpected(res);
      default:
        throw absurd(res);
    }
  });

  test('empty response content type with accept one header', async () => {
    const res = await sdk.getPetAge({
      parameters: {petId: 'hi'},
      headers: {accept: 'application/*'},
    });
    switch (res.code) {
      case 200:
        touch<number>(res.data);
        throw unexpected(res);
      case 400:
        touch<undefined>(res.data);
        throw unexpected(res);
      case 404:
        touch<undefined>(res.data);
        break;
      case 'default':
        throw unexpected(res);
      default:
        throw absurd(res);
    }
  });

  test('empty response content type with accept all header', async () => {
    const res = await sdk.getPetAge({
      parameters: {petId: 'hi'},
      headers: {accept: 'text/*'},
    });
    switch (res.code) {
      case 200:
        touch<undefined>(res.data);
        throw unexpected(res);
      case 400:
        touch<string>(res.data);
        throw unexpected(res);
      case 404:
        touch<undefined>(res.data);
        break;
      case 'default':
        throw unexpected(res);
      default:
        throw absurd(res);
    }
  });
});

function newRouter(): Router {
  const pets = new Map<string, Writable<types['Pet']>>();
  return new Router()
    .use(koaBody())
    .get('/pets', (ctx) => {
      ctx.status = 200;
      const limit = ctx.query.limit ?? 2;
      if (limit! > 2) {
        ctx.status = 400;
        ctx.body = {code: 400, message: 'Limit too high'};
        return;
      }
      if (ctx.accepts('text/plain')) {
        ctx.status = 406;
        ctx.body = 'json only';
        return;
      }
      ctx.body = [...pets.values()];
    })
    .post('/pets', (ctx) => {
      const id = '' + (pets.size + 1);
      pets.set(id, {...ctx.request.body, id});
      ctx.status = 201;
      if (ctx.accepts('text/plain')) {
        ctx.body = id;
      }
    })
    .get('/pets/:petId', (ctx) => {
      const pet = pets.get(ctx.params.petId!);
      if (pet) {
        ctx.body = pet;
      } else {
        ctx.status = 404;
        ctx.body = {code: 404, message: 'Pet not found'};
      }
    })
    .put('/pets/:petId', (ctx) => {
      const pet = pets.get(ctx.params.petId!);
      if (!pet) {
        ctx.status = 404;
        ctx.body = {code: 404, message: 'Pet not found'};
        return;
      }
      Object.assign(pet, ctx.request.body);
      ctx.body = pet;
    })
    .get('/pets/:petId/age', (ctx) => {
      const pet = pets.get(ctx.params.petId!);
      if (pet) {
        ctx.body = 10;
      } else {
        ctx.status = 404;
      }
    });
}
