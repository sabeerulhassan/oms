import { auth } from "../../../lib/auth";

export default async function DashboardPage() {
  const session = await auth();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Welcome back</h2>
        <p className="text-slate-500">
          Logged in as <span className="font-semibold">{session?.user?.email}</span>
        </p>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="p-6 bg-white rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-sm font-medium text-slate-500">OMS Status</h3>
          <p className="text-2xl font-bold mt-2">Active</p>
        </div>
        <div className="p-6 bg-white rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-sm font-medium text-slate-500">Express Hook</h3>
          <p className="text-2xl font-bold mt-2 text-emerald-600">Online</p>
        </div>
      </div>
    </div>
  );
}