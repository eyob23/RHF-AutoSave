import { useSyncExternalStore } from "react";
import type {
  AutosaveController,
  AutosaveSelector,
  AutosaveStatusSnapshot,
} from "../core/types";

export function useAutosaveSelector<
  TSelection,
  TFormValues extends Record<string, unknown>,
  TPayload,
  TResult,
>(
  controller: Pick<
    AutosaveController<TFormValues, TPayload, TResult>,
    "getState" | "subscribe"
  >,
  selector: AutosaveSelector<TSelection>,
  isEqual: (left: TSelection, right: TSelection) => boolean = Object.is,
): TSelection {
  const subscribe = (listener: () => void) => {
    let previousSelection = selector(
      controller.getState() as AutosaveStatusSnapshot,
    );
    return controller.subscribe(() => {
      const nextSelection = selector(
        controller.getState() as AutosaveStatusSnapshot,
      );
      if (!isEqual(previousSelection, nextSelection)) {
        previousSelection = nextSelection;
        listener();
      }
    });
  };

  const getSnapshot = () =>
    selector(controller.getState() as AutosaveStatusSnapshot);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
