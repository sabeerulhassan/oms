"use client";

import React, { useState } from "react";
import useSWR, { mutate } from "swr";
import { fetchWithAuth } from "@/lib/api";
import { formatToColomboTime } from "@/utils/timezone";
import { Users, ShieldAlert, Loader2, Search, Heart, CheckCircle, AlertTriangle } from "lucide-react";

type ReferralPair = {
  id: string;
  referrer_phone: string;
  referee_phone: string;
  status: "pending" | "completed" | "invalid";
  referrer_discount: number;
  referee_discount: number;
  created_at: string;
  completed_at: string | null;
};

export default function ReferralsPage() {
  const [searchPhone, setSearchPhone] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Fallback endpoint fetching active customer-driven referral instances
  const { data: customerData, isLoading, error } = useSWR(
    searchPhone ? `/customers/${searchPhone}` : null,
    fetchWithAuth
  );

  const handleInvalidate = async (id: string) => {
    if (!confirm("Are you sure you want to manually invalidate this referral record? This action cannot be reversed.")) {
      return;
    }

    setUpdatingId(id);
    try {
      await fetchWithAuth(`/referrals/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "invalid" }),
      });
      // Force reload active customer view
      mutate(`/customers/${searchPhone}`);
    } catch (err: any) {
      alert(err.message || "Failed to alter status.");
    } finally {
      setUpdatingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed": return "bg-emerald-50 text-emerald-700 border-emerald-100";
      case "invalid": return "bg-rose-50 text-rose-700 border-rose-100";
      default: return "bg-amber-50 text-amber-700 border-amber-100";
    }
  };

  const referralList: ReferralPair[] = customerData?.referrals_given || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Referrals</h1>
        <p className="text-sm text-slate-500">Search referrers to audit connection status and flag entries.</p>
      </div>

      {/* Lookup Bar */}
      <div className="flex bg-white p-5 rounded-xl border border-slate-200 items-center gap-4 shadow-sm">
        <div className="flex-1 max-w-md">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
            Lookup Referrer Phone
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. 0771234567"
              value={searchPhone}
              onChange={(e) => setSearchPhone(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 w-full outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 font-mono"
            />
          </div>
        </div>
      </div>

      {/* Main Results Board */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {!searchPhone ? (
          <div className="p-16 text-center space-y-2">
            <Heart className="mx-auto h-8 w-8 text-slate-300" />
            <p className="text-sm text-slate-500">Provide a registered phone number to locate associated referrals.</p>
          </div>
        ) : isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-2">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            <p className="text-xs text-slate-400">Scanning registry database...</p>
          </div>
        ) : error ? (
          <div className="p-10 text-center text-sm text-rose-500">
            Customer details could not be found or processed. Verify search phone entry.
          </div>
        ) : referralList.length === 0 ? (
          <div className="p-16 text-center space-y-2">
            <AlertTriangle className="mx-auto h-6 w-6 text-slate-400" />
            <p className="text-sm text-slate-500 font-medium">No referral outputs matched for user {customerData.name}.</p>
          </div>
        ) : (
          <div>
            <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-200">
              <h3 className="font-bold text-slate-900 text-sm">
                Referral records dispatched by {customerData.name} ({referralList.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50/30 border-b border-slate-200 text-xs font-semibold uppercase text-slate-500">
                    <th className="px-6 py-4">Created</th>
                    <th className="px-6 py-4">Referee Number</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Referrer Reward</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {referralList.map((ref) => (
                    <tr key={ref.id} className="hover:bg-slate-50/20">
                      <td className="px-6 py-4 whitespace-nowrap text-slate-500">
                        {formatToColomboTime(ref.created_at, false)}
                      </td>
                      <td className="px-6 py-4 font-mono font-semibold text-slate-950">{ref.referee_phone}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold border ${getStatusBadge(ref.status)}`}>
                          {ref.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-semibold text-slate-800">
                        Rs {ref.referrer_discount || 150}
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        {ref.status === "pending" ? (
                          updatingId === ref.id ? (
                            <Loader2 className="inline-block h-4 w-4 animate-spin text-slate-400" />
                          ) : (
                            <button
                              onClick={() => handleInvalidate(ref.id)}
                              className="inline-flex items-center space-x-1 text-xs text-rose-600 hover:bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-lg font-semibold"
                            >
                              <ShieldAlert size={12} />
                              <span>Invalidate</span>
                            </button>
                          )
                        ) : (
                          <span className="text-xs text-slate-400 italic font-normal">No actions available</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}