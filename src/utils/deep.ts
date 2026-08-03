import type { ArrayDiffResult } from "../core/types";
import { getByPath, setByPath } from "./path";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function cloneDeep<TValue>(value: TValue): TValue {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => cloneDeep(item)) as TValue;
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneDeep(item)]),
    ) as TValue;
  }

  return value;
}

export function isDeepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (typeof left !== typeof right) {
    return false;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      return false;
    }
    return left.every((item, index) => isDeepEqual(item, right[index]));
  }

  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) {
      return false;
    }
    return leftKeys.every((key) => isDeepEqual(left[key], right[key]));
  }

  return false;
}

export function deepMerge<TValue>(
  target: TValue,
  source: Partial<TValue>,
): TValue {
  if (Array.isArray(target) && Array.isArray(source)) {
    return cloneDeep(source) as TValue;
  }

  if (isPlainObject(target) && isPlainObject(source)) {
    const output: Record<string, unknown> = { ...target };
    Object.entries(source).forEach(([key, value]) => {
      const current = output[key];
      output[key] =
        isPlainObject(current) && isPlainObject(value)
          ? deepMerge(current, value)
          : cloneDeep(value);
    });
    return output as TValue;
  }

  return cloneDeep(source as TValue);
}

export function findChangedPaths(
  left: unknown,
  right: unknown,
  prefix = "",
): string[] {
  if (isDeepEqual(left, right)) {
    return [];
  }

  if (
    !isPlainObject(left) &&
    !isPlainObject(right) &&
    !Array.isArray(left) &&
    !Array.isArray(right)
  ) {
    return prefix ? [prefix] : [];
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    return prefix ? [prefix] : [];
  }

  const keys = new Set([
    ...Object.keys((left as Record<string, unknown>) ?? {}),
    ...Object.keys((right as Record<string, unknown>) ?? {}),
  ]);

  const output: string[] = [];
  keys.forEach((key) => {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    output.push(
      ...findChangedPaths(
        (left as Record<string, unknown> | undefined)?.[key],
        (right as Record<string, unknown> | undefined)?.[key],
        nextPrefix,
      ),
    );
  });

  return output;
}

export function applyPaths<TValue>(
  source: TValue,
  reference: TValue,
  paths: string[],
): TValue {
  return paths.reduce((accumulator, path) => {
    const nextValue = getByPath(reference, path);
    return setByPath(accumulator, path, cloneDeep(nextValue));
  }, cloneDeep(source));
}

export function diffArraysBy<TItem>(
  before: TItem[],
  after: TItem[],
  idOf: (item: TItem) => string | number,
): ArrayDiffResult<TItem> {
  const beforeMap = new Map(before.map((item) => [idOf(item), item]));
  const afterMap = new Map(after.map((item) => [idOf(item), item]));

  const added = after.filter((item) => !beforeMap.has(idOf(item)));
  const removed = before.filter((item) => !afterMap.has(idOf(item)));
  const modified = after.reduce<Array<{ before: TItem; after: TItem }>>(
    (accumulator, item) => {
      const id = idOf(item);
      const previous = beforeMap.get(id);
      if (previous && !isDeepEqual(previous, item)) {
        accumulator.push({ before: previous, after: item });
      }
      return accumulator;
    },
    [],
  );

  return {
    added,
    removed,
    modified,
    hasChanges: added.length > 0 || removed.length > 0 || modified.length > 0,
  };
}
