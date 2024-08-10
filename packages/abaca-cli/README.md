# Abaca [![NPM version](https://img.shields.io/npm/v/abaca.svg)](https://www.npmjs.com/package/abaca) [![codecov](https://codecov.io/gh/opvious/abaca/branch/main/graph/badge.svg?token=XuV2bcZPjJ)](https://codecov.io/gh/opvious/abaca)

An [OpenAPI][] SDK generator with very strong type guarantees and minimal
boilerplate.


## Quickstart

1. Install this package as development dependency:

  ```sh
  npm i -D abaca
  ```

2. Use its `generate` command (or `g` for short) to create a TypeScript SDK from
   an OpenAPI specification file, typically from an `npm` script:

  ```sh
  abaca g resources/openapi.yaml -o src/sdk.gen.ts
  ```

3. Import the generated SDK from your code and instantiate it:

  ```typescript
  import {createSdk} from './sdk.gen.js';

  const sdk = createSdk(/* Optional configuration */);
  ```

4. That's it! The instantiated SDK exposes a strongly typed method for each
   operation in OpenAPI specification which you can use to make requests.

  ```typescript
  const res = await sdk.someOperation(/* Request body, parameters, ... */);
  switch (res.code) {
    case 200:
      doSomething(res.data); // Narrowed response data
      break;
    // ...
  }
  ```

Take a look at the [repository](https://www.gihub.com/opvious/abaca)'s README
for more information, examples, and extensions (e.g. Koa integrations).


## Type safety

Abaca checks request types and narrows response types extensively. This section
describes the major components and highlights common patterns.


### Overview

```typescript
const res = await sdk.doSomething({
  headers: {
    'content-type': 'application/json', // 1
    accept: 'application/json', // 2
  },
  params: {/* ... */}, // 3
  body: {/* ... */}, // 4
  options: {/* ... */}, // 5
});
if (res.code === 200) { // 6
  return res.data; // 7
}
```

1. The `content-type` header (or, if omitted, the SDK's default) must match one
   of the operation's request body's mime types. [The type of the request's body
   automatically reflects this value.](#request-body-type-inference)
2. The `accept` header (or, if omitted, the SDK's default) must match one of the
   operation's response mime types. [The type of the response automatically
   reflects this value.](#response-type-inference)
3. Each of the `parameters` (query, path, and headers) must have the expected
   type and be present if required.
4. The request's `body` can only be specified if the operation expects one and
   must be present if required. Its type must be valid for the operation and
   chosen `content-type`.
5. [Request options are type checked against the SDK's local `fetch`
   implementation.](#custom-fetch-implementation)
6. Expected response codes are statically determined from the spec, supporting
   both status numbers and ranges (`2XX`, ...).
7. The response's type is automatically narrowed to both the `accept` header and
   response code.


### Request body type inference

Abaca automatically type checks each request's body against its `'content-type'`
header. In the common case where the header is omitted, the SDK's default is
used (`application/json`, unless overridden). For example, using the
`uploadTable` operation defined [here][tables], its body should by default
contain a `Table`:

```typescript
await sdk.uploadTable({
  headers: {'content-type': 'application/json'}, // Can be omitted
  params: {id: 'my-id'},
  body: {/* ... */}, // Expected type: `Table`
});
```

Switching to CSV will automatically change the body's expected type:

```typescript
await sdk.uploadTable({
  headers: {'content-type': 'text/csv'}, // Different content-type
  params: {id: 'my-id'},
  body: '...', // Expected type: `string`
});
```

Additionally the `'content-type'` header is statically checked to match one of
the defined body types. It also can be auto-completed in compatible editors:

```typescript
await sdk.uploadTable({
  headers: {'content-type': 'application/xml'}, // Compile time error
  params: {id: 'my-id'},
});
```


### Response type inference

Abaca automatically narrows the types of responses according to the response's
code and request's `'accept'` header. When the header is omitted, it uses the
SDK's default (similar to request typing above, defaulting to
`application/json;q=1, text/*;q=0.5`). For example, using the `downloadTable`
operation defined [here][tables]:

```typescript
const res = await sdk.downloadTable({params: {id: 'my-id'}});
switch (res.code) {
  case 200:
    res.data; // Narrowed type: `Table`
    break;
  case 404:
    res.data; // Narrowed type: `undefined`
    break;
}
```

Setting the accept header to CSV updates the response's type accordingly:

```typescript
const res = await sdk.downloadTable({
  headers: {accept: 'text/csv'},
  params: {id: 'my-id'},
});
switch (res.code) {
  case 200:
    res.data; // Narrowed type: `string`
    break;
  case 404:
    res.data; // Narrowed type: `undefined`
    break;
}
```

Wildcards are also supported. In this case the returned type will be the union
of all possible response values:

```typescript
const res = await sdk.downloadTable({
  params: {id: 'my-id'},
  headers: {accept: '*/*'},
});
if (res.code === 200) {
  res.data; // Narrowed type: `Table | string`
}
```

Finally, the `accept` header itself is type-checked (and auto-completable):

```typescript
const res = await sdk.downloadTable({
  params: {id: 'my-id'},
  headers: {
    // Valid examples:
    accept: 'application/json',
    accept: 'application/*',
    accept: 'text/csv',
    accept: 'text/*',
    accept: '*/*',
    // Invalid examples:
    accept: 'application/xml',
    accept: 'text/plain',
    accept: 'image/*',
  },
});
```


### Custom `fetch` implementation

The `fetch` SDK creation option allows swapping the underlying `fetch`
implementation. SDK method typings will automatically be updated to accept any
additional arguments it supports. For example to use
[`node-fetch`](https://www.npmjs.com/package/node-fetch):

```typescript
import fetch from 'node-fetch'

const nodeFetchSdk = createSdk({fetch, /** Other options... */});
await nodeFetchSdk.uploadTable({
  options: {
    compress: true, // OK: `node-fetch` argument
  },
  // ...
});

const fetchSdk = createSdk();
await fetchSdk.uploadTable({
  options: {
    compress: true, // Type error: default `fetch` does not support `compress`
  },
})
```

```typescript
const sdk = createSdk();

const res = await sdk.runSomeOperation({
  params: {/* ... */}, // Checked
  body: {/* ... */}, // Checked
  headers: {
    accept: 'application/json', // Checked (and optional)
    'content-type': 'application/json', // Checked (and optional)
  },
});

switch (res.code) {
  case 200:
    res.data; // Narrowed (based on code and `accept` header)
  // ...
}
```


[OpenAPI]: https://www.openapis.org/
[tables]: /examples/content-types/resources/openapi.yaml
