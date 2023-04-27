import {OpenAPIV2, OpenAPIV3, OpenAPIV3_1} from 'openapi-types';

export interface OpenapiDocuments {
  '2.0': OpenAPIV2.Document;
  '3.0': OpenAPIV3.Document;
  '3.1': OpenAPIV3_1.Document;
}

export type OpenapiVersion = keyof OpenapiDocuments;

export type OpenapiDocument = OpenapiDocuments[OpenapiVersion];

export const openapiVersions = ['2.0', '3.0', '3.1'] as const;
