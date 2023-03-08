import {enclosingPackageInfo} from '@opvious/stl-telemetry';

export const packageInfo = enclosingPackageInfo(import.meta.url);

/** Translates an OpenAPI path to a koa-router compatible one. */
export function routerPath(p: string): string {
  return p.replace(/{([^}]+)}/g, ':$1');
}
