<p align="center">
  <img src="assets/logo.png" height="200" stype="margin: 2em;"/>
</p>

# Abaca [![CI](https://github.com/opvious/abaca/actions/workflows/ci.yml/badge.svg)](https://github.com/opvious/abaca/actions/workflows/ci.yml) [![NPM version](https://img.shields.io/npm/v/abaca.svg)](https://www.npmjs.com/package/abaca) [![codecov](https://codecov.io/gh/opvious/abaca/branch/main/graph/badge.svg?token=XuV2bcZPjJ)](https://codecov.io/gh/opvious/abaca)

An [OpenAPI][] SDK generator with (very) strong type guarantees and minimal
boilerplate.

+ Exports tiny, dependency-free, single-file client SDKs
+ Supports custom `fetch` implementations, arbitrary content-types, streaming,
  and more
+ Provides [Koa][] integrations for server routing and proxying


## Preview

First, generate the SDK from an OpenAPI specification:

```sh
abaca generate resources/openapi.yaml --output src/sdk.gen.ts
```

Then simply import the generated file in your code to benefit from strongly
typed fetch methods for all operations defined in the specification:

```typescript
import {createSdk} from './sdk.gen.js'; // Generated SDK

const sdk = createSdk(/* Server URL */);

const res = await sdk.someOperation(/* Typed body, parameters, ... */);
switch (res.code) { // Typed code
  case 200:
    doSomething(res.data); // Narrowed data type
    break;
  // ...
}
```

Take a look at the following examples to see how Abaca handles various
use-cases:

+ [Simple JSON API](/examples/json)
+ [Streaming API (client-side, server-side, and
  bi-directional)](/examples/streaming)
+ [API with multiple content-types](/examples/multi-content)


## Packages

+ [`abaca`](/packages/abaca), client SDK generator CLI
+ [`abaca-koa`](/packages/abaca-koa), Koa integrations for server routing and
  proxying
+ [`abaca-openapi`](/packages/abaca-openapi), OpenAPI tools (specification
  parsing, schema validation, etc.)
+ [`abaca-runtime`](/packages/abaca-runtime), shared utilities


## Alternatives

+ https://github.com/ajaishankar/openapi-typescript-fetch
+ https://github.com/ferdikoomen/openapi-typescript-codegen
+ https://github.com/oazapfts/oazapfts
+ https://github.com/openapitools/openapi-generator
+ https://tools.openapis.org/categories/sdk.html (includes other languages)


## Developing

```sh
$ pnpm i
$ pnpm dlx husky install # Set up git hooks, only needed once
```


[OpenAPI]: https://www.openapis.org/
[Koa]: https://koajs.com/
[string literals]: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#literal-types
