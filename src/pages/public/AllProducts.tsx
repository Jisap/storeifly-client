import React, { useEffect, useState, useMemo, useRef } from "react";
import { useParams, Link, useSearchParams, useNavigate } from "react-router-dom";
import { StoreNavbar } from "../../components/StoreNavbar";
import { StoreFooter } from "../../components/StoreFooter";
import { ProductCard, type ProductCardItem } from "../../components/common/ProductCard";
import { useCart } from "../../context/CartContext";
import { Search, X, ChevronRight, ShoppingBag, ArrowUpDown } from "lucide-react";
import { Spinner } from "../../components/common/Spinner";
import { getStoreAccentStyles } from "../../utils/storeAccent";
import { api } from "../../config/api";

/**
 * Tienda pública tal como la devuelve `GET /api/stores/slug/:slug`.
 * No incluye campos sensibles internos como `merchant_id`.
 */
export interface PublicStore {
  id?: number;
  name: string;
  slug: string;
  logo_url?: string;
  banner_url?: string;
  description?: string;
  currency?: string;
  hero_style?: string;
  accent_color?: string;
  shipping_fee?: number | string;
  free_shipping_threshold?: number | string;
  payment_methods?: string[];
}

/**
 * Opciones del selector de orden. `value` es lo que se guarda en el estado y
 * en la URL (?sort=...); `label` es el texto que ve el cliente.
 * "featured" es el orden por defecto: no reordena, deja el del servidor
 * (más recientes primero, según la function pública de Neon).
 */
const SORT_OPTIONS = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest First" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "name-asc", label: "Name: A to Z" },
  { value: "name-desc", label: "Name: Z to A" },
];

/**
 * Página pública "Todos los productos" de una tienda: catálogo completo con
 * buscador, filtro por categoría y ordenación. Ruta: `/store/:storeSlug/products`.
 *
 * Es la parte PÚBLICA (clientes), a diferencia de `ProductsPage` (comerciante).
 * Consume dos endpoints de la function pública de Neon (solo lectura):
 *  - `GET /api/stores/slug/:slug`                   → datos de la tienda.
 *  - `GET /api/products?storeSlug=&status=active`   → productos activos.
 *
 * Mejoras aplicadas:
 *  - Quick-add inteligente: si el producto tiene variantes, redirige al detalle
 *    para que el cliente elija variante y no compre una equivocada a ciegas.
 *  - Validación de stock en quick-add: impide añadir productos agotados.
 *  - Selector de categorías dinámico generado a partir del catálogo cargado.
 *  - Sincronización bidireccional limpia con `searchParams` sin bucles ni desajustes al volver atrás.
 *  - Prevención de race conditions al cambiar de tienda con flag `cancelled`.
 *  - Limpieza de temporizadores (`setTimeout`) al desmontar el componente.
 *  - Comparación de texto en español (`es`) con sensibilidad base para ordenación A-Z.
 */
export const AllProducts: React.FC = () => {
  const { storeSlug } = useParams<{ storeSlug: string }>();
  const navigate = useNavigate();

  // Parámetros de la URL: `?q=` (búsqueda), `?sort=` (orden) y opcionalmente `?category=`.
  const [searchParams, setSearchParams] = useSearchParams();

  // `setStoreSlug` le dice al carrito de qué tienda es (un carrito por tienda);
  // `addToCart` añade líneas.
  const { setStoreSlug, addToCart } = useCart();

  const [store, setStore] = useState<PublicStore | null>(null);
  const [products, setProducts] = useState<ProductCardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Id del producto recién añadido: sirve para mostrar el feedback "Added" 1,5 s.
  const [addedId, setAddedId] = useState<number | null>(null);
  const addedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Estados locales inicializados desde los searchParams
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "");
  const [sortBy, setSortBy] = useState(searchParams.get("sort") || "featured");
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get("category") || "all");

  // Limpieza del timeout de feedback visual al desmontar
  useEffect(() => {
    return () => {
      if (addedTimeoutRef.current) {
        clearTimeout(addedTimeoutRef.current);
      }
    };
  }, []);

  // Mantener los filtros sincronizados si la URL cambia externamente (ej: botón "Atrás" del navegador)
  useEffect(() => {
    const qFromUrl = searchParams.get("q") || "";
    const sortFromUrl = searchParams.get("sort") || "featured";
    const catFromUrl = searchParams.get("category") || "all";

    setSearchQuery(qFromUrl);
    setSortBy(sortFromUrl);
    setSelectedCategory(catFromUrl);
  }, [searchParams]);

  // Carga de tienda y productos con protección de cancelación
  useEffect(() => {
    if (!storeSlug) return;
    setStoreSlug(storeSlug);

    let cancelled = false;

    const fetchInitialData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [storeRes, prodRes] = await Promise.all([
          api.get(`/api/stores/slug/${encodeURIComponent(storeSlug)}`),
          api.get(`/api/products?storeSlug=${encodeURIComponent(storeSlug)}&status=active`),
        ]);

        if (!cancelled) {
          if (storeRes.data?.success && storeRes.data?.store) {
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
          if (prodRes.data?.success) setProducts(prodRes.data.products || []);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = (err as any)?.response?.data?.message || "Failed to load store products";
          setError(msg);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchInitialData();

    return () => {
      cancelled = true;
    };
  }, [storeSlug, setStoreSlug]);

  /**
   * Actualiza los parámetros en la URL de forma limpia sin provocar bucles.
   */
  const updateParams = (newQ: string, newSort: string, newCat: string) => {
    const params: Record<string, string> = {};
    if (newQ.trim()) params.q = newQ.trim();
    if (newSort !== "featured") params.sort = newSort;
    if (newCat !== "all") params.category = newCat;
    setSearchParams(params, { replace: true });
  };

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    updateParams(val, sortBy, selectedCategory);
  };

  const handleSortChange = (val: string) => {
    setSortBy(val);
    updateParams(searchQuery, val, selectedCategory);
  };

  const handleCategoryChange = (cat: string) => {
    setSelectedCategory(cat);
    updateParams(searchQuery, sortBy, cat);
  };

  /**
   * Obtiene la lista única de categorías disponibles en los productos cargados.
   */
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p) => {
      if (p.category_name && p.category_name.trim()) {
        cats.add(p.category_name.trim());
      }
    });
    return Array.from(cats);
  }, [products]);

  /**
   * "Añadir rápido" desde la tarjeta.
   * Regla de negocio crítica:
   *  - Si el producto tiene variantes (talla, color, etc.), NO podemos elegir
   *    a ciegas la primera opción: navegamos al detalle para que el usuario elija.
   *  - Si no tiene stock disponible, se bloquea.
   */
  const handleQuickAdd = (e: React.MouseEvent, p: ProductCardItem) => {
    e.preventDefault();
    e.stopPropagation();

    // Si tiene stock 0 o menos, no se puede añadir
    if (p.stock !== undefined && p.stock <= 0) {
      return;
    }

    // Si tiene variantes, llevar al cliente al detalle del producto
    if (p.variants && Array.isArray(p.variants) && p.variants.length > 0) {
      navigate(`/store/${storeSlug}/products/${p.id}`);
      return;
    }

    addToCart({
      productId: Number(p.id),
      name: p.name,
      price: Number(p.price) || 0,
      image: p.images?.[0],
      quantity: 1,
      variant: undefined,
      stock: p.stock ?? 0,
    });

    setAddedId(Number(p.id));
    if (addedTimeoutRef.current) clearTimeout(addedTimeoutRef.current);
    addedTimeoutRef.current = setTimeout(() => setAddedId(null), 1500);
  };

  /**
   * Lista final: filtra por categoría y texto (nombre, descripción, SKU)
   * y luego ordena según la opción elegida.
   */
  const filteredProducts = useMemo(() => {
    let list = [...products];

    // Filtro por categoría
    if (selectedCategory !== "all") {
      list = list.filter((p) => p.category_name?.toLowerCase() === selectedCategory.toLowerCase());
    }

    // Filtro por texto de búsqueda
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q) ||
          p.sku?.toLowerCase().includes(q)
      );
    }

    // Ordenación
    switch (sortBy) {
      case "price-asc":
        list.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
        break;
      case "price-desc":
        list.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
        break;
      case "name-asc":
        list.sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
        break;
      case "name-desc":
        list.sort((a, b) => b.name.localeCompare(a.name, "es", { sensitivity: "base" }));
        break;
      case "newest":
        list.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
        break;
    }

    return list;
  }, [products, searchQuery, sortBy, selectedCategory]);

  if (loading) return <Spinner fullScreen />;

  // Error o tienda no cargada: pantalla de aviso con enlace a la home.
  if (error || !store) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white p-4 text-center">
        <ShoppingBag className="w-8 h-8 text-neutral-400 mb-2" />
        <h1 className="text-base font-semibold text-neutral-900 mb-1">Catalog Unavailable</h1>
        <p className="text-xs text-neutral-500 max-w-sm mb-4">{error || "Store products could not be loaded."}</p>
        <Link to="/" className="px-4 py-2 store-accent-btn text-xs font-medium rounded-full transition">
          Return to StoreiFly
        </Link>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-white text-neutral-900 flex flex-col font-sans"
      style={getStoreAccentStyles(store.accent_color)}
    >
      <StoreNavbar store={store} />

      {/* Cabecera con migas de pan */}
      <div className="border-b border-neutral-100 bg-neutral-50/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex items-center gap-1.5 text-[11px] text-neutral-400 mb-3">
            <Link to={`/store/${store.slug}`} className="hover:text-neutral-900 transition">
              Home
            </Link>
            <ChevronRight className="w-3 h-3 text-neutral-300" />
            <span className="text-neutral-900 font-medium">All Products</span>
          </div>

          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl tracking-tight text-neutral-900">All Products</h1>
              <p className="text-xs text-neutral-500 mt-1 max-w-xl">
                Browse the complete curated catalog from {store.name}.
              </p>
            </div>
          </div>

          {/* Selector de categorías si la tienda tiene al menos una */}
          {availableCategories.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 mt-6 no-scrollbar">
              <button
                type="button"
                onClick={() => handleCategoryChange("all")}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition cursor-pointer ${
                  selectedCategory === "all"
                    ? "store-accent-btn"
                    : "bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                All Categories
              </button>
              {availableCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => handleCategoryChange(cat)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition cursor-pointer ${
                    selectedCategory.toLowerCase() === cat.toLowerCase()
                      ? "store-accent-btn"
                      : "bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-100"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 w-full flex-1">
        {/* Buscador y selector de orden */}
        <div className="flex flex-col sm:flex-row sm:justify-between items-stretch sm:items-center gap-3 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs border border-neutral-200 rounded-full focus:outline-none focus:border-(--store-accent) focus:ring-1 focus:ring-(--store-accent-ring) bg-neutral-50/50"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => handleSearchChange("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 bg-white border border-neutral-200 rounded-full px-3 py-2 text-xs self-start sm:self-auto">
            <ArrowUpDown className="w-3.5 h-3.5 text-neutral-400" />
            <select
              value={sortBy}
              onChange={(e) => handleSortChange(e.target.value)}
              className="bg-transparent text-neutral-700 text-xs font-medium focus:outline-none cursor-pointer"
            >
              {SORT_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Rejilla de productos o mensaje sin resultados */}
        {filteredProducts.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 items-start sm:gap-6 xl:mb-40">
            {filteredProducts.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                storeSlug={store.slug}
                onQuickAdd={handleQuickAdd}
                isAdded={addedId === Number(p.id)}
              />
            ))}
          </div>
        ) : (
          <div className="py-20 xl:py-32 text-center flex flex-col items-center justify-center">
            <h2 className="text-sm font-medium text-neutral-900 mb-1">No products found</h2>
            <p className="text-xs text-neutral-500 max-w-xs mb-3">
              Try a different search term or browse all categories.
            </p>
            {(searchQuery || selectedCategory !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCategory("all");
                  updateParams("", sortBy, "all");
                }}
                className="px-4 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs rounded-full transition"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}
      </main>

      <StoreFooter store={store} />
    </div>
  );
};
