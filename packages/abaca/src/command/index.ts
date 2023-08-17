import {assert, check} from '@opvious/stl-errors';
import {resolvable} from '@opvious/stl-utils/functions';
import {Command} from 'commander';
import fs from 'fs';
import readline from 'readline';

import {COMMAND_NAME, logPath, packageInfo} from '../common.js';
import {newCommand} from './common.js';
import {generateCommand} from './generate.js';
import {resolveCommand} from './resolve.js';

export function mainCommand(): Command {
  return newCommand()
    .name(COMMAND_NAME)
    .description('Abaca CLI')
    .option('-Q, --quiet', 'suppress spinner output')
    .addCommand(generateCommand())
    .addCommand(resolveCommand())
    .addCommand(showLogCommand())
    .addCommand(showVersionCommand());
}

function showLogCommand(): Command {
  return newCommand()
    .command('log')
    .description('display log file path')
    .option(
      '-p, --pid [pid]',
      'display lines from log file corresponding to the given PID. if the ' +
        'PID is absent, show lines from the last command with at least one ' +
        'warning or error'
    )
    .action(async (opts) => {
      const fp = logPath();
      const {pid} = opts;
      if (pid == null) {
        console.log(fp);
        return;
      }
      const lines = await commandLines(fp, pid === true ? undefined : +pid);
      for (const line of lines) {
        console.log(line);
      }
    });
}

// Not ideal but saves us full line parsing. This should be safe give how Pino
// builds log messages.
const logLinePattern = /^{"level":(\d+),"time":\d+,"pid":(\d+)/;

function commandLines(
  fp: string,
  pid: number | undefined
): Promise<ReadonlyArray<string>> {
  const [ret, cb] = resolvable<ReadonlyArray<string>>();
  let lines: string[] = [];
  let emitted: string[] = [];
  let shouldEmit = false;

  let ppid: any;
  const readable = readline
    .createInterface(fs.createReadStream(fp))
    .on('error', cb)
    .on('line', (line) => {
      const match = logLinePattern.exec(line);
      assert(match, 'Unexpected log line: %s', line);
      const cpid = +match[2]!;
      if (cpid !== ppid) {
        flush();
      }
      if (pid == null || pid === cpid) {
        lines.push(line);
      }
      shouldEmit ||= pid == null ? +match[1]! > 30 : cpid === pid;
      ppid = cpid;
    })
    .on('close', () => {
      flush();
      cb(null, emitted);
    });

  function flush(): void {
    if (shouldEmit) {
      emitted = lines;
      if (pid != null) {
        readable.close();
      }
    }
    shouldEmit = false;
    lines = [];
  }

  return ret;
}

function showVersionCommand(): Command {
  return newCommand()
    .command('version')
    .description('display version')
    .action(() => void console.log(check.isPresent(packageInfo.version)));
}
