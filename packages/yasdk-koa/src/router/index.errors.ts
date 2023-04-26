import {errorFactories, StandardError} from '@opvious/stl-errors';
import {InvalidValueError} from 'yasdk-openapi';

export const [errors, codes] = errorFactories({
  definitions: {
    invalidRequest: (origin: RequestError) => ({
      message: 'Invalid request: ' + origin.message,
      tags: {origin},
    }),
    invalidResponseData: (cause: InvalidValueError) => ({
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
