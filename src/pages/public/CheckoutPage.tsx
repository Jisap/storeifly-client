import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useCart } from "../../context/CartContext";
import { useAuth } from "../../context/AuthContext";
import { StoreNavbar } from "../../components/StoreNavbar";
import { ArrowLeft, ShoppingBag, Truck, Smartphone, Building2 } from "lucide-react";
import toast from "react-hot-toast";
import { CheckoutContactForm } from "../../components/public/checkout/CheckoutContactForm";
import { CheckoutShippingForm, type ShippingAddress } from "../../components/public/checkout/CheckoutShippingForm";
import { CheckoutOrderSummary } from "../../components/public/checkout/CheckoutOrderSummary";
import { getStoreAccentStyles } from "../../utils/storeAccent";
import { formatPaymentMethod } from "../../utils/payment";
import { api } from "../../config/api";
import type { PublicStore } from "../public/AllProducts";

/**
 * Página de Checkout (Finalizar Compra).
 *
 * Flujo y correcciones de consistencia:
 *  - Carga la tienda y sus métodos de pago admitidos (`store.payment_methods`).
 *  - Permite al cliente seleccionar entre los métodos de pago reales de la tienda (no hardcodea "cod").
 *  - Envía `storeId` numérico obligatorio al backend junto con el código válido de `paymentMethod`.
 *  - Pre-llena nombre y correo si el cliente ya ha iniciado sesión.
 */
export const CheckoutPage: React.FC = () => {
  const { storeSlug } = useParams<{ storeSlug: string }>();
  const { cart, subtotal, clearCart, setStoreSlug } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Estados de UI y datos
  const [store, setStore] = useState<PublicStore | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Estados del formulario
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [address, setAddress] = useState<ShippingAddress>({
    street: "",
    city: "",
    state: "",
    zip: "",
    country: "United States",
  });

  // Método de pago seleccionado
  const [paymentMethod, setPaymentMethod] = useState<string>("cash_on_delivery");

  // Carga la configuración de la tienda y pre-llena los datos si el usuario está autenticado
  useEffect(() => {
    if (!storeSlug) {
      setLoading(false);
      return;
    }
    setStoreSlug(storeSlug);

    api.get(`/api/stores/slug/${encodeURIComponent(storeSlug)}`)
      .then((res) => {
        if (res.data?.success && res.data.store) {
          const currentStore = res.data.store;
          setStore({
            ...currentStore,
            id: currentStore.id ? Number(currentStore.id) : undefined,
            description: currentStore.description ?? undefined,
            logo_url: currentStore.logo_url ?? undefined,
            banner_url: currentStore.banner_url ?? undefined,
            accent_color: currentStore.accent_color ?? undefined,
          });

          // Selecciona el primer método de pago disponible de la tienda
          if (Array.isArray(currentStore.payment_methods) && currentStore.payment_methods.length > 0) {
            setPaymentMethod(currentStore.payment_methods[0]);
          }

          // Pre-llena nombre y email si el usuario ya inició sesión
          if (user) {
            setCustomerName(user.name || "");
            setCustomerEmail(user.email || "");
          }
        }
      })
      .catch((err) => {
        console.error("Failed to fetch store:", err);
      })
      .finally(() => setLoading(false));
  }, [storeSlug, user, setStoreSlug]);

  // --- RENDERIZADO CONDICIONAL INICIAL ---
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500 text-sm">Loading checkout...</div>;
  }

  // Redirige o muestra estado vacío si no hay productos en el carrito
  if (cart.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4 text-center">
        <ShoppingBag className="w-12 h-12 text-gray-300 mb-3" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">Your cart is empty</h2>
        <Link
          to={`/store/${storeSlug}`}
          className="px-4 py-2 bg-black text-white text-xs font-semibold rounded-lg hover:bg-gray-800 transition"
        >
          Back to Store
        </Link>
      </div>
    );
  }

  // --- CÁLCULOS DE TOTALES ---
  const freeThreshold = store ? Number(store.free_shipping_threshold) || 0 : 0;
  const baseShippingFee = store ? Number(store.shipping_fee) || 0 : 0;
  const isFreeShipping = freeThreshold > 0 && subtotal >= freeThreshold;
  const shippingCost = isFreeShipping ? 0 : baseShippingFee;
  const grandTotal = subtotal + shippingCost;

  // Lista de métodos de pago aceptados por la tienda
  const availablePaymentMethods =
    store?.payment_methods && store.payment_methods.length > 0
      ? store.payment_methods
      : ["cash_on_delivery"];

  /**
   * Valida los campos del formulario y envía la solicitud de creación de orden.
   */
  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!store?.id) {
      toast.error("Store information is missing. Please reload.");
      return;
    }

    if (!customerName.trim() || !customerEmail.trim()) {
      toast.error("Please enter your name and email");
      return;
    }

    if (!address.street.trim() || !address.city.trim() || !address.zip.trim()) {
      toast.error("Please fill out complete shipping address");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        storeId: Number(store.id),
        items: cart.map((item) => ({
          productId: Number(item.productId),
          quantity: Number(item.quantity),
        })),
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim().toLowerCase(),
        customerPhone: customerPhone.trim() || undefined,
        shippingAddress: address,
        paymentMethod,
      };

      const res = await api.post("/api/orders/checkout", payload);

      if (res.data?.success) {
        const order = res.data.order;
        clearCart(); // Vacía el carrito local tras una compra exitosa
        toast.success("Order placed successfully!");
        navigate(`/store/${storeSlug}/order-confirmation/${order.order_number}`);
      }
    } catch (err: unknown) {
      console.error("Checkout error:", err);
      const msg = (err as any)?.response?.data?.message || "Failed to place order";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // --- RENDERIZADO PRINCIPAL ---
  return (
    <div
      className="min-h-screen bg-neutral-50 text-neutral-900 flex flex-col font-sans"
      style={getStoreAccentStyles(store?.accent_color)}
    >
      {store && <StoreNavbar store={store} />}

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-1">
        {/* Navegación de retorno al carrito */}
        <button
          onClick={() => navigate(`/store/${storeSlug}/cart`)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-900 mb-6 transition cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Cart
        </button>

        <h1 className="text-xl font-medium tracking-tight text-neutral-900 mb-6">Checkout</h1>

        {/* Grid principal del formulario */}
        <form onSubmit={handlePlaceOrder} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Columna izquierda: Contacto, Envío y Método de Pago */}
          <div className="lg:col-span-2 space-y-5">
            <CheckoutContactForm
              customerName={customerName}
              onCustomerNameChange={setCustomerName}
              customerEmail={customerEmail}
              onCustomerEmailChange={setCustomerEmail}
              customerPhone={customerPhone}
              onCustomerPhoneChange={setCustomerPhone}
            />

            <CheckoutShippingForm address={address} onAddressChange={setAddress} />

            {/* Selector de Método de Pago dinámico */}
            <div className="bg-white rounded-3xl border border-neutral-200/90 p-6 sm:p-7 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-medium text-neutral-900">Payment Method</h2>
                <span className="text-[11px] text-neutral-400">Select how you want to pay</span>
              </div>

              <div className="space-y-2.5">
                {availablePaymentMethods.map((method) => {
                  const isSelected = paymentMethod === method;
                  return (
                    <label
                      key={method}
                      onClick={() => setPaymentMethod(method)}
                      className={`flex items-center justify-between p-3.5 rounded-2xl border transition cursor-pointer ${
                        isSelected
                          ? "border-(--store-accent) bg-(--store-accent-light) text-neutral-900"
                          : "border-neutral-200 bg-neutral-50/50 hover:bg-neutral-100/60 text-neutral-700"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="paymentMethod"
                          value={method}
                          checked={isSelected}
                          onChange={() => setPaymentMethod(method)}
                          className="accent-emerald-600 cursor-pointer"
                        />
                        <div>
                          <p className="text-xs font-semibold">{formatPaymentMethod(method)}</p>
                          <p className="text-[11px] text-neutral-500">
                            {method === "cash_on_delivery"
                              ? "Pay in cash when your order is delivered."
                              : method === "mobile_money"
                              ? "Direct payment via mobile money account."
                              : "Direct electronic transfer to store bank account."}
                          </p>
                        </div>
                      </div>
                      {method === "cash_on_delivery" ? (
                        <Truck className="w-4 h-4 text-neutral-400" />
                      ) : method === "mobile_money" ? (
                        <Smartphone className="w-4 h-4 text-neutral-400" />
                      ) : (
                        <Building2 className="w-4 h-4 text-neutral-400" />
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Columna derecha: Resumen del pedido y botón de acción */}
          <div className="space-y-4">
            <CheckoutOrderSummary
              cart={cart}
              subtotal={subtotal}
              shippingCost={shippingCost}
              isFreeShipping={isFreeShipping}
              grandTotal={grandTotal}
              submitting={submitting}
            />
          </div>
        </form>
      </main>
    </div>
  );
};
