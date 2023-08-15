# Abaca Koa integrations

## Type-safe routing

```typescript
import {createOperationsRouter} from 'abaca-koa';

const router = createOperationsRouter({
  document, // OpenAPI specification
  handlers: {
    createPet: (ctx) => {
      pet = {id: 11, ...ctx.request.body};
      return {status: 201, type: 'text/plain', data: 'ok'};
    },
    listPets: async (ctx) => {
      const limit = ctx.params.limit ?? 2;
      if (limit! > 10) {
        return 400;
      }
      return {data: pets};
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
