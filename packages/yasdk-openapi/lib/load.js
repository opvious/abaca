import { assert, unexpected } from '@opvious/stl-errors';
import { ifPresent } from '@opvious/stl-utils/functions';
import { Resolver } from '@stoplight/json-ref-resolver';
import { readFile } from 'fs/promises';
import { default as validation } from 'openapi-schema-validator';
import path from 'path';
import YAML from 'yaml';
const SchemaValidator = validation.default;
/** Reads and validates an OpenAPI schema from a path. */
export async function loadOpenapiDocument(
/** File path, currently only YAML paths are supported. */
fp, opts) {
    const str = await readFile(fp, 'utf8');
    let obj;
    const ext = path.extname(fp);
    switch (ext) {
        case '.json':
            obj =
                ifPresent(opts?.reviver, (r) => JSON.parse(str, r)) ?? JSON.parse(str);
            break;
        case '.yml':
        case '.yaml':
            obj =
                ifPresent(opts?.reviver, (r) => YAML.parse(str, r)) ?? YAML.parse(str);
            break;
        default:
            throw unexpected(ext);
    }
    const version = typeof obj?.openapi == 'string' ? obj.openapi.trim().slice(0, 3) : '';
    const allowed = opts?.versions ?? allVersions;
    assert(allowed.includes(version), 'Incompatible version: %s', version);
    const validator = new SchemaValidator({ version });
    const validated = validator.validate(obj);
    assert(!validated.errors.length, 'OpenAPI schema validation errors: %j', validated.errors);
    if (!opts?.resolveReferences) {
        return obj;
    }
    const resolver = new Resolver();
    const resolved = await resolver.resolve(obj);
    assert(!resolved.errors.length, 'OpenAPI schema resolution errors: %j', resolved.errors);
    return resolved.result;
}
const allVersions = ['2.0', '3.0', '3.1'];
