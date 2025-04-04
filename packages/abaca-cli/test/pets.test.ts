import Router from '@koa/router';
import {absurd, assert, unexpected, unreachable} from '@mtth/stl-errors';
import http from 'http';
import Koa from 'koa';
import koaBody_ from 'koa-body';
import fetch from 'node-fetch';
import {Writable} from 'ts-essentials';

const koaBody = koaBody_.default ?? koaBody_;

import {startApp} from './helpers.js';
import {
  createSdk,
  RequestBody,
  ResponseBody,
  Schema,
  Sdk,
} from './pets-sdk.gen.js';

describe('pets', () => {
  let sdk: Sdk<typeof fetch>;
  let root: string;
  let server: http.Server;

  beforeAll(async () => {
    const router = newRouter();
    const app = new Koa<any, any>()
      .use(router.allowedMethods())
      .use(router.routes());
    server = await startApp(app);
    const addr = server.address();
    assert(addr, 'Missing server address');
    root = typeof addr == 'string' ? addr : `http://localhost:${addr.port}`;
    sdk = createSdk({address: server.address()!, fetch});
  });

  afterAll(() => {
    server?.close();
  });

  test('no-argument 200 code', async () => {
    const res = await sdk.listPets();
    switch (res.code) {
      case 200:
        expect<ReadonlyArray<Schema<'Pet'>>>(res.body).toEqual([]);
        break;
      default:
        throw unexpected(res);
    }
  });

  test('empty argument 200 code', async () => {
    const res = await sdk.listPets({});
    switch (res.code) {
      case 200:
        expect<ReadonlyArray<Schema<'Pet'>>>(res.body).toEqual([]);
        break;
      default:
        throw unexpected(res);
    }
  });

  test('query parameter', async () => {
    const res = await sdk.listPets({
      params: {limit: 5},
    });
    switch (res.code) {
      case 200:
      case '2XX':
        throw unexpected(res);
      default:
        expect<number>(res.body.code).toEqual(400);
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
        expect<undefined>(res.body).toBeUndefined();
    }
  });

  test('unexpected code', async () => {
    const res = await sdk.listPets({
      headers: {accept: 'text/*'},
    });
    switch (res.code) {
      case 200:
      case '2XX':
        throw unexpected(res);
      default:
        expect(res.code).toEqual('default');
        expect(res.raw.status).toEqual(406);
        expect<Schema<'Error'>>(res.body).toBeUndefined();
    }
  });

  test('required path parameter', async () => {
    const res = await sdk.showPetById({
      params: {petId: '12'},
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
    const res = await sdk.listPets({params: {limit: 1}});
    let body: ResponseBody<'listPets', 200> | undefined;
    switch (res.code) {
      case 200:
        body = res.body;
        break;
      default:
        throw unexpected(res);
    }
    expect(body).toEqual([]);
  });

  test('required body', async () => {
    const cres = await sdk.createPet({
      body: {name: 'n', tag: 't'},
      headers: {accept: 'text/plain'},
    });
    if (cres.code !== 201) {
      throw unreachable();
    }
    const id: string = cres.body;
    const body: RequestBody<'updatePetTag'> = {name: 'a'};
    const res = await sdk.updatePetTag({body, params: {petId: id}});
    switch (res.code) {
      case 200:
        expect<Schema<'Pet'>>(res.body).toEqual({id, name: 'a', tag: 't'});
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
        expect(res.body).toEqual([]);
        break;
      default:
        throw unexpected(res);
    }
  });

  test('empty response content type', async () => {
    const res = await sdk.getPetAge({params: {petId: 'hi'}});
    switch (res.code) {
      case 200:
        assertType<number>(res.body);
        throw unexpected(res);
      case 400:
        assertType<string>(res.body);
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
      params: {petId: 'hi'},
      headers: {accept: 'application/*'},
    });
    switch (res.code) {
      case 200:
        assertType<number>(res.body);
        throw unexpected(res);
      case 400:
        assertType<undefined>(res.body);
        throw unexpected(res);
      case 404:
        assertType<undefined>(res.body);
        break;
      case 'default':
        throw unexpected(res);
      default:
        throw absurd(res);
    }
  });

  test('empty response content type with accept all header', async () => {
    const res = await sdk.getPetAge({
      params: {petId: 'hi'},
      headers: {accept: 'text/*'},
    });
    switch (res.code) {
      case 200:
        assertType<undefined>(res.body);
        throw unexpected(res);
      case 400:
        assertType<string>(res.body);
        throw unexpected(res);
      case 404:
        assertType<undefined>(res.body);
        break;
      case 'default':
        throw unexpected(res);
      default:
        throw absurd(res);
    }
  });

  test('custom fetch', async () => {
    const sdk = createSdk<typeof fetch>({
      address: root,
      fetch: (url, init) => {
        init.headers.boom = '1';
        return fetch(url, init);
      },
    });
    const res = await sdk.createPet({body: {name: ''}});
    expect(res).toMatchObject({
      code: 'default',
      raw: {status: 599},
    });
  });
});

function newRouter(): Router {
  const pets = new Map<string, Writable<Schema<'Pet'>>>();
  return new Router()
    .use(koaBody())
    .get('/pets', (ctx) => {
      ctx.status = 200;
      const limit = +(ctx.query.limit ?? 2);
      if (limit > 2) {
        ctx.status = 400;
        ctx.body = {code: 400, message: 'Limit too high'};
        return;
      }
      if (!ctx.accepts('application/json')) {
        ctx.status = 406;
        ctx.body = 'json only';
        return;
      }
      ctx.body = [...pets.values()];
    })
    .post('/pets', (ctx) => {
      if (ctx.get('boom')) {
        ctx.status = 599;
        return;
      }
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
