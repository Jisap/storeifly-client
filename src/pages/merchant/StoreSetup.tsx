import React, { useState } from "react";
import { useNavigate, useSearchParams, Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Store, ArrowRight, Upload } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "../../config/api";

/**
 * Página "Configura tu tienda": formulario de creación de la tienda del
 * comerciante. Es la pantalla a la que `AuthCard` envía (`/merchant/store-setup`)
 * a quien entra como merchant y todavía no tiene tienda.
 *
 * Es el cliente de dos endpoints del backend:
 *  - `POST /api/upload/single`  → `uploadSingle` (sube logo y banner a Cloudinary).
 *  - `POST /api/stores`         → `createStore` (crea la tienda y asigna el rol "merchant").
 *
 * Opcionalmente puede venir con `?slug=mi-tienda` en la URL (por ejemplo,
 * desde una landing donde el usuario ya eligió su dirección): el nombre y el
 * slug se rellenan a partir de ahí.
 *
 * Flujo:
 *  1. Guardas de acceso (cargando / sin sesión / admin / ya tiene tienda).
 *  2. El usuario rellena nombre, slug, descripción, moneda, envío e imágenes.
 *  3. Al enviar, se crea la tienda; si va bien, se guarda en el contexto y se
 *     navega a `/merchant`.
 *
 * IMPORTANTE: las validaciones de aquí son solo comodidad de UX. Las reales
 * son las de `parseStoreInput` y `createStore` en el backend.
 */
export const StoreSetup: React.FC = () => {
  // `store` y `setStore` del contexto: si ya hay tienda se redirige; al crearla
  // se guarda con `setStore`. `loading` se renombra a `authLoading` (es el
  // "¿ya se comprobó la sesión?" de `AuthProvider`).
  const { user, store, setStore, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialSlug = searchParams.get("slug") || "";

  // Nombre inicial: si vino un slug, lo convierte en título.
  // "nordic-ceramics" → "nordic ceramics" → "Nordic Ceramics"
  // (`\b\w` es la primera letra de cada palabra).
  const [name, setName] = useState(initialSlug ? initialSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "");
  const [slug, setSlug] = useState(initialSlug);
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState("USD");
  // Los números se guardan como STRING porque es lo que da un `<input>`;
  // se convierten con `Number(...)` al enviar.
  const [shippingFee, setShippingFee] = useState("5.00");
  const [freeShippingThreshold, setFreeShippingThreshold] = useState("50.00");
  const [logoUrl, setLogoUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  // ---- GUARDAS DE ACCESO ----
  // Todos los hooks están ARRIBA de estos `return` (requisito de React: los
  // hooks no pueden ir después de un return condicional). Las funciones de
  // más abajo no son hooks, por eso sí pueden ir después.

  // Aún no se sabe si hay sesión: se evita redirigir a login por error.
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-neutral-400 text-xs font-mono">
        Authenticating...
      </div>
    );
  }

  // Sin sesión → login de comerciantes.
  if (!user) {
    return <Navigate to="/merchant/login" replace />;
  }

  // Los admins no pueden tener tienda (misma regla que `createStore`).
  if (user.role === "admin") {
    return <Navigate to="/admin" replace />;
  }

  // Ya tiene tienda → panel. Es también lo que redirige tras crearla: al
  // hacer `setStore`, esta guarda se activa en el siguiente render.
  if (store) {
    return <Navigate to="/merchant" replace />;
  }

  /**
   * Al escribir el nombre, el slug se autogenera MIENTRAS el usuario no lo
   * haya tocado: se considera "no tocado" si está vacío o si coincide con la
   * versión simple del nombre ANTERIOR (`name` aquí aún es el valor viejo).
   * Normalización: minúsculas, todo lo que no sea a-z/0-9 pasa a "-", y se
   * quitan guiones al principio y al final.
   * Ej.: "Nordic  Ceramics!" → "nordic-ceramics"
   */
  const handleNameChange = (val: string) => {
    setName(val);
    if (!slug || slug === name.toLowerCase().replace(/\s+/g, "-")) {
      setSlug(
        val
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, ""),
      );
    }
  };

  /**
   * Sube una imagen (logo o banner) al backend y guarda la URL devuelta.
   *
   * Envía `multipart/form-data` con el campo "image": ese nombre debe
   * coincidir con el de multer en la ruta (`upload.single("image")`).
   * La respuesta de `uploadSingle` es `{ success, url, public_id }`; aquí
   * solo se usa `url` (ya optimizada con f_auto,q_auto).
   */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: "logo" | "banner") => {
    // El usuario pudo cancelar el selector de archivos.
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];

    const formData = new FormData();
    formData.append("image", file);

    if (field === "logo") setUploadingLogo(true);
    else setUploadingBanner(true);

    try {
      const res = await api.post("/api/upload/single", formData);

      if (res.data.success) {
        if (field === "logo") setLogoUrl(res.data.url);
        else setBannerUrl(res.data.url);
        toast.success("Image uploaded!");
      }
    } catch {
      toast.error("Image upload failed");
    } finally {
      if (field === "logo") setUploadingLogo(false);
      else setUploadingBanner(false);
    }
  };

  /**
   * Envía el formulario: crea la tienda con `POST /api/stores`.
   *
   * Notas del contrato con el backend (`parseStoreInput` + `createStore`):
   *  - `slug` es opcional para el backend; si se envía se normaliza con
   *    `generateSlug`. Si el slug ya existe responde 409 ("That store URL is
   *    already taken"), que se muestra en el toast.
   *  - Los precios se convierten con `Number(...) || 0` (vacío o inválido → 0).
   *  - `logo_url` / `banner_url` vacíos ("") se guardan como `null`.
   *  - `payment_methods` NO se envía: la tienda hereda el `@default` del schema
   *    (los tres métodos). Ver notas.
   *  - `hero_style: "hero1"` va fijo (uno de los valores de `VALID_HEROES`).
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); // evita que el navegador recargue la página
    if (!name.trim()) {
      toast.error("Please enter a store name");
      return;
    }

    setLoading(true);
    try {
      const res = await api.post("/api/stores", {
        name: name.trim(),
        slug: slug.trim(),
        description,
        currency,
        shipping_fee: Number(shippingFee) || 0,
        free_shipping_threshold: Number(freeShippingThreshold) || 0,
        logo_url: logoUrl,
        banner_url: bannerUrl,
        hero_style: "hero1",
      });

      if (res.data.success) {
        // Guarda la tienda en el contexto; la guarda `if (store)` de
        // arriba redirigirá a /merchant. El `navigate` siguiente es
        // redundante pero inofensivo.
        setStore(res.data.store);
        toast.success("Store created successfully!");
        navigate("/merchant");
      }
    } catch (err: any) {
      // Muestra el `message` del backend (400/409/403...) o uno genérico.
      toast.error(err.response?.data?.message || "Failed to create store");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50/70 flex items-center justify-center p-4 py-12 font-sans">
      <div className="w-full max-w-xl bg-white rounded-3xl sm:rounded-4xl border border-neutral-200/80 p-7 sm:p-10">
        {/* Cabecera */}
        <div className="flex items-center gap-3.5 mb-7">
          <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-800 shrink-0">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl text-neutral-900">Setup Your Store</h1>
            <p className="text-xs text-neutral-400 mt-0.5">
              Configure your brand, store URL, and delivery rules to start selling online.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* NOMBRE Y SLUG. El slug se limita a a-z, 0-9 y "-" mientras se escribe. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[11px] font-medium text-neutral-700 mb-1.5">Store Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Nordic Ceramics"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                className="w-full px-3.5 py-2 text-xs border border-neutral-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/20 bg-neutral-50/50"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-neutral-700 mb-1.5">Store URL Slug *</label>
              {/* Contenedor que simula un input con prefijo fijo "/store/". */}
              <div className="flex items-center border border-neutral-200 rounded-xl px-3.5 py-2 bg-neutral-50/50 text-xs focus-within:border-emerald-600 focus-within:ring-1 focus-within:ring-emerald-600/20">
                <span className="text-neutral-400 font-mono text-[11px]">/store/</span>
                <input
                  type="text"
                  required
                  placeholder="nordic-ceramics"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  className="w-full bg-transparent focus:outline-none font-mono text-neutral-900 ml-1 text-xs"
                />
              </div>
            </div>
          </div>

          {/* DESCRIPCIÓN (el backend admite hasta 2000 caracteres). */}
          <div>
            <label className="block text-[11px] font-medium text-neutral-700 mb-1.5">Store Tagline / Bio</label>
            <textarea
              rows={2}
              placeholder="Handcrafted Scandinavian tableware and interior objects."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2 text-xs border border-neutral-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/20 bg-neutral-50/50"
            />
          </div>

          {/* MONEDA Y ENVÍO. `min="0"` solo bloquea las flechas del input; el backend rechaza negativos. */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-neutral-700 mb-1.5">Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3.5 py-2 text-xs border border-neutral-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/20 bg-neutral-50/50"
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="CAD">CAD ($)</option>
                <option value="INR">INR (₹)</option>
                <option value="GHS">GHS (GH₵)</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-neutral-700 mb-1.5">Shipping Fee ({currency})</label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={shippingFee}
                onChange={(e) => setShippingFee(e.target.value)}
                className="w-full px-3.5 py-2 text-xs border border-neutral-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/20 bg-neutral-50/50 font-mono"
              />
            </div>
            <div>
              {/* Umbral de envío gratis: 0 significa "sin envío gratis" (ver `createOrder`). */}
              <label className="block text-[11px] font-medium text-neutral-700 mb-1.5">Free Shipping Over ({currency})</label>
              <input
                type="number"
                step="1"
                min="0"
                value={freeShippingThreshold}
                onChange={(e) => setFreeShippingThreshold(e.target.value)}
                className="w-full px-3.5 py-2 text-xs border border-neutral-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/20 bg-neutral-50/50 font-mono"
              />
            </div>
          </div>

          {/* LOGO Y BANNER: se puede pegar una URL https o subir un archivo.
                        El botón "Upload" es un <label> que envuelve un <input type="file">
                        oculto: pulsar el label abre el selector de archivos. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 border-t border-neutral-100 pt-5">
            <div>
              <label className="block text-[11px] font-medium text-neutral-700 mb-1.5">Store Logo</label>
              <input
                type="text"
                placeholder="https://..."
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                className="w-full px-3.5 py-2 text-xs border border-neutral-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/20 bg-neutral-50/50 mb-2"
              />
              <label className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-neutral-100 hover:bg-neutral-200 rounded-full text-[11px] font-medium text-neutral-700 cursor-pointer transition">
                <Upload className="w-3.5 h-3.5" />
                <span>{uploadingLogo ? "Uploading..." : "Upload Logo"}</span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, "logo")} />
              </label>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-neutral-700 mb-1.5">Hero Banner</label>
              <input
                type="text"
                placeholder="https://..."
                value={bannerUrl}
                onChange={(e) => setBannerUrl(e.target.value)}
                className="w-full px-3.5 py-2 text-xs border border-neutral-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/20 bg-neutral-50/50 mb-2"
              />
              <label className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-neutral-100 hover:bg-neutral-200 rounded-full text-[11px] font-medium text-neutral-700 cursor-pointer transition">
                <Upload className="w-3.5 h-3.5" />
                <span>{uploadingBanner ? "Uploading..." : "Upload Banner"}</span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, "banner")} />
              </label>
            </div>
          </div>

          {/* Botón principal: se desactiva mientras se crea la tienda. */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-full transition shadow-xs shadow-emerald-700/20 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer mt-4"
          >
            <span>{loading ? "Creating Store..." : "Launch Store & Open Dashboard"}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};