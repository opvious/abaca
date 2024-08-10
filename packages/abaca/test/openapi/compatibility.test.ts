import {ResourceLoader} from '@opvious/stl-utils/files';

import * as sut from '../src/compatibility.js';
import {loadOpenapiDocument, OpenapiDocument} from '../src/document/index.js';

const loader = ResourceLoader.enclosing(import.meta.url).scoped('test');

interface Schemas {
  Pet: {
    readonly id: number;
    readonly name: string;
  };
  PetInput: {
    readonly name: string;
    readonly tag?: string;
  };
}

describe('schema compatibility predicates', () => {
  let predicates: sut.CompatibilityPredicatesFor<Schemas>;

  beforeAll(async () => {
    const doc: OpenapiDocument<Schemas> = await loadOpenapiDocument({
      path: loader.localUrl('pets.openapi.yaml'),
      loader,
    });
    predicates = sut.schemaCompatibilityPredicates({document: doc});
  });

  test('predicate', () => {
    expect(predicates.isPet({id: 1, name: 'n'})).toBe(true);
    expect(predicates.isPet({id: 1})).toBe(false);
  });

  test('assert compatible', () => {
    const arg: unknown = {id: 1, name: 'n'};
    sut.assertCompatible(arg, predicates.isPet);
  });

  test('assert incompatible', () => {
    try {
      sut.assertCompatible({id: 2}, predicates.isPet);
    } catch (err) {
      expect(err).toMatchObject({code: sut.errorCodes.IncompatibleValue});
    }
    expect.assertions(1);
  });
});
