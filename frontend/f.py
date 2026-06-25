import os
from pathlib import Path

# Define the file structure and contents
frontend_files = {
    # Configuration Files
    "package.json": """{
  "name": "kurkees-admin-frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "14.2.3",
    "next-auth": "5.0.0-beta.19",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "swr": "^2.2.5",
    "lucide-react": "^0.378.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.3.0"
  },
  "devDependencies": {
    "@types/node": "^20.12.12",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.3",
    "typescript": "^5.4.5"
  }
}""",

    "vercel.json": """{
  "cleanUrls": true,
  "framework": "nextjs"
}""",

    "tailwind.config.ts": """import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
export default config;""",

    # Auth & API Helpers
    "src/types/next-auth.d.ts": """import NextAuth, { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    user: {
      email: string;
      role?: string;
    } & DefaultSession["user"];
  }

  interface User {
    token?: string;
    role?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    role?: string;
  }
}""",

    "src/lib/auth.ts": """import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

export const { handlers, auth, signIn, signOut } = NextAuth({
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          });

          if (!response.ok) {
            return null;
          }

          const data = await response.json();

          if (data && data.token) {
            return {
              id: credentials.email as string,
              email: credentials.email as string,
              token: data.token,
              role: "admin",
            };
          }
          return null;
        } catch (error) {
          console.error("Auth server error:", error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.accessToken = user.token;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.accessToken = token.accessToken as string;
        if (session.user) {
          session.user.email = token.email as string;
        }
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
});""",

    "src/app/api/auth/[...nextauth]/route.ts": """import { handlers } from "@/lib/auth";
export const { GET, POST } = handlers;""",

    "src/middleware.ts": """import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isLoginPage = req.nextUrl.pathname.startsWith("/login");
  const isAdminPage = req.nextUrl.pathname.startsWith("/admin");

  if (isAdminPage && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }

  if (isLoginPage && isLoggedIn) {
    return NextResponse.redirect(new URL("/admin/dashboard", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/login"],
};""",

    "src/lib/api.ts": """import { getSession } from "next-auth/react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api";

export async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const session = await getSession();
  const token = session?.accessToken;

  const headers = new Headers(options.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}""",

    "src/utils/timezone.ts": """/**
 * Formats a date string or Date object to the Asia/Colombo timezone representation.
 * Standard format: YYYY-MM-DD HH:MM:SS
 */
export function formatToColomboTime(
  dateInput: string | Date | null | undefined,
  includeTime: boolean = true
): string {
  if (!dateInput) return "—";
  
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  
  if (isNaN(date.getTime())) return "Invalid Date";

  const options: Intl.DateTimeFormatOptions = {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(includeTime && {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }),
  };

  const formattedParts = new Intl.DateTimeFormat("en-CA", options).format(date);
  return formattedParts.replace(",", "");
}""",

    # Shared UI Components
    "src/components/Sidebar.tsx": """"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import useSWR from "swr";
import { fetchWithAuth } from "@/lib/api";
import { 
  ShoppingBag, 
  Users, 
  MessageSquare, 
  UserPlus, 
  LogOut, 
  Home 
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
              className={`flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium transition-colors \${
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
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full \${
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
}""",

    # Application Pages and Layouts
    "src/app/globals.css": """@tailwind base;
@tailwind components;
@tailwind utilities;""",

    "src/app/layout.tsx": """import "./globals.css";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Kurkees Admin Portal",
  description: "Internal Order Management & Referral Tracking",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen bg-slate-50`}>
        {children}
      </body>
    </html>
  );
}""",

    "src/app/page.tsx": """import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/admin/dashboard");
}""",

    "src/app/admin/layout.tsx": """import Sidebar from "@/components/Sidebar";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Sidebar />
      <div className="pl-64">
        <main className="p-8 max-w-7xl mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}""",

    "src/app/admin/dashboard/page.tsx": """import { auth } from "@/lib/auth";

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
}""",

    "src/app/login/page.tsx": """"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid email credentials or password match.");
      } else {
        router.push("/admin/dashboard");
        router.refresh();
      }
    } catch (err) {
      setError("An unexpected authentication error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md space-y-8 bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
        <div className="text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
            Kurkees Peanut Butter
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Admin Portal Access
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm border border-red-100">
            {error}
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-amber-500 focus:ring-amber-500 sm:text-sm outline-none"
                placeholder="admin@kurkees.lk"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-amber-500 focus:ring-amber-500 sm:text-sm outline-none"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-lg text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 disabled:opacity-50 transition-colors"
          >
            {isLoading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}""",
}


def create_frontend_scaffolding():
    """Iterate over the file configuration map, generate parent directories, and write contents."""
    print("Starting configuration scaffolding...")

    for file_path_str, content in frontend_files.items():
        file_path = Path(file_path_str)

        # Create parent directories if they don't exist
        file_path.parent.mkdir(parents=True, exist_ok=True)

        # Write file contents
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content.strip())

        print(f"Created file: {file_path_str}")

    print("\\nScaffolding step complete. Run your installation commands to finish.")


if __name__ == "__main__":
    create_frontend_scaffolding()