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

export interface OpenapiDocuments {
  '2.0': DeepReadonly<OpenAPIV2.Document>;
  '3.0': DeepReadonly<OpenAPIV3.Document>;
  '3.1': DeepReadonly<OpenAPIV3_1.Document>;
}

export type OpenapiVersion = keyof OpenapiDocuments;

export type OpenapiDocument = OpenapiDocuments[OpenapiVersion];

export const openapiVersions = ['2.0', '3.0', '3.1'] as const;
