import {fail} from '@opvious/stl-errors';
import {describe, expect, test} from 'vitest';

import * as sut from '../src/load.js';

describe('load OpenAPI document', () => {
  describe('valid', () => {
    test.each([
      'pets.openapi.yaml',
      'petstore.openapi.json',
      'tables.openapi.yaml',
    ])('%s', async (name) => {
      await sut.loadOpenapiDocument(resourceUrl(name));
    });
  });

  test('unexpected version', async () => {
    try {
      await sut.loadOpenapiDocument(resourceUrl('pets.openapi.yaml'), {
        versions: ['2.0'],
      });
      fail();
    } catch (err) {
      expect(err).toMatchObject({code: 'ERR_UNEXPECTED_VERSION'});
    }
  });

  test('invalid document', async () => {
    try {
      await sut.loadOpenapiDocument(resourceUrl('invalid.openapi.yaml'));
      fail();
    } catch (err) {
      expect(err).toMatchObject({code: 'ERR_INVALID_SCHEMA'});
    }
  });
});

describe('extract operation definitions', () => {
  test('null hook', async () => {
    const doc = await sut.loadOpenapiDocument(resourceUrl('pets.openapi.yaml'));
    const defs = sut.extractOperationDefinitions(doc);
    expect(defs).toEqual({
      listPets: {
        path: '/pets',
        method: 'get',
        parameters: {
          limit: {location: 'query', schema: null},
        },
        responses: {
          '200': {'application/json': null},
          '2XX': {'text/plain': null},
        },
      },
      createPet: {
        path: '/pets',
        method: 'post',
      },
    });
  });
});

function resourceUrl(name: string): URL {
  return new URL(`./resources/${name}`, import.meta.url);
}
