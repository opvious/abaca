import {errorFactories, errorMessage, StandardError} from '@opvious/stl-errors';
import {IncompatibleValueError} from 'abaca-openapi';

const [errors, errorCodes] = errorFactories({
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
    unreadableRequestType: (type: string) => ({
      message: `Request type ${type} can't be decoded`,
    }),
    unwritableResponseType: (type: string) => ({
      message: `Response type ${type} can't be encoded`,
    }),
  },
});

type RequestError = StandardError<{readonly status: number}>;

const [requestErrors] = errorFactories({
  definitions: {
    unacceptable: () => ({
      message:
        'Request must accept at least one content type for each response code',
      tags: {status: 406},
    }),
    missingParameter: (name: string) => ({
      message: `Parameter ${name} is required but was missing`,
      tags: {status: 400},
    }),
    invalidParameter: (name: string, cause: IncompatibleValueError) => ({
      message: `Invalid parameter ${name}: ` + cause.message,
      tags: {status: 400, name, ...cause.tags},
      cause,
    }),
    unsupportedContentType: (type: string) => ({
      message: `Content-type ${type} is not supported`,
      tags: {status: 415},
    }),
    missingBody: () => ({
      message: 'This operation expects a body but none was found',
      tags: {status: 400},
    }),
    unexpectedBody: () => ({
      message:
        'This operation does not support requests with a body. Please make ' +
        'sure that the request does not have a body or `content-type` ' +
        'header.',
      tags: {status: 400},
    }),
    unreadableBody: (cause: unknown) => ({
      message: 'Body could not be decoded: ' + errorMessage(cause),
      tags: {status: 400},
      cause,
    }),
    invalidBody: (cause: IncompatibleValueError) => ({
      message: 'Invalid body: ' + cause.message,
      tags: {status: 400, ...cause.tags},
      cause,
    }),
    invalidMultipartProperty: (
      name: string,
      cause: IncompatibleValueError
    ) => ({
      message: `Invalid multipart property ${name}: ${cause.message}`,
      tags: {status: 400, name, ...cause.tags},
      cause,
    }),
  },
  prefix: 'ERR_REQUEST_',
});

export {errors, requestErrors};

export default errorCodes;
