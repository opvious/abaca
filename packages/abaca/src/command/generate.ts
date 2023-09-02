import {assert} from '@opvious/stl-errors';
import {localPath} from '@opvious/stl-utils/files';
import {ifPresent} from '@opvious/stl-utils/functions';
import {commaSeparated, GlobMapper} from '@opvious/stl-utils/strings';
import {
  documentPathOperations,
  extractPathOperationDefinitions,
  OpenapiDocument,
} from 'abaca-openapi';
import {
  DEFAULT_ACCEPT,
  JSON_MIME_TYPE,
  JSON_SEQ_MIME_TYPE,
  OperationDefinition,
} from 'abaca-runtime';
import {Command} from 'commander';
import {Eta} from 'eta';
import openapiTypescript, {OpenAPITSOptions} from 'openapi-typescript';
import YAML from 'yaml';

import {packageInfo, resourceLoader} from '../common.js';
import {
  contextualAction,
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
      '-d, --document-output <path>',
      'also output the consolidated, fully resolved, OpenAPI document to ' +
        'this path'
    )
    .option(
      '-i, --include <globs>',
      'filter which operations to include in the SDK. the filter is applied ' +
        'to the (potentially generated) operation ID and can include globs. ' +
        'for example `account*=y` would only include operations with ID ' +
        'starting with `account`',
      'y'
    )
    .option('-o, --output <path>', 'output file path (default: stdin)')
    .option('-r, --loader-root <path>', 'loader root path (default: CWD)')
    .option(
      '-t, --streaming-content-types <types>',
      'comma-separated list of content-types which contain streamed data. ' +
        'request and responses with these types will be exposed via an ' +
        '`AsyncIterable`',
      JSON_SEQ_MIME_TYPE
    )
    .option(
      '-v, --document-version <version>',
      'version override used in the consolidated document. only applicable ' +
        'if the `--document-output` option is used'
    )
    .option(
      '--default-accept <type>',
      'default accept header used in requests',
      DEFAULT_ACCEPT
    )
    .option(
      '--default-address <url>',
      'default address used when instantiating the SDK (default: ' +
        'the first static server URL defined in the document, if any)'
    )
    .option(
      '--default-content-type <type>',
      'default content-type header used in requests',
      JSON_MIME_TYPE
    )
    .option(
      '--generate-ids',
      'automatically generate IDs for operations which do not have one. ' +
        'the generated ID form is `<path>#<verb>`, for example `/pets#post`'
    )
    .option(
      '--skip-document-validation',
      'bypass input OpenAPI specification schema validation. this may cause ' +
        'unexpected results'
    )
    .option(
      '--strict-additional-properties',
      'only allow additional properties when explicitly allowed in an ' +
        'object\'s schema'
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
        });
        const {pathCount, schemaCount} = summarizeDocument(doc);
        spinner.succeed(
          `Resolved document. [paths=${pathCount}, schemas=${schemaCount}]`
        );

        spinner.start('Generating SDK...');
        const operationGlob = GlobMapper.predicating(opts.include);
        const streamingTypes = commaSeparated(opts.streamingContentTypes);
        const operations = extractPathOperationDefinitions({
          document: doc,
          generateIds: opts.generateIds,
          idGlob: operationGlob,
        });
        const serverAddresses = extractServerAddresses(doc, url);
        const types = await generateTypes({
          document: doc,
          streamingTypes,
          operations,
          additionalProperties: !opts.strictAdditionalProperties,
          operationGlob,
        });
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
          defaultAccept: opts.defaultAccept,
          defaultAddress: opts.defaultAddress,
          defaultContentType: opts.defaultContentType,
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

enum SchemaFormat {
  BINARY = 'binary',
}

async function generateTypes(args: {
  readonly document: OpenapiDocument;
  readonly streamingTypes: ReadonlyArray<string>;
  readonly operations: {readonly [id: string]: OperationDefinition};
  readonly additionalProperties: boolean;
  readonly operationGlob: GlobMapper<boolean>;
}): Promise<{
  readonly source: string;
  readonly count: number;
}> {
  const {streamingTypes, additionalProperties, operationGlob} = args;

  // We clone the document to mutate it since `doc` contains immutable nodes.
  // Note also that `openapi-typescript` may mutate it (for example to filter
  // `x-` properties).
  const cloned = JSON.parse(JSON.stringify(args.document));

  // Add operation IDs in case any were generated and add fake properties to
  // request bodies to enable "oneof" behavior.
  for (const [id, def] of Object.entries(args.operations)) {
    const val = cloned.paths[def.path][def.method];
    if (val.operationId) {
      assert(
        val.operationId === id,
        'Inconsistent operation ID: %s != %s',
        id,
        val.operationId
      );
    } else {
      val.operationId = id;
    }
  }

  // Delete IDs of any operations which aren't included. This will prevent
  // them from having a generated type.
  for (const {value: val} of documentPathOperations(cloned)) {
    const {operationId: id} = val;
    if (id != null && !operationGlob.map(id)) {
      delete (val as any).operationId;
    }
  }

  // postTransform can be called multiple times for a given path, we need to
  // keep track of the last time it runs to correctly wrap it later on. This
  // will require two passes.
  let count = 0;
  const lastGenerated = new Map<string, string>();
  const nonStreaming = await generate({
    transform(schema) {
      if ('type' in schema && schema.type === 'object') {
        schema.additionalProperties ??= additionalProperties;
      }
      switch (schema.format) {
        case SchemaFormat.BINARY:
          return 'Blob';
        default:
          return undefined;
      }
    },
    postTransform(gen, opts) {
      count++;
      const {path} = opts;
      if (isStreamingPath(path, streamingTypes)) {
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
