# On-demand streaming example

This example shows how to use and implement an endpoint which streams data via
[JSON text sequences][json-seq] back to compatible clients and gracefully falls
back to JSON otherwise. As an extension we also show how to implement
client-side and bi-directional streaming using the same primitives.

```typescript
// Standard JSON API call
const unary = await sdk.processMessages({
  body: {messages},
});
switch (unary.code) {
  case 200:
    for (const processed of unary.data) {
      // ...
    }
  // ...
}

// Streaming JSON API call
const streaming = await sdk.processMessages({
  headers: {accept: 'application/json-seq'},
  body: {messages},
});
switch (streaming.code) {
  case 200:
    for await (const processed of streaming.data) {
      // ...
    }
  // ...
}
```

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
