import __inlinable from 'inlinable';

export const packageInfo = __inlinable((ctx) =>
  ctx.enclosing(import.meta.url).metadata()
);

export const supportedVersions = ['3.0', '3.1'] as const;
