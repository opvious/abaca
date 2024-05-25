# Smart streaming example

## Overview

This example shows how to define OpenAPI endpoints which support both unary
(non-streaming) and streaming calls. This makes it easy to build services which
provide real-time information back to clients when possible and fall back to
standard responses otherwise.

+ Unary `application/json` API call.

  ```typescript
  const unary = await sdk.processMessages({body});
  switch (unary.code) {
    case 200:
      // In the unary case, data is available (only) once the call completes as
      // a list of messages.
      for (const processed of unary.data) {
        // ...
      }
    // ...
  }
  ```

+ Streaming [`application/json-seq`][json-seq] API call. The only difference
  with the call above is the `accept` header which is now updated to accept JSON
  sequences.

  ```typescript
  const streaming = await sdk.processMessages({
    headers: {accept: 'application/json-seq'},
    body,
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

Note that these capabilities are exposed via simple HTTP requests (no WebSockets
required for instance) and without losing any of the type-safety provided by the
OpenAPI specification. It's also possible to stream with other content-types
simply by providing a compatible decoder and encoder.


## Sources

+ OpenAPI specification: [`resources/openapi.yaml`](resources/openapi.yaml)
+ Client implementation: [`src/client.ts`](src/client.ts)
+ Server implementation: [`src/server.ts`](src/server.ts)
+ Sample usage: [`test/index.test.ts`](test/index.test.ts)

To run the example:

```sh
pnpm test
```


[json-seq]: https://datatracker.ietf.org/doc/html/rfc7464
