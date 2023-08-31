# On-demand streaming example

## Overview

This example shows how to use and implement endpoints which stream data via
[JSON text sequences][json-seq] back to compatible clients and gracefully fall
back to JSON otherwise.

```typescript
// Standard JSON API call. `application/json` responses are accepted by default,
// so we can omit the header.
const unary = await sdk.processMessages({
  body: messages,
});
switch (unary.code) {
  case 200:
    // In this case data is available (only) once the call completes.
    for (const processed of unary.data) {
      // ...
    }
  // ...
}

// Streaming JSON API call. The only difference with the call above is the
// `accept` header which is now updated to accept JSON sequences.
const streaming = await sdk.processMessages({
  headers: {accept: 'application/json-seq'},
  body: messages,
});
switch (streaming.code) {
  case 200:
    // Response data is now available incrementally and automatically typed as
    // an `AsyncIterable`! Processing it in real time is as easy as using an
    // asynchronous loop.
    for await (const processed of streaming.data) {
      // ...
    }
  // ...
}
```

As an extension we also show how to implement client-side and bi-directional
streaming using the same primitives.

Note that all these capabilities are exposed via simple HTTP requests (no
WebSockets required for instance) and without losing any of the type-safety
provided by the OpenAPI specification. Finally it is also possible to stream
content-types other than JSON sequences by specifying them via Abaca CLI's
`--streaming-content-types` option.


## Contents

+ OpenAPI specification: [`resources/openapi.yaml`](resources/openapi.yaml)
+ Client implementation: [`src/client.ts`](src/client.ts)
+ Server implementation: [`src/server.ts`](src/server.ts)
+ Sample usage: [`test/index.test.ts`](test/index.test.ts)

To run the example:

```sh
pnpm test
```


[json-seq]: https://datatracker.ietf.org/doc/html/rfc7464
