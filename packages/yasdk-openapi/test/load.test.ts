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
          limit: {location: 'query', required: false},
        },
        body: undefined,
        responses: {
          '200': ['application/json'],
          '2XX': ['text/plain'],
          default: ['application/json'],
        },
      },
      createPet: {
        path: '/pets',
        method: 'post',
        body: {required: true, types: ['application/json']},
        parameters: {},
        responses: {
          '201': ['text/plain'],
          default: ['application/json'],
        },
      },
      getPetAge: {
        path: '/pets/{petId}/age',
        body: undefined,
        method: 'get',
        parameters: {petId: {location: 'path', required: true}},
        responses: {
          '200': ['application/json'],
          '400': ['text/plain'],
          '404': [],
        },
      },
      showPetById: {
        path: '/pets/{petId}',
        body: undefined,
        method: 'get',
        parameters: {petId: {location: 'path', required: true}},
        responses: {
          '200': ['application/json'],
          default: ['application/json'],
        },
      },
      updatePetTag: {
        path: '/pets/{petId}',
        body: {required: true, types: ['application/json']},
        method: 'put',
        parameters: {petId: {location: 'path', required: true}},
        responses: {
          '200': ['application/json'],
        },
      },
    });
  });
});

function resourceUrl(name: string): URL {
  return new URL(`./resources/${name}`, import.meta.url);
}
