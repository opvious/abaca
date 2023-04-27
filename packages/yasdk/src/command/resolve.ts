import {ResourceLoader} from '@opvious/stl-utils/files';
import {Command} from 'commander';
import {writeFile} from 'fs/promises';
import path from 'path';
import YAML from 'yaml';
import {loadOpenapiDocument} from 'yasdk-openapi';

import {supportedVersions} from './common.js';

export function resolveCommand(): Command {
  return new Command()
    .command('resolve')
    .alias('r')
    .description('Show fully resolved OpenAPI document')
    .argument('<path>', 'path to OpenAPI document (v3.0 or v3.1)')
    .option('-o, --output <path>', 'output file path (default: stdin)')
    .option('-r, --root <path>', 'loader root path (default: CWD)')
    .action(async (pp, opts) => {
      const doc = await loadOpenapiDocument({
        path: path.resolve(pp),
        versions: supportedVersions,
        loader: ResourceLoader.create({root: opts.root}),
      });
      const out = YAML.stringify(doc);
      if (opts.output) {
        await writeFile(opts.output, out, 'utf8');
      } else {
        console.log(out);
      }
    });
}
