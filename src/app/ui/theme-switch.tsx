'use client';

import { useState } from 'react';
import { SunIcon, MoonIcon } from '@heroicons/react/24/outline';
import {
  THEME_COOKIE_MAX_AGE,
  THEME_COOKIE_NAME,
  type Theme,
} from '@/app/lib/theme';

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
}

function persistTheme(theme: Theme) {
  document.cookie = `${THEME_COOKIE_NAME}=${theme}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax`;
}

export default function ThemeSwitch({ initialTheme }: { initialTheme: Theme }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';

    setTheme(nextTheme);
    applyTheme(nextTheme);
    persistTheme(nextTheme);
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="flex h-[48px] w-full grow items-center justify-center gap-2 rounded-md p-3 text-sm font-medium theme-nav-item theme-bg-secondary theme-text-secondary md:flex-none md:justify-start md:p-2 md:px-3"
    >
      {theme === 'dark' ? (
        <>
          <SunIcon className="w-6" />
          <div className="hidden md:block">Light</div>
        </>
      ) : (
        <>
          <MoonIcon className="w-6" />
          <div className="hidden md:block">Dark</div>
        </>
      )}
    </button>
  );
}
