export type Lane = number;
export type Lanes = number;

export const NoLane: Lane = 0b0000;
export const DefaultLane: Lane = 0b0001;

export function mergeLanes(first: Lanes, second: Lanes): Lanes {
  return first | second;
}

export function includesSomeLane(set: Lanes, subset: Lanes): boolean {
  return (set & subset) !== NoLane;
}
