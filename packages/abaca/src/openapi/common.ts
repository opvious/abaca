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

export function splitPointer(ptr: JsonPointer): ReadonlyArray<string> {
  assert(ptr.startsWith('/'), 'Invalid pointer: %s', ptr);
  if (ptr === '/') {
    return [];
  }
  const parts: string[] = [];
  for (const part of ptr.slice(1).split('/')) {
    parts.push(part.replaceAll('~1', '/').replaceAll('~0', '~'));
  }
  return parts;
}

export function dereferencePointer<V = any>(
  ptr: JsonPointer,
  root: unknown
): V {
  let val: any = root;
  for (const part of splitPointer(ptr)) {
    val = val[part];
    assert(val !== undefined, 'Undefined pointer value for %s', ptr);
  }
  return val;
}
