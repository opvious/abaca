import events from 'events';
import http from 'http';
import Koa from 'Koa';
import {setTimeout} from 'timers/promises';

import {
  messagesRouter,
  MessagesSdk,
  messagesSdk,
  Schema,
} from '../src/index.js';

let server: http.Server;
let sdk: MessagesSdk;

beforeAll(async () => {
  const router = await messagesRouter();
  server = new Koa().use(router.routes()).listen();
  await events.once(server, 'listening');
  sdk = messagesSdk(`http://localhost:${(server.address() as any).port}`);
});

afterAll(() => {
  server.close();
});

test('client streaming', async () => {
  async function* messages(): AsyncIterable<Schema<'Message'>> {
    let count = 5;
    while (count-- > 0) {
      yield {contents: 'hi'};
      await setTimeout(75);
    }
  }

  const res = await sdk.ingestMessages({
    body: messages(),
    headers: {'content-type': 'application/json-seq'},
  });
  expect(res.code).toEqual(204);
});

test('server streaming', async () => {
  const res = await sdk.repeatMessage({
    body: 'hello',
    parameters: {count: 3},
    headers: {accept: 'application/json-seq', 'content-type': 'text/plain'},
  });
  assert(res.code === 200);

  const contents: string[] = [];
  for await (const msg of res.data) {
    contents.push(msg.contents);
  }
  expect(contents).toEqual(['hello', 'hello', 'hello']);
});

test('bi-directional streaming', async () => {
  async function* messages(): AsyncIterable<Schema<'Message'>> {
    let count = 2;
    while (count-- > 0) {
      yield {contents: 'hey'};
      await setTimeout(25);
    }
  }

  const res = await sdk.echoMessages({
    body: messages(),
    headers: {
      accept: 'application/json-seq',
      'content-type': 'application/json-seq',
    },
  });
  assert(res.code === 200);

  const contents: string[] = [];
  for await (const msg of res.data) {
    contents.push(msg.contents);
  }
  expect(contents).toEqual(['hey', 'hey']);
});
