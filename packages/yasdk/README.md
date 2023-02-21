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
    accept: 'application/json', // 1
    'content-type': 'application/json', // 2
  },
  parameters: {/* ... */}, // 3
  body: {/* ... */}, // 4
});
if (res.code === 200) { // 5
  return res.data; // 6
}
```

1. The `accept` header (or, if omitted, the SDK's default) must match one of the
   operation's response mime types. __The type of the response automatically
   reflects this value.__
2. The `content-type` header (or, if omitted, the SDK's default) must match one
   of the operation's request body mime types. __The type of the request's body
   automatically reflects this value.__
3. Each of the `parameters` (query, path, and headers) must have the expected
   type and be present if required.
4. The request's `body` can only be specified if the operation expects one and
   must be present if required. Its type must be valid for the operation and
   chosen `content-type`.
5. Expected response codes are statically determined from the spec, supporting
   both status numbers and ranges (`2XX`, ...).
6. The response's type is automatically narrowed to both the `accept` header and
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
        description: A matching table was found
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

#### Request type inference

Omitting the `'content-type'` header will fall back to the SDK's default
(`application/json`, unless overridden at creation time):

```typescript
await sdk.setTable({
  parameters: {id: 'my-id'},
  body: {rows: [/* ... */]}, // Expected type: `Table`
});
```

Specifying a `'content-type'` will automatically change the body's expected
type:

```typescript
await sdk.setTable({
  parameters: {id: 'my-id'},
  headers: {'content-type': 'text/csv'},
  body: '...', // Expected type: `string`
});
```

Additionally the `'content-type'` header is statically checked to match one of
the defined body types. It also can be auto-completed if your editor supports
auto-completion.

```typescript
await sdk.setTable({
  parameters: {id: 'my-id'},
  headers: {'content-type': 'application/xml'}, // Type error
});
```
