# YASDK

Yet another TypeScript OpenAPI SDK generator

+ [Motivation](https://github.com/mtth/yasdk#why)
+ [Examples](https://github.com/mtth/yasdk#examples)

```typescript
const sdk = createSdk(API_URL);

const res = await sdk.runQuery({
  parameters: {/* ... */}, // Checked
  body: {/* ... */}, // Checked
  headers: {
    accept: 'application/json', // Checked (and optional)
    'content-type': 'application/json', // Checked (and optional)
  },
});

switch (res.code) {
  case 200:
    res.data; // Narrowed based on code and `accept` header.
  // ...
}
```

## Quickstart

1. Add this package as `devDependency`:

```sh
npm i -D yasdk
```

2. Run it on your OpenAPI definition file, typically via a NPM script:

```sh
yasdk -i resources/openapi.yaml -o src/sdk.gen.ts
```

3. Import the SDK:

```typescript
import {createSdk} from './sdk.gen';
```

## Options

SDK creation supports the following options:

+ `headers`, headers sent with all requests
+ `options`, options set on all requests
+ `fetch`, custom fetch implementation
+ `defaultContentType`, default content-type used as `'content-type'` and
  `'accept'` headers when omitted
+ `encoders`, request body encoders
+ `decoders`, response decoders
