<p align="center">
  <img src="assets/logo.png" height="200" stype="margin: 2em;"/>
</p>

# Abaca [![CI](https://github.com/opvious/abaca/actions/workflows/ci.yml/badge.svg)](https://github.com/opvious/abaca/actions/workflows/ci.yml) [![NPM version](https://img.shields.io/npm/v/abaca.svg)](https://www.npmjs.com/package/abaca) [![codecov](https://codecov.io/gh/opvious/abaca/branch/main/graph/badge.svg?token=XuV2bcZPjJ)](https://codecov.io/gh/opvious/abaca)

An [OpenAPI][] SDK generator with very strong type guarantees and minimal
boilerplate.

+ Exports dependency-free, single-file client SDKs with a tiny runtime footprint
+ Supports forms and file uploads, arbitrary content-types, streaming, custom
  `fetch` implementations, and more - all without compromising on type safety
+ Provides [Koa][] integrations for server routing and proxying


## Preview

First, generate the SDK from an OpenAPI specification (URL or local path). For
example from [Stripe's specification][]:

```sh
npx abaca generate \
  https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.yaml \
  --output src/sdk.gen.ts
```

Then simply import the generated file in your code and instantiate the SDK.
You're now ready to make type-safe API calls.

```typescript
import {createSdk} from './sdk.gen.js'; // Generated SDK (see above)

// Instantiate the SDK. The returned instance contains a strongly typed method
// for each operation defined in the original OpenAPI specification.
const sdk = createSdk({ // SDK-wide options (common headers, ...)
  headers: {authorization: `Bearer sk_test_your_key`},
});

// Each method's inputs (request body, parameters, ...) must match their type
// in the specification. The response (data and code) is also extensively typed,
// including taking into account the request's `accept` header.
const res = await sdk.GetAccounts({params: {limit: 5}}); // Typed parameters
switch (res.code) { // Typed response code
  case 200:
    console.log(`${res.data.length} accounts.`); // Narrowed response data type
    break;
  // ...
}
```

Take a look at the following examples to see how Abaca safely and concisely
handles various use-cases:

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
