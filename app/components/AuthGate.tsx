"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const APP_BASE_PATH = "/verus-monitoring";

function getAppPath(path: string) {
  return `${APP_BASE_PATH}${path}`;
}

function toAppRelativePath(pathname: string, search: string) {
  const withoutBase = pathname === APP_BASE_PATH ? "/" : pathname.startsWith(`${APP_BASE_PATH}/`) ? pathname.slice(APP_BASE_PATH.length) : pathname;

  return `${withoutBase || "/"}${search ? `?${search}` : ""}`;
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isReady, setIsReady] = useState(false);
  const search = useMemo(() => searchParams.toString(), [searchParams]);
  const appRelativePath = useMemo(() => toAppRelativePath(pathname, search), [pathname, search]);
  const isLoginPage = appRelativePath === "/login" || appRelativePath.startsWith("/login?");
  const canRender = isLoginPage || isReady;

  useEffect(() => {
    if (isLoginPage) {
      return;
    }

    let cancelled = false;

    async function checkSession() {
      try {
        const response = await fetch(getAppPath("/api/auth/session"), { cache: "no-store" });
        const result = (await response.json()) as { authenticated?: boolean };

        if (cancelled) {
          return;
        }

        if (result.authenticated) {
          setIsReady(true);
          return;
        }
      } catch {
        if (cancelled) {
          return;
        }
      }

      window.location.replace(`${getAppPath("/login")}?next=${encodeURIComponent(appRelativePath)}`);
    }

    void checkSession();

    return () => {
      cancelled = true;
    };
  }, [appRelativePath, isLoginPage]);

  if (!canRender) {
    return (
      <main className="page authLoadingPage">
        <div className="authLoadingPanel">Checking access...</div>
      </main>
    );
  }

  return children;
}
