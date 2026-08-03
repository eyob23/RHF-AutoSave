import { useEffect, useMemo, useRef } from "react";
import {
  useBeforeUnload as useRouterBeforeUnload,
  useLocation,
  useNavigate,
} from "react-router-dom";

type AutosaveBlockerState = "unblocked" | "blocked";

export interface AutosaveBlockerController {
  state: AutosaveBlockerState;
  proceed: () => void;
  reset: () => void;
}

function locationToPathname(location: {
  pathname: string;
  search: string;
  hash: string;
}) {
  return `${location.pathname}${location.search}${location.hash}`;
}

export function useAutosaveBlocker(
  when: boolean,
  message = "You have unsaved changes. Select Cancel to stay on this page, or OK to leave without saving.",
) {
  const location = useLocation();
  const navigate = useNavigate();
  const lastConfirmedPathRef = useRef(locationToPathname(location));

  useEffect(() => {
    lastConfirmedPathRef.current = locationToPathname(location);
  }, [location]);

  useRouterBeforeUnload(
    ({ preventDefault }) => {
      if (!when) {
        return;
      }
      preventDefault();
    },
    { capture: true },
  );

  useEffect(() => {
    if (!when) {
      return;
    }

    let restoringPath = false;

    const onPopState = () => {
      if (restoringPath) {
        restoringPath = false;
        return;
      }

      const shouldLeave = window.confirm(message);
      if (shouldLeave) {
        lastConfirmedPathRef.current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        return;
      }

      const restoreTo = lastConfirmedPathRef.current;
      restoringPath = true;
      window.history.pushState(window.history.state, "", restoreTo);
      window.dispatchEvent(new PopStateEvent("popstate"));
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [when, message]);

  useEffect(() => {
    if (!when) {
      return;
    }

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) {
        return;
      }

      if (anchor.target && anchor.target !== "_self") {
        return;
      }

      const nextUrl = new URL(anchor.href, window.location.href);
      const currentUrl = new URL(window.location.href);
      const nextPath = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
      const currentPath = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;

      if (nextPath === currentPath) {
        return;
      }

      event.preventDefault();
      const shouldLeave = window.confirm(message);
      if (!shouldLeave) {
        return;
      }

      lastConfirmedPathRef.current = nextPath;
      if (nextUrl.origin === currentUrl.origin) {
        navigate(nextPath);
        return;
      }

      window.location.assign(nextUrl.toString());
    };

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
    };
  }, [when, message, navigate]);

  return useMemo<AutosaveBlockerController>(
    () => ({
      state: "unblocked",
      proceed: () => undefined,
      reset: () => undefined,
    }),
    [],
  );
}
