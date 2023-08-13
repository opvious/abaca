import {errorFactories, StandardError} from '@opvious/stl-errors';
import {IncompatibleValueError} from 'abaca-openapi';

export const [errors, codes] = errorFactories({
  definitions: {
    invalidRequest: (reason: RequestError) => ({
      message: 'Invalid request: ' + reason.message,
      tags: {reason},
    }),
    invalidResponseData: (cause: IncompatibleValueError) => ({
      message: 'Invalid response data: ' + cause.message,
      tags: cause.tags,
      cause,
    }),
    unacceptableResponseType: (
      oid: string,
      type: string,
      accepted: Iterable<string>,
      declared: Iterable<string> | undefined
    ) => ({
      message:
        `Response type ${type} does not belong to the set of acceptable ` +
        `values for operation ${oid} (accepted=[${[...accepted].join(', ')}]` +
        `, declared=[${[...(declared ?? [])].join(', ')}])`,
    }),
    unexpectedResponseBody: {
      message: 'This response should not have a body',
    },
    unwritableResponseType: (type: string) => ({
      message: `Response type ${type} does not have a matching encoder`,
    }),
  },
});

type RequestError = StandardError<{readonly status: number}>;

export default codes;
