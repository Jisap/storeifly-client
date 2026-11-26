import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useCart } from "../../context/CartContext";
import { useAuth } from "../../context/AuthContext";
import { StoreNavbar } from "../../components/StoreNavbar";
import { ArrowLeft, ShoppingBag } from "lucide-react";
import toast from "react-hot-toast";
import { CheckoutContactForm } from "../../components/public/checkout/CheckoutContactForm";
import { CheckoutShippingForm, type ShippingAddress } from "../../components/public/checkout/CheckoutShippingForm";
import { CheckoutOrderSummary } from "../../components/public/checkout/CheckoutOrderSummary";
import { getStoreAccentStyles } from "../../utils/storeAccent";
import { api } from "../../config/api";

/**
 * Página de Checkout (Finalizar Compra).
 * Recopila la información de contacto y envío del cliente, muestra el resumen del pedido
 * y procesa la creación de la orden (actualmente configurado para pago contra entrega / COD).
 */
export const CheckoutPage: React.FC = () => {
  const { storeSlug } = useParams<{ storeSlug: string }>();
  const { cart, subtotal, clearCart, setStoreSlug } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();

  // --- ESTADOS DE UI Y DATOS ---
  // Nota: Se recomienda definir una interfaz `Store` para reemplazar `any`
  const [store, setStore] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // --- ESTADOS DEL FORMULARIO ---
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

  // Carga la configuración de la tienda y pre-llena los datos si el usuario está autenticado
  useEffect(() => {
    if (!storeSlug) {
      setLoading(false);
      return;
    }
    setStoreSlug(storeSlug);

    api.get(`/api/stores/slug/${encodeURIComponent(storeSlug)}`)
      .then((res) => {
        if (res.data?.success) {
          const currentStore = res.data.store;
          setStore(currentStore);

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

  /**
   * Valida los campos del formulario y envía la solicitud de creación de orden.
   * Limpia el carrito y redirige a la página de confirmación en caso de éxito.
   */
  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validación básica de campos obligatorios
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
        storeSlug,
        items: cart,
        customerName,
        customerEmail,
        customerPhone,
        shippingAddress: address,
        paymentMethod: "cod", // Configurado por defecto como Pago Contra Entrega (Cash on Delivery)
      };

      const res = await api.post("/api/orders/checkout", payload);

      if (res.data?.success) {
        const order = res.data.order;
        clearCart(); // Vacía el carrito local tras una compra exitosa
        toast.success("Order placed successfully!");
        navigate(`/store/${storeSlug}/order-confirmation/${order.order_number}`);
      }
    } catch (err: any) {
      console.error("Checkout error:", err);
      toast.error(err.response?.data?.message || "Failed to place order");
    } finally {
      setSubmitting(false);
    }
  };

  // --- RENDERIZADO PRINCIPAL ---
  return (
    // Aplica variables CSS dinámicas basadas en el color de acento de la tienda
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

        {/* Grid principal del formulario: 2/3 para datos, 1/3 para resumen */}
        <form onSubmit={handlePlaceOrder} className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Columna izquierda: Formularios de Contacto y Envío */}
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
          </div>

          {/* Columna derecha: Resumen del pedido y botón de acción (Sticky por defecto en el componente hijo) */}
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