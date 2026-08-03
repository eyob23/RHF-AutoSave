import type { FieldValues } from "react-hook-form";
import type { AutosaveTransport, AutosaveTransportContext, AutosaveTransportResult } from "../core/types";

export interface CompositeTransportStep<
  TFormValues extends FieldValues,
  TPayload,
  TResult,
> {
  transport: AutosaveTransport<TFormValues, TPayload, TResult>;
  when?: (context: AutosaveTransportContext<TFormValues, TPayload>) => boolean;
}

export function composeTransports<
  TFormValues extends FieldValues,
  TPayload = Partial<TFormValues>,
  TResult = unknown,
>(
  steps: Array<CompositeTransportStep<TFormValues, TPayload, TResult>>,
): AutosaveTransport<TFormValues, TPayload, TResult[]> {
  return async (context) => {
    const output: TResult[] = [];

    for (const step of steps) {
      if (step.when && !step.when(context)) {
        continue;
      }

      const result = await step.transport(context);
      if (!result.ok) {
        return {
          ok: false,
          error: result.error,
        };
      }

      output.push(result.data as TResult);
    }

    return {
      ok: true,
      data: output,
    };
  };
}