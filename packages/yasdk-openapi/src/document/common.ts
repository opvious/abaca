import {errorFactories} from '@opvious/stl-errors';
import {OpenAPISchemaValidatorResult} from 'openapi-schema-validator';
import {OpenAPIV2, OpenAPIV3, OpenAPIV3_1} from 'openapi-types';
import {DeepReadonly} from 'ts-essentials';

export const [errors, errorCodes] = errorFactories({
  definitions: {
    invalidDocument: (issues: ReadonlyArray<DocumentValidationIssue>) => ({
      message:
        'OpenAPI schema is invalid: ' +
        issues.map(formatValidationIssue).join(', '),
      tags: {issues},
    }),
    unexpectedDocumentVersion: (
      got: string,
      want: ReadonlyArray<OpenapiVersion>
    ) => ({
      message: `OpenAPI version ${got} is not acceptable`,
      tags: {got, want},
    }),
  },
  prefix: 'ERR_OPENAPI_',
});

export type DocumentValidationIssue =
  OpenAPISchemaValidatorResult['errors'][number];

function formatValidationIssue(i: DocumentValidationIssue): string {
  return `[${i.instancePath}] ${i.message}`;
}

const documentTag = 'yasdk-openapi:documentTag+v1';

/**
 * An error code with attached type information about the error's tags. This
 * information can be picked up during retrieval (e.g. `isStandardError`) to
 * make the type of matching error's tags as specific as possible.
 */
export type TaggedDocument<D, S> = DeepReadonly<D> & {
  readonly [documentTag]: S;
};

export interface OpenapiDocuments<S = any> {
  '2.0': TaggedDocument<OpenAPIV2.Document, S>;
  '3.0': TaggedDocument<OpenAPIV3.Document, S>;
  '3.1': TaggedDocument<OpenAPIV3_1.Document, S>;
}

export type OpenapiVersion = keyof OpenapiDocuments;

export type OpenapiDocument<S = any> = OpenapiDocuments<S>[OpenapiVersion];

export const openapiVersions = ['2.0', '3.0', '3.1'] as const;
