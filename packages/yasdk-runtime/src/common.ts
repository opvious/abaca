export type AsyncOrSync<V> = V | Promise<V>;

export type Has<N extends number | string | symbol, V> = {
  readonly [K in N]: V;
};

export type Get<O, N extends keyof O | string, D = never> = O extends Has<
  N,
  infer V
>
  ? V & {}
  : D;

export type Lookup<
  O,
  N extends keyof O | string,
  D = undefined
> = O extends Has<N, infer V>
  ? V & {}
  : O extends Partial<Has<N, infer V>>
  ? (V & {}) | undefined
  : D;

export type Exact<T, V> = T extends V
  ? Exclude<keyof T, keyof V> extends never
    ? T
    : never
  : never;

export type Values<O> = O[keyof O];

export type KeysOfValues<O> = Values<{
  [K in keyof O]: keyof O[K];
}>;
