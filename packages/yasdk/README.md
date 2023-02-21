# YASDK

Yet another TypeScript OpenAPI SDK generator

## Features

+ Concise API with (very) strong typing guarantees
+ Dependency-free single-file generated SDK (less than 2kB minified)
+ Pluggable `fetch` implementation, without patching the global object

## Quickstart

1. Add this package as `devDependency`:

```sh
npm i -D yasdk
```

2. Run it on your OpenAPI definition file, typically via a NPM script:

```js
// package.json
{
  // ...
  "scripts": {
    "prepare": "yasdk -i resources/openapi.yaml -o src/sdk.gen.ts",
    // ...
  }
}
```

3. Instantiate the SDK:

```typescript
import {createSdk} from './sdk.gen';

const sdk = createSdk(API_URL);
```

## Typings

### Overview

Each request is statically checked against the corresponding OpenAPI operation:

```typescript
const sdk = createSdk(API_URL);

const res = await sdk.updatePet({
  headers: {
    'content-type': 'application/json', // 1
    accept: 'application/json', // 2
  },
  parameters: {/* ... */}, // 3
  body: {/* ... */}, // 4
  options: {/* ... */}, // 5
});
if (res.code === 200) { // 6
  return res.data; // 7
}
```

1. The `content-type` header (or, if omitted, the SDK's default) must match one
   of the operation's request body mime types. [The type of the request's body
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

### Examples

Assume a simple API for uploading and downloading tabular data, for example
defined as follows:

```yaml
/tables/{id}:
  get:
    operationId: downloadTable
    parameters:
      - $ref: '#/components/parameters/TableId'
    responses:
      '200':
        description: Table found
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Table'
          text/csv:
            schema:
              type: string
      '404':
        description: Table not found
  put:
    operationId: uploadTable
    parameters:
      - $ref: '#/components/parameters/TableId'
    requestBody:
      required: true
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Table'
        text/csv:
          schema:
            type: string
    responses:
      '201':
        description: Table created
      '204':
        description: Table updated
```

#### Request body type inference

`yasdk` automatically type checks each request's body against its
`'content-type'` header. In the common case where the header is omitted, the
SDK's default is used (`application/json`, unless overridden at creation time):

```typescript
await sdk.uploadTable({
  parameters: {id: 'my-id'},
  body: {/* ... */}, // Expected type: `Table`
});
```

Specifying a `'content-type'` will automatically change the body's expected
type:

```typescript
await sdk.uploadTable({
  parameters: {id: 'my-id'},
  headers: {'content-type': 'text/csv'},
  body: '...', // Expected type: `string`
});
```

Additionally the `'content-type'` header is statically checked to match one of
the defined body types. It also can be auto-completed if your editor supports
auto-completion.

```typescript
await sdk.uploadTable({
  parameters: {id: 'my-id'},
  headers: {'content-type': 'application/xml'}, // Type error
});
```

#### Response type inference

`yasdk` automatically narrows the types of responses according to the request's
`'accept'` header and response code. When the header is omitted, it uses the
SDK's default (similar to request typing above):

```typescript
const res = await sdk.downloadTable({parameters: {id: 'my-id'}});
switch (res.code) {
  case 200:
    res.data; // Narrowed type: `Table`
    break;
  case 404:
    res.data; // Narrowed type: `undefined`
    break;
}
```

Setting a specific content-type has the expected effect:

```typescript
const res = await sdk.downloadTable({
  parameters: {id: 'my-id'},
  headers: {accept: 'text/csv'},
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

Wildcards are also supported:

```typescript
const res = await sdk.downloadTable({
  parameters: {id: 'my-id'},
  headers: {accept: '*/*'},
});
if (res.code === 200) {
  res.data; // Narrowed type: `Table | string`
}
```

Finally, the `accept` header itself is type-checked (and auto-completable):

```typescript
const res = await sdk.downloadTable({
  parameters: {id: 'my-id'},
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

#### Custom `fetch` implementation

The `fetch` SDK creation option allows swapping the underlying `fetch`
implementation. SDK method typings will automatically be updated to accept any
additional arguments it supports. For example to use
[`node-fetch`](https://www.npmjs.com/package/node-fetch):

```typescript
import fetch from 'node-fetch'

const nodeFetchSdk = createSdk(API_URL, {fetch});
await nodeFetchSdk.uploadTable({
  options: {
    compress: true, // OK: `node-fetch` argument
  },
  // ...
});

const fetchSdk = createSdk(API_URL);
await nodeFetchSdk.uploadTable({
  options: {
    compress: true, // Type error: default `fetch` does not support `compress`
  },
})
```
