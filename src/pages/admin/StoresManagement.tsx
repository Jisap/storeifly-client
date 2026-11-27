import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { AdminLayout } from "../../components/AdminLayout";
import { ExternalLink, Search, Store as StoreIcon, AlertCircle, RefreshCw } from "lucide-react";
import { Spinner } from "../../components/common/Spinner";
import toast from "react-hot-toast";
import { api } from "../../config/api";

/**
 * Estructura de tienda para la gestión administrativa.
 */
export interface AdminStore {
  id: number;
  merchant_id?: string | null;
  name: string;
  slug: string;
  logo_url?: string | null;
  banner_url?: string | null;
  description?: string | null;
  status: string;
  currency?: string | null;
  merchant?: { id: string; name: string; email: string } | null;
  merchant_name?: string | null;
  merchant_email?: string | null;
  product_count?: number;
  order_count?: number;
  total_revenue?: number | string;
  _count?: { products: number; orders: number; categories: number };
}

/**
 * Formatea importes monetarios respetando la divisa de la tienda.
 */
const formatPrice = (amount: number | string, curr: string = "USD"): string => {
  const num = Number(amount) || 0;
  const symbols: Record<string, string> = {
    USD: "$",
    EUR: "€",
    GBP: "£",
    GHS: "GH₵",
    NGN: "₦",
  };
  const sym = symbols[curr.toUpperCase()] || `${curr.toUpperCase()} `;
  return `${sym}${num.toFixed(2)}`;
};

/**
 * Página de Administración de Tiendas (Stores Management).
 * Permite a los administradores visualizar el listado de tiendas, buscar por diversos criterios,
 * revisar métricas clave (productos, órdenes, ingresos) y activar o suspender tiendas.
 *
 * Mejoras aplicadas:
 *  - `loading` se inicializa en `true` para evitar el parpadeo de lista vacía.
 *  - Estado `error` con aviso visual amigable y botón de reintento.
 *  - Corrección de la ruta del patch a `/api/stores/:id/toggle-status`.
 *  - Actualización local segura (`{ ...s, ...res.data.store }`) sin destruir datos de comerciante ni métricas.
 *  - Soporte para propiedades del comerciante anidadas (`s.merchant?.name`) y planas (`s.merchant_name`).
 *  - Fallback visual para tiendas sin logo (muestra inicial o ícono).
 *  - Formato dinámico de ingresos según `s.currency`.
 *  - Tipado riguroso con `AdminStore`.
 */
export const StoresManagement: React.FC = () => {
  const [stores, setStores] = useState<AdminStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchStores = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/api/stores/admin/all");
      if (res.data?.success && Array.isArray(res.data.stores)) {
        setStores(res.data.stores);
      } else {
        setError(res.data?.message || "Failed to load stores.");
      }
    } catch (err: unknown) {
      console.error("Failed to fetch stores:", err);
      const msg = (err as any)?.response?.data?.message || "Failed to connect to stores service.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get("/api/stores/admin/all");
        if (!cancelled) {
          if (res.data?.success && Array.isArray(res.data.stores)) {
            setStores(res.data.stores);
          } else {
            setError(res.data?.message || "Failed to load stores.");
          }
        }
      } catch (err: unknown) {
        if (!cancelled) {
          console.error("Failed to fetch stores:", err);
          const msg = (err as any)?.response?.data?.message || "Failed to connect to stores service.";
          setError(msg);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Alterna el estado de la tienda (activo/suspendido).
   */
  const handleToggleStatus = async (storeId: number, currentStatus: string) => {
    const isActivating = currentStatus !== "active";
    const actionWord = isActivating ? "activate" : "suspend";

    if (!window.confirm(`Are you sure you want to ${actionWord} this store?`)) return;

    try {
      const res = await api.patch(`/api/stores/${storeId}/toggle-status`);
      if (res.data?.success) {
        toast.success(res.data.message || `Store ${actionWord}d successfully`);
        // Actualización local preservando los datos relacionados (merchant y métricas)
        setStores((prev) =>
          prev.map((s) => (s.id === storeId ? { ...s, ...res.data.store, status: res.data.store.status } : s))
        );
      }
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.message || "Action failed";
      toast.error(msg);
    }
  };

  // Filtrado en el cliente
  const q = search.toLowerCase().trim();
  const filtered = stores.filter((s) => {
    const merchantName = s.merchant_name || s.merchant?.name || "";
    const merchantEmail = s.merchant_email || s.merchant?.email || "";
    return (
      s.name.toLowerCase().includes(q) ||
      s.slug.toLowerCase().includes(q) ||
      merchantName.toLowerCase().includes(q) ||
      merchantEmail.toLowerCase().includes(q)
    );
  });

  const statusClass = (active: boolean, variant: "badge" | "btn") =>
    variant === "badge"
      ? active
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : "bg-rose-50 text-rose-700 border-rose-200"
      : active
        ? "bg-white text-rose-600 border-neutral-200 hover:bg-rose-50 hover:border-rose-200"
        : "bg-black text-white border-black hover:bg-neutral-800";

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl tracking-tight text-neutral-900">Stores Management</h1>
          <p className="text-xs text-neutral-500 mt-1">Review, monitor, and regulate platform storefronts.</p>
        </div>

        {/* BARRA DE BÚSQUEDA Y CONTADOR */}
        <div className="bg-white p-3.5 rounded-2xl border border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              type="text"
              placeholder="Filter by store, slug, or merchant..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-full focus:outline-none focus:border-black transition"
            />
          </div>
          <span className="text-xs text-neutral-400 font-mono px-2">{filtered.length} stores</span>
        </div>

        {/* TABLA DE TIENDAS */}
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-neutral-200 overflow-hidden shadow-xs">
          {loading ? (
            <Spinner padded />
          ) : error ? (
            <div className="p-12 text-center">
              <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3">
                <AlertCircle className="w-5 h-5" />
              </div>
              <p className="text-xs text-neutral-600 mb-4">{error}</p>
              <button
                type="button"
                onClick={fetchStores}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-neutral-900 hover:bg-black text-white text-xs font-medium rounded-full transition cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Try Again</span>
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <p className="p-16 text-center text-xs text-neutral-400 font-mono">No stores found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50/70 text-neutral-400 font-mono text-[11px] uppercase border-b border-neutral-100">
                  <tr>
                    {["Store", "Merchant", "Products", "Orders", "Revenue", "Status", "Actions"].map((h, i) => (
                      <th key={h} className={`py-3 ${i === 6 ? "px-5 text-right" : "px-4"}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {filtered.map((s) => {
                    const merchantName = s.merchant_name || s.merchant?.name || "Unassigned";
                    const merchantEmail = s.merchant_email || s.merchant?.email || "";
                    const productCount = s.product_count ?? s._count?.products ?? 0;
                    const orderCount = s.order_count ?? s._count?.orders ?? 0;
                    const revenue = Number(s.total_revenue || 0);
                    const currency = s.currency || "USD";

                    return (
                      <tr key={s.id} className="hover:bg-neutral-50/50 transition">
                        {/* Tienda: Logo, Nombre y Slug */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-neutral-100 border border-neutral-200 shrink-0 flex items-center justify-center font-mono font-medium text-neutral-600 text-[11px] overflow-hidden">
                              {s.logo_url ? (
                                <img src={s.logo_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                s.name.charAt(0).toUpperCase() || <StoreIcon className="w-3.5 h-3.5 text-neutral-400" />
                              )}
                            </div>
                            <div>
                              <span className="font-medium text-neutral-900 block">{s.name}</span>
                              <Link
                                to={`/store/${s.slug}`}
                                target="_blank"
                                className="text-[11px] font-mono text-neutral-400 hover:text-neutral-900 hover:underline inline-flex items-center gap-1"
                              >
                                /store/{s.slug} <ExternalLink className="w-2.5 h-2.5" />
                              </Link>
                            </div>
                          </div>
                        </td>

                        {/* Comerciante */}
                        <td className="py-3.5 px-4">
                          <span className="text-neutral-900 font-medium block">{merchantName}</span>
                          {merchantEmail && (
                            <span className="text-[11px] text-neutral-400 font-mono">{merchantEmail}</span>
                          )}
                        </td>

                        {/* Métricas */}
                        <td className="py-3.5 px-4 text-neutral-600 font-mono">{productCount}</td>
                        <td className="py-3.5 px-4 text-neutral-600 font-mono">{orderCount}</td>
                        <td className="py-3.5 px-4 font-semibold text-neutral-900 font-mono">
                          {formatPrice(revenue, currency)}
                        </td>

                        {/* Estado */}
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium uppercase border ${statusClass(
                              s.status === "active",
                              "badge"
                            )}`}
                          >
                            {s.status}
                          </span>
                        </td>

                        {/* Acciones */}
                        <td className="py-3.5 px-5 text-right">
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(s.id, s.status)}
                            className={`px-3 py-1 text-xs font-medium rounded-full transition border cursor-pointer ${statusClass(
                              s.status === "active",
                              "btn"
                            )}`}
                          >
                            {s.status === "active" ? "Suspend" : "Activate"}
                          </button>
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
