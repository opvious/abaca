import {ResourceLoader} from '@opvious/stl-utils/files';
import {Command} from 'commander';
import path from 'path';
import YAML from 'yaml';
import {assertIsOpenapiDocument, loadResolvableResource} from 'yasdk-openapi';

import {supportedVersions, writeOutput} from './common.js';

export function resolveCommand(): Command {
  return new Command()
    .command('resolve')
    .alias('r')
    .description('Show fully resolved OpenAPI document')
    .argument('<path>', 'path to OpenAPI document (v3.0 or v3.1)')
    .option('-o, --output <path>', 'output file path (default: stdin)')
    .option('-s, --skip-validation', 'skip schema validation')
    .option('-r, --loader-root <path>', 'loader root path (default: CWD)')
    .action(async (pp, opts) => {
      const resolved = await loadResolvableResource(path.resolve(pp), {
        loader: ResourceLoader.create({root: opts.loaderRoot}),
      });
      if (!opts.skipValidation) {
        assertIsOpenapiDocument(resolved, {versions: supportedVersions});
      }
      const out = YAML.stringify(resolved);
      if (opts.output) {
        await writeOutput(opts.output, out);
      } else {
        console.log(out);
      }
    });
}
