# Abaca Koa integrations

## Type-safe routing

```typescript
import {createOperationsRouter} from 'abaca-koa';

import {Schema} from './sdk.gen.js'; // Abaca generated SDK

const pets: Schema<'Pet'>[] = [];

const router = createOperationsRouter({
  document, // OpenAPI specification
  handlers: {
    createPet: (ctx) => {
      pets.push({id: pets.length, ...ctx.request.body}); // Body is typed
      return 201; // Response code is type-checked
    },
    listPets: async (ctx) => {
      const limit = ctx.params.limit ?? 5; // Parameters are typed
      return {data: pets.slice(0, limit)}; // Response data is type-checked
    },
  },
});
```

## Customizable proxying

```typescript
import {createOperationsProxy} from 'abaca-koa';

const proxy = createOperationsProxy({
  document, // OpenAPI specification
  upstreams: {
    readOnly: {target: /* server address */},
    // Other upstreams...
  },
  dispatch: (op) => /* upstream for each operation */
});
```
