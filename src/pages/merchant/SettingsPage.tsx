import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
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
 * Color de acento por defecto. Se usa en el estado inicial Y como fallback
 * en el `useEffect` para que nunca haya inconsistencia entre ambos.
 */
const DEFAULT_ACCENT = "#059669";

/**
 * Opciones de moneda disponibles en el selector. Incluye GHS (el valor por
 * defecto del backend) para evitar un `<select>` sin opción seleccionada.
 */
const CURRENCY_OPTIONS = [
  { value: "GHS", label: "GHS – Ghanaian Cedi" },
  { value: "USD", label: "USD – US Dollar" },
  { value: "EUR", label: "EUR – Euro" },
  { value: "GBP", label: "GBP – British Pound" },
  { value: "NGN", label: "NGN – Nigerian Naira" },
];

/**
 * Métodos de pago disponibles, alineados con `VALID_PAYMENT_METHODS` del
 * backend (`storeController.ts`).
 */
const PAYMENT_METHOD_OPTIONS: { value: string; label: string }[] = [
  { value: "mobile_money",     label: "Mobile Money" },
  { value: "cash_on_delivery", label: "Cash on Delivery" },
  { value: "bank_transfer",    label: "Bank Transfer" },
];

/**
 * Página "Ajustes de la tienda" del comerciante: edita nombre, descripción,
 * moneda, logo, banner, envío, métodos de pago, estilo de cabecera (hero) y
 * color de acento.
 *
 * Es el cliente de `updateMyStore` (backend): todas las llamadas son
 * `PUT /api/stores/me` con un body PARCIAL (solo los campos que se envían se
 * validan con `parseStoreInput(body, true)` y se modifican). Más la subida de
 * imágenes `POST /api/upload/single` (`uploadSingle`).
 *
 * Hay DOS formas de guardar:
 *  1. Autoguardado inmediato: el estilo de hero y el color de acento se
 *     guardan al cambiarlos (el color con debounce de 350 ms).
 *  2. Botón "Save Store Settings": guarda el resto del formulario (excepto
 *     hero y color, que ya se guardaron por su cuenta).
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
  const { store, setStore, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Un estado por campo. Se rellenan desde `store` en el `useEffect` de abajo.
  // Los números van como STRING porque es lo que entrega un `<input>`.
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [logoUrl, setLogoUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [shippingFee, setShippingFee] = useState("0");
  const [freeShippingThreshold, setFreeShippingThreshold] = useState("0");
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [heroStyle, setHeroStyle] = useState<HeroStyleType>("hero1");
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT);

  // `loading` pasa a false cuando llega la tienda; `saving` mientras se guarda.
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Indicadores de subida separados para logo y banner (a diferencia de `StoreSetup`).
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  // Guarda el id del temporizador del debounce del color. Es un `ref` (no un
  // estado) porque cambiarlo no debe provocar un nuevo render.
  const accentColorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Flag para rellenar el formulario solo una vez (en el primer render con
  // tienda). Evita que `setStore` (llamado tras cada autoguardado) resetee
  // los campos mientras el usuario está editando.
  const initialized = useRef(false);

  // Limpieza al salir de la página: cancela un guardado de color pendiente
  // para que no se ejecute con el componente ya desmontado.
  useEffect(() => {
    return () => {
      if (accentColorTimeoutRef.current) {
        clearTimeout(accentColorTimeoutRef.current);
      }
    };
  }, []);

  // Si la auth terminó de cargar y no hay tienda, el usuario no tiene tienda:
  // redirige a la configuración inicial en lugar de girar el spinner para siempre.
  useEffect(() => {
    if (!authLoading && !store) {
      navigate("/merchant/store-setup");
    }
  }, [authLoading, store, navigate]);

  // Copia los datos de la tienda a los campos del formulario. Solo rellena
  // todos los campos UNA VEZ (primera carga). En actualizaciones posteriores
  // de `store` (tras autoguardados) solo se sincronizan heroStyle y
  // accentColor, que el usuario no puede editar a mano.
  useEffect(() => {
    if (!store) return;

    if (!initialized.current) {
      // Primera carga: rellena todos los campos.
      initialized.current = true;
      setName(store.name || "");
      setDescription(store.description || "");
      setCurrency(store.currency || "USD");
      setLogoUrl(store.logo_url || "");
      setBannerUrl(store.banner_url || "");
      // `?.toString()`: los decimales de Prisma llegan como string ("5.00").
      setShippingFee(store.shipping_fee?.toString() || "0");
      setFreeShippingThreshold(store.free_shipping_threshold?.toString() || "0");
      setPaymentMethods(store.payment_methods ?? []);
    }

    // Siempre (incluidos autoguardados): sincroniza solo los campos
    // controlados por los selectores de autoguardado.
    setHeroStyle((store.hero_style as HeroStyleType) || "hero1");
    setAccentColor(store.accent_color || DEFAULT_ACCENT);
    setLoading(false);
  }, [store]);

  /**
   * Sube una imagen (logo o banner) a `POST /api/upload/single` (campo
   * "image") y guarda la URL devuelta en el estado del formulario. OJO: solo
   * rellena el campo; no se guarda en la tienda hasta pulsar "Save".
   * Se limpia el valor del `<input>` al terminar para permitir subir el mismo
   * archivo dos veces seguidas.
   */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: "logo" | "banner") => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    // Guarda la referencia al input ANTES del await para poder limpiarlo luego.
    const input = e.target;

    const fd = new FormData();
    fd.append("image", file);

    if (field === "logo") setUploadingLogo(true);
    else setUploadingBanner(true);

    try {
      // No se fija `Content-Type` a mano: axios lo hace con el `boundary`
      // correcto al detectar que el body es un `FormData`.
      const res = await api.post("/api/upload/single", fd);
      if (res.data?.success) {
        if (field === "logo") setLogoUrl(res.data.url);
        else setBannerUrl(res.data.url);
        toast.success("Image uploaded! Click Save to apply changes.");
      }
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.message ?? "Upload failed";
      toast.error(msg);
    } finally {
      // Permite subir el mismo archivo de nuevo (el navegador no dispara
      // `onChange` si el valor no cambia).
      input.value = "";
      if (field === "logo") setUploadingLogo(false);
      else setUploadingBanner(false);
    }
  };

  /**
   * Alterna un método de pago en la lista. Si ya está seleccionado lo quita;
   * si no, lo añade.
   */
  const togglePaymentMethod = (method: string) => {
    setPaymentMethods((prev) =>
      prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method]
    );
  };

  /**
   * Cambia el estilo de cabecera y lo guarda AL INSTANTE (sin pulsar "Save").
   * Se actualiza el estado local primero (respuesta inmediata en pantalla) y
   * luego se envía solo `{ hero_style }`. Si falla, revierte al valor previo
   * para que la UI no mienta.
   */
  const handleHeroStyleChange = async (newStyle: HeroStyleType) => {
    const prev = heroStyle;
    setHeroStyle(newStyle);

    try {
      const res = await api.put("/api/stores/me", { hero_style: newStyle });
      if (res.data?.success) {
        setStore(res.data.store);
        toast.success("Hero layout saved!");
      }
    } catch (err: unknown) {
      setHeroStyle(prev);
      const msg = (err as any)?.response?.data?.message ?? "Failed to save hero layout";
      toast.error(msg);
    }
  };

  /**
   * Cambia el color de acento con DEBOUNCE: el color se actualiza al momento
   * en pantalla, pero la petición al servidor solo se envía cuando el usuario
   * deja de mover el selector durante 350 ms. Cada cambio cancela el
   * temporizador anterior. Evita decenas de peticiones al arrastrar un
   * selector de color. El backend exige formato "#RRGGBB".
   * Si falla, revierte al valor previo.
   */
  const handleAccentColorChange = (newColor: string) => {
    const prev = accentColor;
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
      } catch (err: unknown) {
        setAccentColor(prev);
        const msg = (err as any)?.response?.data?.message ?? "Failed to save accent color";
        toast.error(msg);
      }
    }, 350);
  };

  /**
   * Guarda el formulario completo con un único `PUT /api/stores/me`.
   * Los números vacíos o inválidos pasan a 0 (`Number(x) || 0`). `logo_url` y
   * `banner_url` vacíos ("") se guardan como `null` (el backend los borra).
   * `payment_methods` vacío se rechaza en el backend; el botón se deshabilita
   * si la lista está vacía.
   * Muestra el `message` del backend (400...) si algo no valida.
   */
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); // evita que el navegador recargue la página

    if (paymentMethods.length === 0) {
      toast.error("Select at least one payment method.");
      return;
    }

    setSaving(true);
    try {
      const res = await api.put("/api/stores/me", {
        name: name.trim(),
        description: description.trim(),
        currency,
        logo_url: logoUrl || null,
        banner_url: bannerUrl || null,
        shipping_fee: Number(shippingFee) || 0,
        free_shipping_threshold: Number(freeShippingThreshold) || 0,
        payment_methods: paymentMethods,
      });

      if (res.data?.success) {
        setStore(res.data.store);
        toast.success("Store settings updated successfully!");
      }
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.message ?? "Failed to update settings";
      toast.error(msg);
    } finally {
      setSaving(false);
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

          {/* Moneda */}
          <div className="p-6 bg-white border border-neutral-200/90 rounded-3xl shadow-xs space-y-4">
            <h2 className="font-medium text-neutral-900">Currency</h2>
            <div>
              <label className="block text-[11px] font-medium text-neutral-700 mb-1.5">Store Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full sm:w-56 px-3.5 py-2 text-xs border border-neutral-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/20 bg-neutral-50/50"
              >
                {CURRENCY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Métodos de pago */}
          <div className="p-6 bg-white border border-neutral-200/90 rounded-3xl shadow-xs space-y-4">
            <h2 className="font-medium text-neutral-900">Payment Methods</h2>
            <p className="text-[11px] text-neutral-500">Select at least one method your customers can use to pay.</p>
            <div className="flex flex-wrap gap-3">
              {PAYMENT_METHOD_OPTIONS.map(({ value, label }) => {
                const checked = paymentMethods.includes(value);
                return (
                  <label
                    key={value}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium cursor-pointer border transition select-none ${
                      checked
                        ? "bg-emerald-50 border-emerald-500 text-emerald-800"
                        : "bg-neutral-100 border-neutral-200 text-neutral-700 hover:bg-neutral-200"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={checked}
                      onChange={() => togglePaymentMethod(value)}
                    />
                    {label}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Envío: coste y umbral de envío gratis. */}
          <StoreShippingForm
            shippingFee={shippingFee}
            onShippingFeeChange={setShippingFee}
            freeShippingThreshold={freeShippingThreshold}
            onFreeShippingThresholdChange={setFreeShippingThreshold}
          />

          <button
            type="submit"
            disabled={saving || paymentMethods.length === 0}
            className="py-3 px-7 text-white bg-emerald-600 text-xs font-semibold rounded-full transition disabled:opacity-50 cursor-pointer shadow-xs active:scale-[0.98]"
          >
            {saving ? "Saving Changes..." : "Save Store Settings"}
          </button>
        </form>
      </div>
    </MerchantLayout>
  );
};
