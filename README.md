<p align="center">
  <img src="assets/logo.png" height="200" stype="margin: 2em;"/>
</p>

# Abaca

An [OpenAPI][] SDK generator with (very) strong typing guarantees and minimal
boilerplate.

+ Exports tiny, dependency-free, single-file client SDKs
+ Provides [Koa][]-compatible server routing and proxying functionality
+ Supports custom `fetch` implementations, arbitrary content-types, and
  streaming

## Packages

+ [`abaca`](/packages/abaca), client SDK generator CLI
+ [`abaca-koa`](/packages/abaca-koa), server routing and proxying library
+ [`abaca-openapi`](/packages/abaca-openapi), OpenAPI tools (specification
  parsing, schema validation, etc.)
+ [`abaca-runtime`](/packages/abaca-runtime), shared utilities

## Alternatives

+ https://github.com/ajaishankar/openapi-typescript-fetch
+ https://github.com/ferdikoomen/openapi-typescript-codegen
+ https://github.com/oazapfts/oazapfts

## Developing

```sh
$ pnpm i
$ pnpm dlx husky install # Set up git hooks, only needed once
```


[OpenAPI]: https://www.openapis.org/
[Koa]: https://koajs.com/
