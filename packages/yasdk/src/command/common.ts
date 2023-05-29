import {LocalPath} from '@opvious/stl-utils/files';
import {mkdir, writeFile} from 'fs/promises';
import __inlinable from 'inlinable';
import path from 'path';
import {OpenapiDocuments, OpenapiVersion} from 'yasdk-openapi';

export const packageInfo = __inlinable((ctx) =>
  ctx.enclosing(import.meta.url).metadata()
);

export const supportedVersions = ['3.0', '3.1'] as const;

/** Writes output to path, creating parent folders as necessary. */
export async function writeOutput(lp: LocalPath, str: string): Promise<void> {
  await mkdir(path.dirname(lp), {recursive: true});
  await writeFile(lp, str, 'utf8');
}

export function overridingVersion<V extends OpenapiVersion>(
  doc: OpenapiDocuments[V],
  version: string
): OpenapiDocuments[V] {
  return {...doc, info: {...doc.info, version}};
}
