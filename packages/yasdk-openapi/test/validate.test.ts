import {fail} from '@opvious/stl-errors';
import {ResourceLoader} from '@opvious/stl-utils/files';

import {assertIsOpenapiDocument} from '../src/parse.js';
import {loadResolvableResource} from '../src/resolvable/index.js';
import * as sut from '../src/validate.js';

const loader = ResourceLoader.enclosing(import.meta.url).scoped('test');

interface Schemas {
  Pet: {
    readonly id: number;
    readonly name: string;
  };
}

describe('schema enforcer', () => {
  let enforcer: sut.SchemaEnforcer<Schemas>;

  beforeAll(async () => {
    const {resolved} = await loadResolvableResource('pets.openapi.yaml', {
      loader,
    });
    assertIsOpenapiDocument(resolved);
    enforcer = sut.schemaEnforcer(resolved);
  });

  test('predicate', () => {
    const vals = enforcer.validators({names: ['Pet']});
    expect(vals.isPet({id: 1, name: 'n'})).toBe(true);
    expect(vals.isPet({id: 1})).toBe(false);
  });

  test('assertion', () => {
    const {isPet} = enforcer.validators({names: ['Pet']});
    const arg: unknown = {id: 1, name: 'n'};
    sut.assertValue(isPet, arg);
    try {
      sut.assertValue(isPet, {id: 2});
      fail();
    } catch (err) {
      expect(err).toMatchObject({code: sut.errorCodes.InvalidValue});
    }
  });
});
