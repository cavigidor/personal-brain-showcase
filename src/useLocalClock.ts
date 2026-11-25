import { useEffect, useState } from "react";

/** A lightweight local minute tick while visible; resync immediately after sleep/focus. */
export function useLocalClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: number | undefined;
    const refresh = () => {
      window.clearTimeout(timer);
      if (document.visibilityState === "hidden") return;
      setNow(new Date());
      timer = window.setTimeout(refresh, 60000 - (Date.now() % 60000));
    };
    refresh();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return now;
}
