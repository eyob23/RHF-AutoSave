import type { FieldValues } from "react-hook-form";
import type { AutosaveTransport, AutosaveTransportResult } from "../core/types";

export interface RtkQueryTransportOptions<
  TFormValues extends FieldValues,
  TPayload,
  TArg,
  TResult,
> {
  mapArg?: (payload: TPayload, values: TFormValues) => TArg;
  mapResult?: (result: unknown) => AutosaveTransportResult<TResult>;
}

type TriggerLike<TArg> = (
  arg: TArg,
) => Promise<unknown> & { unwrap?: () => Promise<unknown> };

export function rtkQueryTransport<
  TFormValues extends FieldValues,
  TPayload = Partial<TFormValues>,
  TArg = TPayload,
  TResult = unknown,
>(
  trigger: TriggerLike<TArg>,
  options?: RtkQueryTransportOptions<TFormValues, TPayload, TArg, TResult>,
): AutosaveTransport<TFormValues, TPayload, TResult> {
  return async ({ payload, values }) => {
    const arg = options?.mapArg
      ? options.mapArg(payload, values)
      : (payload as unknown as TArg);
    const request = trigger(arg);
    const result =
      typeof request.unwrap === "function"
        ? await request.unwrap()
        : await request;
    return options?.mapResult
      ? options.mapResult(result)
      : { ok: true, data: result as TResult };
  };
}
