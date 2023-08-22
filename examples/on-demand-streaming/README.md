# On-demand streaming example

This example shows how to use and implement an endpoint which streams data via
[JSON text sequences][json-seq] back to compatible clients and gracefully falls
back to JSON otherwise. As an extension we also show how to implement
client-side and bi-directional streaming using the same primitives.

All these capabilities are exposed via simple HTTP requests (no WebSockets
required for instance) and without losing any of the type-safety provided by the
OpenAPI specification.

+ OpenAPI specification: [`resources/openapi.yaml`](resources/openapi.yaml)
+ Client implementation: [`src/client.ts`](src/client.ts)
+ Server implementation: [`src/server.ts`](src/server.ts)
+ Sample usage: [`test/index.test.ts`](test/index.test.ts)

To run the example:

```sh
pnpm test
```


[json-seq]: https://datatracker.ietf.org/doc/html/rfc7464
