# YASDK

Yet another TypeScript OpenAPI SDK generator

## Why?

+ Concise API with (very) strong typing guarantees
+ Dependency-free single-file generated SDK (less than 3kB uncompressed)
+ Pluggable `fetch` implementation without patching the global object

## Type guarantees overview

Each request is statically checked against the corresponding OpenAPI operation:

```typescript
const sdk = createSdk(API_URL);

const res = await sdk.updatePet({
  headers: {
    accept: 'application/json', // 1
    'content-type': 'application/json', // 2
  },
  parameters: {/* ... */}, // 3
  body: {/* ... */}, // 4
});
if (res.code === 200) { // 5
  return res.data; // 6
}
```

1. The `accept` header (or, if omitted, the SDK's default) must match one of the
   operation's response mime types. Changes to this value will automatically be
   reflected in the type of the response.
2. The `content-type` header (or, if omitted, the SDK's default) must match one
   of the operation's request body mime types. Changes to this value will
   automatically be reflected in the type of the body.
3. Each of the `parameters` (query, path, and headers) must have the expected
   type and be present if required.
4. The request's `body` can only be specified if the operation expects one and
   must be present if required. Its type must be valid for the current operation
   and chosen `content-type`.
5. Expected response codes are statically determined from the spec.
6. The response's type is automatically narrowed to both the `accept` header and
   response code.

All this with a single function per operation and standard object inputs!

## Developing

```sh
$ pnpm i
$ pnpm dlx husky install # Set up git hooks, only needed once
```
