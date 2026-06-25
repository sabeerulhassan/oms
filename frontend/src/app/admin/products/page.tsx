"use client";

import React, { useState, useRef } from "react";
import useSWR, { mutate } from "swr";
import { fetchWithAuth } from "@/lib/api";
import { 
  Package, Loader2, Plus, Edit2, Trash2, X, Upload, Save, 
  Layers, CheckSquare, Square, Eye, PlaySquare
} from "lucide-react";

type SizeOption = {
  size: string;
  price: number;
  in_stock: boolean;
  size_youtube_id?: string;
  size_images?: string[]; // Array of Cloudinary URLs
};

type ProductInput = {
  id?: string;
  slug: string;
  name: string;
  flavor: string;
  ingredients: string;
  description: string;
  usage: string;
  tags: string[];
  default_youtube_id: string;
  images: string[]; // Main Gallery Cloudinary URLs
  sizes: SizeOption[];
};

const DEFAULT_FORM: ProductInput = {
  slug: "",
  name: "",
  flavor: "",
  ingredients: "",
  description: "",
  usage: "",
  tags: [],
  default_youtube_id: "",
  images: [],
  sizes: [
    { size: "220g", price: 750, in_stock: true, size_youtube_id: "", size_images: [] },
    { size: "340g", price: 1050, in_stock: true, size_youtube_id: "", size_images: [] },
    { size: "450g", price: 1350, in_stock: true, size_youtube_id: "", size_images: [] }
  ]
};

export default function ProductsPage() {
  const { data, isLoading, error } = useSWR("/products", fetchWithAuth);

  // Form Panel States
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<ProductInput>(DEFAULT_FORM);
  const [tagInput, setTagsInput] = useState("");
  
  // Upload States
  const mainImageInputRef = useRef<HTMLInputElement>(null);
  const sizeImageInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleOpenAdd = () => {
    setForm(DEFAULT_FORM);
    setTagsInput("");
    setDrawerOpen(true);
  };

  const handleOpenEdit = (product: any) => {
    // Structure backend response data to match form inputs exactly
    setForm({
      id: product.id,
      slug: product.slug,
      name: product.name,
      flavor: product.flavor,
      ingredients: product.ingredients,
      description: product.description,
      usage: product.usage,
      tags: product.tags || [],
      default_youtube_id: product.default_youtube_id || "",
      images: (product.images || []).map((img: any) => img.image_url),
      sizes: (product.sizes || []).map((s: any) => ({
        size: s.size,
        price: s.price,
        in_stock: s.in_stock,
        size_youtube_id: s.size_youtube_id || "",
        size_images: (s.size_images || []).map((img: any) => img.image_url)
      }))
    });
    setTagsInput((product.tags || []).join(", "));
    setDrawerOpen(true);
  };

  // SECURE FRONTEND-DIRECT CLOUDINARY FILE UPLOAD WITH DETAILED DEBUG LOGS
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, sizeIndex?: number) => {
    const file = e.target.files?.[0];
    if (!file) return;

    console.log("=== CLOUDINARY UPLOAD START ===");
    console.log("Selected file:", file.name, `(${file.size} bytes)`, `[${file.type}]`);

    setUploading(true);
    try {
      // 1. Fetch secure signature from OMS backend
      console.log("Fetching secure upload signature from OMS backend...");
      const authData = await fetchWithAuth("/products/upload/signature");
      console.log("Backend Signature Data received successfully:", {
        cloud_name: authData.cloud_name,
        api_key: authData.api_key ? "PRESENT" : "MISSING",
        timestamp: authData.timestamp,
        signature: authData.signature ? "PRESENT" : "MISSING"
      });

      const { signature, timestamp, api_key, cloud_name } = authData;

      // 2. Prepare FormData matching exactly the parameters used to sign the signature
      const formData = new FormData();
      formData.append("file", file);
      formData.append("signature", signature);
      formData.append("timestamp", String(timestamp));
      formData.append("api_key", api_key);
      formData.append("folder", "products");

      console.log("Sending payload directly to Cloudinary CDN...");
      
      const response = await fetch(`https://api.cloudinary.com/v1_1/${cloud_name}/image/upload`, {
        method: "POST",
        body: formData,
      });

      // If Cloudinary rejects the upload, print the exact reason
      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        console.error("❌ CLOUDINARY REJECTED REQUEST:", errorJson);
        throw new Error(errorJson.error?.message || "Direct upload to Cloudinary failed.");
      }

      const data = await response.json();
      const uploadedUrl = data.secure_url;
      
      console.log("✅ CLOUDINARY UPLOAD SUCCESS! CDN URL:", uploadedUrl);

      if (sizeIndex !== undefined) {
        setForm(prev => {
          const updatedSizes = [...prev.sizes];
          updatedSizes[sizeIndex].size_images = [...(updatedSizes[sizeIndex].size_images || []), uploadedUrl];
          return { ...prev, sizes: updatedSizes };
        });
      } else {
        setForm(prev => ({ ...prev, images: [...prev.images, uploadedUrl] }));
      }
    } catch (err: any) {
      console.error("❌ FILE UPLOAD ERROR IN CATCH BLOCK:", err);
      alert("Image upload failed: " + err.message);
    } finally {
      if (e.target) e.target.value = ""; // Clear file selector input
      setUploading(false);
      console.log("=== CLOUDINARY UPLOAD COMPLETED ===");
    }
  };

  const handleRemoveMainImage = (index: number) => {
    setForm(prev => ({
      ...prev,
      images: prev.images.filter((_, idx) => idx !== index)
    }));
  };

  const handleRemoveSizeImage = (sizeIndex: number, imgIndex: number) => {
    setForm(prev => {
      const updatedSizes = [...prev.sizes];
      updatedSizes[sizeIndex].size_images = updatedSizes[sizeIndex].size_images?.filter((_, idx) => idx !== imgIndex);
      return { ...prev, sizes: updatedSizes };
    });
  };

  const handleAddSizeRow = () => {
    setForm(prev => ({
      ...prev,
      sizes: [...prev.sizes, { size: "", price: 0, in_stock: true, size_youtube_id: "", size_images: [] }]
    }));
  };

  const handleRemoveSizeRow = (index: number) => {
    setForm(prev => ({
      ...prev,
      sizes: prev.sizes.filter((_, idx) => idx !== index)
    }));
  };

  const handleSizeFieldChange = (index: number, field: keyof SizeOption, value: any) => {
    setForm(prev => {
      const updatedSizes = [...prev.sizes];
      updatedSizes[index] = { ...updatedSizes[index], [field]: value };
      return { ...prev, sizes: updatedSizes };
    });
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const parsedTags = tagInput
        .split(",")
        .map(t => t.trim())
        .filter(Boolean);

      const payload = { ...form, tags: parsedTags };

      if (form.id) {
        // Update
        await fetchWithAuth(`/products/${form.id}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
      } else {
        // Create
        await fetchWithAuth(`/products`, {
          method: "POST",
          body: JSON.stringify(payload)
        });
      }

      alert("Product saved successfully!");
      setDrawerOpen(false);
      mutate("/products");
    } catch (err: any) {
      alert("Failed to save product: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteProduct = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to permanently delete "${name}"? This action cannot be undone.`)) return;

    try {
      await fetchWithAuth(`/products/${id}`, { method: "DELETE" });
      alert("Product deleted successfully.");
      mutate("/products");
    } catch (err: any) {
      alert("Delete failed: " + err.message);
    }
  };

  return (
    <div className="space-y-6 relative">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Products Catalog</h1>
          <p className="text-sm text-slate-500">Manage dynamic website products, multiple sizes, pricing maps, and stock states.</p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="inline-flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          <span>Add New Product</span>
        </button>
      </div>

      {/* Main Catalog Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            <p className="text-sm text-slate-500">Reading dynamic catalog...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-rose-500">
            Error loading catalog. Verify DB schema has been migrated.
          </div>
        ) : data?.data.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            No products in database. Click Add Product to seed.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase text-slate-500">
                  <th className="px-6 py-4 w-20">Preview</th>
                  <th className="px-6 py-4">Product Info</th>
                  <th className="px-6 py-4">Slug (SEO Route)</th>
                  <th className="px-6 py-4">Sizes & Price Tiers</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.data.map((product: any) => {
                  const defaultImg = product.images?.[0]?.image_url || "/placeholder.svg";
                  
                  return (
                    <tr key={product.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="relative h-12 w-12 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center">
                          <img src={defaultImg} alt={product.name} className="object-contain p-1 w-full h-full" />
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900">{product.name}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{product.flavor}</div>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {(product.tags || []).map((t: string) => (
                            <span key={t} className="text-[10px] bg-slate-100 border px-1.5 py-0.2 rounded font-medium text-slate-600">{t}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-600">{product.slug}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1.5">
                          {(product.sizes || []).map((s: any) => (
                            <span key={s.size} className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-semibold border ${
                              s.in_stock ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-rose-50 text-rose-700 border-rose-100 opacity-60"
                            }`}>
                              {s.size}: Rs. {s.price}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => handleOpenEdit(product)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded border border-blue-100 transition-colors"
                            title="Edit Product"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(product.id, product.name)}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded border border-rose-100 transition-colors"
                            title="Delete Product"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Slide-over Form Drawer Container */}
      {drawerOpen && (
        <div className="fixed inset-0 overflow-hidden z-50 flex justify-end">
          <div 
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity" 
            onClick={() => { if (!submitting && !uploading) setDrawerOpen(false); }}
          />

          <div className="relative w-full max-w-2xl bg-white shadow-xl flex flex-col h-full z-10 animate-slide-in">
            {/* Drawer Header */}
            <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-amber-100 text-amber-700 rounded-lg">
                  <Package size={20} />
                </div>
                <h3 className="font-bold text-slate-900 text-lg">
                  {form.id ? "Edit Catalog Product" : "Add New Product"}
                </h3>
              </div>
              <button 
                disabled={submitting}
                onClick={() => setDrawerOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>

            {/* Drawer Scrollable Content */}
            <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Product Info Block */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b pb-2 flex items-center gap-1.5">
                  <Layers size={14} /> Base Details
                </h4>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Product Name *</label>
                    <input
                      type="text"
                      required
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g. Pure Sugar-Free Smooth"
                      className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">SEO Route (Slug) *</label>
                    <input
                      type="text"
                      required
                      disabled={!!form.id} // Cannot alter slug once created to prevent broken canonical links
                      value={form.slug}
                      onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") })}
                      placeholder="e.g. pure-sugar-free-smooth"
                      className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500 disabled:bg-slate-50 disabled:cursor-not-allowed font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Flavor Profile *</label>
                    <input
                      type="text"
                      required
                      value={form.flavor}
                      onChange={(e) => setForm({ ...form, flavor: e.target.value })}
                      placeholder="e.g. 100% Pure Peanut"
                      className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Tags (Comma Separated)</label>
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagsInput(e.target.value)}
                      placeholder="e.g. Best Seller, Sugar-Free, Smooth"
                      className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Ingredients *</label>
                    <input
                      type="text"
                      required
                      value={form.ingredients}
                      onChange={(e) => setForm({ ...form, ingredients: e.target.value })}
                      placeholder="e.g. Roasted Peanuts Only"
                      className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Description *</label>
                    <textarea
                      required
                      rows={2}
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="Product details, taste notes..."
                      className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Recommended Usage *</label>
                    <input
                      type="text"
                      required
                      value={form.usage}
                      onChange={(e) => setForm({ ...form, usage: e.target.value })}
                      placeholder="e.g. Drizzle over fresh bananas, blend in shakes..."
                      className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>

              {/* Media Gallery Block */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b pb-2 flex items-center gap-1.5">
                  <Eye size={14} /> Main Media Gallery
                </h4>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Default YouTube Video ID</label>
                    <input
                      type="text"
                      value={form.default_youtube_id}
                      onChange={(e) => setForm({ ...form, default_youtube_id: e.target.value })}
                      placeholder="e.g. dQw4w9WgXcQ (11 characters)"
                      className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Upload Product Images</label>
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      ref={mainImageInputRef} 
                      onChange={(e) => handleFileUpload(e)}
                    />
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => mainImageInputRef.current?.click()}
                      className="w-full flex items-center justify-center space-x-2 border-2 border-dashed border-slate-300 hover:border-slate-400 text-slate-600 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
                    >
                      {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                      <span>{uploading ? "Uploading Image..." : "Choose Image File"}</span>
                    </button>
                  </div>
                </div>

                {/* Image Previews */}
                {form.images.length > 0 && (
                  <div className="flex flex-wrap gap-2.5 pt-2">
                    {form.images.map((url, idx) => (
                      <div key={idx} className="relative h-16 w-16 bg-slate-50 border rounded-lg overflow-hidden flex items-center justify-center group">
                        <img src={url} alt="Gallery Preview" className="object-contain p-1 w-full h-full" />
                        <button
                          type="button"
                          onClick={() => handleRemoveMainImage(idx)}
                          className="absolute inset-0 bg-red-600/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-lg"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Sizes and Price matrix block */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="flex justify-between items-center border-b pb-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Layers size={14} /> Size & Pricing Configurations
                  </h4>
                  <button
                    type="button"
                    onClick={handleAddSizeRow}
                    className="inline-flex items-center space-x-1 text-xs text-blue-600 hover:underline font-semibold"
                  >
                    <Plus size={12} />
                    <span>Add Size option</span>
                  </button>
                </div>

                <div className="space-y-4">
                  {form.sizes.map((s, idx) => (
                    <div key={idx} className="p-4 border border-slate-100 rounded-xl bg-slate-50/50 space-y-3 relative group">
                      
                      <button
                        type="button"
                        onClick={() => handleRemoveSizeRow(idx)}
                        className="absolute top-4 right-4 text-slate-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove Size"
                      >
                        <Trash2 size={16} />
                      </button>

                      <div className="grid grid-cols-4 gap-3 items-end pr-8">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase">Size Name *</label>
                          <input
                            type="text"
                            required
                            value={s.size}
                            onChange={(e) => handleSizeFieldChange(idx, "size", e.target.value)}
                            placeholder="e.g. 340g"
                            className="mt-1 w-full text-xs border rounded px-2.5 py-1.5 outline-none bg-white focus:border-amber-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase">Price (Rs) *</label>
                          <input
                            type="number"
                            required
                            min={0}
                            value={s.price}
                            onChange={(e) => handleSizeFieldChange(idx, "price", Number(e.target.value))}
                            placeholder="e.g. 1050"
                            className="mt-1 w-full text-xs border rounded px-2.5 py-1.5 outline-none bg-white focus:border-amber-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase">YouTube Override</label>
                          <input
                            type="text"
                            value={s.size_youtube_id || ""}
                            onChange={(e) => handleSizeFieldChange(idx, "size_youtube_id", e.target.value)}
                            placeholder="e.g. Video ID"
                            className="mt-1 w-full text-xs border rounded px-2.5 py-1.5 outline-none bg-white focus:border-amber-500 font-mono"
                          />
                        </div>
                        <div>
                          <button
                            type="button"
                            onClick={() => handleSizeFieldChange(idx, "in_stock", !s.in_stock)}
                            className={`flex items-center space-x-1.5 text-xs font-semibold py-1.5 px-3 border rounded ${
                              s.in_stock ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-rose-50 text-rose-700 border-rose-100"
                            }`}
                          >
                            {s.in_stock ? <CheckSquare size={14} /> : <Square size={14} />}
                            <span>{s.in_stock ? "In Stock" : "No Stock"}</span>
                          </button>
                        </div>
                      </div>

                      {/* Size Specific Images Overrides */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase">Size Image Overrides (Optional)</label>
                          <input 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            ref={(el) => { sizeImageInputRefs.current[idx] = el; }} 
                            onChange={(e) => handleFileUpload(e, idx)}
                          />
                          <button
                            type="button"
                            disabled={uploading}
                            onClick={() => sizeImageInputRefs.current[idx]?.click()}
                            className="inline-flex items-center space-x-1 text-[10px] font-bold text-blue-600 hover:underline"
                          >
                            <Upload size={10} />
                            <span>Upload size image</span>
                          </button>
                        </div>

                        {s.size_images && s.size_images.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {s.size_images.map((url, imgIdx) => (
                              <div key={imgIdx} className="relative h-12 w-12 bg-white border rounded overflow-hidden flex items-center justify-center group/img">
                                <img src={url} alt="Size Override Preview" className="object-contain p-1 w-full h-full" />
                                <button
                                  type="button"
                                  onClick={() => handleRemoveSizeImage(idx, imgIdx)}
                                  className="absolute inset-0 bg-red-600/80 text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity rounded"
                                >
                                  <Trash2 size={10} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                    </div>
                  ))}
                </div>
              </div>

            </form>

            {/* Drawer Controls footer */}
            <div className="p-6 border-t border-slate-200 flex justify-end space-x-3 bg-slate-50">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setDrawerOpen(false)}
                className="px-4 py-2 text-sm font-semibold bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                onClick={handleFormSubmit}
                disabled={submitting || uploading}
                className="inline-flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                <span>{submitting ? "Saving..." : "Save Product"}</span>
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}