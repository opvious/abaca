import {ResourceLoader} from '@opvious/stl-utils/files';
import {ifPresent} from '@opvious/stl-utils/functions';
import {assertIsOpenapiDocument, loadResolvable} from 'abaca-openapi';
import {Command} from 'commander';
import YAML from 'yaml';

import {overridingVersion, supportedVersions, writeOutput} from './common.js';

export function resolveCommand(): Command {
  return new Command()
    .command('resolve')
    .alias('r')
    .description('Show fully resolved OpenAPI document')
    .argument('<path>', 'path to OpenAPI document (v3.0 or v3.1)')
    .option('-o, --output <path>', 'output file path (default: stdin)')
    .option('-s, --skip-validation', 'skip schema validation')
    .option('-r, --loader-root <path>', 'loader root path (default: CWD)')
    .option('-v, --document-version <version>', 'version override')
    .action(async (pl, opts) => {
      const doc: any = await loadResolvable(pl, {
        loader: ResourceLoader.create({root: opts.loaderRoot}),
      });
      if (!opts.skipValidation) {
        assertIsOpenapiDocument(doc, {versions: supportedVersions});
      }
      const out = YAML.stringify(
        ifPresent(opts.documentVersion, (v) => overridingVersion(doc, v)) ?? doc
      );
      if (opts.output) {
        await writeOutput(opts.output, out);
      } else {
        console.log(out);
      }
    });
}
