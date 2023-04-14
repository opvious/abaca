import __inlinable from 'inlinable';

export const packageInfo = __inlinable((ctx) =>
  ctx.enclosing(import.meta.url).metadata()
);

/** Translates an OpenAPI path to a koa-router compatible one. */
export function routerPath(p: string): string {
  return p.replace(/{([^}]+)}/g, ':$1');
}
