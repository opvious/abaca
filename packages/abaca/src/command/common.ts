import {
  assert,
  errorMessage,
  isStandardError,
  rethrowUnless,
  statusErrors,
} from '@opvious/stl-errors';
import {
  LocalPath,
  localPath,
  PathLike,
  ResourceLoader,
} from '@opvious/stl-utils/files';
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

import {errors} from './index.errors.js';

// Supported versions
const versions = ['3.0', '3.1'] as const;

export async function resolveDocument(args: {
  readonly path: PathLike | URL;
  readonly loaderRoot: PathLike;
  readonly bypassSchemaValidation?: boolean;
}): Promise<OpenapiDocuments[(typeof versions)[number]]> {
  const loader = ResourceLoader.create({root: args.loaderRoot});

  let data: string;
  if (args.path instanceof URL && args.path.protocol !== 'file:') {
    data = await fetchUrl(args.path);
  } else {
    data = await readFile(localPath(args.path), 'utf8');
  }

  try {
    return await resolveOpenapiDocument(data, {
      loader,
      versions,
      bypassSchemaValidation: args.bypassSchemaValidation,
    });
  } catch (err) {
    rethrowUnless(isStandardError(err, openapiErrorCodes.InvalidDocument), err);
    let msg =
      'OpenAPI specification does not match the schema for its version ' +
      '(see issues below). You can disable this check with the ' +
      '`--bypass-schema-validation` flag though this may cause ' +
      'unexpected results.\n';
    for (const issue of err.tags.issues) {
      msg += JSON.stringify(issue, null, 2) + '\n';
    }
    throw statusErrors.invalidArgument(new Error(msg));
  }
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
    const spinner = ora({isSilent: !!opts.quiet});
    const commandPrefix = cmd.rawArgs.slice(0, 2);
    assert(commandPrefix[0] != null, 'Empty command initializer');
    try {
      await fn.call({spinner, commandPrefix}, ...args);
    } catch (cause) {
      spinner.fail(errorMessage(cause));
      throw errors.actionFailed(cause);
    }
  };
}

export interface ActionContext {
  readonly spinner: Ora;
  readonly commandPrefix: [string, ...string[]];
}
