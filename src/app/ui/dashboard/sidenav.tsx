import Link from 'next/link';
import { cookies } from 'next/headers';
import NavLinks from '@/app/ui/dashboard/nav-links';
import ThemeSwitch from '@/app/ui/theme-switch';
import { PowerIcon } from '@heroicons/react/24/outline';
import { signOut } from '@/auth';
import { DEFAULT_THEME, THEME_COOKIE_NAME, isTheme } from '@/app/lib/theme';

export default async function SideNav() {
  const cookieStore = await cookies();
  const cookieTheme = cookieStore.get(THEME_COOKIE_NAME)?.value;
  const theme = isTheme(cookieTheme) ? cookieTheme : DEFAULT_THEME;

  return (
    <div className="flex h-full flex-col px-3 py-4 md:px-2 border-r theme-bg-secondary">
      <Link
        className="mb-2 flex h-20 items-center justify-center rounded-md bg-blue-600 p-4 md:h-40"
        href="/"
      >
        <span className="text-white font-bold text-xl">BlockWatch</span>
      </Link>
      <div className="flex grow flex-row justify-between space-x-2 md:flex-col md:space-x-0 md:space-y-2">
        <NavLinks />
        <div className="hidden h-auto w-full grow md:block"></div>
        <ThemeSwitch initialTheme={theme} />
        <form action={async () => {
          'use server';
          await signOut({ redirectTo: '/login' });
        }}
        >
          <button className="flex h-[48px] w-full grow items-center justify-center gap-2 rounded-md p-3 text-sm font-medium theme-nav-item theme-bg-secondary theme-text-secondary md:flex-none md:justify-start md:p-2 md:px-3">
            <PowerIcon className="w-6" />
            <div className="hidden md:block">Sign Out</div>
          </button>
        </form>
      </div>
    </div>
  );
}
