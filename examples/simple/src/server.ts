import Router from '@koa/router';
import {createOperationsRouter} from 'abaca-koa';
import {loadOpenapiDocument} from 'abaca-openapi';
import Koa from 'koa';

import {operations, Schema} from './sdk.gen.js';

/** Creates a basic router for the pets API */
async function petsRouter(): Promise<Router> {
  // Load OpenAPI specification from resources/ folder
  const document = await loadOpenapiDocument();

  // Create the router
  const pets = new Map<number, Schema<'Pet'>>();
  return createOperationsRouter<operations>({
    document,
    handlers: {
      createPet: (ctx) => {
        const pet = {id: pets.size + 1, ...ctx.request.body};
        pets.set(pet.id, pet);
        return {status: 201, data: pet};
      },
      listPets: (ctx) => {
        const limit = ctx.params.limit ?? 10;
        return {data: [...pets.values()].slice(0, limit)};
      },
      showPetById: (ctx) => {
        const pet = pets.get(ctx.params.petId);
        return pet ? {data: pet} : 404;
      },
    },
  });
}

/** Runs the pets router on port 8080 */
async function main(): Promise<void> {
  const router = await petsRouter();
  const app = new Koa().use(router.routes());
  app.listen(8080).on('listening', () => void console.log('Listening...'));
}

main().catch((err) => {
  process.exitCode = 1;
  console.error(err);
});
