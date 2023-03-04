export function resourceUrl(name: string): URL {
  return new URL(`./resources/${name}`, import.meta.url);
}
