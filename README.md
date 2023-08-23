<p align="center">
  <img src="assets/logo.png" height="200" stype="margin: 2em;"/>
</p>

# Abaca [![CI](https://github.com/opvious/abaca/actions/workflows/ci.yml/badge.svg)](https://github.com/opvious/abaca/actions/workflows/ci.yml) [![NPM version](https://img.shields.io/npm/v/abaca.svg)](https://www.npmjs.com/package/abaca) [![codecov](https://codecov.io/gh/opvious/abaca/branch/main/graph/badge.svg?token=XuV2bcZPjJ)](https://codecov.io/gh/opvious/abaca)

An [OpenAPI][] SDK generator with very strong type guarantees and minimal
boilerplate.

+ Exports dependency-free, single-file client SDKs with a tiny runtime footprint
+ Supports arbitrary content-types, form and file uploads, streaming, custom
  `fetch` implementations, and more - all without compromising on type safety
+ Provides [Koa][] integrations for server routing and proxying


## Motivation

At [Opvious][], we use OpenAPI to describe both our public and internal APIs.
To provide a great experience for our users, we support a variety of
content-types and granular response codes in our specifications. For example we
provide [on-demand streaming](examples/on-demand-streaming) when solving
optimization models, streaming results back to clients when possible.

We tried various TypeScript SDK generator libraries (see the
[alternatives](#alternatives) section below) but didn't find one which could
express these capabilities without losing type-safety. Abaca is our attempt at
building a library which provides strong type safety beyond JSON APIs.


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

Shortlist of related libraries that we used before Abaca:

+ https://github.com/ajaishankar/openapi-typescript-fetch
+ https://github.com/ferdikoomen/openapi-typescript-codegen
+ https://github.com/oazapfts/oazapfts

More tools are also listed here: https://tools.openapis.org/categories/sdk.html


## Developing

```sh
pnpm i
pnpm dlx husky install # Set up git hooks, only needed once
```


[Koa]: https://koajs.com
[OpenAPI]: https://www.openapis.org
[Opvious]: https://www.opvious.io
