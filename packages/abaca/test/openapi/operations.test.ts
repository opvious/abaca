import {ResourceLoader} from '@opvious/stl-utils/files';
import YAML from 'yaml';

import * as sut from '../../src/openapi/operations.js';

const loader = ResourceLoader.enclosing(import.meta.url).scoped('test/openapi');

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
          '200': [{mimeType: 'application/json'}],
          '2XX': [{mimeType: 'text/plain'}],
          default: [{mimeType: 'application/json'}],
        },
      },
      createPet: {
        path: '/pets',
        method: 'post',
        body: {required: true, types: ['application/json']},
        parameters: {},
        responses: {
          '201': [{mimeType: 'text/plain'}],
          default: [{mimeType: 'application/json'}],
        },
      },
      getPetAge: {
        path: '/pets/{petId}/age',
        body: undefined,
        method: 'get',
        parameters: {petId: {location: 'path', required: true}},
        responses: {
          '200': [{mimeType: 'application/json'}],
          '400': [{mimeType: 'text/plain'}],
          '404': [],
        },
      },
      showPetById: {
        path: '/pets/{petId}',
        body: undefined,
        method: 'get',
        parameters: {petId: {location: 'path', required: true}},
        responses: {
          '200': [{mimeType: 'application/json'}],
          default: [{mimeType: 'application/json'}],
        },
      },
      updatePetTag: {
        path: '/pets/{petId}',
        body: {required: true, types: ['application/json']},
        method: 'put',
        parameters: {petId: {location: 'path', required: true}},
        responses: {
          '200': [{mimeType: 'application/json'}],
        },
      },
    });
  });
});
