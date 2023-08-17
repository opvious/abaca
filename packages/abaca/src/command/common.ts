import {
  errorMessage,
  isStandardError,
  rethrowUnless,
  statusErrors,
} from '@opvious/stl-errors';
import {
  LocalPath,
  localPath,
  localUrl,
  PathLike,
  ResourceLoader,
} from '@opvious/stl-utils/files';
import {ifPresent} from '@opvious/stl-utils/functions';
import {
  OpenapiDocuments,
  OpenapiVersion,
  ReferenceResolvers,
  resolveOpenapiDocument,
} from 'abaca-openapi';
import openapiErrorCodes from 'abaca-openapi/errors';
import {Command} from 'commander';
import {mkdir, readFile, writeFile} from 'fs/promises';
import fetch from 'node-fetch';
import ora, {Ora} from 'ora';
import path from 'path';
import {AsyncOrSync} from 'ts-essentials';

import {telemetry} from '../common.js';
import {errors} from './index.errors.js';

// Supported versions
const versions = ['3.0', '3.1'] as const;

type Document = OpenapiDocuments[(typeof versions)[number]];

export async function resolveDocument(args: {
  readonly path: string;
  readonly loaderRoot: PathLike;
  readonly skipSchemaValidation?: boolean;
  readonly generateOperationIds?: boolean;
}): Promise<Document> {
  const loader = ResourceLoader.create({root: args.loaderRoot});

  let url;
  try {
    url = new URL(args.path);
  } catch (_err) {
    url = localUrl(args.path);
  }

  let data: string;
  if (url.protocol !== 'file:') {
    data = await fetchUrl(url);
  } else {
    data = await readFile(localPath(url), 'utf8');
  }

  try {
    return await resolveOpenapiDocument(data, {
      loader,
      versions,
      skipSchemaValidation: args.skipSchemaValidation,
      ignoreWebhooks: true,
      generateOperationIds: args.generateOperationIds,
      telemetry,
    });
  } catch (err) {
    rethrowUnless(isStandardError(err, openapiErrorCodes.InvalidDocument), err);
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

export function summarizeDocument(doc: Document): {
  readonly pathCount: number;
  readonly schemaCount: number;
} {
  return {
    pathCount: ifPresent(doc.paths, (o) => Object.keys(o).length) ?? 0,
    schemaCount:
      ifPresent(doc.components?.schemas, (o) => Object.keys(o).length) ?? 0,
  };
}

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
