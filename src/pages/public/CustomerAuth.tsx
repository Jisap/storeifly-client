import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { StoreNavbar } from "../../components/StoreNavbar";
import { AuthCard } from "../../components/common/AuthCard";
import { getStoreAccentStyles } from "../../utils/storeAccent";
import { api } from "../../config/api";

/**
 * Página de login/registro de CLIENTES dentro de una tienda concreta.
 *
 * Ruta esperada: algo como `/store/:storeSlug/auth` (el nombre exacto lo
 * define tu `App.tsx`). El `storeSlug` de la URL indica de qué tienda viene
 * el cliente, y la página se pinta con la identidad visual de esa tienda
 * (navbar y color de acento).
 *
 * Es la respuesta a la primera nota de `AuthCard`: aquí SÍ se pasa
 * `role="customer"` de forma explícita, así que un cliente nunca cae en el
 * valor por defecto "merchant" ni se le llama a `onboard-merchant`.
 *
 * Qué hace:
 *  1. Carga los datos públicos de la tienda por su slug.
 *  2. Si el usuario ya tiene sesión, lo redirige a la tienda.
 *  3. Si no, muestra el formulario `AuthCard` en modo cliente.
 *
 * Lo que ocurre tras autenticarse lo decide `AuthCard`: como aquí no se pasa
 * `onSuccess`, llama a `login(...)` del contexto y navega a `/store/<slug>`.
 */
export const CustomerAuth: React.FC = () => {
  // `useParams` lee `:storeSlug` de la URL. Puede ser `undefined` si la ruta
  // no lo define, por eso el tipo es `string | undefined`.
  const { storeSlug } = useParams<{ storeSlug: string }>();

  // `loading` se renombra a `authLoading` porque es el "¿ya se comprobó la
  // sesión?" del contexto (ver `AuthProvider`).
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Datos de la tienda, o `null` mientras cargan (o si falla la carga).
  // Tipado `any` (ver notas): lo ideal es usar la interfaz `Store`.
  const [store, setStore] = useState<any>(null);

  // CARGA DE LA TIENDA. Se pide por slug a `/api/stores/slug/:slug`, ruta
  // pública y de solo lectura, la que atiende tu function de Neon
  // (`/stores/slug/:slug`). La usa para dos cosas: el navbar y el color de
  // acento.
  useEffect(() => {
    if (storeSlug) {
      api.get(`/api/stores/slug/${storeSlug}`).then((res) => {
        if (res.data.success) {
          setStore(res.data.store);
        }
        // Si la tienda no existe (404) o está suspendida (403), axios lanza
        // una excepción y cae en el `.catch`, que solo la escribe en consola:
        // la página sigue mostrando el formulario sin identidad de tienda.
      }).catch(console.error);
    }
  }, [storeSlug]);

  // REDIRECCIÓN SI YA HAY SESIÓN. Se espera a `!authLoading`, para no
  // redirigir ni mostrar el formulario antes de saber si hay sesión.
  // `replace: true` sustituye esta página en el historial: así el botón
  // "atrás" no devuelve aquí en bucle.
  // OJO: redirige a CUALQUIER usuario logueado (también merchants y admins).
  useEffect(() => {
    if (!authLoading && user && storeSlug) {
      navigate(`/store/${storeSlug}`, { replace: true });
    }
  }, [user, authLoading, storeSlug, navigate]);

  return (
    // `getStoreAccentStyles` devuelve un objeto de estilos con las variables
    // CSS `--store-accent` y `--store-accent-ring`, que usan los inputs y
    // botones de `AuthCard` (clases `store-accent-btn`, `store-accent-text`).
    // Con `store` aún `null` recibe `undefined` y debería devolver el color
    // por defecto (comprueba que `storeAccent.ts` lo haga).
    <div
      className="min-h-screen bg-neutral-50/60 text-neutral-900 flex flex-col font-sans"
      style={getStoreAccentStyles(store?.accent_color)}
    >
      {/* El navbar solo se pinta cuando la tienda ya cargó. */}
      {store && <StoreNavbar store={store} />}

      <main className="max-w-md mx-auto px-4 py-12 sm:py-16 w-full flex-1 flex flex-col justify-center items-center">
        {/* `role="customer"` evita el valor por defecto "merchant". Con
            `allowRegister` el cliente puede crear cuenta. `storeId` empieza
            `undefined` hasta que carga la tienda; no pasa nada porque
            `storeSlug` ya basta para que `AuthCard` navegue de vuelta. */}
        <AuthCard
          role="customer"
          allowRegister={true}
          storeId={store?.id}
          storeSlug={storeSlug}
        />
      </main>
    </div>
  );
};