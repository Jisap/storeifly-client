import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { MerchantLayout } from "../../components/MerchantLayout";
import { DollarSign, ShoppingBag, TrendingUp, Package, AlertTriangle, ExternalLink, ArrowUpRight, Plus } from "lucide-react";
import { Spinner } from "../../components/common/Spinner";
import { api } from "../../config/api";

/**
 * Dashboard del comerciante: resumen de su tienda con métricas y pedidos recientes.
 *
 * Es el cliente de `getMerchantAnalytics` (backend). La llamada es
 * `GET /api/analytics/merchant` y devuelve `{ success, analytics }` con:
 * totalRevenue, totalOrders, avgOrderValue, pendingOrders, deliveredOrders,
 * totalProducts, lowStockCount y recentOrders.
 *
 * Qué muestra:
 *  1. Cabecera con accesos rápidos ("Add Product", "View Storefront").
 *  2. Cuatro tarjetas de métricas.
 *  3. Tabla de pedidos recientes.
 *
 * Se renderiza dentro de `MerchantLayout` (navegación lateral del panel). Esta
 * página no comprueba el rol: la protección debe hacerla una ruta protegida
 * en el router del cliente, y la real la hace el backend (`requireAuth` +
 * `requireRole`).
 */
export const MerchantDashboard: React.FC = () => {
  // `store` solo se usa para mostrar los botones de la cabecera.
  const { store } = useAuth();
  // Respuesta del backend, o `null` mientras no llega. Tipado `any` (ver notas).
  const [analytics, setAnalytics] = useState<any>(null);
  // OJO: empieza en `false` (ver notas, es el fallo más importante).
  const [loading, setLoading] = useState(false);

  // Carga las métricas una sola vez al montar la página.
  useEffect(() => {
    api.get("/api/analytics/merchant").then((res) => {
      if (res.data?.success) {
        setAnalytics(res.data.analytics);
      }
      // Los errores solo van a consola; la UI muestra ceros (ver notas).
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  // Pantalla de carga. Con `loading` iniciado en `false`, esto nunca se ve.
  if (loading) {
    return (
      <MerchantLayout>
        <Spinner padded />
      </MerchantLayout>
    );
  }

  return (
    <MerchantLayout>
      <div className="space-y-7">
        {/* CABECERA. Los botones solo aparecen si hay tienda cargada. */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h1 className="text-xl sm:text-2xl text-neutral-900 mt-10">Merchant Dashboard</h1>

          {store && (
            <div className="flex items-center gap-2.5">
              {/* Lleva a la gestión de productos (no abre un formulario directamente). */}
              <Link
                to="/merchant/products"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-full transition cursor-pointer shadow-xs shadow-emerald-700/20"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Product</span>
              </Link>
              {/* Abre la tienda pública en otra pestaña. */}
              <Link
                to={`/store/${store.slug}`}
                target="_blank"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-neutral-50 border border-neutral-200 text-neutral-700 text-xs font-medium rounded-full transition"
              >
                <span>View Storefront</span>
                <ExternalLink className="w-3.5 h-3.5 text-neutral-400" />
              </Link>
            </div>
          )}
        </div>

        {/* TARJETAS DE MÉTRICAS. Mientras `analytics` es null se muestran ceros. */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Ventas totales: suma de pedidos con payment_status "paid". */}
          <div className="bg-white p-5 rounded-3xl border border-neutral-200/80">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">Total Sales</span>
              <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-700">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            {/* El símbolo "$" es fijo, aunque la tienda use otra moneda. */}
            <p className="text-2xl font-semibold font-mono text-neutral-900 mt-2">
              ${analytics ? Number(analytics.totalRevenue).toFixed(2) : "0.00"}
            </p>
            <span className="text-[10px] text-neutral-400 mt-1 block">From paid transactions</span>
          </div>

          {/* 2. Pedidos totales + los que esperan gestión (pendingOrders = estado "placed"). */}
          <div className="bg-white p-5 rounded-3xl border border-neutral-200/80">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">Total Orders</span>
              <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-700">
                <ShoppingBag className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-semibold font-mono text-neutral-900 mt-2">{analytics ? analytics.totalOrders : 0}</p>
            <span className="text-[10px] text-amber-600 mt-1 block font-medium">
              {analytics ? analytics.pendingOrders : 0} awaiting fulfillment
            </span>
          </div>

          {/* 3. Valor medio de los pedidos pagados. */}
          <div className="bg-white p-5 rounded-3xl border border-neutral-200/80">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">Avg Order</span>
              <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-700">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-semibold font-mono text-neutral-900 mt-2">
              ${analytics ? Number(analytics?.avgOrderValue || 0).toFixed(2) : "0.00"}
            </p>
            <span className="text-[10px] text-neutral-400 mt-1 block">Per checkout order</span>
          </div>

          {/* 4. Productos y aviso de stock bajo (stock <= 5). */}
          <div className="bg-white p-5 rounded-3xl border border-neutral-200/80">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">Products</span>
              <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-700">
                <Package className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-semibold font-mono text-neutral-900 mt-2">{analytics ? analytics.totalProducts : 0}</p>
            <span className="text-[10px] text-neutral-500 mt-1 block">
              {analytics && analytics.lowStockCount > 0 ? (
                <span className="text-rose-600 font-medium flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {analytics.lowStockCount} low stock
                </span>
              ) : (
                "Inventory healthy"
              )}
            </span>
          </div>
        </div>

        {/* PEDIDOS RECIENTES. */}
        <div className="bg-white rounded-3xl border border-neutral-200/80 overflow-hidden">
          <div className="p-5 sm:p-6 border-b border-neutral-100 flex items-center justify-between">
            <h2 className="font-medium text-neutral-900">Recent Orders</h2>
            <Link
              to="/merchant/orders"
              className="text-xs font-medium text-neutral-700 hover:text-black flex items-center gap-1 transition"
            >
              <span>View All</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {analytics && analytics.recentOrders && analytics.recentOrders.length > 0 ? (
            // `overflow-x-auto`: la tabla se desplaza en horizontal en móvil.
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50/70 text-neutral-400 font-medium border-b border-neutral-100">
                  <tr>
                    <th className="p-3.5 pl-6">Order</th>
                    <th className="p-3.5">Customer</th>
                    <th className="p-3.5">Total</th>
                    <th className="p-3.5">Payment</th>
                    <th className="p-3.5">Fulfillment</th>
                    <th className="p-3.5 pr-6 text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {analytics.recentOrders.map((o: any) => (
                    <tr key={o.id} className="hover:bg-neutral-50/50 transition">
                      <td className="p-3.5 pl-6 font-mono font-medium text-neutral-900">{o.order_number}</td>
                      <td className="p-3.5 text-neutral-700">{o.customer_name}</td>
                      {/* `total` llega como string ("25.00") por ser Decimal; `Number()` lo convierte. */}
                      <td className="p-3.5 font-mono font-medium text-neutral-900">${Number(o.total).toFixed(2)}</td>
                      <td className="p-3.5">
                        {/* Verde si "paid"; ámbar para cualquier otro valor. */}
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase border ${o.payment_status === "paid"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-amber-50 text-amber-700 border-amber-200"
                            }`}
                        >
                          {o.payment_status}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase bg-neutral-100 text-neutral-700 border border-neutral-200">
                          {o.order_status}
                        </span>
                      </td>
                      {/* Fecha en el formato del navegador del usuario. */}
                      <td className="p-3.5 pr-6 text-right text-neutral-400 text-[11px] font-mono">
                        {new Date(o.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center text-xs text-neutral-400 font-mono">
              No orders placed yet. Share your store link to start receiving orders!
            </div>
          )}
        </div>
      </div>
    </MerchantLayout>
  );
};