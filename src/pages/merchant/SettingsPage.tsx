import React, { useEffect, useState, useRef } from "react";
import { useAuth } from "../../context/AuthContext";
import { MerchantLayout } from "../../components/MerchantLayout";
import toast from "react-hot-toast";
import { StoreBrandingForm } from "../../components/merchant/settings/StoreBrandingForm";
import { StoreShippingForm } from "../../components/merchant/settings/StoreShippingForm";
import { Spinner } from "../../components/common/Spinner";
import { StoreHeroStyleSelector, type HeroStyleType } from "../../components/merchant/settings/StoreHeroStyleSelector";
import { StoreAccentColorSelector } from "../../components/merchant/settings/StoreAccentColorSelector";
import { api } from "../../config/api";

/**
 * Página "Ajustes de la tienda" del comerciante: edita nombre, descripción,
 * moneda, logo, banner, envío, estilo de cabecera (hero) y color de acento.
 *
 * Es el cliente de `updateMyStore` (backend): todas las llamadas son
 * `PUT /api/stores/me` con un body PARCIAL (solo los campos que se envían se
 * validan con `parseStoreInput(body, true)` y se modifican). Más la subida de
 * imágenes `POST /api/upload/single` (`uploadSingle`).
 *
 * Hay DOS formas de guardar:
 *  1. Autoguardado inmediato: el estilo de hero y el color de acento se
 *     guardan al cambiarlos (el color con debounce de 350 ms).
 *  2. Botón "Save Store Settings": guarda el resto del formulario (y, de
 *     nuevo, hero y color).
 *
 * Tras cada guardado correcto se llama a `setStore(res.data.store)` para que
 * el resto de la app (navbar, tienda pública, etc.) vea los datos nuevos.
 *
 * IMPORTANTE: `slug` y `status` NO se pueden cambiar aquí (el backend los
 * ignora). Las validaciones del cliente son solo UX; las reales son las de
 * `parseStoreInput`.
 */
export const SettingsPage: React.FC = () => {
  // `store` es la tienda cargada en el contexto (de `AuthProvider.refreshMe`).
  const { store, setStore } = useAuth();

  // Un estado por campo. Se rellenan desde `store` en el `useEffect` de abajo.
  // Los números van como STRING porque es lo que entrega un `<input>`.
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [logoUrl, setLogoUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [shippingFee, setShippingFee] = useState("0");
  const [freeShippingThreshold, setFreeShippingThreshold] = useState("0");
  const [heroStyle, setHeroStyle] = useState<HeroStyleType>("hero1");
  const [accentColor, setAccentColor] = useState("#059669");

  // `loading` pasa a false cuando llega la tienda; `saving` mientras se guarda.
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Indicadores de subida separados para logo y banner (a diferencia de `StoreSetup`).
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  // Guarda el id del temporizador del debounce del color. Es un `ref` (no un
  // estado) porque cambiarlo no debe provocar un nuevo render.
  const accentColorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Limpieza al salir de la página: cancela un guardado de color pendiente
  // para que no se ejecute con el componente ya desmontado.
  useEffect(() => {
    return () => {
      if (accentColorTimeoutRef.current) {
        clearTimeout(accentColorTimeoutRef.current);
      }
    };
  }, []);

  // Copia los datos de la tienda a los campos del formulario. Se ejecuta
  // cuando `store` cambia, incluido tras cada `setStore(...)` de un guardado
  // (ver notas: puede pisar lo que el usuario esté editando).
  useEffect(() => {
    if (store) {
      setName(store.name || "");
      setDescription(store.description || "");
      setCurrency(store.currency || "USD");
      setLogoUrl(store.logo_url || "");
      setBannerUrl(store.banner_url || "");
      // `?.toString()`: los decimales de Prisma llegan como string ("5.00").
      setShippingFee(store.shipping_fee?.toString() || "0");
      setFreeShippingThreshold(store.free_shipping_threshold?.toString() || "0");
      setHeroStyle((store.hero_style as HeroStyleType) || "hero1");
      // Color por defecto distinto al del estado inicial (ver notas).
      setAccentColor(store.accent_color || "#ff9500");
      setLoading(false);
    }
  }, [store]);

  /**
   * Sube una imagen (logo o banner) a `POST /api/upload/single` (campo
   * "image") y guarda la URL devuelta en el estado del formulario. OJO: solo
   * rellena el campo; no se guarda en la tienda hasta pulsar "Save".
   */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: "logo" | "banner") => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];

    const fd = new FormData();
    fd.append("image", file);

    if (field === "logo") setUploadingLogo(true);
    else setUploadingBanner(true);

    try {
      const res = await api.post("/api/upload/single", fd, { headers: { "Content-Type": "multipart/form-data" } });
      if (res.data?.success) {
        if (field === "logo") setLogoUrl(res.data.url);
        else setBannerUrl(res.data.url);
        toast.success("Image uploaded!");
      }
    } catch (err) {
      toast.error("Upload failed");
    } finally {
      if (field === "logo") setUploadingLogo(false);
      else setUploadingBanner(false);
    }
  };

  /**
   * Cambia el estilo de cabecera y lo guarda AL INSTANTE (sin pulsar "Save").
   * Se actualiza el estado local primero (respuesta inmediata en pantalla) y
   * luego se envía solo `{ hero_style }`. Si falla, el selector se queda en el
   * valor nuevo aunque no se guardó (ver notas).
   */
  const handleHeroStyleChange = async (newStyle: HeroStyleType) => {
    setHeroStyle(newStyle);

    try {
      const res = await api.put("/api/stores/me", { hero_style: newStyle });
      if (res.data?.success) {
        setStore(res.data.store);
        toast.success("Hero layout saved!");
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to save hero layout");
    }
  };

  /**
   * Cambia el color de acento con DEBOUNCE: el color se actualiza al momento
   * en pantalla, pero la petición al servidor solo se envía cuando el usuario
   * deja de mover el selector durante 350 ms. Cada cambio cancela el
   * temporizador anterior. Evita decenas de peticiones al arrastrar un
   * selector de color. El backend exige formato "#RRGGBB".
   */
  const handleAccentColorChange = async (newColor: string) => {
    setAccentColor(newColor);

    if (accentColorTimeoutRef.current) {
      clearTimeout(accentColorTimeoutRef.current);
    }

    accentColorTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await api.put("/api/stores/me", { accent_color: newColor });
        if (res.data?.success) {
          setStore(res.data.store);
          toast.success("Accent color saved!");
        }
      } catch (err: any) {
        toast.error(err.response?.data?.message || "Failed to save accent color");
      }
    }, 350);
  };

  /**
   * Guarda el formulario completo con un único `PUT /api/stores/me`.
   * Los números vacíos o inválidos pasan a 0 (`Number(x) || 0`). `logo_url` y
   * `banner_url` vacíos ("") se guardan como `null` (el backend los borra).
   * Muestra el `message` del backend (400...) si algo no valida.
   */
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); // evita que el navegador recargue la página
    setSaving(true);
    try {
      const res = await api.put("/api/stores/me", {
        name: name.trim(),
        description: description.trim(),
        currency,
        logo_url: logoUrl,
        banner_url: bannerUrl,
        shipping_fee: Number(shippingFee) || 0,
        free_shipping_threshold: Number(freeShippingThreshold) || 0,
        hero_style: heroStyle,
        accent_color: accentColor,
      });

      if (res.data?.success) {
        setStore(res.data.store);
        toast.success("Store settings updated Successfully!");
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to update settings");
    } finally {
      setSaving(false)
    }
  };

  // Spinner hasta que la tienda llega del contexto.
  if (loading) {
    return (
      <MerchantLayout>
        <Spinner padded />
      </MerchantLayout>
    );
  }

  return (
    <MerchantLayout>
      <div className="space-y-6 max-w-4xl font-sans">
        <h1 className="text-xl sm:text-2xl text-neutral-900 mt-10">Store Settings</h1>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Estilo de cabecera: se guarda al seleccionarlo. */}
          <div className="p-6 bg-white border border-neutral-200/90 rounded-3xl shadow-xs">
            <StoreHeroStyleSelector value={heroStyle} onChange={handleHeroStyleChange} />
          </div>

          {/* Color de acento: se guarda con debounce. */}
          <div className="p-6 bg-white border border-neutral-200/90 rounded-3xl shadow-xs">
            <StoreAccentColorSelector value={accentColor} onChange={handleAccentColorChange} />
          </div>

          {/* Marca: nombre, descripción, logo y banner (con subida de archivos). */}
          <StoreBrandingForm
            name={name}
            onNameChange={setName}
            description={description}
            onDescriptionChange={setDescription}
            logoUrl={logoUrl}
            onLogoUrlChange={setLogoUrl}
            bannerUrl={bannerUrl}
            onBannerUrlChange={setBannerUrl}
            onFileUpload={handleFileUpload}
            uploadingLogo={uploadingLogo}
            uploadingBanner={uploadingBanner}
          />

          {/* Envío: coste y umbral de envío gratis. */}
          <StoreShippingForm
            shippingFee={shippingFee}
            onShippingFeeChange={setShippingFee}
            freeShippingThreshold={freeShippingThreshold}
            onFreeShippingThresholdChange={setFreeShippingThreshold}
          />

          <button
            type="submit"
            disabled={saving}
            className="py-3 px-7 text-white bg-emerald-600 text-xs font-semibold rounded-full transition disabled:opacity-50 cursor-pointer shadow-xs active:scale-[0.98]"
          >
            {saving ? "Saving Changes..." : "Save Store Settings"}
          </button>
        </form>
      </div>
    </MerchantLayout>
  );
};