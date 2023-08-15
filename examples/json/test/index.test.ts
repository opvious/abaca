import events from 'events';
import http from 'http';
import Koa from 'koa';

import {createRouter, createSdk, Sdk} from '../src/index.js';

let server: http.Server;
let sdk: Sdk;

beforeAll(async () => {
  const router = await createRouter();
  server = new Koa().use(router.routes()).listen();
  await events.once(server, 'listening');
  sdk = createSdk(`http://localhost:${(server.address() as any).port}`);
});

beforeEach(async () => {
  await sdk.clearPets();
});

afterAll(() => {
  server.close();
});

test('list no pets', async () => {
  const res = await sdk.listPets();
  assert(res.code === 200);
  expect(res.data).toEqual([]);
});

test('creates and fetches a pet', async () => {
  const createRes = await sdk.createPet({body: {name: 'Fido'}});
  assert(createRes.code === 201);
  const petId = createRes.data.id;

  const showRes = await sdk.showPetById({parameters: {petId}});
  assert(showRes.code === 200);
});

test('fetches a missing pet', async () => {
  const res = await sdk.showPetById({parameters: {petId: 123}});
  expect(res.code).toEqual(404);
});
