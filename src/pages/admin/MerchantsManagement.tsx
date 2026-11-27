import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { AdminLayout } from "../../components/AdminLayout";
import { Search, ExternalLink, RefreshCw } from "lucide-react";
import { Spinner } from "../../components/common/Spinner";
import { api } from "../../config/api";

export interface AdminMerchant {
    id: string;
    name: string;
    email: string;
    role?: string;
    created_at?: string;
    createdAt?: string;
    store_id: number | null;
    store_name: string | null;
    store_slug: string | null;
    store_status: string | null;
}

export const MerchantsManagement: React.FC = () => {
    const [merchants, setMerchants] = useState<AdminMerchant[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");

    const fetchMerchants = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get("/api/stores/admin/merchants");
            if (res.data?.success && Array.isArray(res.data.merchants)) {
                setMerchants(res.data.merchants);
            } else {
                setMerchants([]);
            }
        } catch (err: any) {
            console.error("Failed to fetch merchants:", err);
            setError(err.response?.data?.message || "Failed to load merchants directory");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchMerchants();
    }, [fetchMerchants]);

    const q = search.trim().toLowerCase();
    const filtered = merchants.filter(
        (m) =>
            m.name?.toLowerCase().includes(q) ||
            m.email?.toLowerCase().includes(q) ||
            m.store_name?.toLowerCase().includes(q) ||
            m.store_slug?.toLowerCase().includes(q)
    );

    return (
        <AdminLayout>
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl sm:text-3xl tracking-tight text-neutral-900">Merchants Directory</h1>
                        <p className="text-xs text-neutral-500 mt-1">Platform-wide overview of all registered merchants and their stores.</p>
                    </div>
                    {error && (
                        <button
                            onClick={() => void fetchMerchants()}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition"
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Retry
                        </button>
                    )}
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                        <input
                            type="text"
                            placeholder="Filter by name, email, or store..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-full focus:outline-none focus:border-black transition"
                        />
                    </div>
                    <span className="text-xs text-neutral-400 font-mono px-2">{filtered.length} merchants</span>
                </div>

                <div className="bg-white rounded-2xl sm:rounded-3xl border border-neutral-200 overflow-hidden">
                    {loading ? (
                        <Spinner padded />
                    ) : error ? (
                        <div className="p-12 text-center space-y-3">
                            <p className="text-xs text-rose-600 font-mono">{error}</p>
                            <button
                                onClick={() => void fetchMerchants()}
                                className="px-4 py-1.5 bg-neutral-900 text-white text-xs font-medium rounded-full hover:bg-black transition cursor-pointer"
                            >
                                Try Again
                            </button>
                        </div>
                    ) : filtered.length === 0 ? (
                        <p className="p-16 text-center text-xs text-neutral-400 font-mono">No merchants found.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-neutral-50/70 text-neutral-400 font-mono text-[11px] uppercase border-b border-neutral-100">
                                    <tr>
                                        {["Merchant", "Email", "Store", "Status", "Joined"].map((h, i) => (
                                            <th key={h} className={`py-3 ${i === 4 ? "px-5 text-right" : "px-4"}`}>
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-100">
                                    {filtered.map((m) => {
                                        const rawDate = m.created_at || m.createdAt;
                                        const formattedDate = rawDate ? new Date(rawDate).toLocaleDateString() : "—";

                                        return (
                                            <tr key={m.id} className="hover:bg-neutral-50/50 transition">
                                                <td className="py-3.5 px-4 font-medium text-neutral-900">{m.name || "Unnamed"}</td>
                                                <td className="py-3.5 px-4 text-neutral-500 font-mono text-[11px]">{m.email}</td>
                                                <td className="py-3.5 px-4">
                                                    {m.store_name ? (
                                                        <Link
                                                            to={`/store/${m.store_slug}`}
                                                            target="_blank"
                                                            className="inline-flex items-center gap-1.5 text-neutral-900 hover:underline font-medium"
                                                        >
                                                            {m.store_name} <ExternalLink className="w-3 h-3 text-neutral-400" aria-hidden="true" />
                                                        </Link>
                                                    ) : (
                                                        <span className="text-neutral-400 font-mono text-[11px]">Pending Setup</span>
                                                    )}
                                                </td>
                                                <td className="py-3.5 px-4">
                                                    {m.store_status ? (
                                                        <span
                                                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium uppercase border ${m.store_status === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200"}`}
                                                        >
                                                            {m.store_status}
                                                        </span>
                                                    ) : (
                                                        <span className="text-neutral-400 font-mono">—</span>
                                                    )}
                                                </td>
                                                <td className="py-3.5 px-5 text-right text-neutral-400 font-mono text-[11px]">
                                                    {formattedDate}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </AdminLayout>
    );
};
