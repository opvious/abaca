import {assert} from '@opvious/stl-errors';
import __inlinable from 'inlinable';

export const packageInfo = __inlinable((ctx) =>
  ctx.enclosing(import.meta.url).metadata()
);

/** JSON pointer (https://datatracker.ietf.org/doc/html/rfc6901) */
export type JsonPointer = string;

export function createPointer(parts: ReadonlyArray<string>): JsonPointer {
  const escaped = parts.map((p) =>
    p.replaceAll('~', '~0').replaceAll('/', '~1')
  );
  return '/' + escaped.join('/');
}

export function dereferencePointer<V = any>(
  ptr: JsonPointer,
  root: unknown
): V {
  assert(ptr.startsWith('/'), 'Invalid pointer: %s', ptr);
  let val: any = root;
  if (ptr === '/') {
    return val;
  }
  for (const part of ptr.slice(1).split('/')) {
    const unescaped = part.replaceAll('~1', '/').replaceAll('~0', '~');
    val = val[unescaped];
    assert(val !== undefined, 'Undefined pointer value for %s', ptr);
  }
  return val;
}
