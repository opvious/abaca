import Router from '@koa/router';
import {loadOpenapiDocument} from 'abaca';
import {
  createOperationsRouter,
  KoaContextsFor,
  KoaHandlersFor,
  KoaValuesFor,
} from 'abaca-koa';

import {Operations, Schema} from './sdk.gen.js';

export async function createRouter(): Promise<Router> {
  // Load OpenAPI specification from resources/ folder
  const document = await loadOpenapiDocument();
  // Create the router from type-checked operation handlers
  return createOperationsRouter<Operations>({
    document,
    handlers: new Handler(),
    handleInvalidRequests: true,
  });
}

// Convenience alias for strongly-typed Koa context for each operation
// (including request bodies, parameters, ...). This is useful to implement
// router handlers outside the `createOperationsRouter` argument, for example
// from a separate class.
type Contexts = KoaContextsFor<Operations>;

// Similarly, convenience alias for acceptable return values for each operation
// (response body, status codes, ...).
type Values = KoaValuesFor<Operations>;

class Handler implements KoaHandlersFor<Operations> {
  private readonly tables = new Map<string, Schema<'Table'>>();

  getTable(ctx: Contexts['getTable']): Values['getTable'] {
    const table = this.tables.get(ctx.params.id);
    if (!table) {
      // Returning a number sends back a response to the client of that status
      // and without a body. Importantly, the returned number is type-checked
      // (405 would fail for example!).
      return 404;
    }
    if (ctx.accepts(['application/json', 'text/csv']) === 'application/json') {
      // When the `type` field is omitted from the return value, the SDK's
      // default is used (application/json here) and the `body` type-checked
      // against it.
      return {body: table};
    }
    // When a `type` field is set, the `body` field must match exactly that
    // content-type's expected type (`string` here). Setting `table` as body
    // directly would fail for example.
    return {
      type: 'text/csv',
      body: table.rows?.map((r) => r.join(',')).join('\n') ?? '',
    };
  }

  setTable(ctx: Contexts['setTable']): Values['setTable'] {
    let table: Schema<'Table'>;
    switch (ctx.request.type) {
      // In each branch below, the type is narrowed automatically to the
      // corresponding content-type's schema.
      case 'application/json':
        table = ctx.request.body;
        break;
      case 'text/csv':
        table = {rows: ctx.request.body.split('\n').map((r) => r.split(','))};
    }
    // The compiler automatically checks for us that the switch statement above
    // is exhaustive (if it wasn't, it would throw an error saying `table` is
    // used before being defined). This guarantees that we aren't forgetting any
    // branches.
    const {id} = ctx.params;
    const created = !this.tables.has(id);
    this.tables.set(id, table);
    return created ? 201 : 204; // Type-checked (see above).
  }

  clearTables(): Values['clearTables'] {
    this.tables.clear();
    return 204;
  }
}
