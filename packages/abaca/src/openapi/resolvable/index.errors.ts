import {errorFactories, errorMessage} from '@mtth/stl-errors';

export const [errors, codes] = errorFactories({
  definitions: {
    orphanedResource: (ref: unknown) => ({
      message: `A file references resource ${ref} but does not have an ID`,
      tags: {ref},
    }),
    unresolvable: (issues: ReadonlyArray<ResolutionIssue>) => ({
      message:
        'Data could not be resolved: ' + issues.map(formatIssue).join(', '),
      tags: {issues},
    }),
    invalidResourceReference: (ru: URL, cause: unknown) => ({
      message: `Reference ${ru} is invalid: ${errorMessage(cause)}`,
      cause,
      tags: {ref: '' + ru},
    }),
  },
  prefix: 'ERR_OPENAPI_',
});

export interface ResolutionIssue {
  readonly message: string;
  readonly path: ReadonlyArray<number | string>;
}

function formatIssue(i: ResolutionIssue): string {
  return `[$${i.path.join('.')}] ${i.message}`;
}

export default codes;
