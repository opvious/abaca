import {enclosingPackageInfo} from '@opvious/stl-telemetry';

export const packageInfo = enclosingPackageInfo(import.meta.url);

/** Translates an OpenAPI path to a koa-router compatible one. */
export function routerPath(p: string): string {
  return p.replace(/{([^}]+)}/g, ':$1');
}

/** Maps over an `AsyncIterable`. */
export async function* mapAsyncIterable<V, W>(
  iter: AsyncIterable<V>,
  fn: (val: V) => W
): AsyncIterable<W> {
  for await (const val of iter) {
    yield fn(val);
  }
}

export function isAsyncIterable(arg: unknown): arg is AsyncIterable<unknown> {
  return !!arg && typeof arg == 'object' && Symbol.asyncIterator in arg;
}
