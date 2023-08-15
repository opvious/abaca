import {check} from '@opvious/stl-errors';
import {localPath, ResourceLoader} from '@opvious/stl-utils/files';
import parseDataUrl from 'data-urls';
import path from 'path';

import * as sut from '../../src/resolvable/index.js';

const loader = ResourceLoader.create({
  root: path.dirname(localPath(import.meta.url)),
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
          Neighbor: {
            $id: 'resource://root-package/neighbor.yaml',
            type: 'object',
            properties: {
              child: {
                $id: 'resource://child1/schema.yaml',
                type: 'object',
                required: [],
                properties: {
                  other: {
                    $id: 'resource://child1/other.yaml',
                    type: 'number',
                  },
                },
              },
            },
          },
          Child1: {
            $id: 'resource://child1/schema.yaml',
            type: 'object',
            required: [],
            properties: {
              other: {
                $id: 'resource://child1/other.yaml',
                type: 'number',
              },
            },
          },
          Child2: {
            $id: 'resource://child2/schema.yaml',
            type: 'object',
            properties: {
              nested: {
                $id: 'resource://child1/schema.yaml',
                type: 'string',
              },
            },
          },
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
  [
    'data-resolver',
    'root.yaml',
    {
      $id: 'resource://root/root.yaml',
      components: {
        schemas: {
          House: {type: 'string'},
        },
      },
    },
  ],
])('%s', (folder, root, want) => {
  test('loads resolvable resource', async () => {
    const scoped = loader.scoped('resources/' + folder);
    const {contents} = await scoped.load(root);
    const got = await sut.resolvingReferences(contents, {
      loader: scoped,
      resolvers: {
        data: (url) =>
          Buffer.from(check.isPresent(parseDataUrl('' + url)).body).toString(),
      },
    });
    expect(got).toEqual(want);
  });
});
