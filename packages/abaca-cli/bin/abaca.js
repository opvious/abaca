#!/usr/bin/env node

import {mainCommand, telemetry} from '../lib/index.js';
import errorCodes from '../lib/index.errors.js';

telemetry.logger.info(
  {data: {cwd: process.cwd(), argv: process.argv, execArgv: process.execArgv}},
  'Running command...',
  process.argv.join(' ')
);

mainCommand().parseAsync(process.argv).catch((err) => {
  if (err.code === errorCodes.command.CommandAborted) {
    process.exitCode = err.tags?.exitCode ?? 0;
    return;
  }
  process.exitCode = 1;
  telemetry.logger.fatal({err}, 'Command failed.');
  if (!errorCodes.command.has(err.code)) {
    console.error(err);
  }
});
