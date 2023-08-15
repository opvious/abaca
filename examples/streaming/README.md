# Streaming Abaca example

This example shows how to implement streaming (client-side, server-side, and
bi-directional) using Abaca and [JSON text sequences][json-seq].


## Files

+ OpenAPI specification: [`resources/openapi.yaml`](resources/openapi.yaml)
+ Client implementation: [`src/client.ts`](src/client.ts)
+ Server implementation: [`src/server.ts`](src/server.ts)
+ Sample usage: [`test/index.test.ts`](test/index.test.ts)


## Running the example

```sh
pnpm test
```

[json-seq]: https://datatracker.ietf.org/doc/html/rfc7464
