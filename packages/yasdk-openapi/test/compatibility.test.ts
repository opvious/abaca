import {fail} from '@opvious/stl-errors';
import {ResourceLoader} from '@opvious/stl-utils/files';

import * as sut from '../src/compatibility.js';
import {loadOpenapiDocument} from '../src/document/index.js';

const loader = ResourceLoader.enclosing(import.meta.url).scoped('test');

interface Schemas {
  Pet: {
    readonly id: number;
    readonly name: string;
  };
}

describe('schema compatibility checker', () => {
  let checker: sut.SchemaCompatibilityChecker<Schemas>;

  beforeAll(async () => {
    const doc = await loadOpenapiDocument({path: 'pets.openapi.yaml', loader});
    checker = sut.schemaCompatibilityChecker(doc);
  });

  test('predicate', () => {
    const vals = checker.validators('Pet');
    expect(vals.isPet({id: 1, name: 'n'})).toBe(true);
    expect(vals.isPet({id: 1})).toBe(false);
  });

  test('assertion', () => {
    const {isPet} = checker.validators('Pet');
    const arg: unknown = {id: 1, name: 'n'};
    sut.assertValue(isPet, arg);
    try {
      sut.assertValue(isPet, {id: 2});
      fail();
    } catch (err) {
      expect(err).toMatchObject({code: sut.errorCodes.IncompatibleValue});
    }
  });
});
