import { OpenAPIV2, OpenAPIV3, OpenAPIV3_1 } from 'openapi-types';
/** Reads and validates an OpenAPI schema from a path. */
export declare function loadOpenapiDocument<V extends OpenapiVersion>(
/** File path, currently only YAML paths are supported. */
fp: string, opts?: {
    /** Acceptable document versions. */
    readonly versions?: ReadonlyArray<V>;
    /** Custom decoding reviver. */
    readonly reviver?: (k: unknown, v: unknown) => unknown;
    /** Resolve all `$refs` in the schema. */
    readonly resolveReferences?: boolean;
}): Promise<OpenapiDocuments[V]>;
export interface OpenapiDocuments {
    '2.0': OpenAPIV2.Document;
    '3.0': OpenAPIV3.Document;
    '3.1': OpenAPIV3_1.Document;
}
export type OpenapiVersion = keyof OpenapiDocuments;
export type OpenapiDocument = OpenapiDocuments[OpenapiVersion];
