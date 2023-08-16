<p align="center">
  <img src="assets/logo.png" height="200" stype="margin: 2em;"/>
</p>

# Abaca [![CI](https://github.com/opvious/abaca/actions/workflows/ci.yml/badge.svg)](https://github.com/opvious/abaca/actions/workflows/ci.yml) [![NPM version](https://img.shields.io/npm/v/abaca.svg)](https://www.npmjs.com/package/abaca) [![codecov](https://codecov.io/gh/opvious/abaca/branch/main/graph/badge.svg?token=XuV2bcZPjJ)](https://codecov.io/gh/opvious/abaca)

An [OpenAPI][] SDK generator with (very) strong typing guarantees and minimal
boilerplate.

+ Exports tiny, dependency-free, single-file client SDKs
+ Supports custom `fetch` implementations, arbitrary content-types, streaming,
  and more
+ Provides [Koa][] integrations for server routing and proxying


## Examples

+ [Simple JSON API](/examples/json)
+ [Streaming API (client-side, server-side, and
  bi-directional)](/examples/streaming)
+ [Multiple content-types (requests and responses)](/examples/multi-content)


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
