<p align="center">
  <img src="assets/logo.png" height="200" stype="margin: 2em;"/>
</p>

# Abaca [![CI](https://github.com/opvious/abaca/actions/workflows/ci.yml/badge.svg)](https://github.com/opvious/abaca/actions/workflows/ci.yml) [![NPM version](https://img.shields.io/npm/v/abaca.svg)](https://www.npmjs.com/package/abaca) [![codecov](https://codecov.io/gh/opvious/abaca/branch/main/graph/badge.svg?token=XuV2bcZPjJ)](https://codecov.io/gh/opvious/abaca)

An [OpenAPI][] SDK generator for TypeScript with __strong type guarantees__ and
__minimal boilerplate__.

+ Exports __dependency-free, single-file client SDKs__ with a tiny runtime
  footprint
+ Handles [form and file uploads](/examples/forms-and-files), [smart
  streaming](/examples/smart-streaming), [content-type
  switching](/examples/content-types), and more
+ Supports both native and custom `fetch` implementations
+ Provides [Koa][] integrations for server routing and proxying


## Motivation

At [Opvious][], we use OpenAPI to describe both our public and internal APIs. To
provide a great experience for our users, we support granular response codes and
a variety of content-types. For example we provide [smart
streaming](examples/smart-streaming) when solving optimization models,
sending results back to clients as early as possible.

We tried various TypeScript SDK generator libraries (see the
[alternatives](#alternatives) section below) but didn't find one which could
express these capabilities without compromising type-safety. Abaca is our
attempt at building a library to address these use-cases.

While we originally built Abaca for internal use, we believe it would be useful
to others and are happy to make it available to the open-source community. We
hope in particular to help those developing APIs which push the boundaries of
unary JSON calls.


## Preview

First, generate the SDK from an OpenAPI specification (URL or local path). For
example from [Stripe's specification](https://github.com/stripe/openapi):

```sh
npx abaca generate \
  https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.yaml \
  --output src/sdk.gen.ts \
  --include '*Account*=y' # Optional operation filter
```

Then simply import the generated file in your code and instantiate the SDK. The
returned instance contains a strongly typed method for each operation defined in
the original OpenAPI specification.

```typescript
import {createSdk} from './sdk.gen.js'; // File generated above

const sdk = createSdk({ // SDK-wide options (common headers, ...)
  headers: {authorization: `Bearer sk_test_your_key`},
});
```

You're now ready to make type-safe API calls. The compiler will ensure that each
method's inputs (request body, parameters, content type header...) match their
type in the specification. The response (data and code) is also extensively
type-checked taking into account the request's `accept` header.

```typescript
const res = await sdk.GetAccount();
switch (res.code) { // Typed response code
  case 200:
    console.log(res.data.capabilities); // Narrowed response data type
    break;
  // ...
}
```

Take a look at the following examples to see how Abaca safely and concisely
handles various use-cases:

+ [JSON API](/examples/json)
+ [Form and file uploads](/examples/forms-and-files)
+ [Smart streaming](/examples/smart-streaming)
+ [Content-type switching](/examples/content-types)


## Packages

+ [`abaca-cli`](/packages/abaca-cli), client SDK generator CLI
+ [`abaca`](/packages/abaca), runtime utilities
+ [`abaca-koa`](/packages/abaca-koa), Koa integrations for server routing and
  proxying
+ [`abaca-openapi`](/packages/abaca-openapi), OpenAPI tools (specification
  parsing, schema validation, etc.)


## Developing

Abaca uses [pnpm](https://pnpm.io/):

```sh
pnpm i
pnpm dlx husky install # Optional, to set up git hooks (only needed once)
pnpm t
```


## Contributing

Contributions are most welcome. If you have an idea that would make Abaca
better, please create an issue or submit a pull request!


## Alternatives

See below for a short list of related libraries. Abaca is inspired by our
favorite parts from each of them.

+ [`openapi-fetch`](https://github.com/drwpow/openapi-typescript), lightweight
  with excellent schema types via `openapi-typescript`
+ [`oazapfts`](https://github.com/oazapfts/oazapfts), granular response codes in
  explicit mode
+ [`openapi-typescript-codegen`](https://github.com/ferdikoomen/openapi-typescript-codegen),
  supports external references
+ [`openapi-typescript-fetch`](https://github.com/ajaishankar/openapi-typescript-fetch),
  includes utility types (requests, responses, etc.)

More tools are also listed here: https://tools.openapis.org/categories/sdk.html


[Koa]: https://koajs.com
[OpenAPI]: https://www.openapis.org
[Opvious]: https://www.opvious.io
