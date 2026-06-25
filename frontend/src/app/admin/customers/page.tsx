"use client";

import React, { useState } from "react";
import useSWR, { mutate } from "swr";
import { fetchWithAuth } from "@/lib/api";
import { formatToColomboTime } from "@/utils/timezone";
import { 
  Search, Loader2, ChevronRight, X, Phone, User, 
  Send, CheckSquare, Calendar, ShoppingBag, Award, Heart 
} from "lucide-react";

type Customer = {
  phone: string;
  name: string;
  address?: string | null;
  city?: string | null;
  opted_in: boolean;
  created_at: string;
};

type CustomerDetail = Customer & {
  orders: any[];
  loyalty_codes: any[];
  referrals_given: any[];
};

export default function CustomersPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [processingOptin, setProcessingOptin] = useState(false);

  const queryParams = new URLSearchParams({
    page: page.toString(),
    limit: "15",
    ...(searchQuery && { search: searchQuery }),
  });

  const { data, isLoading, error } = useSWR(
    `/customers?${queryParams.toString()}`,
    fetchWithAuth
  );

  const { data: details, isLoading: loadingDetails } = useSWR<CustomerDetail>(
    selectedPhone ? `/customers/${selectedPhone}` : null,
    fetchWithAuth
  );

  const handleSendOptIn = async (phone: string) => {
    setProcessingOptin(true);
    try {
      const res = await fetchWithAuth("/referrals/optin", {
        method: "POST",
        body: JSON.stringify({ phone }),
      });
      alert(res.message || "Opt-in invitation message has been queued.");
    } catch (err: any) {
      alert(err.message || "Failed to initiate opt-in process.");
    } finally {
      setProcessingOptin(false);
    }
  };

  const handleConfirmOptIn = async (phone: string) => {
    setProcessingOptin(true);
    try {
      const res = await fetchWithAuth("/referrals/confirm-optin", {
        method: "POST",
        body: JSON.stringify({ phone }),
      });
      alert(res.message || "Customer successfully opted in.");
      mutate(`/customers/${phone}`);
      mutate(`/customers?${queryParams.toString()}`);
    } catch (err: any) {
      alert(err.message || "Failed to finalize opt-in confirmation.");
    } finally {
      setProcessingOptin(false);
    }
  };

  return (
    <div className="space-y-6 relative">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
        <p className="text-sm text-slate-500">Track registration directories and control referral enrollment flows.</p>
      </div>

      {/* Control Strip */}
      <div className="flex bg-white p-4 rounded-xl border border-slate-200 items-center justify-between shadow-sm">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search name or phone..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            className="pl-9 pr-4 py-2 w-full text-sm border border-slate-200 rounded-lg outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
          />
        </div>
      </div>

      {/* Primary Layout Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            <p className="text-sm text-slate-500">Locating accounts...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-rose-500">
            Error loading registry. Verify DB connection.
          </div>
        ) : data?.data.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            No customer profiles matched the criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase text-slate-500">
                  <th className="px-6 py-4">Customer Name</th>
                  <th className="px-6 py-4">Phone Number</th>
                  <th className="px-6 py-4">Registered Date</th>
                  <th className="px-6 py-4">Referral Opt-In Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.data.map((customer: Customer) => (
                  <tr 
                    key={customer.phone} 
                    onClick={() => setSelectedPhone(customer.phone)}
                    className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-4 font-semibold text-slate-900">{customer.name}</td>
                    <td className="px-6 py-4 text-slate-700 font-mono">{customer.phone}</td>
                    <td className="px-6 py-4 text-slate-500">
                      {formatToColomboTime(customer.created_at, false)}
                    </td>
                    <td className="px-6 py-4">
                      {customer.opted_in ? (
                        <span className="inline-flex px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-100">
                          Enrolled
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded bg-slate-50 text-slate-500 text-xs font-medium border border-slate-100">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <ChevronRight className="inline-block text-slate-400" size={16} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Block */}
        {data && data.meta.total > 0 && (
          <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Page {page} of {Math.ceil(data.meta.total / 15)} (Total {data.meta.total} records)
            </span>
            <div className="flex space-x-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 disabled:opacity-50"
              >
                Prev
              </button>
              <button
                disabled={page >= Math.ceil(data.meta.total / 15)}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Slide-over Side Drawer Container */}
      {selectedPhone && (
        <div className="fixed inset-0 overflow-hidden z-50 flex justify-end">
          <div 
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity" 
            onClick={() => setSelectedPhone(null)}
          />

          <div className="relative w-full max-w-xl bg-white shadow-xl flex flex-col h-full z-10 animate-slide-in">
            {/* Drawer Header */}
            <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-amber-100 text-amber-700 rounded-lg">
                  <User size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">
                    {loadingDetails ? "Fetching Details..." : details?.name}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">{selectedPhone}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedPhone(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {loadingDetails || !details ? (
                <div className="flex flex-col items-center justify-center h-48 space-y-2">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  <p className="text-xs text-slate-400">Loading relation structures...</p>
                </div>
              ) : (
                <>
                  {/* Address and City Information */}
                  {(details.address || details.city) && (
                    <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Location Profile</h4>
                      <p className="text-sm text-slate-800 font-medium">
                        {details.address} {details.address && details.city ? "—" : ""} {details.city}
                      </p>
                    </div>
                  )}

                  {/* Option Controls Wrapper */}
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Referral Management</h4>
                    {details.opted_in ? (
                      <div className="text-sm text-emerald-700 bg-emerald-50 p-3 rounded-lg border border-emerald-100 font-medium">
                        ✓ Registered in the referral system. Ready to evaluate codes.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-slate-500 leading-relaxed">
                          Opt this customer into the referrals program to generate invitation structures and codes.
                        </p>
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleSendOptIn(details.phone)}
                            disabled={processingOptin}
                            className="flex items-center justify-center space-x-2 text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 py-2 rounded-lg transition-colors disabled:opacity-50"
                          >
                            <Send size={12} />
                            <span>Queue Invite</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleConfirmOptIn(details.phone)}
                            disabled={processingOptin}
                            className="flex items-center justify-center space-x-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white py-2 rounded-lg transition-colors disabled:opacity-50"
                          >
                            <CheckSquare size={12} />
                            <span>Opt-In Directly</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Transactions Nested Tab List */}
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2 text-slate-800 border-b border-slate-100 pb-2">
                      <ShoppingBag size={16} className="text-slate-400" />
                      <h4 className="text-sm font-bold">Transaction History ({details.orders.length})</h4>
                    </div>
                    {details.orders.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No transactions recorded.</p>
                    ) : (
                      <div className="space-y-2">
                        {details.orders.map((order: any) => (
                          <div key={order.id} className="p-3 border border-slate-100 rounded-lg text-xs flex justify-between items-center hover:bg-slate-50/50">
                            <div>
                              <div className="font-semibold text-slate-800">{order.summary}</div>
                              <div className="text-slate-400 mt-1">{formatToColomboTime(order.created_at, false)}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-slate-900">Rs {order.final_amount}</div>
                              <span className="text-[10px] uppercase font-bold text-slate-400 block mt-1">{order.status}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Loyalty Codes Subsection */}
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2 text-slate-800 border-b border-slate-100 pb-2">
                      <Award size={16} className="text-slate-400" />
                      <h4 className="text-sm font-bold">Loyalty Codes ({details.loyalty_codes.length})</h4>
                    </div>
                    {details.loyalty_codes.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No loyalty codes assigned.</p>
                    ) : (
                      <div className="space-y-2">
                        {details.loyalty_codes.map((code: any) => (
                          <div key={code.id} className="p-3 border border-slate-100 rounded-lg text-xs flex justify-between items-center">
                            <div>
                              <div className="font-bold text-amber-700 font-mono">{code.code}</div>
                              <div className="text-slate-400 mt-1">Expires: {formatToColomboTime(code.expires_at, false)}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-semibold text-slate-800">Rs {code.discount_amount}</div>
                              {code.used_at ? (
                                <span className="text-[10px] text-red-500 bg-red-50 px-1 py-0.5 rounded font-medium mt-1 inline-block">Used</span>
                              ) : (
                                <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1 py-0.5 rounded font-semibold mt-1 inline-block">Active</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Referrals Render Section */}
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2 text-slate-800 border-b border-slate-100 pb-2">
                      <Heart size={16} className="text-slate-400" />
                      <h4 className="text-sm font-bold">Referrals Generated ({details.referrals_given.length})</h4>
                    </div>
                    {details.referrals_given.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No referrals associated with this profile.</p>
                    ) : (
                      <div className="space-y-2">
                        {details.referrals_given.map((ref: any) => (
                          <div key={ref.id} className="p-3 border border-slate-100 rounded-lg text-xs flex justify-between items-center">
                            <div>
                              <div className="font-semibold text-slate-800">Referee: {ref.referee_phone}</div>
                              <div className="text-slate-400 mt-1">Initiated: {formatToColomboTime(ref.created_at, false)}</div>
                            </div>
                            <div className="text-right">
                              <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                                ref.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                              }`}>
                                {ref.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}