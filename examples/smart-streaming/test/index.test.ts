import events from 'events';
import http from 'http';
import Koa from 'koa';
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
  sdk = messagesSdk(server.address()!);
});

afterAll(() => {
  server.close();
});

describe('smart streaming', () => {
  const messages = [{contents: 'hi'}, {contents: 'there'}];

  test('unary', async () => {
    const res = await sdk.processMessages({body: messages});
    assert(res.code === 200);
    expect(res.data).toEqual([{contents: 'HI'}, {contents: 'THERE'}]);
  });

  test('streaming', async () => {
    const res = await sdk.processMessages({
      body: messages,
      headers: {accept: 'application/json-seq'},
    });
    assert(res.code === 200);
    const contents: string[] = [];
    for await (const msg of res.data) {
      contents.push(msg.contents);
    }
    expect(contents).toEqual(['HI', 'THERE']);
  });
});

test('client streaming', async () => {
  async function* messages(): AsyncIterable<Schema<'Message'>> {
    let count = 5;
    while (count-- > 0) {
      yield {contents: 'hi'};
      await setTimeout(25);
    }
  }

  const res = await sdk.ingestMessages({
    body: messages(),
    headers: {'content-type': 'application/json-seq'},
  });
  assert(res.code === 200);
  expect(res.data).toEqual(10);
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
