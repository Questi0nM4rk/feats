export interface World {
  [key: string]: unknown;
}

export type WorldFactory<W extends World = World> = () => W;
