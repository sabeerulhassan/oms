import { getSession, signOut } from "next-auth/react"; // <-- Added signOut import

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
    // GLOBAL PRIVILEGE GUARD: If backend returns 401 Unauthorized, automatically route to login
    if (response.status === 401) {
      console.warn("Session expired or invalid token. Redirecting to login...");
      if (typeof window !== "undefined") {
        signOut({ callbackUrl: "/login" });
      }
    }

    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.message || errorData.error || `HTTP error! status: ${response.status}`;
    throw new Error(errorMessage);
  }

  return response.json();
}