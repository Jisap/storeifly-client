import React, { createContext, useContext, useState, useEffect } from "react";
import { authClient } from "../auth";
import { api } from "../config/api";

/**
 * Contexto de autenticación del cliente (React).
 *
 * Es la pieza del frontend que responde a "¿quién es el usuario y qué tienda
 * tiene?". Cualquier componente puede leerlo con `useAuth()`.
 *
 * Cómo encaja con el backend:
 *  - La SESIÓN la gestiona Neon Auth (`authClient`). Este contexto la lee con
 *    `getSession()`.
 *  - El ROL "admin" / "merchant" viene de `neon_auth."user".role` (el que
 *    escribe `updateNeonUserRole`).
 *  - La TIENDA se pide a `GET /api/stores/me` (`getMyStore`), enviando el
 *    token en la cabecera `Authorization: Bearer`.
 *
 * IMPORTANTE: el rol y la tienda guardados aquí son una copia en memoria, solo
 * para decidir qué pantallas mostrar. La seguridad real está en el backend
 * (`requireAuth` / `requireRole`); nunca confíes en este estado para proteger
 * datos.
 */

/**
 * Usuario autenticado, en la forma que usa la app.
 *
 * `role` se calcula en `refreshMe` (ver allí). `store_id` es el id de su
 * tienda, o null si no tiene (o si es admin).
 */
export interface User {
  id: number | string;
  name: string;
  email: string;
  role: "admin" | "merchant" | "customer" | string;
  store_id?: number | string | null;
}

/**
 * Tienda del comerciante, como la devuelve `GET /api/stores/me`.
 *
 * Es un espejo manual del modelo `stores` de Prisma: si cambias el schema,
 * actualiza esta interfaz a mano (TypeScript no lo detecta).
 *
 * Notas:
 *  - `shipping_fee` y `free_shipping_threshold` están como `number`, pero el
 *    backend los envía como `Decimal`, que viaja como STRING ("5.00"). Ver notas.
 *  - Falta `payment_methods` (el campo nuevo que añadiste al schema).
 */
export interface Store {
  id: number | string;
  merchant_id: string | number;
  name: string;
  slug: string;
  logo_url?: string;
  banner_url?: string;
  description?: string;
  currency: string;
  status: "active" | "suspended";
  shipping_fee: number;
  free_shipping_threshold: number;
  hero_style?: "hero1" | "hero2" | "hero3" | "hero4" | string;
  accent_color?: string;
}

/**
 * Lo que expone el contexto a los componentes:
 *  - user / store: datos actuales, o `null` si no hay sesión / tienda.
 *  - token: token de sesión (también guardado en localStorage).
 *  - loading: `true` hasta que termina la PRIMERA comprobación de sesión.
 *    Úsalo para no mostrar un "no has iniciado sesión" falso al cargar.
 *  - login: guarda token, usuario y (opcional) tienda de forma manual.
 *  - logout: cierra la sesión.
 *  - refreshMe: vuelve a leer sesión, rol y tienda (llámalo tras crear la
 *    tienda o tras `onboardMerchant`).
 *  - setStore: reemplaza la tienda en memoria (por ejemplo, tras editarla).
 */
interface AuthContextType {
  user: User | null;
  token: string | null;
  store: Store | null;
  loading: boolean;
  login: (token: string, user: User, store?: Store | null) => void;
  logout: () => void;
  refreshMe: () => Promise<void>;
  setStore: (store: Store | null) => void;
}

// `undefined` como valor inicial permite que `useAuth` detecte si se usa
// fuera del Provider y lance un error claro.
const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Provider: envuelve la app (normalmente en `main.tsx` o `App.tsx`) y
 * mantiene el estado de autenticación. Al montarse, comprueba la sesión.
 */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  // El token se inicializa desde localStorage para que esté disponible en
  // el primer render, antes de que termine `refreshMe`.
  const [token, setToken] = useState<string | null>(localStorage.getItem("storeifly_token"));
  const [store, setStore] = useState<Store | null>(null);
  // Empieza en `true`: aún no se sabe si hay sesión.
  const [loading, setLoading] = useState<boolean>(true);

  /**
   * Sincroniza el estado con la realidad: lee la sesión de Neon Auth,
   * calcula el rol y carga la tienda.
   *
   * Flujo:
   *  1. Pide la sesión a Neon Auth. Si no hay usuario → limpia todo y sale.
   *  2. Guarda el token (el de la sesión, o el que ya había en localStorage).
   *  3. Calcula el rol inicial a partir de `neonRole`.
   *  4. Si NO es admin, pide `/api/stores/me`. Si devuelve tienda, el usuario
   *     es "merchant" (aunque su rol en BD aún no lo dijera).
   *  5. Guarda `user` y `store`.
   *
   * `finally` garantiza que `loading` pase a `false` en cualquier caso.
   */
  const refreshMe = async () => {
    try {
      // `.catch(() => null)` evita que un fallo de red rompa la función:
      // se trata como "sin sesión".
      const sessionRes = await authClient.getSession().catch(() => null);
      const activeSession = sessionRes?.data?.session;
      const activeNeonUser = sessionRes?.data?.user;

      // Token: preferimos el de la sesión activa; si no, el guardado.
      const savedToken = activeSession?.token || localStorage.getItem("storeifly_token");

      // Sin usuario en la sesión de Neon: se borra todo rastro local.
      if (!activeNeonUser) {
        localStorage.removeItem("storeifly_token");
        setUser(null);
        setStore(null);
        setToken(null);
        setLoading(false);
        return;
      }

      if (savedToken) {
        localStorage.setItem("storeifly_token", savedToken);
        setToken(savedToken);
      }

      // Por defecto, cualquier usuario es "customer".
      let initialRole: "admin" | "merchant" | "customer" | string = "customer";

      // `role` no está en el tipo del usuario de Neon Auth, de ahí el `as any`.
      // Solo existe si el plugin de administración/roles está activo.
      const neonRole = (activeNeonUser as any).role;

      if (neonRole === "admin") {
        initialRole = "admin";
      } else if (neonRole === "merchant") {
        initialRole = "merchant";
      }

      let resolvedStore: Store | null = null;

      // Los admins no pueden tener tienda (misma regla que `createStore`
      // en el backend), así que ni se consulta.
      if (initialRole !== "admin") {
        try {
          // `/api/stores/me` = `getMyStore`. Devuelve 404 si el usuario
          // aún no tiene tienda; axios lo lanza como excepción y el
          // `catch` lo trata como "sin tienda" (caso normal, no error).
          const storeRes = await api.get("/api/stores/me", {
            headers: savedToken ? { Authorization: `Bearer ${savedToken}` } : undefined,
          });
          if (storeRes.data?.success && storeRes.data?.store) {
            resolvedStore = storeRes.data.store;
            // Tener tienda implica ser merchant, aunque `neonRole` sea null.
            initialRole = "merchant";
          }
        } catch {
          resolvedStore = null;
        }
      }

      setUser({
        id: activeNeonUser.id,
        // Si no tiene nombre, se usa la parte del email antes de la "@".
        name: activeNeonUser.name || activeNeonUser.email.split("@")[0],
        email: activeNeonUser.email,
        role: initialRole,
        store_id: initialRole === "admin" ? null : (resolvedStore?.id || null),
      });

      setStore(initialRole === "admin" ? null : resolvedStore);

    } catch (err) {
      // Fallo inesperado: se cierra la sesión local por seguridad.
      console.error("Error refreshing auth session:", err);
      localStorage.removeItem("storeifly_token");
      setUser(null);
      setStore(null);
      setToken(null);
    } finally {
      setLoading(false)
    }

  };

  // Al montar el Provider, comprueba la sesión una vez (array vacío = solo al inicio).
  useEffect(() => {
    refreshMe();
  }, []);

  /**
   * Guarda manualmente token, usuario y tienda (por ejemplo, justo después
   * de un login o registro, sin esperar a `refreshMe`).
   * `newStore !== undefined`: si no se pasa tienda, se conserva la actual;
   * si se pasa `null`, se borra.
   */
  const login = (newToken: string, newUser: User, newStore?: Store | null) => {

    if (newToken) {
      localStorage.setItem("storeifly_token", newToken);
      setToken(newToken);
    }

    setUser(newUser);
    if (newStore !== undefined) {
      setStore(newStore);
    }
  };

  /**
   * Cierra la sesión en Neon Auth y limpia el estado local. Si `signOut`
   * falla (red), igualmente se limpia lo local. Es `async`, pero el tipo
   * del contexto la declara como `() => void`; funciona, solo que quien la
   * llame no puede hacer `await` con tipos correctos (ver notas).
   */
  const logout = async () => {
    try {
      await authClient.signOut();
    } catch (e) {
      console.warn("SignOut error:", e);
    }

    localStorage.removeItem("storeifly_token");
    setToken(null);
    setUser(null);
    setStore(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, store, loading, login, logout, refreshMe, setStore }}>{children}</AuthContext.Provider>
  );
};

/**
 * Hook para leer el contexto: `const { user, store, loading } = useAuth();`.
 * Lanza un error si se usa fuera de `<AuthProvider>`.
 */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};