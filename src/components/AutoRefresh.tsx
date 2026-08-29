"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// A request with procurement can sit for days. A shared link must not poll for days.
const MAX_MINUTES = 10;

/**
 * Asks the server again while something is still moving, only while the tab is
 * visible, and gives up after a while. A tab left open overnight goes quiet.
 */
export function AutoRefresh({ everySeconds, active }: { everySeconds: number; active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;

    const until = Date.now() + MAX_MINUTES * 60_000;
    const timer = setInterval(() => {
      if (Date.now() > until) return clearInterval(timer);
      if (document.visibilityState === "visible") router.refresh();
    }, everySeconds * 1000);
    return () => clearInterval(timer);
  }, [active, everySeconds, router]);

  return null;
}
