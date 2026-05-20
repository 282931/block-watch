export type Theme = 'light' | 'dark';

export const THEME_COOKIE_NAME = 'theme';
export const DEFAULT_THEME: Theme = 'light';
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isTheme(value: string | undefined): value is Theme {
  return value === 'light' || value === 'dark';
}
