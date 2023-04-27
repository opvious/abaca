import {OpenAPIV2, OpenAPIV3, OpenAPIV3_1} from 'openapi-types';
import {DeepReadonly} from 'ts-essentials';

export interface OpenapiDocuments {
  '2.0': DeepReadonly<OpenAPIV2.Document>;
  '3.0': DeepReadonly<OpenAPIV3.Document>;
  '3.1': DeepReadonly<OpenAPIV3_1.Document>;
}

export type OpenapiVersion = keyof OpenapiDocuments;

export type OpenapiDocument = OpenapiDocuments[OpenapiVersion];

export const openapiVersions = ['2.0', '3.0', '3.1'] as const;
