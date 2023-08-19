import {assert} from '@opvious/stl-errors';
import {localPath} from '@opvious/stl-utils/files';
import {ifPresent} from '@opvious/stl-utils/functions';
import {commaSeparated} from '@opvious/stl-utils/strings';
import {extractOperationDefinitions} from 'abaca-openapi';
import {JSON_SEQ_MIME_TYPE} from 'abaca-runtime';
import {Command} from 'commander';
import {Eta} from 'eta';
import openapiTypescript, {OpenAPITSOptions} from 'openapi-typescript';
import YAML from 'yaml';

import {packageInfo, resourceLoader} from '../common.js';
import {
  contextualAction,
  Document,
  extractServerAddresses,
  newCommand,
  overridingVersion,
  parseDocumentUri,
  resolveDocument,
  summarizeDocument,
  writeOutput,
} from './common.js';

export function generateCommand(): Command {
  return newCommand()
    .command('generate')
    .alias('g')
    .description(
      'generate types and client SDK from an OpenAPI specification (3.x)'
    )
    .argument('<path|url>', 'path or URL to OpenAPI document')
    .option(
      '-a, --default-address <url>',
      'default address to use when instantiating the SDK (default: ' +
        'the first static server URL defined in the document, if any)'
    )
    .option(
      '-d, --document-output <path>',
      'also output the consolidated, fully resolved, OpenAPI document to ' +
        'this path'
    )
    .option('-o, --output <path>', 'output file path (default: stdin)')
    .option('-r, --loader-root <path>', 'loader root path (default: CWD)')
    .option(
      '-t, --streaming-content-types <types>',
      'comma-separated list of content-types which contain streamed data. ' +
        'request and responses with these types will be wrapped in async ' +
        'iterables',
      JSON_SEQ_MIME_TYPE
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
      contextualAction(async function (uri, opts) {
        const {spinner} = this;

        spinner.start('Resolving document...');
        const url = parseDocumentUri(uri);
        const doc = await resolveDocument({
          url,
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
        const operations = extractOperationDefinitions(doc);
        const serverAddresses = extractServerAddresses(doc, url);
        const types = await generateTypes(doc, streamingTypes);
        const eta = new Eta({
          autoEscape: false,
          views: localPath(resourceLoader.localUrl('templates')),
        });
        const source = await eta.renderAsync('sdk', {
          version: packageInfo.version,
          operations,
          typeSource: types.source
            .replace(/ ([2345])XX:\s+{/g, ' \'$1XX\': {')
            .replace(/export /g, ''),
          serverAddresses,
          defaultAddress: opts.defaultAddress,
        });
        spinner.succeed(
          `Generated SDK. [operations=${Object.keys(operations).length}, ` +
            `types=${types.count}]`
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
          await writeOutput(opts.output, source);
        } else {
          console.log(source);
        }
      })
    );
}

async function generateTypes(
  doc: Document,
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
    transform(schema) {
      return schema.format === 'binary' ? 'Blob' : undefined;
    },
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
