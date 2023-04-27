import {filePath, ResourceLoader} from '@opvious/stl-utils/files';
import path from 'path';

import * as sut from '../../src/resolvable/index.js';

const loader = ResourceLoader.create({
  root: path.dirname(filePath(import.meta.url)),
  dependenciesFolder: 'deps',
  resourcesFolder: 'data',
});

describe.each<[string, string, unknown]>([
  [
    'nested',
    'root.yaml',
    {
      $id: 'resource://root-package/root.yaml',
      components: {
        schemas: {
          Neighbor: {type: 'object', properties: {child: {type: 'number'}}},
          Child1: {type: 'number'},
          Child2: {type: 'object', properties: {nested: {type: 'string'}}},
        },
      },
    },
  ],
  [
    'fragments',
    'request.yaml',
    {
      $id: 'resource://root/request.yaml',
      components: {
        schemas: {
          Bus: {type: 'string'},
          Car: {type: 'number'},
        },
      },
    },
  ],
  ['simple', 'openapi.yaml', {openapi: '3.0.0', paths: {}}],
])('%s', (folder, root, want) => {
  let loaded: sut.LoadedResolvableResource;

  beforeAll(async () => {
    loaded = await sut.loadResolvableResource(root, {
      loader: loader.scoped('resources/' + folder),
    });
  });

  test('loads resolvable resource', async () => {
    expect(loaded.resolved).toEqual(want);
  });

  test('combines resolvables', () => {
    expect(sut.combineResolvables(loaded.resolvables)).toEqual(want);
  });
});
