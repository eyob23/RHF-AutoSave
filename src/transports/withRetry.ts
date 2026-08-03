import type { FieldValues } from "react-hook-form";
import type { AutosaveTransport } from "../core/types";

export interface RetryOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

export function withRetry<
  TFormValues extends FieldValues,
  TPayload,
  TResult,
>(
  transport: AutosaveTransport<TFormValues, TPayload, TResult>,
  options?: RetryOptions,
): AutosaveTransport<TFormValues, TPayload, TResult> {
  const maxRetries = options?.maxRetries ?? 3;
  const retryDelayMs = options?.retryDelayMs ?? 400;

  return async (context) => {
    let attempt = 0;
    let latestError: unknown;

    while (attempt <= maxRetries) {
      if (context.signal.aborted) {
        return {
          ok: false,
          error: new DOMException("Autosave aborted", "AbortError"),
        };
      }

      const result = await transport(context);
      if (result.ok) {
        return result;
      }

      latestError = result.error;
      if (attempt === maxRetries) {
        return result;
      }

      if (options?.shouldRetry && !options.shouldRetry(latestError, attempt)) {
        return result;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, retryDelayMs * (attempt + 1));
      });

      attempt += 1;
    }

    return {
      ok: false,
      error: latestError,
    };
  };
}