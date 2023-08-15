import {createSdk} from './sdk.gen.js';

/** Runs a few sample operations on the API created in server.js */
async function main(): Promise<void> {
  // Create a client SDK pointing to the local example server
  const sdk = createSdk('http://localhost:8080');

  // List initial pets
  const res1 = await sdk.listPets();
  if (res1.code !== 200) {
    throw new Error(res1.data.message); // Error type
  }
  console.log(`Initial pets: ${JSON.stringify(res1.data)}`); // Pet list type

  // Create a new pet
  const res2 = await sdk.createPet({
    body: {name: 'Fido'}, // Type-checked
  });
  if (res2.code !== 201) {
    throw new Error(res2.data.message);
  }
  console.log(`Created pet: ${JSON.stringify(res2.data)}`); // Pet type

  // Refetch the newly created pet
  const res3 = await sdk.showPetById({
    parameters: {petId: res2.data.id},
  });
  if (res3.code === 404) {
    console.log('Pet not found?'); // Empty body type
  } else if (res3.code !== 200) {
    throw new Error(res3.data.message);
  }
  console.log(`Fetched pet: ${JSON.stringify(res3.data)}`);
}

main().catch((err) => {
  process.exitCode = 1;
  console.error(err);
});
