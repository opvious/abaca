import {assert} from '@opvious/stl-errors';
import {localPath} from '@opvious/stl-utils/files';
import {ifPresent} from '@opvious/stl-utils/functions';
import {GlobMapper} from '@opvious/stl-utils/strings';
import {
  documentPathOperations,
  extractPathOperationDefinitions,
  OpenapiDocument,
} from 'abaca-openapi';
import {
  DEFAULT_ACCEPT,
  JSON_MIME_TYPE,
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
        const operations = extractPathOperationDefinitions({
          document: doc,
          generateIds: opts.generateIds,
          idGlob: operationGlob,
        });
        const serverAddresses = extractServerAddresses(doc, url);
        const types = await generateTypes({
          document: doc,
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
  STREAM = 'stream',
}

async function generateTypes(args: {
  readonly document: OpenapiDocument;
  readonly operations: {readonly [id: string]: OperationDefinition};
  readonly additionalProperties: boolean;
  readonly operationGlob: GlobMapper<boolean>;
}): Promise<{
  readonly source: string;
  readonly count: number;
}> {
  const {additionalProperties, operationGlob} = args;

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

  // transform can be called multiple times for a given path, we need to keep
  // track of the last time it runs to correctly wrap it later on. This will
  // require two passes.
  let count = 0;
  const streamed = new Map<string, string>();
  const unstreamed = await generate({
    transform(schema, opts) {
      if (!('type' in schema)) {
        return undefined;
      }
      count++;
      if (schema.type === 'object') {
        schema.additionalProperties ??= additionalProperties;
        return undefined;
      } else if (schema.type !== 'string' || schema.format == null) {
        return undefined;
      }
      switch (schema.format) {
        case SchemaFormat.BINARY:
          return 'Blob';
        case SchemaFormat.STREAM: {
          const {items} = schema as any;
          assert(items, 'Missing stream items');
          delete schema.format;
          Object.assign(schema, {type: 'array'});
          streamed.set(opts.path, ''); // Placeholder
          return undefined;
        }
        default:
          return undefined;
      }
    },
    postTransform(gen, opts) {
      const {path} = opts;
      if (streamed.has(path)) {
        streamed.set(path, gen);
      }
      return gen;
    },
  });
  if (!streamed.size) {
    // No streamed types, we can return directly.
    return {source: unstreamed, count};
  }
  const source = await generate({
    transform(schema, opts) {
      const gen = streamed.get(opts.path);
      if (gen) {
        return `Asyncify<${gen}>`;
      }
      if (!('type' in schema)) {
        return undefined;
      }
      if (schema.type === 'object') {
        schema.additionalProperties ??= additionalProperties;
        return undefined;
      }
      return schema.type === 'string' && schema.format === SchemaFormat.BINARY
        ? 'Blob'
        : undefined;
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
