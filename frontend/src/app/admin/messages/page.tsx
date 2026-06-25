"use client";

import React, { useState } from "react";
import useSWR, { mutate } from "swr";
import { fetchWithAuth } from "@/lib/api";
import { formatToColomboTime } from "@/utils/timezone";
import { 
  MessageSquare, Loader2, Clipboard, Check, Send, 
  Clock, AlertCircle, RefreshCw 
} from "lucide-react";

type Message = {
  id: string;
  to_phone: string;
  to_name: string | null;
  message_text: string;
  type: "loyalty_initial" | "loyalty_reminder" | "referral_optin" | "referral_share" | "order_dispatched";
  send_by: string;
  sent_at: string | null;
  is_overdue: boolean;
};

export default function MessagesPage() {
  const [activeTab, setActiveTab] = useState<"pending" | "sent">("pending");
  const [page, setPage] = useState(1);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const queryParams = new URLSearchParams({
    page: page.toString(),
    limit: "15",
    status: activeTab,
  });

  const { data, isLoading, error } = useSWR(
    `/messages?${queryParams.toString()}`,
    fetchWithAuth,
    { refreshInterval: 10000 }
  );

  const handleCopyToClipboard = async (message: Message) => {
    try {
      await navigator.clipboard.writeText(message.message_text);
      setCopyingId(message.id);
      setTimeout(() => setCopyingId(null), 2000);
    } catch (err) {
      alert("Failed to write to system clipboard.");
    }
  };

  const handleMarkAsSent = async (messageId: string) => {
    setUpdatingId(messageId);
    try {
      await fetchWithAuth(`/messages/${messageId}/sent`, {
        method: "PATCH",
      });
      mutate(`/messages?${queryParams.toString()}`);
    } catch (err: any) {
      alert(err.message || "Failed to update status flag.");
    } finally {
      setUpdatingId(null);
    }
  };

  const getUrgencyDisplay = (msg: Message) => {
    if (msg.sent_at) return null;
    
    if (msg.is_overdue) {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-rose-50 text-rose-700 text-[11px] font-semibold border border-rose-200">
          <AlertCircle size={10} />
          <span>Overdue</span>
        </span>
      );
    }

    const todayDateStr = new Date().toISOString().split("T")[0];
    const sendByDateStr = msg.send_by ? msg.send_by.split("T")[0] : "";
    
    if (sendByDateStr === todayDateStr) {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-amber-50 text-amber-700 text-[11px] font-semibold border border-amber-200">
          <Clock size={10} />
          <span>Today</span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-500 text-[11px] font-medium">
        Future
      </span>
    );
  };

  const getMessageTypeBadge = (type: string) => {
    switch (type) {
      case "loyalty_initial": return "text-blue-700 bg-blue-50 border-blue-100";
      case "loyalty_reminder": return "text-purple-700 bg-purple-50 border-purple-100";
      case "referral_optin": return "text-amber-700 bg-amber-50 border-amber-100";
      case "referral_share": return "text-emerald-700 bg-emerald-50 border-emerald-100";
      case "order_dispatched": return "text-indigo-700 bg-indigo-50 border-indigo-100"; // Added cohesive theme colors
      default: return "text-slate-500 bg-slate-50 border-slate-100";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Message Queue</h1>
          <p className="text-sm text-slate-500">Manually trigger, copy, and log queued outbound client notification templates.</p>
        </div>
        <button
          onClick={() => mutate(`/messages?${queryParams.toString()}`)}
          className="inline-flex items-center justify-center space-x-2 bg-white border border-slate-200 text-slate-700 px-3.5 py-2 rounded-lg text-sm font-semibold hover:bg-slate-50"
        >
          <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Tab Switcher Grid */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => { setActiveTab("pending"); setPage(1); }}
          className={`px-5 py-3 text-sm font-bold border-b-2 transition-all -mb-px ${
            activeTab === "pending"
              ? "border-amber-600 text-amber-700"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Pending Queue
        </button>
        <button
          onClick={() => { setActiveTab("sent"); setPage(1); }}
          className={`px-5 py-3 text-sm font-bold border-b-2 transition-all -mb-px ${
            activeTab === "sent"
              ? "border-amber-600 text-amber-700"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Sent Archive
        </button>
      </div>

      {/* Queue Listing Panel */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            <p className="text-sm text-slate-400">Loading templates...</p>
          </div>
        ) : error ? (
          <div className="p-10 text-center text-sm text-rose-500">
            Failed to parse messages records. Check connection settings.
          </div>
        ) : data?.data.length === 0 ? (
          <div className="p-16 text-center space-y-2 text-sm text-slate-400">
            <MessageSquare className="mx-auto h-8 w-8 text-slate-300" />
            <p className="font-medium">All clear. No messages reside in the current view.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {data.data.map((msg: Message) => (
              <div 
                key={msg.id} 
                className={`p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-slate-50/30 transition-colors ${
                  !msg.sent_at && msg.is_overdue ? "border-l-4 border-rose-500 bg-rose-50/10" : ""
                }`}
              >
                <div className="space-y-2 flex-1">
                  {/* Metadata Row */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-slate-900">{msg.to_name || "Unknown"}</span>
                    <span className="text-slate-400 font-mono">({msg.to_phone})</span>
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${getMessageTypeBadge(msg.type)}`}>
                      {msg.type.replace("_", " ")}
                    </span>
                    {getUrgencyDisplay(msg)}
                  </div>

                  {/* Body Copy Text */}
                  <p className="text-sm text-slate-700 bg-slate-50/80 p-3.5 rounded-lg border border-slate-200 font-normal leading-relaxed break-words whitespace-pre-wrap">
                    {msg.message_text}
                  </p>

                  {/* Timestamp Row */}
                  <div className="text-[11px] text-slate-400">
                    {msg.sent_at ? (
                      <span>Dispatched At: {formatToColomboTime(msg.sent_at, true)}</span>
                    ) : (
                      <span>Scheduled Send Date: {formatToColomboTime(msg.send_by, true)}</span>
                    )}
                  </div>
                </div>

                {/* Processing Actions */}
                <div className="flex flex-row md:flex-col items-center justify-end gap-2 w-full md:w-auto self-stretch md:self-auto border-t md:border-t-0 border-slate-100 pt-3 md:pt-0">
                  <button
                    onClick={() => handleCopyToClipboard(msg)}
                    className="flex-1 md:flex-initial flex items-center justify-center space-x-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 px-3.5 py-2 rounded-lg transition-colors"
                  >
                    {copyingId === msg.id ? (
                      <>
                        <Check size={14} className="text-emerald-600" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Clipboard size={14} />
                        <span>Copy Text</span>
                      </>
                    )}
                  </button>

                  {!msg.sent_at && (
                    <button
                      onClick={() => handleMarkAsSent(msg.id)}
                      disabled={updatingId === msg.id}
                      className="flex-1 md:flex-initial flex items-center justify-center space-x-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-2 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {updatingId === msg.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Send size={14} />
                      )}
                      <span>Mark Sent</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination Controls */}
        {data && data.meta.total > 0 && (
          <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-normal">
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
    </div>
  );
}