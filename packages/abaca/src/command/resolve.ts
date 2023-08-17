import {ifPresent} from '@opvious/stl-utils/functions';
import {Command} from 'commander';
import YAML from 'yaml';

import {
  contextualAction,
  newCommand,
  overridingVersion,
  resolveDocument,
  summarizeDocument,
  writeOutput,
} from './common.js';

export function resolveCommand(): Command {
  return newCommand()
    .command('resolve')
    .alias('r')
    .description('resolve all references in an OpenAPI document')
    .argument('<path>', 'path to OpenAPI document (v3.0 or v3.1)')
    .option('-o, --output <path>', 'output file path (default: stdin)')
    .option('-r, --loader-root <path>', 'loader root path (default: CWD)')
    .option(
      '-v, --document-version <version>',
      'consolidated document version override'
    )
    .option('--skip-document-validation', 'bypass schema validation')
    .action(
      contextualAction(async function (pl, opts) {
        const {spinner} = this;

        spinner.start('Resolving document...');
        const doc = await resolveDocument({
          path: pl,
          loaderRoot: opts.loaderRoot,
          skipSchemaValidation: opts.skipDocumentValidation,
        });
        const {pathCount, schemaCount} = summarizeDocument(doc);
        spinner.succeed(
          `Resolved document. [paths=${pathCount}, schemas=${schemaCount}]`
        );

        const out = YAML.stringify(
          ifPresent(opts.documentVersion, (v) => overridingVersion(doc, v)) ??
            doc
        );
        if (opts.output) {
          await writeOutput(opts.output, out);
        } else {
          console.log(out);
        }
      })
    );
}
