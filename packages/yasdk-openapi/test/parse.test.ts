import {fail} from '@opvious/stl-errors';
import {ResourceLoader} from '@opvious/stl-utils/files';
import YAML from 'yaml';

import * as sut from '../src/parse.js';

const loader = ResourceLoader.enclosing(import.meta.url).scoped('test');

describe('load OpenAPI document', () => {
  describe('valid', () => {
    test.each([
      'pets.openapi.yaml',
      'petstore.openapi.json',
      'tables.openapi.yaml',
    ])('%s', async (name) => {
      await sut.loadOpenapiDocument({path: name, loader});
    });
  });

  test('unexpected version', async () => {
    try {
      await sut.loadOpenapiDocument({
        path: 'pets.openapi.yaml',
        loader,
        versions: ['2.0'],
      });
      fail();
    } catch (err) {
      expect(err).toMatchObject({code: sut.errorCodes.UnexpectedVersion});
    }
  });

  test('invalid document', async () => {
    try {
      await sut.loadOpenapiDocument({path: 'invalid.openapi.yaml', loader});
      fail();
    } catch (err) {
      expect(err).toMatchObject({code: sut.errorCodes.InvalidSchema});
    }
  });
});

describe('extract operation definitions', () => {
  test('null hook', async () => {
    const {contents} = await loader.load('pets.openapi.yaml');
    const doc = YAML.parse(contents);
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
