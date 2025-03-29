import {
  errorMessage,
  isStandardError,
  rethrowUnless,
  statusErrors,
} from '@mtth/stl-errors';
import {
  LocalPath,
  localPath,
  localUrl,
  PathLike,
  ResourceLoader,
} from '@mtth/stl-utils/files';
import {ifPresent} from '@mtth/stl-utils/functions';
import {
  OpenapiDocument,
  ReferenceResolvers,
  resolveOpenapiDocument,
} from 'abaca';
import abacaErrorCodes from 'abaca/errors';
import {Command} from 'commander';
import {mkdir, readFile, writeFile} from 'fs/promises';
import fetch from 'node-fetch';
import ora, {Ora} from 'ora';
import path from 'path';
import {AsyncOrSync} from 'ts-essentials';

import {telemetry} from '../common.js';
import {errors} from './index.errors.js';

export function parseDocumentUri(uri: string): URL {
  try {
    return new URL(uri);
  } catch (_err) {
    return localUrl(uri);
  }
}

export async function resolveDocument(args: {
  readonly url: URL;
  readonly loaderRoot: PathLike;
  readonly skipSchemaValidation?: boolean;
}): Promise<OpenapiDocument> {
  const loader = ResourceLoader.create({root: args.loaderRoot});

  let data: string;
  if (args.url.protocol !== 'file:') {
    data = await fetchUrl(args.url);
  } else {
    data = await readFile(localPath(args.url), 'utf8');
  }

  try {
    return await resolveOpenapiDocument(data, {
      loader,
      skipSchemaValidation: args.skipSchemaValidation,
      ignoreWebhooks: true,
      telemetry,
    });
  } catch (err) {
    rethrowUnless(
      isStandardError(err, abacaErrorCodes.openapi.InvalidDocument),
      err
    );
    const {issueCount, issues} = err.tags;
    let msg =
      'OpenAPI specification does not match the schema for its version: ' +
      `${issueCount} issue(s) found, see below. You can disable this check ` +
      'with the `--skip-document-validation` flag though this may cause ' +
      'unexpected results.\n';
    for (const issue of err.tags.issues) {
      msg += JSON.stringify(issue, null, 2) + '\n';
    }
    if (issueCount > issues.length) {
      msg += `and ${issueCount - issues.length} more...\n`;
    }
    throw statusErrors.invalidArgument(new Error(msg));
  }
}

export function summarizeDocument(doc: OpenapiDocument): {
  readonly pathCount: number;
  readonly schemaCount: number;
} {
  return {
    pathCount: ifPresent(doc.paths, (o) => Object.keys(o).length) ?? 0,
    schemaCount:
      ifPresent(doc.components?.schemas, (o) => Object.keys(o).length) ?? 0,
  };
}

export function extractServerAddresses(
  doc: OpenapiDocument,
  base: URL
): ReadonlyArray<string> {
  const ret: string[] = [];
  for (const item of doc.servers ?? []) {
    if (item.variables && Object.keys(item.variables).length) {
      // TODO: Support templated servers.
      continue;
    }
    let url;
    try {
      url = new URL(item.url, base.protocol === 'file:' ? undefined : base);
    } catch (_err) {
      continue;
    }
    ret.push('' + url);
  }
  return ret;
}

/** Writes output to path, creating parent folders as necessary. */
export async function writeOutput(lp: LocalPath, str: string): Promise<void> {
  await mkdir(path.dirname(lp), {recursive: true});
  await writeFile(lp, str, 'utf8');
}

/** Returns a copy of the input document with the version overridden */
export function overridingVersion(
  doc: OpenapiDocument,
  version: string
): OpenapiDocument {
  return {...doc, info: {...doc.info, version}};
}

export async function fetchUrl(url: URL): Promise<string> {
  const res = await fetch(url);
  return res.text();
}

export const referenceResolvers = {
  http: fetchUrl,
  https: fetchUrl,
} as const satisfies ReferenceResolvers;

export function newCommand(): Command {
  return new Command().exitOverride((cause) => {
    throw errors.commandAborted(cause);
  });
}

export function contextualAction(
  fn: (this: ActionContext, ...args: any[]) => AsyncOrSync<void>
): (...args: any[]) => Promise<void> {
  return async (...args): Promise<void> => {
    let cmd = args[args.length - 1]; // Command is always last.
    while (cmd.parent) {
      cmd = cmd.parent;
    }
    const opts = cmd.opts();
    const isSilent = !!opts.quiet;
    const spinner = ora({isSilent});
    try {
      await fn.call({spinner}, ...args);
    } catch (cause) {
      const msg = `Error (PID ${process.pid}): ${errorMessage(cause)}`;
      if (isSilent) {
        console.error(msg);
      } else {
        spinner.fail(msg);
      }
      throw errors.actionFailed(cause);
    }
  };
}

export interface ActionContext {
  readonly spinner: Ora;
}
