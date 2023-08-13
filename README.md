<p align="center">
  <img src="resources/images/logo.png" height="200" stype="margin: 2em;"/>
</p>

# Abaca

_Light on boilerplate, strong on type safety_

## Features

+ Generates concise [OpenAPI][] SDKs with (very) strong typing guarantees
+ Exports tiny, dependency-free, single-file client SDKs
+ Supports custom `fetch` implementations, arbitrary content-types, and
  streaming
+ Provides [Koa][]-compatible server routing and proxy utilities

## Packages

+ [`abaca`](/packages/abaca), client SDK generator CLI
+ [`abaca-koa`](/packages/abaca-koa), server routing and proxying utilities
+ [`abaca-openapi`](/packages/abaca-openapi), OpenAPI utilities (specification
  parsing, schema validation, etc.)
+ [`abaca-runtime`](/packages/abaca-runtime), shared functionality

## Developing

```sh
$ pnpm i
$ pnpm dlx husky install # Set up git hooks, only needed once
```

## Alternatives

+ https://github.com/ajaishankar/openapi-typescript-fetch
+ https://github.com/ferdikoomen/openapi-typescript-codegen
+ https://github.com/oazapfts/oazapfts


[OpenAPI]: https://www.openapis.org/
[Koa]: https://koajs.com/
