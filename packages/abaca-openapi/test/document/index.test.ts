import {fail} from '@opvious/stl-errors';
import { ResourceLoader} from '@opvious/stl-utils/files';

import codes from '../../src/document/index.errors.js';
import * as sut from '../../src/document/index.js';

const loader = ResourceLoader.enclosing(import.meta.url).scoped('test');

describe('load OpenAPI document', () => {
  describe('valid', () => {
    test.each([
      'pets.openapi.yaml',
      'petstore.openapi.json',
      'tables.openapi.yaml',
    ])('%s', async (name) => {
      await sut.loadOpenapiDocument({path: loader.localUrl(name), loader});
    });
  });

  test('unexpected version', async () => {
    try {
      await sut.loadOpenapiDocument({
        path: loader.localUrl('pets.openapi.yaml'),
        loader,
        versions: ['2.0'],
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

  test('embeds definitions', async () => {
    const doc: sut.OpenapiDocument<number> = await sut.loadOpenapiDocument({
      loader: loader.scoped('document/resources/embedded'),
      versions: ['3.0'],
    });
    expect(Object.keys(doc.components!.schemas!)).toEqual(['Row']);
  });
});
