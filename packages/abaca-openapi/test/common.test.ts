import * as sut from '../src/common.js';

describe('json pointer', () => {
  describe('create', () => {
    test.each([
      [['foo'], '/foo'],
      [['foo', 'bar'], '/foo/bar'],
      [['~', 'bar'], '/~0/bar'],
      [['hi/there', 'you~'], '/hi~1there/you~0'],
    ])('%j => %j', (arg, want) => {
      expect(sut.createPointer(arg)).toEqual(want);
    });
  });

  describe('dereference', () => {
    test.each([
      [123, [], 123],
      [{one: 1}, ['one'], 1],
      [{arr: [1, 2, 3]}, ['arr', '1'], 2],
    ])('%j @ %s => %j', (val, path, want) => {
      const ptr = sut.createPointer(path);
      expect(sut.dereferencePointer(ptr, val)).toEqual(want);
    });
  });
});
