import {Command} from 'commander';

import {packageInfo} from './common.js';
import {generateCommand} from './generate.js';
import {resolveCommand} from './resolve.js';

const COMMAND_NAME = 'yasdk';

export function mainCommand(): Command {
  return new Command()
    .name(COMMAND_NAME)
    .description('YASDK CLI')
    .addCommand(generateCommand())
    .addCommand(resolveCommand())
    .version('' + packageInfo.version);
}
