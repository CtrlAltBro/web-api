import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const KEY = "cab-theme";

function initial(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {}
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// Night mode: [data-theme="dark"] on <html> switches the semantic tokens.
export function useTheme() {
  const [theme, setTheme] = useState(initial);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch {}
  }, [theme]);
  return [theme, setTheme] as const;
}
