import {test} from 'vitest';

import {operations, types} from './pets-sdk.gen.js';
import * as sut from '../src/index.js';
import {loadDocument} from './helpers.js';

test('', async () => {
  const doc = await loadDocument('pets.openapi.yaml');
  const pets = new Map<number, types['Pet']>();
  const router = sut.operationsRouter<operations>({
    doc,
    handlers: {
      listPets: async (ctx) => {
        const limit = ctx.query.limit ?? 2;
        if (limit! > 2) {
          return {code: 400, data: {code: 400, message: 'Limit too high'}};
        }
        return {code: 200, data: [...pets.values()]};
      },
      createPet: async (ctx) => {
        if (ctx.get('boom')) {
          return {code: 400, data: {code: 400, message: ''}};
        }
        const id = pets.size + 1;
        pets.set(id, {...ctx.request.body, id});
        if (ctx.accepts('text/plain')) {
          return {code: 201, type: 'text/plain', data: '' + id};
        } else {
          return 201;
        }
      },
      showPetById: async (ctx: any) => {
        const {petId} = ctx.params;
        const pet = pets.get(petId);
        return pet ? {code: 200, data: pet} : 404;
      },
      updatePetTag: async (ctx: any) => {
        const pet = pets.get(ctx.params.petId);
        if (!pet) {
          return 404;
        }
        Object.assign(pet, ctx.request.body);
        return {code: 200, data: pet};
      },
    },
  });
});
