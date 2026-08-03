import { pickPaths, setByPath } from "./path";

export function buildDirtyTree(paths: string[]): Record<string, unknown> {
  return paths.reduce<Record<string, unknown>>((accumulator, path) => {
    return setByPath(accumulator, path, true);
  }, {});
}

export function selectDirtyPayload<TValue>(values: TValue, paths: string[]): Partial<TValue> {
  return pickPaths(values, paths);
}