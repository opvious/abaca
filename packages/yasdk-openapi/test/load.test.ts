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
          limit: {location: 'query', required: false, schema: null},
        },
        body: undefined,
        responses: {
          '200': {'application/json': null},
          '2XX': {'text/plain': null},
          default: {'application/json': null},
        },
      },
      createPet: {
        path: '/pets',
        method: 'post',
        body: {required: true, schemas: {'application/json': null}},
        parameters: {},
        responses: {
          '201': {'text/plain': null},
          default: {'application/json': null},
        },
      },
      getPetAge: {
        path: '/pets/{petId}/age',
        body: undefined,
        method: 'get',
        parameters: {petId: {location: 'path', required: true, schema: null}},
        responses: {
          '200': {'application/json': null},
          '400': {'text/plain': null},
          '404': {},
        },
      },
      showPetById: {
        path: '/pets/{petId}',
        body: undefined,
        method: 'get',
        parameters: {petId: {location: 'path', required: true, schema: null}},
        responses: {
          '200': {'application/json': null},
          default: {'application/json': null},
        },
      },
      updatePetTag: {
        path: '/pets/{petId}',
        body: {required: true, schemas: {'application/json': null}},
        method: 'put',
        parameters: {petId: {location: 'path', required: true, schema: null}},
        responses: {
          '200': {'application/json': null},
        },
      },
    });
  });
});

function resourceUrl(name: string): URL {
  return new URL(`./resources/${name}`, import.meta.url);
}
