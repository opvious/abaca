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

test('creates and fetches a pet', async () => {
  // Each operation in the OpenAPI specification has a corresponding function on
  // the SDK instance. Its input and output types are automatically generated
  // from the operation's schema. For example the request's `body` must match a
  // `Schema<'PetInput'> here:
  const createRes = await sdk.createPet({body: {name: 'Fido'}});

  // Response types can be narrowed by checking the response's code. This is
  // useful since different codes typically have different response schemas, for
  // example successful response and errors. In this example we did not declare
  // any errors in our specification so their data's type is `unknown`.
  assertType<Schema<'Pet'> | unknown>(createRes.data);
  // However after asserting that our response is successful...
  assert(createRes.code === 201);
  // ...the response's data type is narrowed accordingly.
  assertType<Schema<'Pet'>>(createRes.data);

  const petId = createRes.data.id;
  const showRes = await sdk.showPetById({params: {petId}});
  // It is often convenient to switch on a response's possible codes to access
  // individually narrowed types.
  switch (showRes.code) {
    case 200:
      assertType<Schema<'Pet'>>(showRes.data); // `data` is typed as `Pet` here
      expect(showRes.data.name).toEqual('Fido');
      break;
    case 404:
      // We did not declare a body in our specification for 404 responses so it
      // is typed as `undefined`.
      assertType<undefined>(showRes.data);
      break;
    default:
      // Bodies for undeclared response codes are typed as `unknown` since we do
      // not have any type information for them in the schema (ssee also the
      // invalid input test below).
      assertType<unknown>(showRes.data);
  }
  expect.assertions(1);
});

test('fetches a missing pet', async () => {
  // Request parameters (both path and query) are also typed according to the
  // specification. They are exposed via the `params` attribute:
  const res = await sdk.showPetById({params: {petId: 123}});

  assert(res.code === 404);
  assertType<undefined>(res.data);
});

test('list no pets', async () => {
  // Requests without required parameters, or bodies can omit their argument
  // entirely.
  const res = await sdk.listPets();

  assert(res.code === 200);
  assertType<ReadonlyArray<Schema<'Pet'>>>(res.data);
  expect(res.data).toEqual([]);
});

test('handles invalid input', async () => {
  // Requests with invalid inputs will fail at compile time. For example if we
  // omit the required `name` input.
  // @ts-expect-error invalid request body (missing name)
  const res = await sdk.createPet({body: {tag: '1234'}});

  assert(res.raw.status === 400);
  // Since we didn't declare 400 error responses in this example's
  // specification, its data's type is left `unknown`. We can still access its
  // value though: in this case we know that it is a string containing the
  // relevant error message.
  expect(res.data).contains('Invalid body');
});
