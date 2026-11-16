import { useEffect, useState } from "react";
import { api, message } from "./api";

// Fetch `path` and return the data. Return null while the request is active.
// The hook ignores a response that arrives after `path` changes.
export function useApi<T>(
  path: string | null,
  onError: (text: string) => void,
): T | null {
  const [loaded, setLoaded] = useState<{ path: string; data: T } | null>(null);
  useEffect(() => {
    if (!path) return;
    let live = true;
    api<T>(path)
      .then((data) => live && setLoaded({ path, data }))
      .catch((e) => live && onError(message(e)));
    return () => {
      live = false;
    };
  }, [path, onError]);
  return loaded?.path === path ? loaded.data : null;
}

// Keep a JSON value in localStorage.
export function useStored<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "null") ?? initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);
  return [value, setValue] as const;
}
