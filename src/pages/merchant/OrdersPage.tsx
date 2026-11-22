import React from "react";
import { MerchantLayout } from "../../components/MerchantLayout";
import toast from "react-hot-toast";
import { OrderTable, type OrderItem } from "../../components/merchant/orders/OrderTable";
import { OrderDetailModal } from "../../components/merchant/orders/OrderDetailModal";
import { useEffect, useState } from "react";
import { api } from "../../config/api";

/**
 * Página "Pedidos y envíos" del comerciante: lista sus pedidos, los filtra por
 * estado y permite cambiar el estado de un pedido, su número de seguimiento y
 * su estado de pago.
 *
 * Es el cliente de dos endpoints del backend:
 *  - `GET   /api/orders/merchant?status=`      → `getMerchantOrders`
 *  - `PATCH /api/orders/merchant/:id/status`   → `updateOrderStatus`
 *
 * Estructura: esta página guarda el estado y la lógica; `OrderTable` (lista) y
 * `OrderDetailModal` (detalle y edición) son de presentación.
 *
 * IMPORTANTE: el contrato del PATCH NO coincide con el backend (ver la primera
 * nota): hoy cambiar el estado de un pedido falla siempre con un 400.
 */
export const OrdersPage: React.FC = () => {
  const [orders, setOrders] = useState<OrderItem[]>([]);
  // Empieza en `true`: correcto, la tabla muestra su estado de carga al inicio.
  const [loading, setLoading] = useState(true);
  // Filtro de estado. "all" = sin filtro (no se envía `?status=`).
  const [filterStatus, setFilterStatus] = useState("all");
  // Pedido abierto en el modal de detalle, o `null` (modal cerrado).
  const [selectedOrder, setSelectedOrder] = useState<OrderItem | null>(null);
  // `true` mientras se guarda un cambio (desactiva los controles del modal).
  const [updatingStatus, setUpdatingStatus] = useState(false);
  // Texto del campo "número de seguimiento" del modal.
  const [trackingInput, setTrackingInput] = useState("");

  // Recarga la lista al montar y cada vez que cambia el filtro.
  useEffect(() => {
    fetchOrders();
  }, [filterStatus]);

  /**
   * Carga los pedidos de la tienda. Con filtro añade `?status=<estado>`
   * (`encodeURIComponent` protege el parámetro). El backend valida el estado
   * contra `ORDER_STATUSES`: un valor desconocido da 400.
   * `finally` garantiza que `loading` vuelva a `false`; los errores solo van a
   * consola (ver notas).
   */
  const fetchOrders = async () => {
    setLoading(true);

    try {
      const url = filterStatus !== "all" ? `/api/orders/merchant?status=${encodeURIComponent(filterStatus)}` : "/api/orders/merchant";
      const res = await api.get(url);
      if (res.data?.success) setOrders(res.data.orders);
    } catch (err) {
      console.error("Failed to fetch orders:", err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Actualiza un pedido: estado de gestión y, opcionalmente, número de
   * seguimiento y estado de pago. Los dos últimos solo se incluyen en el body
   * si se pasan (`...(x !== undefined && { ... })` es un spread condicional).
   *
   * Si va bien, sustituye el pedido en la lista y en el modal por el que
   * devuelve el backend (`res.data.order`), así la UI refleja el servidor.
   *
   * Body que envía: { order_status, tracking_number?, payment_status? }
   * Body que ESPERA el backend: { status } (ver notas).
   */
  const handleUpdateOrder = async (orderId: number, status: string, tracking?: string, payment?: string) => {
    setUpdatingStatus(true);
    try {
      const res = await api.patch(
        `/api/orders/merchant/${orderId}/status`, {
        order_status: status,
        ...(tracking !== undefined && { tracking_number: tracking }),
        ...(payment !== undefined && { payment_status: payment }),
      }
      );
      if (res.data?.success) {
        toast.success("Order status updated!");
        setOrders((prev) => prev.map((o) => o.id === orderId ? res.data.order : o));
        if (selectedOrder?.id === orderId) setSelectedOrder(res.data.order);
      }
    } catch (err: any) {
      // Muestra el `message` del backend (400/404...) o uno genérico.
      toast.error(err.response?.data?.message || "Failed to update order");
    } finally {
      setUpdatingStatus(false);
    }
  };

  return (
    <MerchantLayout>
      <div className="space-y-7 font-sans">
        <h1 className="text-xl sm:text-2xl text-neutral-900 mt-10">Orders & Fulfillment</h1>

        {/* Tabla. `onUpdateOrderStatus` es el cambio rápido de estado desde la
                    fila: solo pasa (id, status), sin seguimiento ni pago. */}
        <OrderTable
          orders={orders}
          loading={loading}
          filterStatus={filterStatus}
          onFilterChange={setFilterStatus}
          onUpdateOrderStatus={(id, status) => handleUpdateOrder(id, status)}
          onOpenDetails={(o) => {
            setSelectedOrder(o);
            // Precarga el campo con el seguimiento ya guardado (o vacío).
            setTrackingInput(o.tracking_number || "");
          }}
        />

        {/* Modal de detalle: aquí sí se puede editar seguimiento y pago, por
                    eso recibe `handleUpdateOrder` completo. */}
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          trackingInput={trackingInput}
          onTrackingInputChange={setTrackingInput}
          onUpdateOrder={handleUpdateOrder}
          updatingStatus={updatingStatus}
        />
      </div>
    </MerchantLayout>
  );
};