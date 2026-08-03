import type { FieldValues } from "react-hook-form";
import type {
  AutosaveTransport,
  AutosaveTransportContext,
  AutosaveTransportResult,
} from "../core/types";
import { normalizePaths, pickPaths } from "../utils/path";

function pathOwns(scope: string, changedPath: string): boolean {
  return (
    changedPath === scope ||
    changedPath.startsWith(`${scope}.`) ||
    changedPath.startsWith(`${scope}[`) ||
    scope.startsWith(`${changedPath}.`) ||
    scope.startsWith(`${changedPath}[`)
  );
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export interface PartitionRouteContext<
  TFormValues extends FieldValues,
  TPayload,
> {
  values: TFormValues;
  matchedPaths: string[];
  partitionPaths: string[];
  context: AutosaveTransportContext<TFormValues, TPayload>;
}

export interface PartitionTransportRoute<
  TFormValues extends FieldValues,
  TPayload = Partial<TFormValues>,
  TResult = unknown,
> {
  key: string;
  paths: string[];
  transport: AutosaveTransport<TFormValues, TPayload, TResult>;
  shouldHandle?: (
    routeContext: PartitionRouteContext<TFormValues, TPayload>,
  ) => boolean;
  selectPayload?: (
    routeContext: PartitionRouteContext<TFormValues, TPayload>,
  ) => TPayload;
  payloadStrategy?: "changed" | "partition";
}

export interface PartitionTransportOptions {
  onUnmatchedPaths?: "error" | "ignore";
}

export interface PartitionTransportRouteResult<TResult> {
  routeKey: string;
  result: AutosaveTransportResult<TResult>;
}

export function createPartitionedTransport<
  TFormValues extends FieldValues,
  TResult = unknown,
>(
  routes: Array<PartitionTransportRoute<TFormValues, any, TResult>>,
  options?: PartitionTransportOptions,
): AutosaveTransport<
  TFormValues,
  Partial<TFormValues>,
  Array<PartitionTransportRouteResult<TResult>>
> {
  const unmatchedBehavior = options?.onUnmatchedPaths ?? "error";

  return async (context) => {
    const touchedRouteKeys = new Set<string>();
    const results: Array<PartitionTransportRouteResult<TResult>> = [];
    const allChangedPaths = normalizePaths(context.changedPaths);

    for (const route of routes) {
      const matchedPaths = normalizePaths(
        allChangedPaths.filter((changedPath) =>
          route.paths.some((scope) => pathOwns(scope, changedPath)),
        ),
      );

      if (matchedPaths.length === 0) {
        continue;
      }

      const routeContext: PartitionRouteContext<TFormValues, unknown> = {
        values: context.values,
        matchedPaths,
        partitionPaths: route.paths,
        context,
      };

      if (route.shouldHandle && !route.shouldHandle(routeContext)) {
        continue;
      }

      touchedRouteKeys.add(route.key);

      const routePayload = route.selectPayload
        ? route.selectPayload(routeContext)
        : route.payloadStrategy === "changed"
          ? pickPaths(context.values, matchedPaths)
          : pickPaths(context.values, route.paths);

      const routeResult = await route.transport({
        ...context,
        payload: routePayload,
        changedPaths: matchedPaths,
      });

      if (!routeResult.ok) {
        return {
          ok: false,
          error: routeResult.error,
          data: results,
        };
      }

      results.push({
        routeKey: route.key,
        result: routeResult,
      });
    }

    if (unmatchedBehavior === "error") {
      const unmatchedPaths = allChangedPaths.filter((changedPath) => {
        return !routes.some((route) =>
          route.paths.some((scope) => pathOwns(scope, changedPath)),
        );
      });

      if (unmatchedPaths.length > 0) {
        return {
          ok: false,
          error: toError(
            `No partition route matched changed paths: ${unmatchedPaths.join(", ")}`,
          ),
          data: results,
        };
      }
    }

    if (
      results.length === 0 &&
      allChangedPaths.length > 0 &&
      touchedRouteKeys.size === 0 &&
      unmatchedBehavior === "error"
    ) {
      return {
        ok: false,
        error: toError(
          "Partitioned transport received changes but no route executed.",
        ),
      };
    }

    return {
      ok: true,
      data: results,
    };
  };
}
