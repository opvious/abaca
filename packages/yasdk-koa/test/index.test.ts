
const router = operationsRouter<operations>({
  doc,
  handlers: {
    listPets: async (ctx) => {
      const limit = ctx.query.limit ?? 2;
      if (limit! > 2) {
        return {code: 400, data: {code: 400, message: 'Limit too high'}};
      }
      if (ctx.accepts('text/plain')) {
        return {code: 406, type: 'text/plain', data: 'json only'};
      }
      return [...pets.values()];
    },
    createPet: async (ctx) => {
      if (ctx.get('boom')) {
        return 599;
      }
      const id = '' + (pets.size + 1);
      pets.set(id, {...ctx.request.body, id});
      if (ctx.accepts('text/plain')) {
        return {code: 201, data: id};
      } else {
        return 201;
      }
    },
    getPet: async (ctx) => {
      const {petId} = ctx.params;
    },
    updatePet: async (ctx) => {
      const pet = pets.get(ctx.params.petId);
      if (!pet) {
        return 404;
      }
      Object.assign(pet, ctx.request.body);
      return {data: pet};
    },
  },
});
