import type { AutosaveStatusSnapshot } from "./types";

type Listener = () => void;

function shallowEqualObjects(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  for (const key of leftKeys) {
    if (!Object.is(left[key], right[key])) {
      return false;
    }
  }

  return true;
}

export function createAutosaveStore(initialState: AutosaveStatusSnapshot) {
  let state = initialState;
  const listeners = new Set<Listener>();

  return {
    getState: () => state,
    setState: (
      update:
        | Partial<AutosaveStatusSnapshot>
        | ((current: AutosaveStatusSnapshot) => AutosaveStatusSnapshot),
    ) => {
      const nextState =
        typeof update === "function"
          ? update(state)
          : {
              ...state,
              ...update,
            };

      if (
        shallowEqualObjects(
          state as unknown as Record<string, unknown>,
          nextState as unknown as Record<string, unknown>,
        )
      ) {
        return;
      }

      state = nextState;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: Listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}