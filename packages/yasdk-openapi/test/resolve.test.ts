import {fail} from '@opvious/stl-errors';

import {loadDocument} from '../src/load.js';
import * as sut from '../src/resolve.js';
import {resourceUrl} from './helpers.js';

describe('resolve references', () => {
  let resolver: sut.ReferenceResolver;

  beforeAll(async () => {
    const doc = await loadDocument(resourceUrl('pets.openapi.yaml'));
    resolver = sut.ReferenceResolver.create(doc);
  });

  test('ok', async () => {
    const obj = await resolver.resolve('#/components/schemas/Pet');
    expect(obj).toMatchObject({type: 'object', required: ['id', 'name']});
  });

  test('not found', async () => {
    try {
      await resolver.resolve('#/missing');
      fail();
    } catch (err) {
      expect(err).toMatchObject({
        code: sut.resolveErrorCodes.UnresolvableReference,
      });
    }
  });
});
