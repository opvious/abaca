import Router from '@koa/router';
import {
  createOperationsRouter,
  KoaContextsFor,
  KoaHandlersFor,
  KoaValuesFor,
} from 'abaca-koa';
import {loadOpenapiDocument} from 'abaca-openapi';

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
// (including request bodies, params, ...).
type Contexts = KoaContextsFor<Operations>;

// Similarly, convenience alias for acceptable return values for each operation
// (response body, status codes, ...).
type Values = KoaValuesFor<Operations>;

class Handler implements KoaHandlersFor<Operations> {
  private readonly tables = new Map<string, Schema<'Table'>>();

  getTable(ctx: Contexts['getTable']): Values['getTable'] {
    const table = this.tables.get(ctx.params.id);
    if (!table) {
      return 404; // Type-checked (405 would fail for example).
    }
    if (ctx.accepts(['application/json', 'text/csv']) === 'application/json') {
      // When the `type` field is omitted, the SDK's default is used
      // (application/json here) and the `data` type-checked against it.
      return {data: table};
    }
    // When a `type` field is set, the `data` field must match exacty that
    // content-type's expected type (`string` here). Setting `table` as data
    // directly would fail for example.
    return {
      type: 'text/csv',
      data: Buffer.from(table.rows?.map((r) => r.join(',')).join('\n') ?? ''),
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
    const {id} = ctx.params;
    const created = !this.tables.has(id);
    this.tables.set(id, table);
    return created ? 201 : 204; // Type-checked.
  }

  createTables(): Values['clearTables'] {
    this.tables.clear();
    return 204; // Type-checked.
  }
}
