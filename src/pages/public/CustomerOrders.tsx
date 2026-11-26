import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { StoreNavbar } from "../../components/StoreNavbar";
import { ShoppingBag, ArrowLeft, Truck } from "lucide-react";
import { getStoreAccentStyles } from "../../utils/storeAccent";
import { formatPaymentMethod } from "../../utils/payment";
import { api } from "../../config/api";

/**
 * Página de Historial de Pedidos del Cliente.
 * Muestra la lista de órdenes realizadas por el usuario autenticado en una tienda específica.
 * Maneja la redirección automática al login si no hay una sesión activa.
 */
export const CustomerOrders: React.FC = () => {
  const { storeSlug } = useParams<{ storeSlug: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // --- ESTADOS DE DATOS Y UI ---
  // Nota: Se recomienda definir interfaces `Order` y `Store` para reemplazar `any`
  const [orders, setOrders] = useState<any[]>([]);
  const [store, setStore] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Carga la tienda y los pedidos del cliente, manejando la limpieza del componente
  useEffect(() => {
    if (authLoading) return; // Espera a que la verificación de autenticación termine

    if (!storeSlug) {
      setLoading(false);
      return;
    }

    let isMounted = true; // Bandera para evitar actualizaciones de estado en componentes desmontados (memory leaks)

    const fetchOrders = async () => {
      setLoading(true);

      try {
        // 1. Obtener datos de la tienda
        const storeRes = await api.get(`/api/stores/slug/${encodeURIComponent(storeSlug)}`);
        if (!isMounted) return;

        if (!storeRes.data?.success) {
          setStore(null);
          setOrders([]);
          return;
        }
        setStore(storeRes.data.store);

        // 2. Validar autenticación: Redirigir al login si no hay usuario activo
        if (!user) {
          navigate(`/store/${encodeURIComponent(storeSlug)}/login`);
          return;
        }

        // 3. Obtener los pedidos del cliente para esta tienda específica
        const ordersRes = await api.get(`/api/orders/customer/my-orders?storeSlug=${encodeURIComponent(storeSlug)}`);
        if (!isMounted) return;

        if (ordersRes.data?.success) {
          setOrders(ordersRes.data.orders || []);
        } else {
          setOrders([]);
        }
      } catch (err) {
        if (isMounted) {
          console.error("Failed to fetch customer orders:", err);
          setOrders([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void fetchOrders();

    // Función de limpieza para cancelar actualizaciones si el componente se desmonta
    return () => {
      isMounted = false;
    };
  }, [storeSlug, authLoading, user, navigate]);

  // --- RENDERIZADO CONDICIONAL: Carga ---
  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-neutral-400 text-xs font-mono">
        Loading orders...
      </div>
    );
  }

  // --- RENDERIZADO PRINCIPAL ---
  return (
    <div
      className="min-h-screen bg-neutral-50 text-neutral-900 flex flex-col font-sans"
      style={getStoreAccentStyles(store?.accent_color)}
    >
      {store && <StoreNavbar store={store} />}

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 w-full flex-1">

        {/* Navegación de retorno */}
        <Link
          to={`/store/${storeSlug}`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-900 mb-6 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Store
        </Link>

        <h1 className="text-xl font-medium tracking-tight text-neutral-900 mb-6">
          Order History
        </h1>

        {orders.length === 0 ? (
          /* --- ESTADO: Sin pedidos --- */
          <div className="bg-white rounded-md border border-neutral-200 p-12 text-center">
            <ShoppingBag className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-neutral-900 mb-1">
              No orders yet
            </h3>
            <p className="text-xs text-neutral-500 mb-5">
              You haven't placed any orders with this store yet.
            </p>
            <Link
              to={`/store/${storeSlug}`}
              className="px-4 py-2 store-accent-btn text-xs font-semibold rounded-full transition shadow-xs"
            >
              Browse Products
            </Link>
          </div>
        ) : (
          /* --- ESTADO: Lista de pedidos --- */
          <div className="space-y-3">
            {orders.map((o) => (
              <div
                key={o.id}
                className="bg-white rounded-2xl border border-neutral-200 p-5 hover:border-neutral-300 transition"
              >
                {/* Cabecera de la tarjeta: Número de orden, fecha y estado */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-neutral-100 pb-3 gap-2">
                  <div>
                    <span className="text-[10px] font-mono text-neutral-400 block">
                      Order #{o.order_number}
                    </span>
                    <span className="text-xs text-neutral-500">
                      Placed on{" "}
                      {o.created_at
                        ? new Date(o.created_at).toLocaleDateString()
                        : "N/A"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 text-[11px] font-medium rounded-xs border uppercase tracking-wide store-accent-pill">
                      {o.order_status || "Pending"}
                    </span>
                    <Link
                      to={`/store/${storeSlug}/order-confirmation/${o.order_number}`}
                      className="text-xs font-medium hover:underline ml-1 store-accent-text"
                    >
                      View Receipt →
                    </Link>
                  </div>
                </div>

                {/* Cuerpo de la tarjeta: Detalles de envío, tracking y totales */}
                <div className="pt-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs">
                  <div>
                    <p className="text-neutral-600">
                      {(o.items || []).length} items • Delivery to{" "}
                      {o.customer_name || "Customer"}
                    </p>
                    {o.tracking_number && (
                      <p className="font-mono text-neutral-800 font-medium mt-1 flex items-center gap-1">
                        <Truck className="w-3.5 h-3.5 text-neutral-500" />
                        Tracking: {o.tracking_number}
                      </p>
                    )}
                  </div>

                  <div className="text-right">
                    <span className="text-sm font-bold font-mono text-neutral-900">
                      {store?.currency || "$"}
                      {Number(o.total || 0).toFixed(2)}
                    </span>
                    <span className="block text-[11px] text-neutral-400">
                      {formatPaymentMethod(o.payment_method)} ({o.payment_status || "Pending"})
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};