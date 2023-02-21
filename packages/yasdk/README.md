# YASDK

Yet another TypeScript SDK generator

## Quickstart

1. Add this package as `devDependency`:

```sh
npm i -D yasdk
```

2. Run it on your OpenAPI definition file, typically via a NPM script:

```js
# package.json
{
  // ...
  "scripts": {
    "prepare": "yasdk -i resources/openapi.yaml -o src/sdk.gen.ts",
    // ...
  }
}
```

3. Instantiate the SDK:

```typescript
import {createSdk} from './sdk.gen';

const sdk = createSdk(API_URL);
```
