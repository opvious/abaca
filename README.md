<p align="center">
  <img src="assets/logo.png" height="200" stype="margin: 2em;"/>
</p>

# Abaca [![CI](https://github.com/opvious/abaca/actions/workflows/ci.yml/badge.svg)](https://github.com/opvious/abaca/actions/workflows/ci.yml) [![NPM version](https://img.shields.io/npm/v/abaca.svg)](https://www.npmjs.com/package/abaca) [![codecov](https://codecov.io/gh/opvious/abaca/branch/main/graph/badge.svg?token=XuV2bcZPjJ)](https://codecov.io/gh/opvious/abaca)

An [OpenAPI][] SDK generator with (very) strong type guarantees and minimal
boilerplate.

+ Exports dependency-free, single-file client SDKs with a tiny runtime footprint
+ Supports arbitrary content-types, streaming, custom `fetch` implementations,
  and more
+ Provides [Koa][] integrations for server routing and proxying


## Preview

First, generate the SDK from an OpenAPI specification (URL or local path):

```sh
abaca generate \
  https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.yaml \
  --output src/sdk.gen.ts
```

Then simply import the generated file in your code to access strongly typed
fetch methods for all operations defined in the specification:

```typescript
import {createSdk} from './sdk.gen.js'; // Generated SDK

const sdk = createSdk({ // SDK-wide options (common headers, ...)
  headers: {authorization: `Bearer sk_test_your_key`},
});

const res = await sdk.GetAccounts({ // Typed request (body, parameters, ...)
  params: {limit: 5},
});
switch (res.code) { // Typed response code
  case 200:
    console.log(`Pet is named ${res.data.name}`); // Narrowed response data type
    break;
  // ...
}
```

Take a look at the following examples to see how Abaca handles various
use-cases:

+ [JSON API](/examples/json)
+ [Form and file uploads](/examples/forms-and-files)
+ [On-demand streaming](/examples/on-demand-streaming)
+ [Multi-content-type endpoints](/examples/multi-content-types)


## Packages

+ [`abaca`](/packages/abaca), client SDK generator CLI
+ [`abaca-codecs`](/packages/abaca-codecs), common client decoders and encoders
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
pnpm i
pnpm dlx husky install # Set up git hooks, only needed once
```


[OpenAPI]: https://www.openapis.org/
[Koa]: https://koajs.com/
[string literals]: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#literal-types
