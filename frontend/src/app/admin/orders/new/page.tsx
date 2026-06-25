"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { fetchWithAuth } from "../../../../lib/api";
import { Loader2, Check, AlertTriangle, Search, User, UserPlus, X } from "lucide-react";

type Customer = {
  phone: string;
  name: string;
  address: string | null;
  city: string | null;
  opted_in: boolean;
};

export default function NewOrderPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  // Customer Lookup States
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Quick-Register States
  const [isRegistering, setIsRegistering] = useState(false);
  const [regName, setRegName] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regAddress, setRegAddress] = useState("");
  const [regCity, setRegCity] = useState("");
  const [registeringLoader, setRegisteringLoader] = useState(false);
  const [registeringError, setRegisteringError] = useState<string | null>(null);

  // Order Core States
  const [summary, setSummary] = useState("");
  const [kilo, setKilo] = useState<number | "">(0);
  const [gram, setGram] = useState<number | "">(500);
  const [pcs, setPcs] = useState<number | "">(1);
  const [totalAmount, setTotalAmount] = useState<number | "">("");
  const [notes, setNotes] = useState("");

  // Discount & Referral States
  const [discountCode, setDiscountCode] = useState("");
  const [validatingCode, setValidatingCode] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [appliedDiscount, setAppliedDiscount] = useState<number>(0);
  const [confirmedCode, setConfirmedCode] = useState<string | null>(null);
  const [verifiedReferrerAddress, setVerifiedReferrerAddress] = useState<string | null>(null);
  const [isFraudSuspended, setIsFraudSuspended] = useState(false);
  const [applyFirstTime, setApplyFirstTime] = useState(true);

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetchWithAuth(`/customers?search=${searchQuery}&limit=5`);
        setSearchResults(res.data || []);
      } catch (err) {
        console.error("Failed to query customers:", err);
      } finally {
        setSearching(false);
      }
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery]);

  useEffect(() => {
    setValidationMessage(null);
    setValidationError(null);
    setAppliedDiscount(0);
    setConfirmedCode(null);
    setDiscountCode("");
    setVerifiedReferrerAddress(null);
    setIsFraudSuspended(false);

    if (selectedCustomer) {
      const checkAutoCreditAndFirstTime = async () => {
        try {
          const res = await fetchWithAuth("/orders/validate-discount", {
            method: "POST",
            body: JSON.stringify({
              customer_phone: selectedCustomer.phone,
              discount_code: "",
              total_amount: totalAmount !== "" ? Number(totalAmount) : 0,
              apply_first_time: applyFirstTime
            }),
          });

          if (res.valid) {
            setAppliedDiscount(res.discount_amount);
            setValidationMessage(res.message);
          } else if (res.type === "fraud_flagged") {
            setIsFraudSuspended(true);
            setValidationError(res.message);
            setVerifiedReferrerAddress(res.referrer_address || "No address on file");
          }
        } catch (err) {
          console.error("Auto-discount evaluation failed:", err);
        }
      };

      checkAutoCreditAndFirstTime();
    }
  }, [selectedCustomer, totalAmount, applyFirstTime]);

  const handleQuickRegisterSubmit = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!regPhone || !regName) {
      setRegisteringError("Phone number and name are required.");
      return;
    }

    setRegisteringLoader(true);
    setRegisteringError(null);

    try {
      const newCustomer = await fetchWithAuth("/customers", {
        method: "POST",
        body: JSON.stringify({
          phone: regPhone,
          name: regName,
          address: regAddress || null,
          city: regCity || null,
        }),
      });

      setSelectedCustomer(newCustomer);
      setIsRegistering(false);
      
      setRegPhone("");
      setRegName("");
      setRegAddress("");
      setRegCity("");
    } catch (err: any) {
      setRegisteringError(err.message || "Failed to register profile.");
    } finally {
      setRegisteringLoader(false);
    }
  };

  const handleValidateDiscount = async () => {
    if (!selectedCustomer) {
      setValidationError("Please select a registered customer first.");
      return;
    }
    if (!discountCode) {
      setValidationError("Please enter a discount code or referrer phone number.");
      return;
    }

    setValidatingCode(true);
    setValidationError(null);
    setValidationMessage(null);
    setAppliedDiscount(0);
    setConfirmedCode(null);
    setVerifiedReferrerAddress(null);
    setIsFraudSuspended(false);

    try {
      const res = await fetchWithAuth("/orders/validate-discount", {
        method: "POST",
        body: JSON.stringify({
          customer_phone: selectedCustomer.phone,
          discount_code: discountCode,
          total_amount: totalAmount !== "" ? Number(totalAmount) : 0,
          apply_first_time: applyFirstTime
        }),
      });

      if (res.valid) {
        setAppliedDiscount(res.discount_amount);
        setValidationMessage(res.message);
        setConfirmedCode(discountCode);

        if (res.type === "referral") {
          setVerifiedReferrerAddress(res.referrer_address || "No address on file");
        }
      } else {
        setValidationError(res.message || "Invalid discount code.");
      }
    } catch (err: any) {
      setValidationError(err.message || "Discount verification failed.");
    } finally {
      setValidatingCode(false);
    }
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !summary || totalAmount === "") {
      alert("Please select a customer and populate all required fields.");
      return;
    }

    setSubmitting(true);
    try {
      await fetchWithAuth("/orders", {
        method: "POST",
        body: JSON.stringify({
          customer_phone: selectedCustomer.phone,
          summary,
          kilo: Number(kilo),
          gram: Number(gram),
          pcs: Number(pcs),
          total_amount: Number(totalAmount),
          discount_code: confirmedCode || null,
          notes: notes || null,
          apply_first_time: applyFirstTime,
          status: "confirmed" // <-- Added to enforce default confirmed status in direct OMS creations
        }),
      });

      router.push("/admin/orders");
    } catch (err: any) {
      alert(err.message || "Failed to finalize order creation.");
    } finally {
      setSubmitting(false);
    }
  };

  const areAddressesIdentical = () => {
    if (!selectedCustomer?.address || !verifiedReferrerAddress) return false;
    const addr1 = selectedCustomer.address.toLowerCase().trim().replace(/\s+/g, "");
    const addr2 = verifiedReferrerAddress.toLowerCase().trim().replace(/\s+/g, "");
    return addr1 === addr2 && addr1 !== "noaddressonfile";
  };

  const calculatedTotal = totalAmount === "" ? 0 : Number(totalAmount);
  const finalAmount = Math.max(0, calculatedTotal - appliedDiscount);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Create Order</h1>
        <p className="text-sm text-slate-500 font-normal font-sans">
          Select a registered customer or quick-register a new one below.
        </p>
      </div>

      <form onSubmit={handleSubmitOrder} className="space-y-6 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        
        {/* Section 1: Customer Lookup and Quick-Register Panel */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Customer lookup</h2>
          
          {!selectedCustomer && !isRegistering && (
            <div className="relative">
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-semibold text-slate-700">Search Customer by Phone or Name *</label>
                <button
                  type="button"
                  onClick={() => setIsRegistering(true)}
                  className="text-xs font-semibold text-amber-600 hover:text-amber-700 flex items-center space-x-1"
                >
                  <UserPlus size={14} />
                  <span>Quick-Register New</span>
                </button>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Type to search (e.g., 077... or Ruwan)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-4 py-2 w-full text-sm border border-slate-200 rounded-lg outline-none focus:border-amber-500"
                />
                {searching && (
                  <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-slate-400" />
                )}
              </div>

              {searchResults.length > 0 && (
                <div className="absolute z-10 w-full bg-white mt-1 border border-slate-200 rounded-lg shadow-lg divide-y divide-slate-100 max-h-60 overflow-y-auto">
                  {searchResults.map((cust) => (
                    <button
                      key={cust.phone}
                      type="button"
                      onClick={() => {
                        setSelectedCustomer(cust);
                        setSearchQuery("");
                        setSearchResults([]);
                      }}
                      className="w-full text-left px-4 py-2.5 hover:bg-slate-50 text-sm flex justify-between items-center"
                    >
                      <div>
                        <div className="font-semibold text-slate-900">{cust.name}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{cust.phone}</div>
                      </div>
                      {cust.address && (
                        <div className="text-xs text-slate-400 max-w-xs truncate">
                          {cust.address}{cust.city ? `, ${cust.city}` : ""}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {searchQuery.trim().length >= 2 && !searching && searchResults.length === 0 && (
                <div className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-lg text-center">
                  <p className="text-xs text-slate-500 mb-2">No matching customer profile found in our records.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setRegPhone(/^\d+$/.test(searchQuery) ? searchQuery : "");
                      setRegName(!/^\d+$/.test(searchQuery) ? searchQuery : "");
                      setIsRegistering(true);
                    }}
                    className="inline-flex items-center space-x-1.5 bg-slate-900 text-white text-xs font-semibold px-3 py-1.5 rounded hover:bg-slate-800"
                  >
                    <UserPlus size={12} />
                    <span>Quick-Register "{searchQuery}"</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {isRegistering && (
            <div className="p-4 border border-amber-200 bg-amber-50/20 rounded-xl space-y-3 relative">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-700">Quick-Register New Customer</h3>
                <button
                  type="button"
                  onClick={() => {
                    setIsRegistering(false);
                    setRegisteringError(null);
                  }}
                  className="text-slate-400 hover:text-slate-600 p-0.5 rounded"
                >
                  <X size={16} />
                </button>
              </div>

              {registeringError && (
                <div className="text-xs text-rose-600 font-semibold">{registeringError}</div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Phone Number *</label>
                  <input
                    type="text"
                    placeholder="e.g. 0771234567"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    className="mt-1 w-full text-xs border border-slate-200 rounded px-2.5 py-1.5 outline-none bg-white focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Customer Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Ruwan Perera"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    className="mt-1 w-full text-xs border border-slate-200 rounded px-2.5 py-1.5 outline-none bg-white focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Delivery Address</label>
                  <input
                    type="text"
                    placeholder="e.g. 123 Galle Road"
                    value={regAddress}
                    onChange={(e) => setRegAddress(e.target.value)}
                    className="mt-1 w-full text-xs border border-slate-200 rounded px-2.5 py-1.5 outline-none bg-white focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">City</label>
                  <input
                    type="text"
                    placeholder="e.g. Colombo 03"
                    value={regCity}
                    onChange={(e) => setRegCity(e.target.value)}
                    className="mt-1 w-full text-xs border border-slate-200 rounded px-2.5 py-1.5 outline-none bg-white focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsRegistering(false)}
                  className="text-xs bg-white border border-slate-200 text-slate-600 px-3 py-1.5 rounded font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleQuickRegisterSubmit}
                  disabled={registeringLoader}
                  className="flex items-center space-x-1 text-xs bg-slate-900 text-white px-3 py-1.5 rounded font-semibold hover:bg-slate-800 disabled:opacity-50"
                >
                  {registeringLoader && <Loader2 size={12} className="animate-spin" />}
                  <span>Register & Select</span>
                </button>
              </div>
            </div>
          )}

          {selectedCustomer && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex justify-between items-start">
              <div className="flex space-x-3">
                <div className="p-2 bg-amber-100 text-amber-700 rounded-lg mt-0.5">
                  <User size={18} />
                </div>
                <div>
                  <div className="font-bold text-slate-900">{selectedCustomer.name}</div>
                  <div className="text-xs font-mono text-slate-500 mt-0.5">{selectedCustomer.phone}</div>
                  {(selectedCustomer.address || selectedCustomer.city) && (
                    <div className="text-xs text-slate-500 mt-2 bg-white px-2.5 py-1.5 rounded border border-slate-200">
                      <span className="font-semibold block text-[10px] uppercase text-slate-400 mb-0.5">Delivery Address</span>
                      {selectedCustomer.address} {selectedCustomer.address && selectedCustomer.city ? "—" : ""} {selectedCustomer.city}
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="text-xs font-semibold text-rose-600 hover:text-rose-800 bg-white border border-rose-100 hover:bg-rose-50 px-2.5 py-1 rounded"
              >
                Change
              </button>
            </div>
          )}
        </div>

        {/* Section 2: Order Summary and Notes */}
        <div className="space-y-4 pt-4 border-t border-slate-100">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Order Contents</h2>
          
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Order Summary *</label>
              <textarea
                required
                rows={3}
                placeholder="e.g. 2x Creamy Peanut Butter 500g"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-amber-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Weight (Kilos) *</label>
                <input
                  type="number"
                  required
                  min={0}
                  value={kilo}
                  onChange={(e) => setKilo(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Weight (Grams) *</label>
                <input
                  type="number"
                  required
                  min={0}
                  value={gram}
                  onChange={(e) => setGram(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">No. of Pcs *</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={pcs}
                  onChange={(e) => setPcs(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Total Order Price (Rs) *</label>
                <input
                  type="number"
                  required
                  min={0}
                  placeholder="e.g. 2300"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Internal Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Delivery instructions, preferred hours"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Promotions Engine */}
        <div className="space-y-4 pt-4 border-t border-slate-100">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Discount & Referrals</h2>
          <div className="space-y-3">
            
            <div className="flex items-center space-x-2.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <input
                type="checkbox"
                id="applyFirstTime"
                checked={applyFirstTime}
                onChange={(e) => setApplyFirstTime(e.target.checked)}
                className="h-4 w-4 text-amber-600 focus:ring-amber-500 border-slate-300 rounded cursor-pointer"
              />
              <label htmlFor="applyFirstTime" className="text-xs font-bold text-slate-700 cursor-pointer select-none">
                Apply Auto 12% First-Time Buyer Discount (If eligible)
              </label>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                disabled={!selectedCustomer}
                placeholder={selectedCustomer ? "Enter KRK code or Referrer Phone" : "Select a customer first"}
                value={discountCode}
                onChange={(e) => setDiscountCode(e.target.value)}
                className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-amber-500 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={handleValidateDiscount}
                disabled={validatingCode || !selectedCustomer}
                className="bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {validatingCode ? "Verifying..." : "Apply Code"}
              </button>
            </div>

            {validationMessage && (
              <div className="flex items-center space-x-2 text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 p-2.5 rounded-lg">
                <Check size={14} />
                <span>{validationMessage}</span>
              </div>
            )}
            {validationError && (
              <div className="flex items-center space-x-2 text-xs text-rose-600 bg-rose-50 border border-rose-100 p-2.5 rounded-lg">
                <AlertTriangle size={14} />
                <span>{validationError}</span>
              </div>
            )}

            {verifiedReferrerAddress && selectedCustomer && (
              <div className="p-4 bg-amber-50/50 border border-amber-200 rounded-xl space-y-3">
                <div className="flex items-center space-x-2 text-amber-800 font-bold text-xs uppercase tracking-wider">
                  <AlertTriangle size={14} />
                  <span>Referral Address Audit</span>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="bg-white p-3 rounded-lg border border-amber-100">
                    <span className="font-semibold block text-slate-500 mb-1">Referee Address (Current Order)</span>
                    <p className="text-slate-800">{selectedCustomer.address || "No address on file"}</p>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-amber-100">
                    <span className="font-semibold block text-slate-500 mb-1">Referrer Address (Friend)</span>
                    <p className="text-slate-800">{verifiedReferrerAddress || "No address on file"}</p>
                  </div>
                </div>

                {(isFraudSuspended || (selectedCustomer.address && verifiedReferrerAddress && 
                  selectedCustomer.address.toLowerCase().trim().replace(/\s+/g, "") === 
                  verifiedReferrerAddress.toLowerCase().trim().replace(/\s+/g, ""))) && (
                  <div className="p-2.5 bg-rose-50 border border-rose-100 text-rose-700 rounded-lg text-xs font-semibold flex items-center space-x-2 animate-pulse">
                    <AlertTriangle size={14} className="shrink-0" />
                    <span>Warning: Delivery addresses match or are highly similar. First-time buyer discounts are suspended for this address to prevent duplication fraud.</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Section 4: Live Accounting Summary */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-sm">
          <div className="flex justify-between text-slate-500">
            <span>Subtotal</span>
            <span>Rs {calculatedTotal}</span>
          </div>
          {appliedDiscount > 0 && (
            <div className="flex justify-between text-red-500">
              <span>Applied Discount</span>
              <span>- Rs {appliedDiscount}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200 pt-2 mt-1">
            <span>Final Total</span>
            <span>Rs {finalAmount}</span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={() => router.push("/admin/orders")}
            className="px-4 py-2 text-sm font-semibold bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !selectedCustomer}
            className="flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            <span>{submitting ? "Processing..." : "Place Order"}</span>
          </button>
        </div>
      </form>
    </div>
  );
}