import events from 'events';
import http from 'http';
import Koa from 'koa';

import {createRouter, createSdk, Schema, Sdk} from '../src/index.js';

let server: http.Server;
let sdk: Sdk;

beforeAll(async () => {
  const router = await createRouter();
  server = new Koa().use(router.routes()).listen();
  await events.once(server, 'listening');
  sdk = createSdk(server.address()!);
});

beforeEach(async () => {
  await sdk.clearPets();
});

afterAll(() => {
  server.close();
});

test('list no pets', async () => {
  const res = await sdk.listPets({});

  assert(res.code === 200);
  // Response data (body) type is narrowed to list of pets after code assertion
  assertType<ReadonlyArray<Schema<'Pet'>>>(res.data);
  expect(res.data).toEqual([]);
});

test('creates and fetches a pet', async () => {
  const createRes = await sdk.createPet({
    body: {name: ''},
    // fo: 123,
  });

  assert(createRes.code === 201);
  // Response data type is narrowed to a pet here
  assertType<Schema<'Pet'>>(createRes.data);
  const petId = createRes.data.id;

  const showRes = await sdk.showPetById({params: {petId}});
  assert(showRes.code === 200);
  // Similarly here
  assertType<Schema<'Pet'>>(showRes.data);
});

test('fetches a missing pet', async () => {
  const res = await sdk.showPetById({params: {petId: 123}});
  assert(res.code === 404);
  // The type of the response's data is narrowed to `undefined` here: 404s do
  // not have a body in our specification
  assertType<undefined>(res.data);
});

test('handles invalid input', async () => {
  // @ts-expect-error invalid request body (missing name)
  const res = await sdk.createPet({body: {tag: '1234'}});
  assert(res.raw.status === 400);
  // Since we didn't declare 400 error responses in this example's
  // specification, the response data's type is left `unknown`. We can still
  // access it though: in this case we know that it is a string containing the
  // relevant error message.
  expect(res.data).contains('Invalid body');
});
