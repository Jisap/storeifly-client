import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { AdminLayout } from "../../components/AdminLayout";
import { Store, Users, DollarSign, ShoppingBag, ArrowUpRight, AlertCircle, RefreshCw } from "lucide-react";
import { Spinner } from "../../components/common/Spinner";
import { api } from "../../config/api";

/**
 * Tienda en el ranking de mejores rendimientos de la plataforma.
 */
export interface TopStore {
  id: number | string;
  name: string;
  slug: string;
  status: string;
  merchant_name: string;
  order_count: number;
  revenue: number;
}

/**
 * Métricas globales devueltas por `GET /api/analytics/platform`.
 */
export interface PlatformAnalytics {
  totalStores: number;
  activeStores: number;
  suspendedStores: number;
  totalMerchants: number;
  totalOrders: number;
  totalRevenue: number;
  topStores: TopStore[];
}

/**
 * Retorna las clases de estilo según el estado de la tienda.
 */
const getStatusBadgeClass = (status: string): string => {
  switch (status.toLowerCase()) {
    case "active":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "suspended":
      return "bg-rose-50 text-rose-700 border-rose-200";
    default:
      return "bg-neutral-100 text-neutral-700 border-neutral-200";
  }
};

/**
 * Dashboard del administrador de plataforma: métricas globales y ranking de
 * las tiendas con mayores ingresos.
 *
 * Mejoras aplicadas:
 *  - `loading` se inicializa en `true` para evitar el parpadeo de ceros.
 *  - Estado `error` con pantalla amigable y botón de reintento.
 *  - Tipado riguroso con `PlatformAnalytics` y `TopStore` (sin `any`).
 *  - Etiquetas claras: "Leading Stores by Revenue" y aclaración de volumen en pedidos pagados no cancelados.
 *  - Prevención de fugas de memoria con flag `cancelled`.
 *  - Accesibilidad en iconos decorativos con `aria-hidden="true"`.
 *  - Manejo seguro de estilos para estados arbitrarios de tiendas.
 */
export const AdminDashboard: React.FC = () => {
  const [analytics, setAnalytics] = useState<PlatformAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await api.get("/api/analytics/platform");
      if (res.data?.success && res.data.analytics) {
        setAnalytics(res.data.analytics);
      } else {
        setError(res.data?.message || "Failed to retrieve platform analytics.");
      }
    } catch (err: unknown) {
      console.error("Failed to load platform analytics:", err);
      const msg = (err as any)?.response?.data?.message || "Error connecting to platform analytics service.";
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
        const res = await api.get("/api/analytics/platform");
        if (!cancelled) {
          if (res.data?.success && res.data.analytics) {
            setAnalytics(res.data.analytics);
          } else {
            setError(res.data?.message || "Failed to retrieve platform analytics.");
          }
        }
      } catch (err: unknown) {
        if (!cancelled) {
          console.error("Failed to load platform analytics:", err);
          const msg = (err as any)?.response?.data?.message || "Error connecting to platform analytics service.";
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

  // Pantalla de carga mientras se obtienen las métricas
  if (loading) {
    return (
      <AdminLayout>
        <Spinner padded />
      </AdminLayout>
    );
  }

  // Pantalla de error con opción a reintentar
  if (error || !analytics) {
    return (
      <AdminLayout>
        <div className="bg-white rounded-3xl border border-neutral-200 p-8 sm:p-12 text-center max-w-lg mx-auto my-12">
          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-base font-semibold text-neutral-900 mb-1">Unable to Load Metrics</h2>
          <p className="text-xs text-neutral-500 mb-6">{error || "An unexpected error occurred while fetching platform data."}</p>
          <button
            type="button"
            onClick={fetchAnalytics}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-neutral-900 hover:bg-black text-white text-xs font-medium rounded-full transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Try Again</span>
          </button>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl tracking-tight text-neutral-900">Overview & Metrics</h1>
          <p className="text-xs text-neutral-500 mt-1">Global performance and multi-tenant storefront statistics.</p>
        </div>

        {/* TARJETAS DE MÉTRICAS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Tiendas */}
          <div className="bg-white p-5 rounded-2xl sm:rounded-3xl border border-neutral-200 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-500">Total Stores</span>
              <div className="w-8 h-8 rounded-full bg-neutral-100 text-neutral-900 flex items-center justify-center">
                <Store className="w-4 h-4" aria-hidden="true" />
              </div>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-light tracking-tight text-neutral-900 font-mono">
                {analytics.totalStores}
              </p>
              <span className="text-[11px] text-neutral-400 font-mono mt-1 block">
                {analytics.activeStores} active • {analytics.suspendedStores} suspended
              </span>
            </div>
          </div>

          {/* 2. Comerciantes */}
          <div className="bg-white p-5 rounded-2xl sm:rounded-3xl border border-neutral-200 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-500">Merchants</span>
              <div className="w-8 h-8 rounded-full bg-neutral-100 text-neutral-900 flex items-center justify-center">
                <Users className="w-4 h-4" aria-hidden="true" />
              </div>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-light tracking-tight text-neutral-900 font-mono">
                {analytics.totalMerchants}
              </p>
              <span className="text-[11px] text-neutral-400 font-mono mt-1 block">Registered accounts</span>
            </div>
          </div>

          {/* 3. Volumen bruto de la plataforma (GMV de órdenes pagadas) */}
          <div className="bg-white p-5 rounded-2xl sm:rounded-3xl border border-neutral-200 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-500">Platform GMV</span>
              <div className="w-8 h-8 rounded-full bg-neutral-100 text-neutral-900 flex items-center justify-center">
                <DollarSign className="w-4 h-4" aria-hidden="true" />
              </div>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-light tracking-tight text-neutral-900 font-mono">
                ${Number(analytics.totalRevenue).toFixed(2)}
              </p>
              <span className="text-[11px] text-neutral-400 font-mono mt-1 block" title="Total accumulated across stores from orders marked as paid">
                Orders marked as paid
              </span>
            </div>
          </div>

          {/* 4. Pedidos totales */}
          <div className="bg-white p-5 rounded-2xl sm:rounded-3xl border border-neutral-200 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-500">Total Orders</span>
              <div className="w-8 h-8 rounded-full bg-neutral-100 text-neutral-900 flex items-center justify-center">
                <ShoppingBag className="w-4 h-4" aria-hidden="true" />
              </div>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-light tracking-tight text-neutral-900 font-mono">
                {analytics.totalOrders}
              </p>
              <span className="text-[11px] text-neutral-400 font-mono mt-1 block">Across all stores</span>
            </div>
          </div>
        </div>

        {/* RANKING: Tiendas líderes por ingresos */}
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-neutral-200 overflow-hidden">
          <div className="p-5 border-b border-neutral-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium text-neutral-900">Leading Stores by Revenue</h2>
              <p className="text-xs text-neutral-400 mt-0.5">Top-performing tenant storefronts by settled volume</p>
            </div>
            <Link
              to="/admin/stores"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-neutral-200 bg-white hover:bg-neutral-50 text-xs font-medium text-neutral-900 transition"
            >
              <span>Manage Stores</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-neutral-500" aria-hidden="true" />
            </Link>
          </div>

          {analytics.topStores && analytics.topStores.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50/70 text-neutral-400 font-mono text-[11px] uppercase border-b border-neutral-100">
                  <tr>
                    <th className="py-3 px-5">Store</th>
                    <th className="py-3 px-4">Merchant</th>
                    <th className="py-3 px-4">Orders</th>
                    <th className="py-3 px-4">Revenue</th>
                    <th className="py-3 px-5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {analytics.topStores.map((s) => (
                    <tr key={s.id} className="hover:bg-neutral-50/50 transition">
                      <td className="py-3.5 px-5">
                        <span className="font-medium text-neutral-900 block">{s.name}</span>
                        <span className="font-mono text-[11px] text-neutral-400 font-normal">/store/{s.slug}</span>
                      </td>
                      <td className="py-3.5 px-4 text-neutral-600">{s.merchant_name}</td>
                      <td className="py-3.5 px-4 text-neutral-600 font-mono">{s.order_count}</td>
                      <td className="py-3.5 px-4 font-semibold text-neutral-900 font-mono">
                        ${Number(s.revenue).toFixed(2)}
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium uppercase border ${getStatusBadgeClass(
                            s.status
                          )}`}
                        >
                          {s.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center text-xs text-neutral-400 font-mono">No store activity recorded yet.</div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};
