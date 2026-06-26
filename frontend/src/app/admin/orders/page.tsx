"use client";

import { useState, useRef } from "react";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import * as XLSX from "xlsx";
import { fetchWithAuth } from "@/lib/api";
import { formatToColomboTime } from "../../../utils/timezone";
import { Search, Loader2, Upload, Send, Package } from "lucide-react";

type Order = {
  id: string;
  order_number: string;
  customer_phone: string;
  summary: string;
  total_amount: number;
  discount_code: string | null;
  discount_amount: number;
  final_amount: number;
  status: "pending" | "confirmed" | "dispatched" | "delivered" | "cancelled";
  notes: string | null;
  created_at: string;
  delivered_at: string | null;
  tracking_number: string | null;
  kilo: number;
  gram: number;
  pcs: number;
  customer?: {
    name: string;
    address: string | null;
    city: string | null;
  };
  customer_name?: string;
  customer_address?: string;
  customer_city?: string;
};

const STATUS_TABS = [
  { label: "All", value: "" },
  { label: "Pending", value: "pending" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Dispatched", value: "dispatched" },
  { label: "Delivered", value: "delivered" },
  { label: "Cancelled", value: "cancelled" },
];

export default function OrdersPage() {
  const [selectedStatus, setSelectedStatus] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [processingPool, setProcessingPool] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);

  const queryParams = new URLSearchParams({
    page: page.toString(),
    limit: "15",
    ...(selectedStatus && { status: selectedStatus }),
    ...(searchQuery && { search: searchQuery }),
  });

  const { data, error, isLoading } = useSWR(
    `/orders?${queryParams.toString()}`,
    fetchWithAuth
  );

  const { data: trackingStats } = useSWR(
    "/tracking/stats",
    fetchWithAuth,
    { refreshInterval: 10000 }
  );

  // Filter visible orders that are strictly 'confirmed' to allow selection
  const visibleConfirmedOrders = (data?.data || []).filter((o: Order) => o.status === "confirmed");
  const visibleConfirmedIds = visibleConfirmedOrders.map((o: Order) => o.id);
  const allVisibleSelected = visibleConfirmedIds.length > 0 && visibleConfirmedIds.every((id: string) => selectedOrderIds.includes(id));

  const handleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedOrderIds(prev => prev.filter(id => !visibleConfirmedIds.includes(id)));
    } else {
      setSelectedOrderIds(prev => Array.from(new Set([...prev, ...visibleConfirmedIds])));
    }
  };

  const toggleOrderSelection = (id: string) => {
    setSelectedOrderIds(prev => 
      prev.includes(id) ? prev.filter(existing => existing !== id) : [...prev, id]
    );
  };

  const handleStatusChange = async (orderId: string, nextStatus: string) => {
    if (nextStatus === "delivered" && !confirm("Marking this order as Delivered will generate and queue customer loyalty codes. Continue?")) return;

    setUpdatingId(orderId);
    try {
      await fetchWithAuth(`/orders/${orderId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      mutate(`/orders?${queryParams.toString()}`);
    } catch (err: any) {
      alert(err.message || "Failed to update status");
    } finally {
      setUpdatingId(null);
    }
  };

  // STEP 1: UPLOAD NUMBERS TO THE POOL
  const handlePoolUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setProcessingPool(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
      
      const trackingNumbers: string[] = [];
      for (let i = 1; i < rows.length; i++) {
        const trackingNo = rows[i][0]; 
        if (trackingNo && String(trackingNo).trim() !== "") {
          trackingNumbers.push(String(trackingNo).trim());
        }
      }

      if (trackingNumbers.length === 0) {
        alert("No tracking numbers found in the uploaded file.");
        return;
      }

      const res = await fetchWithAuth(`/tracking/upload`, {
        method: "POST",
        body: JSON.stringify({ tracking_numbers: trackingNumbers }),
      });

      alert(`Successfully added ${res.added_count} new tracking numbers to the pool!`);
      mutate("/tracking/stats");
    } catch (err: any) {
      alert("Error adding tracking numbers: " + err.message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
      setProcessingPool(false);
    }
  };

  // STEP 2: DISPATCH AND GENERATE EXCEL
  const handleBulkDispatch = async () => {
    if (selectedOrderIds.length === 0) return;
    
    if (trackingStats?.available < selectedOrderIds.length) {
      alert(`Not enough tracking numbers available! You need ${selectedOrderIds.length}, but only have ${trackingStats?.available}. Please upload more.`);
      return;
    }

    if (!confirm(`Are you sure you want to dispatch ${selectedOrderIds.length} orders? Tracking numbers will be permanently assigned.`)) return;

    setIsDispatching(true);
    try {
      const dispatchedOrders: Order[] = await fetchWithAuth(`/orders/bulk-dispatch`, {
        method: "POST",
        body: JSON.stringify({ order_ids: selectedOrderIds }),
      });

      // Build Excel array
      const excelData: (string | number)[][] = [
        [
          "TrackingNumber", "Reference", "PackageDescription", "ReceiverName", 
          "ReceiverAddress", "ReceiverCity", "ReceiverContactNo", "NoOfPcs", 
          "Kilo", "Gram", "Amount", "Exchange", "Remark"
        ]
      ];

      for (const order of dispatchedOrders) {
        const cName = order.customer_name || order.customer?.name || "";
        const cAddr = order.customer_address || order.customer?.address || "";
        const cCity = order.customer_city || order.customer?.city || "";

        excelData.push([
          order.tracking_number,
          order.order_number, 
          order.summary || "",
          cName,
          cAddr,
          cCity,
          order.customer_phone,
          order.pcs || 1,
          order.kilo || 0,
          order.gram || 500,
          order.final_amount,
          0, 
          order.notes || ""
        ]);
      }

      // Generate XLSX
      const outWorksheet = XLSX.utils.aoa_to_sheet(excelData);
      outWorksheet['!cols'] = [
        { wch: 15 }, { wch: 15 }, { wch: 30 }, { wch: 20 }, { wch: 40 }, 
        { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, 
        { wch: 10 }, { wch: 10 }, { wch: 25 }, 
      ];
      const workbookOut = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbookOut, outWorksheet, "Shipments");
      XLSX.writeFile(workbookOut, `Completed_Shipping_Batch_${new Date().toISOString().split('T')[0]}.xlsx`);

      // Cleanup & Refresh UI
      setSelectedOrderIds([]);
      mutate(`/orders?${queryParams.toString()}`);
      mutate("/tracking/stats");
      alert("Orders successfully dispatched and shipping file downloaded.");

    } catch (err: any) {
      alert("Dispatch failed: " + err.message);
    } finally {
      setIsDispatching(false);
    }
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "pending": return "bg-amber-50 text-amber-700 border-amber-200";
      case "confirmed": return "bg-blue-50 text-blue-700 border-blue-200";
      case "dispatched": return "bg-indigo-50 text-indigo-700 border-indigo-200";
      case "delivered": return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "cancelled": return "bg-rose-50 text-rose-700 border-rose-200";
      default: return "bg-slate-50 text-slate-700 border-slate-200";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
          <p className="text-sm text-slate-500">View and update customer transaction pipelines.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          
          <div className="flex items-center space-x-2 bg-indigo-50 border border-indigo-100 text-indigo-800 px-3 py-2 rounded-lg text-sm font-semibold">
            <Package size={16} />
            <span>Pool: {trackingStats?.available || 0}</span>
          </div>

          <input 
            type="file" 
            accept=".csv, .xlsx, .xls" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handlePoolUpload} 
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={processingPool}
            className="inline-flex items-center justify-center bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {processingPool ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
            Add Tracking Numbers
          </button>
          <Link
            href="/admin/orders/new"
            className="inline-flex items-center justify-center bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Create New Order
          </Link>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-xl border border-slate-200">
        <div className="flex flex-wrap gap-1 w-full md:w-auto">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.label}
              onClick={() => {
                setSelectedStatus(tab.value);
                setPage(1);
                setSelectedOrderIds([]); // Clear selection when switching tabs
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                selectedStatus === tab.value
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          {selectedOrderIds.length > 0 && (
            <button
              onClick={handleBulkDispatch}
              disabled={isDispatching}
              className="inline-flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {isDispatching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              <span>Dispatch {selectedOrderIds.length} Orders</span>
            </button>
          )}

          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search notes or summary..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="pl-9 pr-4 py-2 w-full text-sm border border-slate-200 rounded-lg outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            <p className="text-sm text-slate-500">Retrieving order database...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-rose-500">
            Failed to load orders. Verify your API database connection.
          </div>
        ) : data?.data.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            No matching orders found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase text-slate-500">
                  <th className="px-6 py-4 w-12 text-center">
                    <input 
                      type="checkbox" 
                      checked={allVisibleSelected}
                      onChange={handleSelectAll}
                      disabled={visibleConfirmedIds.length === 0}
                      className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500 cursor-pointer disabled:opacity-50"
                    />
                  </th>
                  <th className="px-6 py-4">Order Info</th>
                  <th className="px-6 py-4">Customer</th>
                  <th className="px-6 py-4">Summary</th>
                  <th className="px-6 py-4 text-right">Amounts</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.data.map((order: Order) => {
                  const isSelectable = order.status === "confirmed";
                  const isSelected = selectedOrderIds.includes(order.id);
                  
                  return (
                    <tr key={order.id} className={`transition-colors ${isSelected ? "bg-amber-50/50" : "hover:bg-slate-50/50"}`}>
                      <td className="px-6 py-4 text-center">
                        {isSelectable ? (
                          <input 
                            type="checkbox" 
                            checked={isSelected}
                            onChange={() => toggleOrderSelection(order.id)}
                            className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500 cursor-pointer"
                          />
                        ) : (
                          <div className="w-4 h-4 mx-auto bg-slate-100 border border-slate-200 rounded opacity-50 cursor-not-allowed"></div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-mono text-xs font-bold text-slate-900 mb-0.5">
                          {order.order_number}
                        </div>
                        <div className="text-xs font-medium text-slate-500">
                          {formatToColomboTime(order.created_at, false)}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {formatToColomboTime(order.created_at, true).split(" ")[1]}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900">{order.customer_phone}</div>
                        {order.discount_code && (
                          <span className="inline-flex items-center text-xs text-amber-600 font-medium bg-amber-50 px-1.5 py-0.5 rounded mt-1 mr-1">
                            Code: {order.discount_code}
                          </span>
                        )}
                        {order.tracking_number && (
                          <span className="inline-flex items-center text-xs text-indigo-600 font-medium bg-indigo-50 px-1.5 py-0.5 rounded mt-1">
                            Tracking: {order.tracking_number}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 max-w-xs truncate">
                        <div className="font-medium text-slate-800">{order.summary}</div>
                        {order.notes && <div className="text-xs text-slate-400 mt-1 italic">Note: {order.notes}</div>}
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <div className="text-slate-950 font-bold">Rs {order.final_amount}</div>
                        {order.discount_amount > 0 && (
                          <div className="text-xs text-red-500 mt-0.5">
                            - Rs {order.discount_amount}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold border ${getStatusStyle(order.status)}`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        {updatingId === order.id ? (
                          <Loader2 className="inline-block h-5 w-5 animate-spin text-slate-400" />
                        ) : (
                          <div className="flex items-center justify-end space-x-2">
                            {order.status === "pending" && (
                              <button
                                onClick={() => handleStatusChange(order.id, "confirmed")}
                                className="text-xs text-blue-600 hover:bg-blue-50 px-2 py-1 rounded border border-blue-200 font-medium"
                              >
                                Confirm
                              </button>
                            )}
                            {order.status === "dispatched" && (
                              <button
                                onClick={() => handleStatusChange(order.id, "delivered")}
                                className="text-xs text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded border border-emerald-200 font-semibold"
                              >
                                Deliver
                              </button>
                            )}
                            {order.status !== "delivered" && order.status !== "cancelled" && (
                              <button
                                onClick={() => handleStatusChange(order.id, "cancelled")}
                                className="text-xs text-rose-600 hover:bg-rose-50 px-2 py-1 rounded border border-rose-100 font-medium"
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Panel */}
        {data && data.meta.total > 0 && (
          <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Showing Page {page} of {Math.ceil(data.meta.total / 15)} (Total {data.meta.total} orders)
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