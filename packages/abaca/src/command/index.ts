import {check} from '@opvious/stl-errors';
import {Command} from 'commander';

import {logPath, packageInfo} from '../common.js';
import {newCommand} from './common.js';
import {generateCommand} from './generate.js';
import {resolveCommand} from './resolve.js';

export function mainCommand(): Command {
  return newCommand()
    .name(packageInfo.name)
    .description('Abaca CLI')
    .addCommand(generateCommand())
    .addCommand(resolveCommand())
    .addCommand(showLogPathCommand())
    .addCommand(showVersionCommand());
}

function showLogPathCommand(): Command {
  return newCommand()
    .command('log')
    .description('display log path')
    .action(() => void console.log(logPath()));
}

function showVersionCommand(): Command {
  return newCommand()
    .command('version')
    .description('display version')
    .action(() => void console.log(check.isPresent(packageInfo.version)));
}
