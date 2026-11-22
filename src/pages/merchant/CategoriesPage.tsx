import React, { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { MerchantLayout } from "../../components/MerchantLayout";
import { Plus, Trash2, FolderTree } from "lucide-react";
import { Spinner } from "../../components/common/Spinner";
import toast from "react-hot-toast";
import { api } from "../../config/api";

/**
 * Forma de una categoría tal como la devuelve el backend.
 * `slug` y `product_count` son opcionales: no los he visto definidos en
 * ningún controlador, así que la interfaz es una suposición (ver notas).
 */
interface Category {
  id: number;
  name: string;
  slug?: string;
  product_count?: number;
}

/**
 * Página "Categorías de producto" del comerciante: lista, crea y borra las
 * categorías de su tienda.
 *
 * Es el cliente de endpoints que AÚN NO me has pasado (ver notas):
 *  - `GET    /api/categories?storeId=` → listado.
 *  - `POST   /api/categories`          → crear (solo envía `{ name }`).
 *  - `DELETE /api/categories/:id`      → borrar.
 *
 * Conexión con el resto: `parseProductInput` valida que el `category_id` de
 * un producto pertenezca a la tienda del comerciante, y `ProductsPage`
 * preselecciona la primera categoría al crear un producto. Por eso conviene
 * tener al menos una categoría antes de crear productos.
 *
 * Es la versión BIEN hecha del patrón de carga de `ProductsPage`: usa
 * `try/catch/finally`, muestra errores con toast y bloquea los botones
 * mientras trabaja.
 */
export const CategoriesPage: React.FC = () => {
  // `store` solo se usa como disparador del `useEffect` (ver abajo).
  const { store } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  // Texto del input "nueva categoría".
  const [name, setName] = useState("");
  // Carga de la lista (empieza en true: correcto, a diferencia del dashboard).
  const [loading, setLoading] = useState(true);
  // Creando una categoría (desactiva el botón de añadir).
  const [submitting, setSubmitting] = useState(false);
  // Id de la categoría que se está borrando, o null. Permite desactivar SOLO
  // el botón de esa fila y mostrar "..." en ella.
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Carga la lista cuando hay tienda en el contexto. Se vuelve a ejecutar si
  // `store` cambia. Sin tienda, quita el "cargando" y deja la lista vacía.
  // `void` indica a propósito que la promesa no se espera (y evita el aviso
  // del linter `no-floating-promises`).
  useEffect(() => {
    if (store) {
      void fetchCategories();
    } else {
      setLoading(false);
    }
  }, [store]);

  /**
   * Carga las categorías de la tienda del usuario.
   *
   * Hace dos peticiones: `GET /api/stores/me` (para obtener el id) y
   * `GET /api/categories?storeId=<id>`. El `finally` garantiza que
   * `loading` vuelva a `false` aunque algo falle, y los errores se avisan
   * con toast. Si no hay tienda, deja la lista vacía sin error.
   */
  const fetchCategories = async () => {
    setLoading(true);

    try {
      const storeRes = await api.get("/api/stores/me");

      if (!storeRes.data?.success || !storeRes.data?.store?.id) {
        setCategories([]);
        return;
      }

      const storeId = storeRes.data.store.id;

      // `encodeURIComponent` protege el parámetro de la URL (aquí es un
      // número, pero es buena práctica).
      const res = await api.get(
        `/api/categories?storeId=${encodeURIComponent(storeId)}`
      );

      if (res.data?.success) {
        // `?? []` evita que la lista quede `undefined` si falta el campo.
        setCategories(res.data.categories ?? []);
      } else {
        toast.error(res.data?.message || "Failed to load categories");
      }
    } catch (err: any) {
      console.error("Failed to fetch categories:", err);
      toast.error(
        err.response?.data?.message || "Failed to load categories"
      );
    } finally {
      setLoading(false);
    }
  };

  /**
   * Crea una categoría con `POST /api/categories { name }`. Si va bien, vacía
   * el input y recarga la lista COMPLETA (`await fetchCategories()`), lo que
   * trae el slug y el contador generados por el servidor. Si el nombre está
   * vacío, no hace nada.
   */
  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); // evita que el navegador recargue la página

    const trimmedName = name.trim();
    if (!trimmedName) return;

    setSubmitting(true);

    try {
      const res = await api.post("/api/categories", {
        name: trimmedName,
      });

      if (res.data?.success) {
        toast.success("Category created!");
        setName("");
        await fetchCategories();
      } else {
        toast.error(res.data?.message || "Failed to create category");
      }
    } catch (err: any) {
      console.error("Failed to create category:", err);
      toast.error(
        err.response?.data?.message || "Failed to create category"
      );
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Borra una categoría tras confirmación (`DELETE /api/categories/:id`) y la
   * quita de la lista local sin volver a pedirla. El mensaje de confirmación
   * avisa de que los productos pueden quedar sin categoría; que eso ocurra
   * depende del `onDelete` de la relación en Prisma (ver notas).
   */
  const handleDelete = async (id: number) => {
    const confirmed = window.confirm(
      "Are you sure? Products in this category may become uncategorized."
    );

    if (!confirmed) return;

    setDeletingId(id);

    try {
      const res = await api.delete(`/api/categories/${id}`);

      if (res.data?.success) {
        setCategories((prev) => prev.filter((c) => c.id !== id));
        toast.success("Category deleted!");
      } else {
        toast.error(res.data?.message || "Failed to delete category");
      }
    } catch (err: any) {
      console.error("Failed to delete category:", err);
      toast.error(
        err.response?.data?.message || "Failed to delete category"
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <MerchantLayout>
      <div className="space-y-7">
        <h1 className="mt-10 text-xl text-neutral-900 sm:text-2xl">
          Product Categories
        </h1>

        {/* FORMULARIO DE CREACIÓN. `maxLength={100}` limita el input; el
                    botón se desactiva mientras se envía o si el texto está vacío. */}
        <div className="rounded-3xl border border-neutral-200/80 bg-white p-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-900">
            Create Category
          </h2>

          <form
            onSubmit={handleCreate}
            className="flex max-w-lg flex-col gap-3 sm:flex-row"
          >
            <input
              type="text"
              required
              maxLength={100}
              placeholder="e.g. Specialty Beans, Drinkware..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 rounded-full border border-neutral-200 bg-neutral-50/50 px-4 py-2.5 text-xs focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600/20"
            />

            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              {submitting ? "Creating..." : "Add Category"}
            </button>
          </form>
        </div>

        {/* LISTA. Tres estados: cargando, vacía o con categorías. */}
        <div className="overflow-hidden rounded-3xl border border-neutral-200/80 bg-white">
          <div className="flex items-center justify-between border-b border-neutral-100 p-5 sm:p-6">
            <h2 className="font-medium text-neutral-900">
              Catalog Collections
            </h2>

            <span className="font-mono text-xs text-neutral-400">
              {categories.length} total
            </span>
          </div>

          {loading ? (
            <Spinner padded />
          ) : categories.length === 0 ? (
            <p className="p-12 text-center font-mono text-xs text-neutral-400">
              No categories created yet.
            </p>
          ) : (
            <div className="divide-y divide-neutral-100">
              {categories.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between p-4 text-xs transition hover:bg-neutral-50/50 sm:px-6"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-600">
                      <FolderTree className="h-4 w-4" />
                    </div>

                    <div>
                      <h3 className="text-xs font-medium text-neutral-900 sm:text-sm">
                        {c.name}
                      </h3>

                      {/* "—" si la categoría no tiene slug. */}
                      <span className="font-mono text-[10px] text-neutral-400">
                        slug: {c.slug || "—"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {/* `product_count` lo calcula el backend (ver notas). */}
                    <span className="rounded-full bg-neutral-100 px-3 py-1 font-mono text-[11px] text-neutral-600">
                      {c.product_count ?? 0} products
                    </span>

                    <button
                      type="button"
                      onClick={() => void handleDelete(c.id)}
                      disabled={deletingId === c.id}
                      className="cursor-pointer rounded-full p-2 text-neutral-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                      title="Delete category"
                    >
                      {deletingId === c.id ? (
                        <span className="text-xs">...</span>
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </MerchantLayout>
  );
};