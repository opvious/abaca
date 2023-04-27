import {errorFactories, errorMessage} from '@opvious/stl-errors';
import {FileUrl} from '@opvious/stl-utils/files';

export const [errors, codes] = errorFactories({
  definitions: {
    missingResolvableId: (url: FileUrl) => ({
      message: `Resource ${url} references another but does not have an ID`,
      tags: {url},
    }),
    unresolvableResource: (
      url: FileUrl,
      issues: ReadonlyArray<ResolutionIssue>
    ) => ({
      message:
        `Resource at ${url} could not be resolved: ` +
        issues.map(formatIssue).join(', '),
      tags: {url, issues},
    }),
    invalidResolvedResource: (ru: URL, cause: unknown) => ({
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
