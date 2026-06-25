"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import useSWR from "swr";
import { fetchWithAuth } from "../lib/api";
import { 
  ShoppingBag, 
  Users, 
  MessageSquare, 
  UserPlus, 
  LogOut, 
  Home,
  Package // <-- Imported package icon for products
} from "lucide-react";

export default function Sidebar() {
  const pathname = usePathname();

  const { data: messagesData } = useSWR(
    "/messages?status=pending&limit=1", 
    fetchWithAuth, 
    { refreshInterval: 15000 }
  );

  const pendingCount = messagesData?.meta?.total || 0;

  const menuItems = [
    { name: "Dashboard", href: "/admin/dashboard", icon: Home },
    { name: "Orders", href: "/admin/orders", icon: ShoppingBag },
    { name: "Customers", href: "/admin/customers", icon: Users },
    { 
      name: "Messages", 
      href: "/admin/messages", 
      icon: MessageSquare,
      badge: pendingCount > 0 ? pendingCount : null 
    },
    { name: "Referrals", href: "/admin/referrals", icon: UserPlus },
    { name: "Products", href: "/admin/products", icon: Package }, // <-- Added Products tab
  ];

  return (
    <aside className="w-64 bg-slate-900 text-white flex flex-col h-screen fixed left-0 top-0 border-r border-slate-800">
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-xl font-bold tracking-wider text-amber-500">
          KURKEES ADMIN
        </h1>
        <p className="text-xs text-slate-400 mt-1">Management Hub</p>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-amber-600 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <div className="flex items-center space-x-3">
                <Icon size={18} />
                <span>{item.name}</span>
              </div>
              {item.badge !== null && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  isActive ? "bg-white text-amber-900" : "bg-red-500 text-white"
                }`}>
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center space-x-3 w-full px-4 py-3 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        >
          <LogOut size={18} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}