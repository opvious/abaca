import Router from '@koa/router';
import {loadOpenapiDocument} from 'abaca';
import {createOperationsRouter} from 'abaca-koa';

import {Operations, Schema} from './sdk.gen.js';

/** Creates a basic router for the pets API */
export async function createRouter(): Promise<Router> {
  // Load OpenAPI specification from resources/ folder
  const document = await loadOpenapiDocument();

  // Create the router from handlers explicitly typed to match their
  // corresponding OpenAPI operation. In this simple example we use a simple
  // in-memory map to store the pets.
  const pets = new Map<number, Schema<'Pet'>>();
  return createOperationsRouter<Operations>({
    document,
    handlers: {
      createPet: (ctx) => {
        // Request bodies are automatically validated and typed. Handlers are
        // guaranteed to be called with input data that matches the
        // specification (invalid input will return an appropriate 4XX error to
        // the client).
        const pet = {id: pets.size + 1, ...ctx.request.body};
        pets.set(pet.id, pet);
        // Data can be sent back by returning an object with status and data
        // properties. Both are type-checked against the OpenAPI specification.
        return {status: 201, data: pet};
      },
      listPets: (ctx) => {
        // Similarly to request bodies, parameters are validated and typed
        // automatically.
        const limit = ctx.params.limit ?? 10;
        // A 200 status can be omitted when sending data.
        return {data: [...pets.values()].slice(0, limit)};
      },
      showPetById: (ctx) => {
        const pet = pets.get(ctx.params.petId);
        // Returning just a number from a handler produces a response with that
        // number as status and no content. Importantly, the returned number is
        // type-checked, so returning 200 would fail here for example!
        return pet ? {data: pet} : 404;
      },
      clearPets: () => {
        pets.clear();
        return 204;
      },
    },
    // The `handleInvalidRequests` option transforms invalid input errors (for
    // example invalid request body) into 4XX responses. When unset, the
    // (typed!) errors are propagated downstream to allow custom handling.
    handleInvalidRequests: true,
  });
}
