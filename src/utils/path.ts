import type { KeyMap, KeyMapTransform } from "../core/types";

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parsePath(path: string): Array<string | number> {
  const segments: Array<string | number> = [];
  const matcher = /([^.[\]]+)|\[(\d+)\]/g;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(path)) !== null) {
    if (match[1] !== undefined) {
      segments.push(match[1]);
    } else if (match[2] !== undefined) {
      segments.push(Number(match[2]));
    }
  }

  return segments;
}

export function joinPath(parts: Array<string | number>): string {
  return parts.reduce<string>((accumulator, part) => {
    if (typeof part === "number") {
      return `${accumulator}[${part}]`;
    }
    return accumulator ? `${accumulator}.${part}` : part;
  }, "");
}

export function getByPath<TValue>(source: unknown, path: string): TValue | undefined {
  return parsePath(path).reduce<unknown>((current, key) => {
    if (current === null || current === undefined) {
      return undefined;
    }
    return (current as Record<string | number, unknown>)[key];
  }, source) as TValue | undefined;
}

export function hasPath(source: unknown, path: string): boolean {
  let current: unknown = source;
  for (const segment of parsePath(path)) {
    if (current === null || current === undefined) {
      return false;
    }
    if (!(segment in (current as Record<string | number, unknown>))) {
      return false;
    }
    current = (current as Record<string | number, unknown>)[segment];
  }
  return true;
}

export function setByPath<TValue>(source: TValue, path: string, value: unknown): TValue {
  const parts = parsePath(path);
  if (parts.length === 0) {
    return value as TValue;
  }

  const cloneNode = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      return [...node];
    }
    if (isObjectLike(node)) {
      return { ...node };
    }
    return typeof parts[0] === "number" ? [] : {};
  };

  const root = cloneNode(source) as Record<string | number, unknown>;
  let cursor: Record<string | number, unknown> = root;

  parts.forEach((segment, index) => {
    const isLeaf = index === parts.length - 1;
    if (isLeaf) {
      cursor[segment] = value;
      return;
    }

    const nextValue = cursor[segment];
    const nextClone = cloneNode(nextValue) as Record<string | number, unknown>;
    cursor[segment] = nextClone;
    cursor = nextClone;
  });

  return root as TValue;
}

export function deleteByPath<TValue>(source: TValue, path: string): TValue {
  const parts = parsePath(path);
  if (parts.length === 0) {
    return source;
  }

  const root = Array.isArray(source)
    ? ([...source] as unknown as Record<string | number, unknown>)
    : ({ ...(source as Record<string, unknown>) } as Record<string | number, unknown>);

  let cursor: Record<string | number, unknown> = root;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const segment = parts[index]!;
    const nextValue = cursor[segment];
    const nextClone = Array.isArray(nextValue)
      ? [...nextValue]
      : isObjectLike(nextValue)
        ? { ...nextValue }
        : {};
    cursor[segment] = nextClone;
    cursor = nextClone as Record<string | number, unknown>;
  }

  const last = parts[parts.length - 1]!;
  if (Array.isArray(cursor)) {
    cursor.splice(Number(last), 1);
  } else {
    delete cursor[last];
  }

  return root as TValue;
}

export function getAllPaths(source: unknown, prefix = ""): string[] {
  if (!isObjectLike(source) && !Array.isArray(source)) {
    return prefix ? [prefix] : [];
  }

  if (Array.isArray(source)) {
    if (source.length === 0) {
      return prefix ? [prefix] : [];
    }

    return source.flatMap((item, index) => {
      const nextPath = prefix ? `${prefix}[${index}]` : `[${index}]`;
      return getAllPaths(item, nextPath);
    });
  }

  const entries = Object.entries(source);
  if (entries.length === 0) {
    return prefix ? [prefix] : [];
  }

  return entries.flatMap(([key, value]) => {
    const nextPath = prefix ? `${prefix}.${key}` : key;
    return getAllPaths(value, nextPath);
  });
}

export function pickPaths<TValue>(source: TValue, paths: string[]): Partial<TValue> {
  let output: Partial<TValue> = {};
  const uniquePaths = normalizePaths(paths);
  for (const path of uniquePaths) {
    const value = getByPath(source, path);
    if (value !== undefined) {
      output = setByPath(output, path, value);
    }
  }
  return output;
}

export function omitPaths<TValue>(source: TValue, paths: string[]): TValue {
  return normalizePaths(paths).reduce((accumulator, path) => deleteByPath(accumulator, path), source);
}

export function flattenObject(source: unknown, prefix = ""): Record<string, unknown> {
  if (!isObjectLike(source) && !Array.isArray(source)) {
    return prefix ? { [prefix]: source } : {};
  }

  if (Array.isArray(source)) {
    return source.reduce<Record<string, unknown>>((accumulator, value, index) => {
      const nextPrefix = prefix ? `${prefix}[${index}]` : `[${index}]`;
      Object.assign(accumulator, flattenObject(value, nextPrefix));
      return accumulator;
    }, {});
  }

  return Object.entries(source).reduce<Record<string, unknown>>((accumulator, [key, value]) => {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    Object.assign(accumulator, flattenObject(value, nextPrefix));
    return accumulator;
  }, {});
}

export function unflattenObject<TValue>(source: Record<string, unknown>): TValue {
  let output: unknown = {};
  for (const [path, value] of Object.entries(source)) {
    output = setByPath(output, path, value);
  }
  return output as TValue;
}

function applyKeyMapTransform(transform: KeyMapTransform, value: unknown): [string, unknown] {
  if (typeof transform === "string") {
    return [transform, value];
  }
  return [transform[0], transform[1](value)];
}

export function mapNestedKeys<TValue>(
  source: TValue,
  keyMap: KeyMap,
  options?: { preserveUnmapped?: boolean },
): Record<string, unknown> {
  const flattened = flattenObject(source);
  const output: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(flattened)) {
    const transform = keyMap[path];
    if (transform) {
      const [targetPath, nextValue] = applyKeyMapTransform(transform, value);
      output[targetPath] = nextValue;
      continue;
    }

    if (options?.preserveUnmapped ?? true) {
      output[path] = value;
    }
  }
  return unflattenObject(output);
}

export function normalizePaths(paths: string[]): string[] {
  const unique = [...new Set(paths.filter(Boolean))].sort((left, right) => left.length - right.length);
  return unique.filter((path, index) => {
    return !unique.slice(0, index).some((candidate) => path === candidate || path.startsWith(`${candidate}.`) || path.startsWith(`${candidate}[`));
  });
}