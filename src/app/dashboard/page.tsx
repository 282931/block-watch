import { auth } from "@/auth";

export default async function Page() {
  const session = await auth();
  const userName = session?.user?.name || 'User';

  return <div className="p-6">
    <h1 className="text-2xl font-bold mb-4 theme-text">Welcome, {userName}!</h1>
    <p className="theme-text-secondary">This is your dashboard.</p>
  </div>;
}