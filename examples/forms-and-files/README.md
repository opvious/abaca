# Forms and files example

## Overview

This example shows how to upload and handle forms and files with Abaca. Both
major form types are supported (`application/x-www-form-encoded` and
`multipart/form-data`).

### Form uploads

```typescript
// URL-encoded
const res = await sdk.uploadForm({
  headers: {'content-type': 'application/x-www-form-urlencoded'},
  body: {/* Typed body */},
});

// Multipart
const res = await sdk.uploadForm({
  headers: {'content-type': 'multipart/form-data'},
  body: {/* Typed body, supporting `Blob` instances for binary properties */},
});
```

[_source_](test/index.test.ts)


### Form ingestion

```typescript
const router = createOperationsRouter<Operations>({
  handlers: {
    uploadForm: async (ctx) => {
      switch (ctx.request.type) {
        case 'application/x-www-form-urlencoded': {
          // URL-encoded forms are automatically decoded and available via a
          // correspondingly typed body. This representation is the simplest
          // but does not support streaming files.
          const {body} = ctx.request; // Typed form contents
          break;
        }
        case 'multipart/form-data': {
          // Multipart forms may contain files and as such are exposed
          // via emitters which emit (typed!) events asynchronously. This
          // allows efficient and safe processing of forms with large files.
          ctx.request.body.on('property', (prop) => {
            switch (prop.name) { // Typed property name
              case 'metadata': {
                const val = prop.field; // Narrowed property value
              }
            }
          });
          await events.once(ctx.request.body, 'done');
          break;
        }
      }
      // ...
    },
  },
  // ...
});
```

[_source_](src/server.ts)


## Sources

+ OpenAPI specification: [`resources/openapi.yaml`](resources/openapi.yaml)
+ Server implementation: [`src/server.ts`](src/server.ts)
+ Sample usage: [`test/index.test.ts`](test/index.test.ts)

To run the example:

```sh
pnpm test
```
