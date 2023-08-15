import {createSdk} from './sdk.gen.js';

/** Runs a few sample operations on the API created in server.js */
async function main(): Promise<void> {
  // Create a client SDK pointing to the local example server
  const sdk = createSdk('http://localhost:8080');

  // List initial pets
  const listRes = await sdk.listPets();
  if (listRes.code !== 200) {
    throw new Error(listRes.data.message);
  }
  console.log(`Initial pet count: ${listRes.data.length}`);

  // Create a new pet
  const createRes = await sdk.createPet({body: {name: 'Fido'}});
  if (createRes.code !== 201) {
    throw new Error(createRes.data.message);
  }
  const petId = createRes.data.id;
  console.log(`Created pet ID: ${petId}`);

  // Refetch the newly created pet
  const showRes = await sdk.showPetById({parameters: {petId}});
  switch (showRes.code) {
    case 200:
      console.log(`Fetched pet named ${showRes.data.name}`);
      break;
    case 404:
      console.log(`Pet ${petId} not found`);
      break;
    default:
      throw new Error(showRes.data.message);
  }
}

main().catch((err) => {
  process.exitCode = 1;
  console.error(err);
});
