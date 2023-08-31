import {ResourceLoader} from '@opvious/stl-utils/files';
import YAML from 'yaml';

import * as sut from '../src/operations.js';

const loader = ResourceLoader.enclosing(import.meta.url).scoped('test');

describe('extract path operation definitions', () => {
  test('null hook', async () => {
    const {contents} = await loader.load('pets.openapi.yaml');
    const doc = YAML.parse(contents);
    const defs = sut.extractPathOperationDefinitions({document: doc});
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
