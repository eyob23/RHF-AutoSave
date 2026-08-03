import type { FieldValues } from "react-hook-form";
import type { AutosaveTransport, AutosaveTransportResult } from "../core/types";

export interface FetchTransportOptions<TPayload, TResult = unknown>
  extends Omit<RequestInit, "body" | "signal"> {
  mapBody?: (payload: TPayload) => BodyInit;
  parseResponse?: (response: Response) => Promise<TResult>;
  mapResult?: (
    data: TResult,
    response: Response,
  ) => AutosaveTransportResult<TResult>;
}

export function fetchTransport<
  TFormValues extends FieldValues,
  TPayload = Partial<TFormValues>,
  TResult = unknown,
>(
  input: RequestInfo | URL | ((payload: TPayload) => RequestInfo | URL),
  options?: FetchTransportOptions<TPayload, TResult>,
): AutosaveTransport<TFormValues, TPayload, TResult> {
  return async ({ payload, signal }) => {
    const endpoint = typeof input === "function" ? input(payload) : input;
    const response = await fetch(endpoint, {
      method: options?.method ?? "PATCH",
      ...options,
      signal,
      body: options?.mapBody ? options.mapBody(payload) : JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers ?? {}),
      },
    });

    const parseResponse =
      options?.parseResponse ??
      (async (currentResponse: Response) => {
        const text = await currentResponse.text();
        if (!text) {
          return undefined as TResult;
        }
        return JSON.parse(text) as TResult;
      });

    const data = await parseResponse(response);

    if (!response.ok) {
      return {
        ok: false,
        error: new Error(`Autosave request failed with status ${response.status}`),
        data,
      };
    }

    return options?.mapResult ? options.mapResult(data, response) : { ok: true, data };
  };
}