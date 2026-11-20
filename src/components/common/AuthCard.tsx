import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, type User as AuthUserType } from "../../context/AuthContext";
// `User` (icono) se importa con ese nombre; por eso el tipo de usuario del
// contexto se renombra a `AuthUserType` y no chocan.
import { Mail, Lock, User, ArrowRight, Eye, EyeOff, ArrowLeftIcon } from "lucide-react";
import toast from "react-hot-toast";
import { authClient } from "../../auth";
import { api } from "../../config/api";

/**
 * Datos que `AuthCard` entrega a `onSuccess` cuando el login o registro termina bien.
 *  - token: token de sesión de Neon Auth ("" si no se pudo obtener).
 *  - user:  usuario ya traducido a la forma de la app (con `role` calculado).
 *  - store: tienda del comerciante, o null (tipada `any`, ver notas).
 *  - mode:  si fue "login" o "register".
 */
export interface AuthSuccessData {
  token: string;
  user: AuthUserType;
  store?: any;
  mode: "login" | "register";
}

/**
 * Props del formulario de acceso. Todas son opcionales, de modo que el mismo
 * componente sirve para tres contextos:
 *  - Login/registro de comerciantes (por defecto, sin `storeSlug`/`storeId`).
 *  - Login de administradores (`role="admin"`, normalmente con `allowRegister={false}`).
 *  - Login/registro de clientes dentro de una tienda (`storeSlug` o `storeId`).
 *
 * Props:
 *  - role:          fuerza el tipo de acceso. Si no se pasa, se deduce (ver `effectiveRole`).
 *  - initialMode:   empieza en "login" o "register". Por defecto "login".
 *  - allowRegister: si es false, oculta el registro y fuerza "login".
 *  - storeId / storeSlug: indican que es un cliente entrando desde una tienda.
 *  - onSuccess:     si se pasa, el componente NO guarda la sesión ni navega: delega
 *                   todo en quien lo use (ver notas).
 */
export interface AuthCardProps {
  role?: "admin" | "merchant" | "customer";
  initialMode?: "login" | "register";
  allowRegister?: boolean;
  storeId?: number | string;
  storeSlug?: string;
  onSuccess?: (data: AuthSuccessData) => void;
}

/**
 * Formulario de inicio de sesión y registro (email + contraseña).
 *
 * Flujo de `handleSubmit`:
 *  1. Autentica con Neon Auth (`signUp.email` o `signIn.email`).
 *  2. Obtiene la sesión y el token.
 *  3. Decide el rol (`determinedRole`).
 *  4. Si es merchant: llama a `/api/stores/onboard-merchant` (backend) y
 *     obtiene su tienda, si la tiene.
 *  5. Construye el objeto `User` de la app.
 *  6. Navega según el rol, o delega en `onSuccess`.
 *
 * Es una versión "manual" de lo que hace `AuthContext.refreshMe`: ambos leen
 * la sesión, calculan el rol y piden la tienda (ver notas).
 */
export const AuthCard: React.FC<AuthCardProps> = ({ role, initialMode = "login", allowRegister = true, storeId, storeSlug, onSuccess }) => {
  // Si el registro no está permitido, siempre "login" aunque initialMode diga otra cosa.
  const [mode, setMode] = useState<"login" | "register">(allowRegister ? initialMode : "login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  // Doble condición: aunque `mode` sea "register", sin `allowRegister` no se muestra.
  const isRegister = allowRegister && mode === "register";

  // Tipo de acceso efectivo: el `role` de las props o, si no hay, se deduce:
  // con tienda (slug/id) → "customer"; sin tienda → "merchant".
  // OJO: el valor por defecto es "merchant" (ver notas, es lo más importante).
  const effectiveRole = role || (storeSlug || storeId ? "customer" : "merchant");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); // evita que el navegador recargue la página
    setLoading(true);

    try {
      // Mismo formato de email que `createOrder`: sin espacios y en minúsculas.
      const trimmedEmail = form.email.trim().toLowerCase();

      // 1. AUTENTICACIÓN con Neon Auth (Better Auth). Las dos ramas devuelven
      //    `{ data, error }`: no lanzan excepción por credenciales incorrectas.
      const result = isRegister
        ? await authClient.signUp.email({
          // Si el nombre quedara vacío, usa la parte del email antes de la "@".
          name: form.name.trim() || trimmedEmail.split("@")[0],
          email: trimmedEmail,
          password: form.password,
        })
        :
        await authClient.signIn.email({
          email: trimmedEmail,
          password: form.password,
        });

      if (result.error) {
        const errMessage = result.error.message || "Authentication failed";
        // Si intentaba registrarse con un email ya existente, lo pasa a "login".
        // Detecta el caso por TEXTO del mensaje ("already"/"exist"): frágil
        // (ver notas).
        if (isRegister && (errMessage.toLowerCase().includes("already") || errMessage.toLowerCase().includes("exist"))) {
          toast.error("An account with this email already exists. Switching to Sign In.");
          setMode("login");
        } else {
          toast.error(errMessage);
        }
        setLoading(false);
        return;
      }

      // 2. SESIÓN Y TOKEN. Se prefiere el de la sesión; si no, el que venga en
      //    la respuesta del login (la forma exacta varía entre versiones, de
      //    ahí los `as any`). Si no hay ninguno, queda "".
      const sessionRes = await authClient.getSession();
      const activeToken = sessionRes.data?.session?.token || (result.data as any)?.token || (result.data as any)?.session?.token || "";

      // Usuario: el de la sesión o, si aún no hay, el de la respuesta del login.
      const sessionUser = sessionRes.data?.user || result.data?.user;

      // El token se guarda en localStorage ANTES de validar nada más
      // (ver notas: relevante cuando se deniega el acceso de admin).
      if (activeToken) {
        localStorage.setItem("storeifly_token", activeToken);
      }

      // 3. ROL. Reglas, en orden:
      //    - Si Neon dice que es admin → "admin".
      //    - Si se entra como merchant, o Neon ya dice merchant → "merchant".
      //    - En cualquier otro caso → "customer".
      //    (El valor inicial `effectiveRole` siempre se sobrescribe.)
      let determinedRole: string = effectiveRole;
      if ((sessionUser as any)?.role === "admin") {
        determinedRole = "admin";
      } else if (effectiveRole === "merchant" || (sessionUser as any)?.role === "merchant") {
        determinedRole = "merchant";
      } else {
        determinedRole = "customer";
      }

      let authStore: any = null;

      // 4. TIENDA: solo para merchants (los admins no tienen tienda).
      if (determinedRole === "merchant") {
        try {
          // `onboardMerchant` (backend): asigna el rol "merchant" y devuelve
          // `{ role, store }`, con `store: null` si aún no la creó.
          // Va con cabecera Bearer porque el backend lee el token de ahí.
          const onboardRes = await api.post(
            "/api/stores/onboard-merchant",
            {},
            { headers: activeToken ? { Authorization: `Bearer ${activeToken}` } : undefined }
          );
          if (onboardRes.data?.store) {
            authStore = onboardRes.data.store;
          }
        } catch (e) {
          // Un fallo aquí NO detiene el login: solo se avisa en consola.
          console.warn("Could not onboard merchant role:", e);
        }

        // Respaldo: pide la tienda con `getMyStore`. En la práctica es redundante
        // (ver notas): si `onboard` ya dijo "sin tienda", esto da 404.
        if (!authStore) {
          try {
            const storeRes = await api.get("/api/stores/me", {
              headers: activeToken ? { Authorization: `Bearer ${activeToken}` } : undefined,
            });
            if (storeRes.data?.success && storeRes.data?.store) {
              authStore = storeRes.data.store;
            }
          } catch {
            authStore = null; // 404 = aún sin tienda (caso normal)
          }
        }
      }

      // 5. USUARIO de la app (misma forma que en `AuthContext`).
      const authUser: AuthUserType = {
        // "user" como id de respaldo es un valor inventado (ver notas).
        id: sessionUser?.id || "user",
        name: sessionUser?.name || form.name.trim() || trimmedEmail.split("@")[0],
        email: trimmedEmail,
        role: determinedRole,
        store_id: determinedRole === "admin" ? null : (authStore?.id || null),
      };

      // CONTROL DE ACCESO DE ADMIN (solo en login): si se entró por la pantalla
      // de admin pero la cuenta no es admin, se rechaza. Es solo UX: la
      // seguridad real la hace `requireRole(["admin"])` en el backend.
      // La sesión de Neon y el token ya quedaron guardados (ver notas).
      if (!isRegister && effectiveRole === "admin" && authUser.role !== "admin") {
        toast.error("Access denied: You do not have platform admin privileges");
        setLoading(false);
        return;
      }

      toast.success(isRegister ? "Account created successfully!" : "Signed in successfully!");

      // 6. FINAL. Dos caminos:
      if (onSuccess) {
        // El padre decide qué hacer. Este componente NO llama a `login()` ni
        // navega: el padre debe guardar la sesión (ver notas).
        onSuccess({ token: activeToken, user: authUser, store: authStore, mode });
      } else {
        // Camino por defecto: guarda la sesión en el contexto y redirige.
        login(activeToken, authUser, authStore);
        if (authUser.role === "admin") {
          navigate("/admin");
        } else if (authUser.role === "merchant" || effectiveRole === "merchant") {
          // Con tienda → panel; sin tienda → asistente de creación.
          navigate(authStore ? "/merchant" : "/merchant/store-setup");
        } else if (storeSlug) {
          navigate(`/store/${storeSlug}`); // cliente: vuelve a la tienda
        } else {
          navigate("/");
        }
      }
    } catch (error) {
      // Errores inesperados (red, excepciones). Las credenciales incorrectas
      // NO llegan aquí: vienen en `result.error`.
      console.error("Authentication error:", error);
      toast.error(error instanceof Error ? error.message : "Authentication failed. Please check credentials.")
    } finally {
      // Siempre se reactiva el botón. (Los `setLoading(false)` de arriba son
      // redundantes: `finally` también se ejecuta tras un `return`.)
      setLoading(false)
    }
  };

  // Estilos comunes de los inputs. Usan variables CSS (`--store-accent`,
  // `--store-accent-ring`) que debe definir el contenedor padre; si no existen,
  // el foco no tendrá color de acento.
  const inputClasses =
    "w-full pl-10 pr-4 py-2.5 text-xs bg-neutral-50/70 border border-neutral-200 rounded-xl focus:outline-none focus:border-[var(--store-accent)] focus:ring-1 focus:ring-[var(--store-accent-ring)] transition text-neutral-900 placeholder-neutral-400";

  return (
    <div className="w-full max-w-sm bg-white rounded-4xl border border-neutral-200/90 p-8 sm:p-9 shadow-xs">
      {/* Botón "volver": navega a la página anterior del historial. */}
      <div className="flex items-center gap-2 mb-4 cursor-pointer" onClick={() => navigate(-1)}>
        <ArrowLeftIcon className="size-5 text-neutral-600" />
        <p className="text-xs text-neutral-600 hover:text-neutral-900">Go Back</p>
      </div>

      <div className="text-center mb-6">
        <h1 className="text-xl sm:text-2xl tracking-tight text-neutral-900">{isRegister ? "Create Account" : "Welcome Back"}</h1>
        <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
          {isRegister ? "Create an account to get started." : "Enter your credentials to access your account."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Nombre: solo en registro. */}
        {isRegister && (
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1.5">Full Name</label>
            <div className="relative">
              <User className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                placeholder="Alex Morgan"
                value={form.name}
                // Actualización inmutable: copia el estado y cambia solo `name`.
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className={inputClasses}
              />
            </div>
          </div>
        )}

        {/* Email: etiqueta y placeholder cambian en la pantalla de admin. */}
        <div>
          <label className="block text-xs font-medium text-neutral-700 mb-1.5">
            {effectiveRole === "admin" ? "Admin Email" : "Email Address"}
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="email"
              required
              placeholder={effectiveRole === "admin" ? "admin@example.com" : "you@example.com"}
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              className={inputClasses}
            />
          </div>
        </div>

        {/* Contraseña con botón para mostrarla/ocultarla. */}
        <div>
          <label className="block text-xs font-medium text-neutral-700 mb-1.5">Password</label>
          <div className="relative">
            <Lock className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type={showPassword ? "text" : "password"}
              required
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              className={`${inputClasses} pr-10 font-mono`}
            />
            <button
              type="button" // evita que envíe el formulario
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 p-0.5 cursor-pointer"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Botón principal. `store-accent-btn` es una clase CSS propia (color de acento). */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-5 text-white text-xs font-semibold rounded-full transition disabled:opacity-50 flex items-center justify-center gap-2 mt-2 cursor-pointer shadow-xs active:scale-[0.98] store-accent-btn"
        >
          <span>{loading ? "Please wait..." : isRegister ? "Create Account" : "Sign In"}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>

        {/* Alternar login/registro. Con `allowRegister={false}` no se muestra nada. */}
        <div className="mt-2">
          {!allowRegister ? null : isRegister ? (
            <p className="text-xs text-neutral-500 text-center">
              Already have an account?{" "}
              <span onClick={() => setMode("login")} className="font-semibold cursor-pointer store-accent-text">
                Sign In
              </span>
            </p>
          ) : (
            <p className="text-xs text-neutral-500 text-center">
              Don't have an account?{" "}
              <span onClick={() => setMode("register")} className="font-semibold cursor-pointer store-accent-text">
                Create Account
              </span>
            </p>
          )}
        </div>
      </form>
    </div>
  );
};