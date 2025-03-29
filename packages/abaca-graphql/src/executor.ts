import {newError, statusError} from '@mtth/stl-errors';
import {
  graphqlErrorFromFailure,
  StandardGraphqlExtensions,
  standardizeGraphqlError,
} from '@mtth/stl-graphql';
import {ifPresent} from '@mtth/stl-utils/functions';
import {
  BaseFetch,
  DEFAULT_ACCEPT,
  JSON_MIME_TYPE,
  RequestHeaders,
  RequestOptions,
  Values,
} from 'abaca';
import * as gql from 'graphql';

import {errors} from './index.errors.js';
import {RequestBody, ResponseBody} from './sdk.gen.js';

export type GraphqlExecutor<F extends BaseFetch = typeof fetch> = <V, R>(
  doc: string | gql.DocumentNode,
  vars?: V,
  opts?: Options<F>
) => Promise<gql.ExecutionResult<R>>;

type Options<F> = RequestOptions<F> & {readonly headers: RequestHeaders};

/**
 * Returns a function for executing GraphQL request from an SDK with a
 * compatible `runQuery` operation. The returned executor will only throw if the
 * request errored before getting a response from the underlying API.
 */
export function graphqlExecutor<F extends BaseFetch>(
  fn: (req: Request<F>) => Promise<Response>
): GraphqlExecutor<F> {
  return async (doc, vars, opts) => {
    const {headers, ...options} = opts ?? {};
    const query = typeof doc == 'string' ? doc : gql.print(doc);

    const res = await fn({
      body: vars ? {query, variables: vars} : {query},
      headers: {
        accept: DEFAULT_ACCEPT,
        'content-type': JSON_MIME_TYPE,
        ...headers,
      },
      options: options as any,
    });

    const path = defaultErrorPath(vars);
    if (res.code === 'default') {
      const err: gql.GraphQLFormattedError =
        typeof res.body == 'string'
          ? {message: res.body}
          : graphqlErrorFromFailure(res.body);
      return {errors: [remoteGraphqlError(err, path)]};
    }

    const {data, errors, extensions} = res.body;
    return {
      data: data as any,
      errors: errors?.map((e) => remoteGraphqlError(e, path)),
      extensions,
    };
  };
}

export type GraphqlRequester<F extends BaseFetch = typeof fetch> = <V, R>(
  doc: string | gql.DocumentNode,
  vars?: V,
  opts?: Options<F>
) => Promise<R>;

export function graphqlRequester<F extends BaseFetch>(
  fn: (req: Request<F>) => Promise<Response>
): GraphqlRequester<F> {
  const exec = graphqlExecutor(fn);

  return async (doc, vars, opts) => {
    const res = await exec(doc, vars, opts);
    if (res.errors?.length) {
      throw errors.resultHasErrors(res);
    }
    return res.data as any;
  };
}

interface Request<F> {
  readonly body: RequestBody<'runQuery'>;
  readonly headers?: RequestHeaders;
  readonly options?: RequestOptions<F>;
}

type Response = Values<{
  [C in 200 | 'default']: {
    readonly code: C;
    readonly body: ResponseBody<'runQuery', C>;
  };
}>;

const REMOTE_ERROR_NAME = 'GraphqlRemoteError';

type Extensions = StandardGraphqlExtensions & gql.GraphQLErrorExtensions;

function remoteGraphqlError(
  cause: gql.GraphQLFormattedError,
  defaultPath?: ReadonlyArray<string>
): gql.GraphQLError {
  const exts = cause.extensions as Extensions | undefined;
  const err =
    ifPresent(exts?.exception?.code, (c) =>
      newError(REMOTE_ERROR_NAME, c, {
        message: cause.message,
        tags: exts?.exception?.tags,
        stackFrom: false,
        cause,
      })
    ) ?? new Error(cause.message);
  const gerr = new gql.GraphQLError(cause.message, {
    // We need to add a default path here otherwise batch executor error
    // handling will drop all fields on the error other than the message when
    // the error doesn't already have one (this happens for scalar parsing
    // issues). The way this default path is computed should be safe as it is
    // conservative - only present when there is exactly one variable in the
    // outbound request.
    path: cause.path ?? defaultPath,
    originalError: exts?.status ? statusError(exts.status, err) : err,
  });
  return standardizeGraphqlError(gerr);
}

function defaultErrorPath(vars: any): ReadonlyArray<string> | undefined {
  if (!vars) {
    return undefined;
  }
  const [key, ...rest] = Object.keys(vars);
  return key != null && !rest.length ? [key] : undefined;
}
