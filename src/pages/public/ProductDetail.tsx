import React, { useEffect, useState, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { StoreNavbar } from "../../components/StoreNavbar";
import { StoreFooter } from "../../components/StoreFooter";
import { useCart } from "../../context/CartContext";
import { ArrowLeft, AlertCircle, Mail } from "lucide-react";
import { Spinner } from "../../components/common/Spinner";
import toast from "react-hot-toast";
import { ProductOverview } from "../../components/public/product-detail/ProductOverview";
import { ProductSpecs } from "../../components/public/product-detail/ProductSpecs";
import { ProductReviews } from "../../components/public/product-detail/ProductReviews";
import { RelatedProducts } from "../../components/public/product-detail/RelatedProducts";
import { getStoreAccentStyles } from "../../utils/storeAccent";
import { api } from "../../config/api";
import type { PublicStore } from "./AllProducts";

/**
 * Página de detalle de producto dentro de una tienda pública.
 *
 * Flujo y robustez:
 *  - Carga el producto y la tienda de Neon Functions de forma segura.
 *  - La petición de productos relacionados es independiente para que un error
 *    secundario nunca impida ver y comprar el producto principal.
 *  - Sincroniza variantes, cantidad seleccionada (con límite de stock) y moneda de la tienda.
 *  - Maneja cancelación de peticiones asíncronas para evitar race conditions al cambiar de producto.
 *  - Retorno directo al catálogo completo de la tienda (`/store/:storeSlug/products`).
 */
export const ProductDetail: React.FC = () => {
  const { storeSlug, productId } = useParams<{ storeSlug: string; productId: string }>();
  const { addToCart, setStoreSlug } = useCart();
  const navigate = useNavigate();

  // Estados de datos
  const [product, setProduct] = useState<any>(null);
  const [store, setStore] = useState<PublicStore | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Estados de interacción del usuario
  const [selectedImage, setSelectedImage] = useState("");
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);

  // Feedback visual temporal tras añadir al carrito
  const [added, setAdded] = useState(false);
  const addedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Limpieza del temporizador al desmontar
  useEffect(() => {
    return () => {
      if (addedTimeoutRef.current) {
        clearTimeout(addedTimeoutRef.current);
      }
    };
  }, []);

  // Carga de producto y tienda con protección contra race conditions
  useEffect(() => {
    if (!storeSlug || !productId) return;
    setStoreSlug(storeSlug);

    let cancelled = false;

    const fetchProductData = async () => {
      setLoading(true);
      // Reinicia estados de interacción para el nuevo producto
      setQuantity(1);
      setSelectedImage("");

      try {
        // Carga principal: producto y tienda
        const [prodRes, storeRes] = await Promise.all([
          api.get(`/api/products/${encodeURIComponent(productId)}`),
          api.get(`/api/stores/slug/${encodeURIComponent(storeSlug)}`),
        ]);

        if (cancelled) return;

        if (prodRes.data?.success && prodRes.data.product) {
          const prod = prodRes.data.product;
          setProduct(prod);
          setSelectedImage(prod.images?.[0] ?? "");

          // Variantes por defecto (primera opción de cada grupo)
          const defaults: Record<string, string> = {};
          prod.variants?.forEach((v: any) => {
            if (v.name && v.options?.length) defaults[v.name] = v.options[0];
          });
          setSelectedVariants(defaults);
        } else {
          setProduct(null);
        }

        if (storeRes.data?.success && storeRes.data.store) {
          const s = storeRes.data.store;
          setStore({
            ...s,
            id: s.id ? Number(s.id) : undefined,
            description: s.description ?? undefined,
            logo_url: s.logo_url ?? undefined,
            banner_url: s.banner_url ?? undefined,
            accent_color: s.accent_color ?? undefined,
          });
        }

        // Carga secundaria: productos relacionados (no bloqueante)
        api
          .get(`/api/products?storeSlug=${encodeURIComponent(storeSlug)}&status=active`)
          .then((relRes) => {
            if (!cancelled && relRes.data?.success && Array.isArray(relRes.data.products)) {
              setRelatedProducts(
                relRes.data.products
                  .filter((p: any) => String(p.id) !== String(productId))
                  .slice(0, 4)
              );
            }
          })
          .catch(() => {
            // Un fallo en los productos relacionados no debe interrumpir la navegación
            if (!cancelled) setRelatedProducts([]);
          });

      } catch (error: unknown) {
        if (!cancelled) {
          console.error("Error loading product:", error);
          setProduct(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchProductData();

    return () => {
      cancelled = true;
    };
  }, [productId, storeSlug, setStoreSlug]);

  /**
   * Valida stock y añade el producto al carrito con variantes y cantidad elegidas.
   */
  const handleAddToCart = () => {
    if (!product) return;

    // Validación de stock
    if (product.stock !== undefined && product.stock <= 0) {
      toast.error("This product is currently out of stock.");
      return;
    }

    const availableStock = typeof product.stock === "number" ? product.stock : 99;
    const finalQuantity = Math.max(1, Math.min(quantity, availableStock));

    const variant =
      Object.entries(selectedVariants)
        .map(([k, v]) => `${k}: ${v}`)
        .join(" / ") || undefined;

    addToCart({
      productId: Number(product.id),
      name: product.name,
      price: Number(product.price) || 0,
      image: selectedImage || product.images?.[0],
      quantity: finalQuantity,
      variant,
      stock: product.stock ?? 0,
    });

    setAdded(true);
    toast.success(`Added ${finalQuantity} to cart!`);

    if (addedTimeoutRef.current) clearTimeout(addedTimeoutRef.current);
    addedTimeoutRef.current = setTimeout(() => setAdded(false), 2000);
  };

  // --- RENDERIZADO CONDICIONAL ---

  if (loading) return <Spinner fullScreen />;

  if (!product) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white p-4">
        <AlertCircle className="w-10 h-10 text-neutral-400 mb-3" />
        <h2 className="text-base font-semibold text-neutral-900">Product not found</h2>
        <p className="text-xs text-neutral-500 mt-1 max-w-sm text-center">
          The requested product may have been removed or is temporarily unavailable.
        </p>
        <Link
          to={`/store/${storeSlug}/products`}
          className="mt-4 px-4 py-2 bg-neutral-900 text-white text-xs font-medium rounded-full hover:bg-black transition"
        >
          Back to Catalog
        </Link>
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

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-1">
        {/* Navegación directa de retorno al catálogo de productos */}
        <button
          type="button"
          onClick={() => navigate(`/store/${storeSlug}/products`)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-900 mb-6 transition cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Catalog
        </button>

        {/* Sección principal del producto: galería, variantes, cantidad, precio y CTA */}
        <ProductOverview
          product={product}
          selectedImage={selectedImage}
          onSelectImage={setSelectedImage}
          selectedVariants={selectedVariants}
          onVariantChange={(name, val) => setSelectedVariants((p) => ({ ...p, [name]: val }))}
          quantity={quantity}
          onQuantityChange={setQuantity}
          onAddToCart={handleAddToCart}
          added={added}
          storeSlug={storeSlug || ""}
          currency={store?.currency || "USD"}
        />

        {/* Secciones informativas adicionales del producto */}
        <ProductSpecs />
        <ProductReviews />
        <RelatedProducts products={relatedProducts} storeSlug={storeSlug || ""} />

        {/* CTA secundario para consultas */}
        <div className="mt-14 bg-white rounded-3xl sm:rounded-4xl border border-neutral-200/80 p-8 sm:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-xs">
          <div className="space-y-2">
            <h4 className="text-xl sm:text-2xl text-neutral-900">Need sizing assistance or a custom order?</h4>
            <p className="text-xs sm:text-sm text-neutral-500 max-w-lg leading-relaxed">
              Our team at {store?.name || "the store"} is available for custom specifications, bulk orders, and gifting inquiries.
            </p>
          </div>
          <button
            type="button"
            onClick={() => toast.success("Thank you for reaching out! We will contact you soon.")}
            className="px-8 py-3 bg-neutral-900 hover:bg-black text-white text-xs font-semibold rounded-full transition flex items-center gap-2 shrink-0 cursor-pointer"
          >
            <Mail className="w-3.5 h-3.5" /> Inquire with Store
          </button>
        </div>
      </main>

      {store && <StoreFooter store={store} />}
    </div>
  );
};
