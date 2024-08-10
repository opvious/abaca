import {errorFactories, errorMessage} from '@opvious/stl-errors';
import {CommanderError} from 'commander';

const [errors, errorCodes] = errorFactories({
  definitions: {
    actionFailed: (cause: unknown) => ({
      message: `Action failed: ${errorMessage(cause)}`,
      cause,
    }),
    commandAborted: (cause: CommanderError) => ({
      message: 'Command aborted',
      cause,
      tags: {exitCode: cause.exitCode},
    }),
  },
});

export {errors};

export default errorCodes;
