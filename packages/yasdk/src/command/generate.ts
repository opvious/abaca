import {assert} from '@opvious/stl-errors';
import {ResourceLoader} from '@opvious/stl-utils/files';
import {ifPresent} from '@opvious/stl-utils/functions';
import {commaSeparated} from '@opvious/stl-utils/strings';
import {Command} from 'commander';
import {readFile} from 'fs/promises';
import openapiTypescript, {OpenAPITSOptions} from 'openapi-typescript';
import path from 'path';
import YAML from 'yaml';
import {
  extractOperationDefinitions,
  loadOpenapiDocument,
  OpenapiDocuments,
} from 'yasdk-openapi';
import {JSON_SEQ_MIME_TYPE} from 'yasdk-runtime';

import {overridingVersion, supportedVersions, writeOutput} from './common.js';

const preambleUrl = new URL(
  '../../resources/preamble/index.gen.ts',
  import.meta.url
);

export function generateCommand(): Command {
  return new Command()
    .command('generate')
    .alias('g')
    .description('Generate typed OpenAPI SDK')
    .argument('<path>', 'path to OpenAPI document (v3.0 or v3.1)')
    .option('-o, --output <path>', 'output file path (default: stdin)')
    .option(
      '-d, --document-output <path>',
      'also output consolidated document at the given path'
    )
    .option('-r, --loader-root <path>', 'loader root path (default: CWD)')
    .option(
      '-t, --streaming-content-types <types>',
      'comma-separated list of content-types which contain streamed data',
      JSON_SEQ_MIME_TYPE
    )
    .option('-v, --document-version <version>', 'version override')
    .action(async (pp, opts) => {
      const doc = await loadOpenapiDocument({
        path: path.resolve(pp),
        loader: ResourceLoader.create({root: opts.loaderRoot}),
        versions: supportedVersions,
      });

      const streamingTypes = commaSeparated(opts.streamingContentTypes);
      const [preambleStr, typesStr, valuesStr] = await Promise.all([
        readFile(preambleUrl, 'utf8'),
        generateTypes(doc, streamingTypes),
        generateValues(doc),
      ]);
      const out = [
        '// Do not edit, this file was auto-generated\n',
        preambleStr,
        setupStreamingContentTypes(streamingTypes),
        typesStr
          .replace(/ ([2345])XX:\s+{/g, ' \'$1XX\': {')
          .replace(/export /g, ''),
        valuesStr,
      ].join('\n');
      if (opts.documentOutput) {
        await writeOutput(
          opts.documentOutput,
          YAML.stringify(
            ifPresent(opts.documentVersion, (v) => overridingVersion(doc, v)) ??
              doc
          )
        );
      }
      if (opts.output) {
        await writeOutput(opts.output, out);
      } else {
        console.log(out);
      }
    });
}

function setupStreamingContentTypes(stypes: ReadonlyArray<string>): string {
  return [
    `const streamingContentTypes = ${JSON.stringify(stypes)} as const;`,
    'type StreamingContentTypes = typeof streamingContentTypes[number];\n',
  ].join('\n');
}

type OpenapiDocument = OpenapiDocuments['3.0' | '3.1'];

async function generateTypes(
  doc: OpenapiDocument,
  stypes: ReadonlyArray<string>
): Promise<string> {
  // We must clone the document since `openapi-typescript` will mutate it (for
  // example to filter `x-` properties) and `doc` contains immutable nodes.
  const cloned = JSON.parse(JSON.stringify(doc));

  // postTransform can be called multiple times for a given path, we need to
  // keep track of the last time it runs to correctly wrap it later on. This
  // will require two passes.
  const lastGenerated = new Map<string, string>();
  const nonStreaming = await generate({
    postTransform(gen, opts) {
      const {path} = opts;
      if (isStreamingPath(path, stypes)) {
        lastGenerated.set(path, gen);
      }
      return gen;
    },
  });
  if (!lastGenerated.size) {
    // No streaming content types, we can return directly.
    return nonStreaming;
  }
  return generate({
    transform(_schema, opts) {
      const gen = lastGenerated.get(opts.path);
      return gen == null ? undefined : `AsyncIterable<${gen}>`;
    },
  });

  function generate(opts: OpenAPITSOptions): Promise<string> {
    return openapiTypescript(cloned, {
      commentHeader: '',
      immutableTypes: true,
      ...opts,
    });
  }
}

function isStreamingPath(p: string, stypes: ReadonlyArray<string>): boolean {
  // TODO: Reduce chance of false positives.
  const [anchor, p1, p2] = p.split('/');
  assert(anchor === '#', 'Unexpected path', p);
  switch (p1) {
    case 'paths':
      break;
    case 'components':
      switch (p2) {
        case 'requestBodies':
        case 'responses':
          break;
        default:
          return false;
      }
      break;
    default:
      return false;
  }
  for (const stype of stypes) {
    if (p.endsWith(stype)) {
      return true;
    }
  }
  return false;
}

async function generateValues(doc: OpenapiDocument): Promise<string> {
  const ops = extractOperationDefinitions(doc);
  let out = `\nconst allOperations = ${JSON.stringify(ops, null, 2)} as const;`;
  out += SUFFIX;
  return out;
}

const SUFFIX = `

export type {
  operations,
  StreamingContentTypes,
};

export type Schemas = components['schemas'];

export type types = Schemas;

export type Schema<K extends keyof Schemas> = Schemas[K];

export type RequestBody<
  K extends keyof operations,
  M extends MimeType = typeof JSON_MIME_TYPE
> = RequestBodyFor<operations[K], M>;

export type RequestParameters<
  K extends keyof operations
> = RequestParametersFor<operations[K]>;

export type ResponseData<
  K extends keyof operations,
  C extends keyof operations[K]['responses'] = keyof operations[K]['responses'],
  M extends MimeType = typeof JSON_MIME_TYPE
> = ResponseDataFor<operations[K], C, M>;

export type CreateSdkOptions<
  F extends BaseFetch = typeof fetch,
  M extends string = typeof JSON_MIME_TYPE,
  A extends MimeType = typeof DEFAULT_ACCEPT
> = CreateSdkOptionsFor<operations, F, M, A>;

export type Sdk<
  F extends BaseFetch = typeof fetch,
  M extends string = typeof JSON_MIME_TYPE,
  A extends MimeType = typeof DEFAULT_ACCEPT
> = SdkFor<operations, F, M, A>;

export function createSdk<
  F extends BaseFetch = typeof fetch,
  M extends string = typeof JSON_MIME_TYPE,
  A extends MimeType = typeof DEFAULT_ACCEPT
>(
  url: string | URL,
  opts?: CreateSdkOptions<F, M, A>
): Sdk<F, M, A> {
  return createSdkFor<operations, F, M, A>(allOperations, url, opts);
}
`;
