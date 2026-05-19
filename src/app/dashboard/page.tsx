import { signOut, auth } from "@/auth";
import { PowerIcon } from "@heroicons/react/24/outline";
import { logout } from "../lib/actions";

export default async function Page() {
  const session = await auth();
  const userName = session?.user?.name || 'User';

  return <div className="p-6">
    <h1 className="text-2xl font-bold mb-4">Welcome, {userName}!</h1>
    <p className="mb-6">This is your dashboard.</p>
    <form action={logout}
    >
      <button className="flex h-[48px] w-full grow items-center justify-center gap-2 rounded-md bg-gray-50 p-3 text-sm font-medium hover:bg-sky-100 hover:text-blue-600 md:flex-none md:justify-start md:p-2 md:px-3">
        <PowerIcon className="w-6" />
        <div className="hidden md:block">Sign Out</div>
      </button>
    </form>
  </div>;
}