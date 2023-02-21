# YASDK

Yet another TypeScript OpenAPI SDK generator

## Why?

+ Concise API with (very) strong typing guarantees
+ Dependency-free single-file generated SDK (less than 2kB)
+ Pluggable `fetch` implementation, without patching the global object

## Typing guarantees overview

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
   operation's response mime types. __The type of the response automatically
   reflects this value.__
2. The `content-type` header (or, if omitted, the SDK's default) must match one
   of the operation's request body mime types. __The type of the request's body
   automatically reflects this value.__
3. Each of the `parameters` (query, path, and headers) must have the expected
   type and be present if required.
4. The request's `body` can only be specified if the operation expects one and
   must be present if required. Its type must be valid for the operation and
   chosen `content-type`.
5. Expected response codes are statically determined from the spec, supporting
   both status numbers and ranges (`2XX`, ...).
6. The response's type is automatically narrowed to both the `accept` header and
   response code.

## Developing

```sh
$ pnpm i
$ pnpm dlx husky install # Set up git hooks, only needed once
```
