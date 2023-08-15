# Streaming Abaca example

This example shows how to stream JSON data from a server to clients in a fully
type-safe way.

## Files

+ OpenAPI specification: [`resources/openapi.yaml`](resources/openapi.yaml)
+ Client code: [`src/client.ts`](src/client.ts)
+ Server code: [`src/server.ts`](src/server.ts)

## Running the example

```sh
node lib/server.js & # Start the API on port 8080
node lib/client.js # Emit a few test requests
```
