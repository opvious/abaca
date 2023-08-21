# Multi content-type example

This example shows how to implement an API which support JSON and CSV
content-types (both in requests and responses) using Abaca.

+ OpenAPI specification: [`resources/openapi.yaml`](resources/openapi.yaml)
+ Server implementation: [`src/server.ts`](src/server.ts)
+ Sample usage: [`test/index.test.ts`](test/index.test.ts)

To run the example:

```sh
pnpm test
```
