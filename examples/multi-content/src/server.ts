import Router from '@koa/router';
import {
  createOperationsRouter,
  KoaContextsFor,
  KoaHandlersFor,
  KoaValuesFor,
} from 'abaca-koa';
import {loadOpenapiDocument} from 'abaca-openapi';

import {operations, Schema} from './sdk.gen.js';

export async function createRouter(): Promise<Router> {
  // Load OpenAPI specification from resources/ folder
  const document = await loadOpenapiDocument();

  // Create the router from type-checked operation handlers
  return createOperationsRouter<operations>({
    document,
    handlers: new Handler(),
  });
}

type Contexts = KoaContextsFor<operations>;

type Values = KoaValuesFor<operations>;

class Handler implements KoaHandlersFor<operations> {
  private readonly tables = new Map<string, Schema<'Table'>>();

  getTable(ctx: Contexts['getTable']): Values['getTable'] {
    const table = this.tables.get(ctx.params.id);
    if (!table) {
      return 404;
    }
    if (ctx.accepts(['application/json', 'text/csv']) === 'application/json') {
      return {data: table};
    }
      return {
        type: 'text/csv',
        data: Buffer.from(table.rows?.map((r) => r.join(',')).join('\n') ?? ''),
      };

  }

  setTable(ctx: Contexts['setTable']): Values['setTable'] {
    let table: Schema<'Table'>;
    switch (ctx.request.type) {
      case 'application/json':
        table = ctx.request.body;
        break;
      case 'text/csv':
        table = {rows: ctx.request.body.split('\n').map((r) => r.split(','))};
    }
    const {id} = ctx.params;
    const created = !this.tables.has(id);
    this.tables.set(id, table);
    return created ? 201 : 204;
  }

  createTables(): Values['clearTables'] {
    this.tables.clear();
    return 204;
  }
}
