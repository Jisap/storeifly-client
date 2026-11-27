import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AdminLayout } from "../../components/AdminLayout";
import { Store, Users, DollarSign, ShoppingBag, ArrowUpRight } from "lucide-react";
import { Spinner } from "../../components/common/Spinner";
import { api } from "../../config/api";

/**
 * Dashboard del administrador de plataforma: métricas globales y ranking de
 * las tiendas con más ingresos.
 *
 * Es el cliente de `getPlatformAnalytics` (backend): `GET /api/analytics/platform`
 * devuelve `{ success, analytics }` con totalStores, activeStores,
 * suspendedStores, totalMerchants, totalOrders, totalRevenue y topStores
 * (cada una con id, name, slug, status, merchant_name, order_count, revenue).
 *
 * Es el equivalente "global" de `MerchantDashboard` y tiene los mismos
 * patrones (y los mismos fallos, ver notas). Se renderiza dentro de
 * `AdminLayout`. La página no comprueba el rol: la protección real la hace el
 * backend (`requireAuth` + `requireRole(["admin"])`) y la ruta protegida del
 * router del cliente.
 */
export const AdminDashboard: React.FC = () => {
  // Respuesta del backend, o `null` mientras no llega. Tipado `any` (ver notas).
  const [analytics, setAnalytics] = useState<any>(null);
  // OJO: empieza en `false` (ver notas, es el fallo más importante).
  const [loading, setLoading] = useState(false);

  // Carga las métricas una sola vez al montar la página.
  useEffect(() => {
    api.get("/api/analytics/platform").then((res) => {
      if (res.data?.success) {
        setAnalytics(res.data.analytics);
      }
      // Los errores solo van a consola; la UI muestra ceros (ver notas).
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  // Pantalla de carga. Con `loading` iniciado en `false`, esto nunca se ve.
  if (loading) {
    return (
      <AdminLayout>
        <Spinner padded />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <h1 className="text-2xl sm:text-3xl tracking-tight text-neutral-900 mt-10">Overview & Metrics</h1>

        {/* TARJETAS DE MÉTRICAS. Mientras `analytics` es null se muestran ceros. */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Tiendas: total, activas y suspendidas. */}
          <div className="bg-white p-5 rounded-2xl sm:rounded-3xl border border-neutral-200 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-500">Total Stores</span>
              <div className="w-8 h-8 rounded-full bg-neutral-100 text-neutral-900 flex items-center justify-center">
                <Store className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-light tracking-tight text-neutral-900 font-mono">
                {analytics ? analytics.totalStores : 0}
              </p>
              <span className="text-[11px] text-neutral-400 font-mono mt-1 block">
                {analytics ? analytics.activeStores : 0} active • {analytics ? analytics.suspendedStores : 0} suspended
              </span>
            </div>
          </div>

          {/* 2. Comerciantes: usuarios con rol "merchant" (de Neon Auth,
                        incluye los que aún no han creado tienda). */}
          <div className="bg-white p-5 rounded-2xl sm:rounded-3xl border border-neutral-200 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-500">Merchants</span>
              <div className="w-8 h-8 rounded-full bg-neutral-100 text-neutral-900 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-light tracking-tight text-neutral-900 font-mono">
                {analytics ? analytics.totalMerchants : 0}
              </p>
              <span className="text-[11px] text-neutral-400 font-mono mt-1 block">Registered creators</span>
            </div>
          </div>

          {/* 3. GMV: suma de pedidos con payment_status "paid" de toda la
                        plataforma. El "$" es fijo (ver notas). */}
          <div className="bg-white p-5 rounded-2xl sm:rounded-3xl border border-neutral-200 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-500">Platform GMV</span>
              <div className="w-8 h-8 rounded-full bg-neutral-100 text-neutral-900 flex items-center justify-center">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-light tracking-tight text-neutral-900 font-mono">
                ${analytics ? Number(analytics.totalRevenue).toFixed(2) : "0.00"}
              </p>
              <span className="text-[11px] text-neutral-400 font-mono mt-1 block">Settled transactions</span>
            </div>
          </div>

          {/* 4. Pedidos totales de todas las tiendas, de cualquier estado. */}
          <div className="bg-white p-5 rounded-2xl sm:rounded-3xl border border-neutral-200 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-500">Total Orders</span>
              <div className="w-8 h-8 rounded-full bg-neutral-100 text-neutral-900 flex items-center justify-center">
                <ShoppingBag className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-light tracking-tight text-neutral-900 font-mono">
                {analytics ? analytics.totalOrders : 0}
              </p>
              <span className="text-[11px] text-neutral-400 font-mono mt-1 block">Across all stores</span>
            </div>
          </div>
        </div>

        {/* RANKING: las 5 tiendas con más ingresos (calculado en el backend). */}
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-neutral-200 overflow-hidden">
          <div className="p-5 border-b border-neutral-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium text-neutral-900">Leading Stores by Volume</h2>
              <p className="text-xs text-neutral-400 mt-0.5">Top-performing tenant storefronts</p>
            </div>
            {/* Lleva a la gestión de tiendas (suspender/activar: `toggleStoreStatus`). */}
            <Link
              to="/admin/stores"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-neutral-200 bg-white hover:bg-neutral-50 text-xs font-medium text-neutral-900 transition"
            >
              <span>Manage Stores</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-neutral-500" />
            </Link>
          </div>

          {analytics && analytics.topStores && analytics.topStores.length > 0 ? (
            // `overflow-x-auto`: la tabla se desplaza en horizontal en móvil.
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
                  {analytics.topStores.map((s: any) => (
                    <tr key={s.id} className="hover:bg-neutral-50/50 transition">
                      <td className="py-3.5 px-5">
                        <span className="font-medium text-neutral-900 block">{s.name}</span>
                        <span className="font-mono text-[11px] text-neutral-400 font-normal">/store/{s.slug}</span>
                      </td>
                      <td className="py-3.5 px-4 text-neutral-600">{s.merchant_name}</td>
                      <td className="py-3.5 px-4 text-neutral-600 font-mono">{s.order_count}</td>
                      {/* `revenue` ya llega como número (el backend lo suma con Number). */}
                      <td className="py-3.5 px-4 font-semibold text-neutral-900 font-mono">
                        ${Number(s.revenue).toFixed(2)}
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        {/* Verde si "active"; rojo para cualquier otro valor (p. ej. "suspended"). */}
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium uppercase border ${s.status === "active"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-rose-50 text-rose-700 border-rose-200"
                            }`}
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