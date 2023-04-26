import {fail} from '@opvious/stl-errors';

import {loadDocument} from '../src/parse.js';
import * as sut from '../src/validate.js';
import {resourceUrl} from './helpers.js';

interface Schemas {
  Pet: {
    readonly id: number;
    readonly name: string;
  };
}

describe('schema enforcer', () => {
  let enforcer: sut.SchemaEnforcer<Schemas>;

  beforeAll(async () => {
    const doc = await loadDocument(resourceUrl('pets.openapi.yaml'));
    enforcer = sut.schemaEnforcer(doc);
  });

  test('predicate', async () => {
    const vals = await enforcer.validators({
      names: ['Pet'],
    });
    expect(vals.isPet({id: 1, name: 'n'})).toBe(true);
    expect(vals.isPet({id: 1})).toBe(false);
  });

  test('assertion', async () => {
    const {isPet} = await enforcer.validators({
      names: ['Pet'],
    });
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
