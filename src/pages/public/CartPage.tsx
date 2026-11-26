import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useCart } from "../../context/CartContext";
import { StoreNavbar } from "../../components/StoreNavbar";
import { ShoppingBag, ArrowRight, ArrowLeft } from "lucide-react";
import { Spinner } from "../../components/common/Spinner";
import { CartShippingProgress } from "../../components/public/cart/CartShippingProgress";
import { CartItemList } from "../../components/public/cart/CartItemList";
import { CartSummarySidebar } from "../../components/public/cart/CartSummarySidebar";
import { getStoreAccentStyles } from "../../utils/storeAccent";
import { api } from "../../config/api";

/**
 * Página del carrito de compras de una tienda pública.
 * Muestra los productos añadidos, calcula los costos de envío según las reglas de la tienda
 * y presenta un resumen con el total estimado antes del checkout.
 */
export const CartPage: React.FC = () => {
  const { storeSlug } = useParams<{ storeSlug: string }>();
  const { cart, updateQuantity, removeFromCart, subtotal, setStoreSlug } = useCart();
  const navigate = useNavigate();

  // Nota: Se recomienda definir una interfaz `Store` para reemplazar `any`
  const [store, setStore] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Sincroniza el slug con el contexto del carrito y carga la configuración de la tienda
  useEffect(() => {
    if (!storeSlug) return;
    setStoreSlug(storeSlug);

    api.get(`/api/stores/slug/${encodeURIComponent(storeSlug)}`)
      .then((res) => {
        if (res.data?.success) setStore(res.data.store);
      })
      .catch((err) => {
        console.error("Failed to fetch store:", err);
      })
      .finally(() => setLoading(false));
  }, [storeSlug]);

  if (loading) return <Spinner fullScreen />;

  // --- CÁLCULOS DE ENVÍO Y TOTAL ---
  // Se obtienen los umbrales de envío gratuito y la tarifa base desde la configuración de la tienda
  const freeThreshold = store ? Number(store.free_shipping_threshold) || 0 : 0;
  const shippingFee = store ? Number(store.shipping_fee) || 0 : 0;

  // Determina si el subtotal actual califica para envío gratuito
  const isFreeShipping = freeThreshold > 0 && subtotal >= freeThreshold;
  const estimatedShipping = isFreeShipping ? 0 : shippingFee;
  const estimatedTotal = subtotal + estimatedShipping;

  return (
    // Aplica variables CSS dinámicas basadas en el color de acento de la tienda
    <div
      className="min-h-screen bg-neutral-50/60 text-neutral-900 flex flex-col font-sans"
      style={getStoreAccentStyles(store?.accent_color)}
    >
      {store && <StoreNavbar store={store} />}

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full flex-1">

        {/* Navegación de retorno al catálogo */}
        <button
          type="button"
          onClick={() => navigate(`/store/${storeSlug}`)}
          className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-900 mb-6 transition cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Continue Shopping</span>
        </button>

        {/* Encabezado con título y contador de items */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl sm:text-3xl text-neutral-900">Shopping Cart</h1>
          <span className="text-xs font-mono text-neutral-500 bg-neutral-100 px-3 py-1 rounded-full">
            {cart.length} {cart.length === 1 ? "item" : "items"}
          </span>
        </div>

        {cart.length === 0 ? (
          /* --- ESTADO: Carrito vacío --- */
          <div className="bg-white rounded-3xl sm:rounded-4xl border border-neutral-200 p-12 sm:p-16 text-center max-w-3xl my-20 mx-auto">
            <div className="flex items-center justify-center mx-auto mb-6 text-neutral-400">
              <ShoppingBag className="w-12 h-12" />
            </div>
            <h2 className="text-xl font-normal text-neutral-900 mb-1">Your bag is empty</h2>
            <p className="text-xs text-neutral-500 mb-6 max-w-xs mx-auto leading-relaxed">
              Explore our catalog to discover handcrafted essentials and unique studio pieces.
            </p>
            <Link
              to={`/store/${storeSlug}/products`}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-black text-white text-xs font-medium hover:bg-neutral-800 transition"
            >
              <span>Explore Catalog</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        ) : (
          /* --- ESTADO: Carrito con productos --- */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

            {/* Columna izquierda: Progreso de envío y lista de productos (7/12 columnas) */}
            <div className="lg:col-span-7 space-y-4">
              <CartShippingProgress freeThreshold={freeThreshold} subtotal={subtotal} />

              <CartItemList
                items={cart}
                storeSlug={storeSlug || ""}
                onUpdateQuantity={updateQuantity}
                onRemoveFromCart={removeFromCart}
              />
            </div>

            {/* Columna derecha: Resumen y checkout (5/12 columnas), sticky al hacer scroll */}
            <div className="lg:col-span-5 sticky top-24">
              <CartSummarySidebar
                subtotal={subtotal}
                shippingFee={shippingFee}
                isFreeShipping={isFreeShipping}
                estimatedTotal={estimatedTotal}
                storeSlug={storeSlug || ""}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
};