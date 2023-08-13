import {Command} from 'commander';

import {packageInfo} from './common.js';
import {generateCommand} from './generate.js';
import {resolveCommand} from './resolve.js';

const COMMAND_NAME = 'abaca';

export function mainCommand(): Command {
  return new Command()
    .name(COMMAND_NAME)
    .description('abaca CLI')
    .addCommand(generateCommand())
    .addCommand(resolveCommand())
    .version('' + packageInfo.version);
}
