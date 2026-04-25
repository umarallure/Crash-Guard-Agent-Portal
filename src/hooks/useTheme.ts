import { useCallback, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'theme';

const readInitialTheme = (): Theme => {
  if (typeof document === 'undefined') return 'dark';
  // index.html has already applied the correct class before React mounted.
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
};

const applyTheme = (next: Theme) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (next === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
  try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
};

/**
 * Lightweight theme hook — stores preference in localStorage and toggles the
 * `dark` class on <html>. Default is dark (bootstrapped by inline script in
 * index.html so there's no flash of the wrong theme on first paint).
 *
 * Syncs across tabs via the `storage` event.
 */
export const useTheme = () => {
  const [theme, setThemeState] = useState<Theme>(readInitialTheme);

  const setTheme = useCallback((next: Theme) => {
    applyTheme(next);
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  // Sync across tabs if the user toggles in another window.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const next = event.newValue === 'light' ? 'light' : 'dark';
      applyTheme(next);
      setThemeState(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return { theme, setTheme, toggleTheme };
};
