import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { MerchantLayout } from "../../components/MerchantLayout";
import { DollarSign, ShoppingBag, TrendingUp, Package, AlertTriangle, ExternalLink, ArrowUpRight, Plus } from "lucide-react";
import { Spinner } from "../../components/common/Spinner";
import { formatPaymentMethod } from "../../utils/payment";
import toast from "react-hot-toast";
import { api } from "../../config/api";

/**
 * Estructura de un pedido en la lista de pedidos recientes.
 */
interface RecentOrder {
  id: number;
  order_number: string;
  customer_name: string;
  customer_email: string;
  total: number | string;
  order_status: string;
  payment_status: string;
  payment_method?: string;
  created_at: string;
}

/**
 * Métricas agregadas de la tienda devueltas por `GET /api/analytics/merchant`.
 */
interface MerchantAnalytics {
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  pendingOrders: number;
  deliveredOrders: number;
  totalProducts: number;
  lowStockCount: number;
  recentOrders: RecentOrder[];
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
 * Dashboard del comerciante: resumen de métricas clave y pedidos recientes de la tienda.
 *
 * Mejoras aplicadas:
 *  - `loading` se inicializa en `true` para evitar el parpadeo de datos en cero.
 *  - Formateo de moneda dinámico según `store.currency` (ej. GHS, EUR, USD) en métricas y tabla.
 *  - Visualización del método de pago (`formatPaymentMethod`) junto al estado de pago (`paid` / `pending`).
 *  - Tipado riguroso con TypeScript (eliminando el uso de `any`).
 *  - Notificación toast en caso de error al consultar las analíticas.
 */
export const MerchantDashboard: React.FC = () => {
  const { store } = useAuth();
  const [analytics, setAnalytics] = useState<MerchantAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  // Carga las métricas al montar la página
  useEffect(() => {
    setLoading(true);
    api
      .get("/api/analytics/merchant")
      .then((res) => {
        if (res.data?.success && res.data.analytics) {
          setAnalytics(res.data.analytics);
        }
      })
      .catch((err) => {
        console.error("Failed to load merchant analytics:", err);
        toast.error("Failed to load store analytics");
      })
      .finally(() => setLoading(false));
  }, []);

  // Pantalla de carga mientras se obtienen las métricas
  if (loading) {
    return (
      <MerchantLayout>
        <Spinner padded />
      </MerchantLayout>
    );
  }

  const currency = store?.currency || "USD";

  return (
    <MerchantLayout>
      <div className="space-y-7">
        {/* CABECERA: accesos directos si la tienda está cargada */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h1 className="text-xl sm:text-2xl text-neutral-900 mt-10">Merchant Dashboard</h1>

          {store && (
            <div className="flex items-center gap-2.5">
              <Link
                to="/merchant/products"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-full transition cursor-pointer shadow-xs shadow-emerald-700/20"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Product</span>
              </Link>
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

        {/* TARJETAS DE MÉTRICAS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Ventas totales */}
          <div className="bg-white p-5 rounded-3xl border border-neutral-200/80">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">Total Sales</span>
              <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-700">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-semibold font-mono text-neutral-900 mt-2">
              {formatPrice(analytics?.totalRevenue || 0, currency)}
            </p>
            <span className="text-[10px] text-neutral-400 mt-1 block">From paid transactions</span>
          </div>

          {/* 2. Total de pedidos y pendientes */}
          <div className="bg-white p-5 rounded-3xl border border-neutral-200/80">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">Total Orders</span>
              <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-700">
                <ShoppingBag className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-semibold font-mono text-neutral-900 mt-2">
              {analytics?.totalOrders || 0}
            </p>
            <span className="text-[10px] text-amber-600 mt-1 block font-medium">
              {analytics?.pendingOrders || 0} awaiting fulfillment
            </span>
          </div>

          {/* 3. Ticket medio por pedido */}
          <div className="bg-white p-5 rounded-3xl border border-neutral-200/80">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">Avg Order</span>
              <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-700">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-semibold font-mono text-neutral-900 mt-2">
              {formatPrice(analytics?.avgOrderValue || 0, currency)}
            </p>
            <span className="text-[10px] text-neutral-400 mt-1 block">Per checkout order</span>
          </div>

          {/* 4. Total de productos y alertas de inventario */}
          <div className="bg-white p-5 rounded-3xl border border-neutral-200/80">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">Products</span>
              <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-700">
                <Package className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-semibold font-mono text-neutral-900 mt-2">
              {analytics?.totalProducts || 0}
            </p>
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

        {/* TABLA DE PEDIDOS RECIENTES */}
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

          {analytics?.recentOrders && analytics.recentOrders.length > 0 ? (
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
                  {analytics.recentOrders.map((o) => (
                    <tr key={o.id} className="hover:bg-neutral-50/50 transition">
                      <td className="p-3.5 pl-6 font-mono font-medium text-neutral-900">{o.order_number}</td>
                      <td className="p-3.5 text-neutral-700">
                        <p className="font-medium">{o.customer_name}</p>
                        <p className="text-[11px] text-neutral-400">{o.customer_email}</p>
                      </td>
                      <td className="p-3.5 font-mono font-medium text-neutral-900">
                        {formatPrice(o.total, currency)}
                      </td>
                      <td className="p-3.5">
                        <div className="flex flex-col gap-1 items-start">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase border ${
                              o.payment_status === "paid"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-amber-50 text-amber-700 border-amber-200"
                            }`}
                          >
                            {o.payment_status}
                          </span>
                          {o.payment_method && (
                            <span className="text-[10px] text-neutral-500 font-sans">
                              {formatPaymentMethod(o.payment_method)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3.5">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase bg-neutral-100 text-neutral-700 border border-neutral-200">
                          {o.order_status}
                        </span>
                      </td>
                      <td className="p-3.5 pr-6 text-right text-neutral-400 text-[11px] font-mono">
                        {o.created_at ? new Date(o.created_at).toLocaleDateString() : "N/A"}
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
