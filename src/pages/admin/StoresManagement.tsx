import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AdminLayout } from "../../components/AdminLayout";
import { ExternalLink, Search } from "lucide-react";
import { Spinner } from "../../components/common/Spinner";
import toast from "react-hot-toast";
import { api } from "../../config/api";

/**
 * Página de Administración de Tiendas (Stores Management).
 * Permite a los administradores visualizar el listado de tiendas, buscar por diversos criterios,
 * revisar métricas clave (productos, órdenes, ingresos) y activar/suspender tiendas.
 */
export const StoresManagement: React.FC = () => {
  // --- ESTADOS DE DATOS Y UI ---
  // Nota: Se recomienda definir una interfaz `Store` para reemplazar `any`
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  // Carga inicial de todas las tiendas desde la API de administración
  useEffect(() => {
    api.get("/api/stores/admin/all")
      .then((res) => {
        if (res.data?.success) setStores(res.data.stores);
      })
      .catch((err) => console.error("Failed to fetch stores:", err))
      .finally(() => setLoading(false));
  }, []);

  /**
   * Alterna el estado de la tienda (activo/suspendido).
   * Solicita confirmación al usuario, actualiza el servidor y refresca el estado local
   * para evitar una recarga completa de la lista.
   */
  const handleToggleStatus = async (storeId: number, status: string) => {
    if (!window.confirm(`Are you sure you want to ${status === "active" ? "suspend" : "activate"} this store?`)) return;

    try {
      const res = await api.patch(`/api/stores/admin/${storeId}/status`);
      if (res.data?.success) {
        toast.success(res.data.message || "Store status updated successfully");
        // Actualización optimista/local del estado con los datos devueltos por la API
        setStores((prev) => prev.map((s) => (s.id === storeId ? res.data.store : s)));
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Action failed");
    }
  };

  // --- LÓGICA DE FILTRADO Y ESTILOS ---
  const q = search.toLowerCase();

  // Filtra las tiendas en el cliente por nombre, slug, nombre del comerciante o email
  const filtered = stores.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.slug.toLowerCase().includes(q) ||
      s.merchant_name?.toLowerCase().includes(q) ||
      s.merchant_email?.toLowerCase().includes(q)
  );

  /**
   * Genera dinámicamente las clases de Tailwind según el estado (activo/inactivo) 
   * y el tipo de elemento visual (insignia de estado o botón de acción).
   */
  const statusClass = (active: boolean, variant: "badge" | "btn") =>
    variant === "badge"
      ? active
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : "bg-rose-50 text-rose-700 border-rose-200"
      : active
        ? "bg-white text-rose-600 border-neutral-200 hover:bg-rose-50 hover:border-rose-200"
        : "bg-black text-white border-black hover:bg-neutral-800";

  return (
    <AdminLayout>
      <div className="space-y-6">

        {/* --- ENCABEZADO Y BARRA DE BÚSQUEDA --- */}
        <h1 className="text-2xl sm:text-3xl tracking-tight text-neutral-900 mt-10">Stores Management</h1>

        <div className="bg-white p-3.5 rounded-2xl border border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter by store, slug, or merchant..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-full focus:outline-none focus:border-black transition"
            />
          </div>
          <span className="text-xs text-neutral-400 font-mono px-2">{filtered.length} stores</span>
        </div>

        {/* --- TABLA DE DATOS --- */}
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-neutral-200 overflow-hidden">
          {loading ? (
            // Estado de carga
            <Spinner padded />
          ) : filtered.length === 0 ? (
            // Estado vacío (sin resultados de búsqueda)
            <p className="p-16 text-center text-xs text-neutral-400 font-mono">No stores found.</p>
          ) : (
            // Estado con datos
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50/70 text-neutral-400 font-mono text-[11px] uppercase border-b border-neutral-100">
                  <tr>
                    {["Store", "Merchant", "Products", "Orders", "Revenue", "Status", "Actions"].map((h, i) => (
                      <th key={h} className={`py-3 ${i === 6 ? "px-5 text-right" : "px-4"}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {filtered.map((s) => (
                    <tr key={s.id} className="hover:bg-neutral-50/50 transition">

                      {/* Columna: Tienda (Logo, Nombre y Enlace público) */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 shrink-0 flex items-center justify-center font-mono font-medium text-neutral-600 text-[10px]">
                            {s.logo_url && (
                              <img src={s.logo_url} alt="" className="w-full h-full object-contain" />
                            )}
                          </div>
                          <div>
                            <span className="font-medium text-neutral-900 block">{s.name}</span>
                            <Link
                              to={`/store/${s.slug}`}
                              target="_blank"
                              className="text-[11px] font-mono text-neutral-400 hover:text-neutral-900 hover:underline inline-flex items-center gap-1"
                            >
                              /store/{s.slug} <ExternalLink className="w-2.5 h-2.5" />
                            </Link>
                          </div>
                        </div>
                      </td>

                      {/* Columna: Comerciante (Nombre y Email) */}
                      <td className="py-3.5 px-4">
                        <span className="text-neutral-900 font-medium block">{s.merchant_name}</span>
                        <span className="text-[11px] text-neutral-400 font-mono">{s.merchant_email}</span>
                      </td>

                      {/* Columnas: Métricas */}
                      <td className="py-3.5 px-4 text-neutral-600 font-mono">{s.product_count || 0}</td>
                      <td className="py-3.5 px-4 text-neutral-600 font-mono">{s.order_count || 0}</td>
                      <td className="py-3.5 px-4 font-semibold text-neutral-900 font-mono">
                        ${Number(s.total_revenue || 0).toFixed(2)}
                      </td>

                      {/* Columna: Estado (Insignia visual) */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium uppercase border ${statusClass(s.status === "active", "badge")}`}
                        >
                          {s.status}
                        </span>
                      </td>

                      {/* Columna: Acciones (Botón de alternar estado) */}
                      <td className="py-3.5 px-5 text-right">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(s.id, s.status)}
                          className={`px-3 py-1 text-xs font-medium rounded-full transition border cursor-pointer ${statusClass(s.status === "active", "btn")}`}
                        >
                          {s.status === "active" ? "Suspend" : "Activate"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};