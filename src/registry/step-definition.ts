import type { World } from "@/state/world";

export type StepCallback<W extends World = World> = (
  world: W,
  ...args: unknown[]
) => Promise<void> | void;

export interface StepDefinition<W extends World = World> {
  readonly keyword: "Given" | "When" | "Then" | "Step";
  readonly pattern: string;
  readonly callback: StepCallback<W>;
}
