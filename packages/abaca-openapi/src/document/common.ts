import {errorFactories} from '@opvious/stl-errors';
import {OpenAPISchemaValidatorResult} from 'openapi-schema-validator';
import {OpenAPIV3, OpenAPIV3_1} from 'openapi-types';
import {DeepReadonly} from 'ts-essentials';

export const [errors, errorCodes] = errorFactories({
  definitions: {
    invalidDocument: (
      issues: ReadonlyArray<DocumentValidationIssue>,
      issueCount: number
    ) => ({
      message:
        'OpenAPI schema is invalid: ' +
        issues.map(formatValidationIssue).join(', ') +
        (issueCount > issues.length
          ? `, and ${issueCount - issues.length} more...`
          : ''),
      tags: {issueCount, issues},
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

/** All supported OpenAPI versions */
export const openapiVersions = ['3.0', '3.1'] as const;

/** Available OpenAPI version type */
export type OpenapiVersion = keyof OpenapiDocuments;

// Not using a symbol for interoperability with compatible library versions.
const documentTag = 'abaca-openapi:documentTag+v1';

/**
 * An OpenAPI document with optional (virtual) type information about its
 * component schemas. This information can be picked up by other utilities, for
 * example schema compatibility checks.
 */
export type TaggedDocument<D, S> = DeepReadonly<D> & {
  readonly [documentTag]: S;
};

/** All supported OpenAPI document types, by version */
export interface OpenapiDocuments<S = any> {
  '3.0': TaggedDocument<OpenAPIV3.Document, S>;
  '3.1': TaggedDocument<OpenAPIV3_1.Document, S>;
}

/** Version-generic OpenAPI document */
export type OpenapiDocument<S = any> = OpenapiDocuments<S>[OpenapiVersion];
