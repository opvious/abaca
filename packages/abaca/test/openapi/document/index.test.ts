import {fail} from '@mtth/stl-errors';
import {RecordingTelemetry} from '@mtth/stl-telemetry';
import {ResourceLoader} from '@mtth/stl-utils/files';

import codes from '../../../src/openapi/document/index.errors.js';
import * as sut from '../../../src/openapi/document/index.js';

const loader = ResourceLoader.enclosing(import.meta.url).scoped('test/openapi');

const telemetry = RecordingTelemetry.forTesting();

describe('load OpenAPI document', () => {
  describe('valid', () => {
    test.each(['pets.openapi.yaml', 'tables.openapi.yaml'])(
      '%s',
      async (name) => {
        await sut.loadOpenapiDocument({path: loader.localUrl(name), loader});
      }
    );
  });

  test('unexpected version', async () => {
    try {
      await sut.loadOpenapiDocument({
        path: loader.localUrl('pets.openapi.yaml'),
        loader,
        versions: ['3.1'],
      });
      fail();
    } catch (err) {
      expect(err).toMatchObject({code: codes.UnexpectedDocumentVersion});
    }
  });

  test('invalid document', async () => {
    try {
      await sut.loadOpenapiDocument({
        path: loader.localUrl('invalid.openapi.yaml'),
        loader,
      });
      fail();
    } catch (err) {
      expect(err).toMatchObject({code: codes.InvalidDocument});
    }
  });

  // TODO: Improve consolidation logic to support this...
  test.skip('embeds definitions', async () => {
    const doc: sut.OpenapiDocument<number> = await sut.loadOpenapiDocument({
      loader: loader.scoped('document/resources/embedded'),
      versions: ['3.0'],
      telemetry,
    });
    expect(doc).toMatchObject({
      components: {
        schemas: {
          Header: {type: 'array'},
          Table: {
            properties: {
              header: {$ref: '#/components/schemas/Header'},
              rows: {type: 'array', items: {$ref: '#/components/schemas/Row'}},
            },
          },
          Row: {type: 'array'},
        },
      },
    });
  });

  test('consolidates simple aliases', async () => {
    const documentLoader = loader.scoped('document');
    const doc: sut.OpenapiDocument<number> = await sut.loadOpenapiDocument({
      path: documentLoader.localUrl('references.openapi.yaml'),
      loader: documentLoader,
      telemetry,
    });
    const res = (doc as any).paths['/tables/{id}'].get.responses['200'];
    expect(res.content['application/json'].schema.$ref).toEqual(
      '#/components/schemas/Table'
    );
  });

  test('consolidates complex aliases', async () => {
    await sut.loadOpenapiDocument({
      loader: loader.scoped('document/resources/consolidated'),
      telemetry,
    });
  });
});
