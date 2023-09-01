import {ResourceLoader} from '@opvious/stl-utils/files';

import * as sut from '../../src/document/parse.js';

const loader = ResourceLoader.enclosing(import.meta.url).scoped(
  'test/document'
);

describe('parse document', () => {
  test('valid', async () => {
    const {contents} = await loader.load('empty.openapi.yaml');
    const doc = sut.parseOpenapiDocument(contents);
    expect(doc.info.title).toEqual('Empty service');
  });
});
