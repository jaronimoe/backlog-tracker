import React from "react";
import { getSetting, setSetting, SETTINGS } from "./db/database";

/** All colors a theme must define: 16 core + 4 tag-type colors. */
export type ThemeColors = {
  bgPrimary: string;
  bgSecondary: string;
  bgCard: string;
  bgHover: string;
  accent: string;
  accentSecondary: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  progressBg: string;
  progressFill: string;
  border: string;
  gold: string;
  silver: string;
  bronze: string;
};

export type TagColors = {
  platform: string;
  genre: string;
  source: string;
  status: string;
};

export type Theme = {
  label: string;
  statusBar: "light" | "dark"; // status-bar *text* color
  colors: ThemeColors;
  tagColors: TagColors;
};

export const THEMES: Record<string, Theme> = {
  dark: {
    label: "Dark",
    statusBar: "light",
    colors: {
      bgPrimary: "#1a1a2e",
      bgSecondary: "#16213e",
      bgCard: "#0f3460",
      bgHover: "#1a4080",
      accent: "#e94560",
      accentSecondary: "#533483",
      textPrimary: "#eaeaea",
      textSecondary: "#a0a0b0",
      textMuted: "#6a6a7a",
      progressBg: "#2a2a4a",
      progressFill: "#4ecca3",
      border: "#2a2a4a",
      gold: "#ffd700",
      silver: "#c0c0c0",
      bronze: "#cd7f32",
    },
    tagColors: {
      platform: "#00b4d8",
      genre: "#533483",
      source: "#417a9b",
      status: "#8d5a2b",
    },
  },
  beige: {
    label: "Beige",
    statusBar: "dark",
    colors: {
      bgPrimary: "#efeae2",
      bgSecondary: "#e4ddd1",
      bgCard: "#d8cfc0",
      bgHover: "#cbc0ad",
      accent: "#a5673f",
      accentSecondary: "#8a8170",
      textPrimary: "#3a352d",
      textSecondary: "#6b6357",
      textMuted: "#94897a",
      progressBg: "#c9bfae",
      progressFill: "#6e8b5e",
      border: "#cfc5b4",
      gold: "#b8860b",
      silver: "#8e8e8e",
      bronze: "#a0642a",
    },
    tagColors: {
      platform: "#a8cfe0",
      genre: "#c7b9dd",
      source: "#a9c6d1",
      status: "#dcb98a",
    },
  },
  retro: {
    label: "Retro",
    statusBar: "light",
    colors: {
      bgPrimary: "#1e1433",
      bgSecondary: "#2a1d47",
      bgCard: "#3b2a63",
      bgHover: "#4c3a7d",
      accent: "#ff6ec7",
      accentSecondary: "#9d4edd",
      textPrimary: "#f3eaff",
      textSecondary: "#c0aee0",
      textMuted: "#8a76b0",
      progressBg: "#332255",
      progressFill: "#00e5c0",
      border: "#443366",
      gold: "#ffd700",
      silver: "#c0c0c0",
      bronze: "#cd7f32",
    },
    tagColors: {
      platform: "#00b4d8",
      genre: "#9d4edd",
      source: "#5e60ce",
      status: "#ff9e64",
    },
  },
};

export const THEME_COLOR_KEYS = Object.keys(
  THEMES.dark.colors
) as (keyof ThemeColors)[];
export const TAG_COLOR_KEYS = Object.keys(
  THEMES.dark.tagColors
) as (keyof TagColors)[];

/**
 * Mutable current palette. All app code reads colors from these two objects
 * at render time; applyCurrent() swaps their contents in place and bumps the
 * theme version so subscribed components re-render.
 */
export const C: ThemeColors = { ...THEMES.dark.colors };
export const TAG_TYPE_COLORS: Record<string, string> = {
  ...THEMES.dark.tagColors,
};

let currentName = "dark";
let version = 0;
const listeners = new Set<() => void>();

export function currentThemeName() {
  return currentName;
}

export function currentStatusBarStyle(): "light" | "dark" {
  return (THEMES[currentName] ?? THEMES.dark).statusBar;
}

// ---- per-theme overrides (persisted as JSON in settings) ----

type Overrides = {
  colors?: Partial<ThemeColors>;
  tags?: Partial<TagColors>;
};

function readAllOverrides(): Record<string, Overrides> {
  try {
    return JSON.parse(getSetting(SETTINGS.themeOverrides, "{}"));
  } catch {
    return {};
  }
}

export function hasOverrides(): boolean {
  const o = readAllOverrides()[currentName];
  if (!o) return false;
  return (
    Object.keys(o.colors ?? {}).length + Object.keys(o.tags ?? {}).length > 0
  );
}

export function setColorOverride(
  key: string,
  value: string | null,
  isTag = false
) {
  const all = readAllOverrides();
  const cur = (all[currentName] = all[currentName] ?? {});
  const bucket = isTag
    ? (cur.tags = cur.tags ?? {})
    : (cur.colors = cur.colors ?? {});
  if (value == null) delete (bucket as any)[key];
  else (bucket as any)[key] = value;
  setSetting(SETTINGS.themeOverrides, JSON.stringify(all));
  applyCurrent();
}

export function clearOverrides() {
  const all = readAllOverrides();
  delete all[currentName];
  setSetting(SETTINGS.themeOverrides, JSON.stringify(all));
  applyCurrent();
}

// ---- switching & subscription ----

function applyCurrent() {
  const t = THEMES[currentName] ?? THEMES.dark;
  const o = readAllOverrides()[currentName] ?? {};
  Object.assign(C, t.colors, o.colors ?? {});
  Object.assign(TAG_TYPE_COLORS, t.tagColors, o.tags ?? {});
  version++;
  listeners.forEach((l) => l());
}

export function setTheme(name: string) {
  currentName = THEMES[name] ? name : "dark";
  setSetting(SETTINGS.theme, currentName);
  applyCurrent();
}

/** Call once at startup, after migrate(). */
export function initTheme() {
  const saved = getSetting(SETTINGS.theme, "dark");
  currentName = THEMES[saved] ? saved : "dark";
  applyCurrent();
}

/** Re-renders the subscribing component whenever the theme changes. */
export function useTheme() {
  const [v, setV] = React.useState(version);
  React.useEffect(() => {
    const l = () => setV(version);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return { name: currentName, version: v };
}

/**
 * Wrap module-level style objects so they are lazily rebuilt when the theme
 * changes (otherwise they'd freeze the colors captured at import time).
 * Usage: const st = themedStyles(() => ({ ... })) — access stays `st.foo`.
 */
export function themedStyles<T extends object>(factory: () => T): T {
  let cache: T | null = null;
  let cacheVersion = -1;
  const ensure = (): T => {
    if (cache == null || cacheVersion !== version) {
      cache = factory();
      cacheVersion = version;
    }
    return cache;
  };
  return new Proxy({} as T, {
    get: (_t, prop) => (ensure() as any)[prop],
    ownKeys: () => Reflect.ownKeys(ensure()),
    getOwnPropertyDescriptor: (_t, prop) =>
      Object.getOwnPropertyDescriptor(ensure(), prop),
  }) as T;
}
