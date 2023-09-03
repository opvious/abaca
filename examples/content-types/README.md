# Content-type switching example

## Overview

This example shows how to implement a type-safe API which supports multiple
content-types per endpoint using Abaca (JSON and CSV).

```typescript
// Upload as JSON
await sdk.setTable({
  params: {id: 'id1'},
  body: { // Expected type: array of rows
    rows: [['r1', 'v1'], ['r2', 'v2']],
  },
});

// Upload as CSV
await sdk.setTable({
  params: {id: 'id2'},
  headers: {'content-type': 'text/csv'},
  body: 'r1\nr2', // Expected type: string
});
```


## Sources

+ OpenAPI specification: [`resources/openapi.yaml`](resources/openapi.yaml)
+ Server implementation: [`src/server.ts`](src/server.ts)
+ Sample usage: [`test/index.test.ts`](test/index.test.ts)

To run the example:

```sh
pnpm test
```
