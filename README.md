# YASDK

Yet another TypeScript OpenAPI SDK generator

```typescript
const sdk = createSdk(API_URL);

const res = await sdk.updatePet({
  headers: {
    accept: 'application/json', // Type-checked
    'content-type': 'application/json', // Type-checked
  },
  body: {/* ... */}, // Type-checked
});
if (res.code === 200) { // Type-checked
  return res.data; // Type narrowed automatically
}
```

## Why?

+ Concise API with (very) strong typing guarantees
+ Dependency-free single-file generated SDK (<3kB uncompressed)
+ Pluggable `fetch` implementation without patching the global object

## Developing

```sh
$ pnpm i
$ pnpm dlx husky install # Set up git hooks, only needed once
```
