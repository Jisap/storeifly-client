import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Spinner } from "../../components/common/Spinner";
import { StoreNavbar } from "../../components/StoreNavbar";
import { StoreFooter } from "../../components/StoreFooter";
import { useCart } from "../../context/CartContext";
import { AlertCircle } from "lucide-react";
import { StoreHeroBanner } from "../../components/public/storefront/StoreHeroBanner";
import { StoreCatalogGrid } from "../../components/public/storefront/StoreCatalogGrid";
import { StoreTestimonials } from "../../components/public/storefront/StoreTestimonials";
import { StoreFaq } from "../../components/public/storefront/StoreFaq";
import { LandingCta } from "../../components/public/landing/LandingCta";
import { getStoreAccentStyles } from "../../utils/storeAccent";
import { api } from "../../config/api";

/**
 * Página de la tienda (Storefront).
 * Carga y muestra la información pública de una tienda específica basada en su slug,
 * incluyendo productos, banners y secciones de contenido, aplicando los estilos de acento de la marca.
 */
export const Storefront: React.FC = () => {
  // Obtiene el identificador de la tienda desde la URL
  const { storeSlug } = useParams<{ storeSlug: string }>();
  // Accede al contexto del carrito para sincronizar la tienda activa y añadir productos
  const { setStoreSlug, addToCart } = useCart();

  // Estados de datos y UI (Nota: se recomienda definir interfaces `Store` y `Product` en el futuro)
  const [store, setStore] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estado temporal para feedback visual (ej. animación de "Añadido") en el botón de compra rápida
  const [addedId, setAddedId] = useState<number | null>(null);

  // Sincroniza el slug con el contexto del carrito y dispara la carga de datos cuando cambia la URL
  useEffect(() => {
    if (storeSlug) {
      setStoreSlug(storeSlug);
      fetchStoreData(storeSlug);
    }
  }, [storeSlug]);

  /**
   * Obtiene los datos de la tienda y sus productos activos en paralelo 
   * para optimizar el tiempo de carga.
   */
  const fetchStoreData = async (slug: string) => {
    setLoading(true);
    setError(null);

    try {
      const [storeRes, prodRes] = await Promise.all([
        api.get(`/api/stores/slug/${encodeURIComponent(slug)}`),
        api.get(`/api/products?storeSlug=${encodeURIComponent(slug)}&status=active`),
      ]);

      if (storeRes.data?.success) setStore(storeRes.data.store);
      if (prodRes.data?.success) setProducts(prodRes.data.products);
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to load store");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Maneja la adición rápida de un producto al carrito.
   * Detiene la propagación del evento para evitar navegaciones no deseadas (ej. si está dentro de un <Link>).
   */
  const handleQuickAdd = (e: React.MouseEvent, p: any) => {
    e.preventDefault();
    e.stopPropagation();

    addToCart({
      productId: p.id,
      name: p.name,
      price: Number(p.price),
      image: p.images?.[0],
      quantity: 1,
      // Construye una cadena de variante por defecto si existen variantes
      variant: p.variants?.length ? `${p.variants[0].name}: ${p.variants[0].options[0]}` : undefined,
      stock: p.stock,
    });

    // Activa el feedback visual temporalmente
    setAddedId(p.id);
    setTimeout(() => setAddedId(null), 1500);
  };

  // --- RENDERIZADO CONDICIONAL ---

  if (loading) return <Spinner fullScreen />;

  if (error || !store) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white p-4 text-center">
        <AlertCircle className="w-8 h-8 text-neutral-400 mb-2" />
        <h1 className="text-base font-semibold text-neutral-900 mb-1">Store Unavailable</h1>
        <p className="text-xs text-neutral-500 max-w-sm mb-4">{error || "This store could not be found."}</p>
        <Link to="/" className="px-3.5 py-1.5 bg-neutral-900 text-white text-xs font-medium rounded-md hover:bg-black transition">
          Return to StoreiFly
        </Link>
      </div>
    );
  }

  // --- RENDERIZADO PRINCIPAL ---
  return (
    // Aplica variables CSS dinámicas basadas en el color de acento de la tienda
    <div
      className="min-h-screen bg-white text-neutral-900 flex flex-col font-sans"
      style={getStoreAccentStyles(store?.accent_color)}
    >
      <StoreNavbar store={store} />
      <StoreHeroBanner store={store} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 w-full flex-1">
        <StoreCatalogGrid
          products={products}
          storeSlug={storeSlug || ""}
          onQuickAdd={handleQuickAdd}
          addedId={addedId}
        />

        <StoreTestimonials />
        <StoreFaq />
        <LandingCta />
      </main>

      <StoreFooter store={store} />
    </div>
  );
};