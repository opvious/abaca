import {assert} from '@opvious/stl-errors';
import {ifPresent} from '@opvious/stl-utils/functions';
import {commaSeparated} from '@opvious/stl-utils/strings';
import {extractOperationDefinitions, OpenapiDocuments} from 'abaca-openapi';
import {JSON_SEQ_MIME_TYPE} from 'abaca-runtime';
import {Command} from 'commander';
import {readFile} from 'fs/promises';
import openapiTypescript, {OpenAPITSOptions} from 'openapi-typescript';
import YAML from 'yaml';

import {packageInfo} from '../common.js';
import {
  contextualAction,
  newCommand,
  overridingVersion,
  resolveDocument,
  summarizeDocument,
  writeOutput,
} from './common.js';

const preambleUrl = new URL(
  '../../resources/preamble/index.gen.ts',
  import.meta.url
);

export function generateCommand(): Command {
  return newCommand()
    .command('generate')
    .alias('g')
    .description('generate types and client SDK from an OpenAPI specification')
    .argument('<path|url>', 'path or URL to OpenAPI document (v3.0 or v3.1)')
    .option('-o, --output <path>', 'output file path (default: stdin)')
    .option('-r, --loader-root <path>', 'loader root path (default: CWD)')
    .option(
      '-t, --streaming-content-types <types>',
      'comma-separated list of content-types which contain streamed data. ' +
        'request and responses with these types will expect async iterables',
      JSON_SEQ_MIME_TYPE
    )
    .option(
      '-d, --document-output <path>',
      'also output a consolidated and fully-resolved document at this path. ' +
        'this document is equivalent to the input and easier to export'
    )
    .option(
      '-v, --document-version <version>',
      'version override used in the consolidated document. only applicable ' +
        'if the `--document-output` option is used'
    )
    .option(
      '--generate-operation-ids',
      'automatically generate IDs for operations which do not have one. ' +
        'the generated ID is `<path>#<verb>`, for example `/pets#post`. by ' +
        'these operations are skipped'
    )
    .option(
      '--skip-document-validation',
      'bypass input OpenAPI specification schema validation. this may cause ' +
        'unexpected results'
    )
    .action(
      contextualAction(async function (pl, opts) {
        const {spinner} = this;

        spinner.start('Resolving document...');
        const doc = await resolveDocument({
          path: pl,
          loaderRoot: opts.loaderRoot,
          skipSchemaValidation: opts.skipDocumentValidation,
          generateOperationIds: opts.generateOperationIds,
        });
        const {pathCount, schemaCount} = summarizeDocument(doc);
        spinner.succeed(
          `Resolved document. [paths=${pathCount}, schemas=${schemaCount}]`
        );

        spinner.start('Generating SDK...');
        const streamingTypes = commaSeparated(opts.streamingContentTypes);
        const [
          preambleStr,
          {source: typesStr, count: typeCount},
          {source: opsStr, count: opsCount},
        ] = await Promise.all([
          readFile(preambleUrl, 'utf8'),
          generateTypes(doc, streamingTypes),
          generateOperations(doc),
        ]);
        const out = [
          '// Do not edit, this file was auto-generated (Abaca ' +
            `v${packageInfo.version})\n`,
          preambleStr,
          setupStreamingContentTypes(streamingTypes),
          typesStr
            .replace(/ ([2345])XX:\s+{/g, ' \'$1XX\': {')
            .replace(/export /g, ''),
          opsStr,
        ].join('\n');
        spinner.succeed(
          `Generated SDK. [operations=${opsCount}, types=${typeCount}]`
        );

        if (opts.documentOutput) {
          await writeOutput(
            opts.documentOutput,
            YAML.stringify(
              ifPresent(opts.documentVersion, (v) =>
                overridingVersion(doc, v)
              ) ?? doc
            )
          );
        }
        if (opts.output) {
          await writeOutput(opts.output, out);
        } else {
          console.log(out);
        }
      })
    );
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
): Promise<{
  readonly source: string;
  readonly count: number;
}> {
  // We must clone the document since `openapi-typescript` will mutate it (for
  // example to filter `x-` properties) and `doc` contains immutable nodes.
  const cloned = JSON.parse(JSON.stringify(doc));

  // postTransform can be called multiple times for a given path, we need to
  // keep track of the last time it runs to correctly wrap it later on. This
  // will require two passes.
  let count = 0;
  const lastGenerated = new Map<string, string>();
  const nonStreaming = await generate({
    postTransform(gen, opts) {
      count++;
      const {path} = opts;
      if (isStreamingPath(path, stypes)) {
        lastGenerated.set(path, gen);
      }
      return gen;
    },
  });
  if (!lastGenerated.size) {
    // No streaming content types, we can return directly.
    return {source: nonStreaming, count};
  }
  const source = await generate({
    transform(_schema, opts) {
      const gen = lastGenerated.get(opts.path);
      return gen == null ? undefined : `AsyncIterable<${gen}>`;
    },
  });
  return {source, count};

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

function generateOperations(doc: OpenapiDocument): {
  readonly source: string;
  readonly count: number;
} {
  const ops = extractOperationDefinitions(doc);
  let source = `\nconst allOperations = ${JSON.stringify(
    ops,
    null,
    2
  )} as const;`;
  source += SUFFIX;
  return {source, count: Object.keys(ops).length};
}

const SUFFIX = `

export type {
  operations as Operations,
  StreamingContentTypes,
};

export type Schemas = components['schemas'];

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
  target: string | URL | AddressInfo,
  opts?: CreateSdkOptions<F, M, A>
): Sdk<F, M, A> {
  return createSdkFor<operations, F, M, A>(allOperations, target, opts);
}
`;
