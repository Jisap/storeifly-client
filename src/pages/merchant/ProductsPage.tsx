import React, { useEffect, useState } from "react";
import { MerchantLayout } from "../../components/MerchantLayout";
import { Plus, Search } from "lucide-react";
import toast from "react-hot-toast";
import { ProductTable, type ProductItem } from "../../components/merchant/products/ProductTable";
import { ProductModal } from "../../components/merchant/products/ProductModal";
import { type VariantGroup } from "../../components/merchant/products/ProductVariantBuilder";
import { api } from "../../config/api";

/**
 * Estado inicial (vacío) del formulario de producto. Se usa para:
 *  - el `useState` inicial,
 *  - "Añadir producto" (se resetea el formulario con una copia),
 *  - inferir el tipo del formulario (`keyof typeof EMPTY_FORM` en `setF`).
 *
 * Todos los números van como STRING porque es lo que entrega un `<input>`;
 * se convierten con `Number(...)` al guardar (ver `handleSaveProduct`).
 * `imageUrlInput` NO se envía al backend: es solo el campo de texto temporal
 * para pegar una URL de imagen.
 */
const EMPTY_FORM = {
  name: "",
  desc: "",
  price: "",
  compareAt: "",
  sku: "",
  stock: "10",
  categoryId: "",
  status: "active",
  images: [] as string[],
  imageUrlInput: "",
  variants: [] as VariantGroup[],
};

/**
 * Carga datos de la tienda del comerciante desde un endpoint que filtra por
 * `?storeId=`. Hace DOS peticiones: primero `GET /api/stores/me` (para saber
 * el id de la tienda) y luego `GET <path>?storeId=<id>`.
 *
 * @param path - Ruta a consultar, p. ej. "/api/products" o "/api/categories".
 * @returns El cuerpo de la respuesta (`{ success, products }` o
 *          `{ success, categories }`), o `null` si algo no fue bien.
 *
 * OJO: no captura errores (ver notas): si falla una petición, la promesa se
 * rechaza y los `.then` de quien la llama no llegan a ejecutarse.
 */
const fetchStoreData = async (path: string) => {
  const storeRes = await api.get("/api/stores/me");
  if (!storeRes.data?.success) return null;
  const storeId = storeRes.data.store.id;
  const res = await api.get(`${path}?storeId=${encodeURIComponent(storeId)}`);
  return res.data?.success ? res.data : null;
};

/**
 * Página "Catálogo de productos" del comerciante: lista, busca, crea, edita y
 * borra productos de su tienda.
 *
 * Es el cliente de los controladores de productos del backend:
 *  - `POST   /api/products`      → `createProduct`
 *  - `PUT    /api/products/:id`  → `updateProduct`
 *  - `DELETE /api/products/:id`  → `deleteProduct`
 *  - `GET    /api/products?storeId=` → listado (la function pública de Neon,
 *    o el Express, según a dónde apunte `api`; ver notas).
 *  - `POST   /api/upload/single` → `uploadSingle` (imágenes).
 *
 * Estructura: esta página guarda TODO el estado y la lógica; los componentes
 * hijos son de presentación:
 *  - `ProductTable`: tabla de productos.
 *  - `ProductModal`: formulario de crear/editar (recibe cada campo y su
 *    callback como props, de ahí la lista tan larga).
 *
 * IMPORTANTE: las validaciones de aquí son solo comodidad de UX. Las reales
 * son las de `parseProductInput` en el backend.
 */
export const ProductsPage: React.FC = () => {
  const [products, setProducts] = useState<ProductItem[]>([]);
  // Categorías de la tienda, tipadas `any` (ver notas).
  const [categories, setCategories] = useState<any[]>([]);
  // `true` desde el inicio: la tabla muestra su estado de carga la primera vez.
  const [loading, setLoading] = useState(true);
  // Texto del buscador (filtra en el cliente, ver `filtered`).
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  // `null` = modo CREAR; un producto = modo EDITAR. Decide qué petición se hace al guardar.
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  // Campos del mini-formulario "añadir grupo de variantes" (ej. "Talla" + "S, M, L").
  const [newVariantName, setNewVariantName] = useState("");
  const [newVariantOptions, setNewVariantOptions] = useState("");

  /**
   * Actualiza UN campo del formulario sin tocar los demás. `keyof typeof
   * EMPTY_FORM` limita `key` a nombres reales del formulario; `val` es `any`
   * porque cada campo tiene un tipo distinto (string, array...).
   */
  const setF = (key: keyof typeof EMPTY_FORM, val: any) => setForm((f) => ({ ...f, [key]: val }));

  // Carga inicial: productos y categorías, en paralelo (dos llamadas independientes).
  // Cada una repite internamente `GET /api/stores/me` (ver notas).
  useEffect(() => {
    fetchStoreData("/api/products").then((d) => {
      if (d) setProducts(d.products);
      setLoading(false);
    })
    fetchStoreData("/api/categories").then((d) => {
      if (d) setCategories(d.categories);
    })
  }, []);

  /** Recarga la lista de productos (se llama tras crear o editar uno). */
  const refetchProducts = async () => {
    setLoading(true);
    fetchStoreData("/api/products").then((d) => {
      if (d) setProducts(d.products);
      setLoading(false)
    })
  };

  /**
   * Abre el modal en modo CREAR: borra el producto en edición, resetea el
   * formulario y preselecciona la PRIMERA categoría (si hay), para que el
   * producto no nazca sin categoría por descuido.
   */
  const openCreateModal = () => {
    setEditingProduct(null);
    setForm({ ...EMPTY_FORM, categoryId: categories[0]?.id?.toString() || "" });
    setIsModalOpen(true);
  };

  /**
   * Abre el modal en modo EDITAR: copia los datos del producto al formulario,
   * convirtiendo números a string (los inputs trabajan con texto) y
   * comprobando con `Array.isArray` que `images` y `variants` (JSON en la BD)
   * sean arrays. Ojo: `compare_at_price` y `category_id` nulos pasan a "".
   */
  const openEditModal = (p: ProductItem) => {
    setEditingProduct(p);
    setForm({
      name: p.name,
      desc: p.description || "",
      price: p.price.toString(),
      compareAt: p.compare_at_price ? p.compare_at_price.toString() : "",
      sku: p.sku || "",
      stock: p.stock.toString(),
      categoryId: p.category_id ? p.category_id.toString() : "",
      status: p.status || "active",
      images: Array.isArray(p.images) ? p.images : [],
      imageUrlInput: "",
      variants: Array.isArray(p.variants) ? p.variants : [],
    });
    setIsModalOpen(true);
  };

  /**
   * Añade al producto una imagen a partir de una URL pegada a mano. No valida
   * el formato: el backend exige https y máx. 10 imágenes (ver notas).
   */
  const handleAddImageFromUrl = () => {
    if (!form.imageUrlInput.trim()) return;
    setF("images", [...form.images, form.imageUrlInput.trim()]);
    setF("imageUrlInput", "");
  };

  /**
   * Sube un archivo de imagen al backend (`POST /api/upload/single`, campo
   * "image") y añade la URL devuelta a la lista de imágenes del producto.
   */
  const handleUploadImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const fd = new FormData();
    fd.append("image", e.target.files[0]);
    setUploadingImage(true)
    try {
      const res = await api.post("/api/upload/single", fd, { headers: { "Content-Type": "multipart/form-data" } });
      if (res.data?.success) {
        setF("images", [...form.images, res.data.url]);
        toast.success("Image uploaded!");
      }
    } catch (error) {
      toast.error("Upload failed");
    } finally {
      setUploadingImage(false);
    }
  };

  /**
   * Añade un grupo de variantes con el nombre y las opciones escritas
   * (ej. nombre "Talla", opciones "S, M, L" → { name: "Talla", options: ["S","M","L"] }).
   * Las opciones se separan por comas, se recortan y se descartan las vacías.
   */
  const handleAddVariantGroup = () => {
    if (!newVariantName.trim() || !newVariantOptions.trim()) {
      toast.error("Provide variant name and comma-separated options");
      return;
    }
    setF("variants", [
      ...form.variants,
      {
        name: newVariantName.trim(),
        options: newVariantOptions
          .split(",")
          .map((o) => o.trim())
          .filter(Boolean),
      },
    ]);
    setNewVariantName("");
    setNewVariantOptions("");
  };

  /**
   * Añade un color al grupo de variantes "Color"/"Colour". Si el grupo ya
   * existe, le añade la opción (sin duplicar, ignorando mayúsculas); si no,
   * crea el grupo "Color" con esa opción. Se pasa a `ProductModal`, que la usa
   * al transformar imágenes con IA (recolor) para registrar el color nuevo.
   */
  const handleAddColorVariantOption = (colorName: string) => {
    const cleanName = colorName.trim();
    if (!cleanName) return;

    const colorGroupIndex = form.variants.findIndex(
      (v) => v.name.toLowerCase() === "color" || v.name.toLowerCase() === "colour"
    );

    if (colorGroupIndex >= 0) {
      const existingGroup = form.variants[colorGroupIndex];
      if (!existingGroup.options.some((o) => o.toLowerCase() === cleanName.toLowerCase())) {
        const updatedGroup = {
          ...existingGroup,
          options: [...existingGroup.options, cleanName],
        };
        const updatedVariants = [...form.variants];
        updatedVariants[colorGroupIndex] = updatedGroup;
        setF("variants", updatedVariants);
      }
    } else {
      setF("variants", [
        ...form.variants,
        {
          name: "Color",
          options: [cleanName],
        },
      ]);
    }
  };

  /**
   * Guarda el producto: crea (`POST`) o actualiza (`PUT`) según `editingProduct`.
   *
   * Traduce el formulario (strings) al contrato de `parseProductInput`:
   *  - `compare_at_price`, `sku` y `category_id` vacíos se envían como `null`
   *    (el backend los interpreta como "quitar").
   *  - `stock` vacío o inválido → 0.
   * Tras guardar: cierra el modal y recarga la lista. Si falla, muestra el
   * `message` del backend (400/404...) o uno genérico.
   */
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.price) {
      toast.error("Product name and price are required");
      return;
    }

    const payload = {
      name: form.name.trim(),
      description: form.desc.trim(),
      price: Number(form.price),
      compare_at_price: form.compareAt ? Number(form.compareAt) : null,
      sku: form.sku.trim() || null,
      stock: Number(form.stock) || 0,
      category_id: form.categoryId ? Number(form.categoryId) : null,
      images: form.images,
      variants: form.variants,
      status: form.status,
    };

    try {
      const res = editingProduct
        ? await api.put(`/api/products/${editingProduct.id}`, payload)
        : await api.post("/api/products", payload);

      if (res.data?.success) {
        toast.success(editingProduct ? "Product updated!" : "Product created!");
        setIsModalOpen(false);
        refetchProducts();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to save product");
    }
  };

  /**
   * Borra un producto tras confirmación (`DELETE /api/products/:id`) y lo quita
   * de la lista local sin volver a pedirla al servidor.
   */
  const handleDeleteProduct = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this product?")) return;
    try {
      const res = await api.delete(`/api/products/${id}`);
      if (res.data?.success) {
        toast.success("Product deleted");
        setProducts((prev) => prev.filter((p) => p.id !== id));
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Delete failed");
    }
  };

  // Filtro del buscador, en el cliente: por nombre o SKU, sin distinguir
  // mayúsculas. `p.sku?.` evita error si el SKU es null.
  const filtered = products.filter(
    (p) => p.name.toLowerCase().includes(search.toLowerCase()) || p.sku?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <MerchantLayout>
      <div className="space-y-7">
        {/* CABECERA con el botón de crear. */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h1 className="text-xl sm:text-2xl text-neutral-900 mt-10">Product Catalog</h1>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-full transition cursor-pointer shadow-xs shadow-emerald-700/20"
          >
            <Plus className="w-3.5 h-3.5" /> Add Product
          </button>
        </div>

        {/* BUSCADOR + contador de resultados. */}
        <div className="bg-white p-3 sm:px-4 rounded-full border border-neutral-200/80 flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search products by title or SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-transparent focus:outline-none placeholder:text-neutral-400"
            />
          </div>
          <span className="text-xs text-neutral-400 font-mono pr-2">{filtered.length} products</span>
        </div>

        {/* TABLA. Recibe los productos YA filtrados y los callbacks de acción. */}
        <ProductTable
          products={filtered}
          loading={loading}
          onEdit={openEditModal}
          onDelete={handleDeleteProduct}
          onAddProduct={openCreateModal}
        />

        {/* MODAL de crear/editar. Es un componente "controlado": todo el
                    estado vive aquí y se le pasa campo a campo con su callback. */}
        <ProductModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          editingProduct={editingProduct}
          categories={categories}
          formName={form.name}
          onFormNameChange={(v) => setF("name", v)}
          formDesc={form.desc}
          onFormDescChange={(v) => setF("desc", v)}
          formPrice={form.price}
          onFormPriceChange={(v) => setF("price", v)}
          formCompareAt={form.compareAt}
          onFormCompareAtChange={(v) => setF("compareAt", v)}
          formSku={form.sku}
          onFormSkuChange={(v) => setF("sku", v)}
          formStock={form.stock}
          onFormStockChange={(v) => setF("stock", v)}
          formCategoryId={form.categoryId}
          onFormCategoryIdChange={(v) => setF("categoryId", v)}
          formStatus={form.status}
          onFormStatusChange={(v) => setF("status", v)}
          formImages={form.images}
          formImageUrlInput={form.imageUrlInput}
          onFormImageUrlInputChange={(v) => setF("imageUrlInput", v)}
          onAddImageFromUrl={handleAddImageFromUrl}
          onUploadImageFile={handleUploadImageFile}
          onRemoveImage={(i) =>
            setF(
              "images",
              form.images.filter((_, idx) => idx !== i),
            )
          }
          // Imagen resultante de una transformación con IA (aiTransform): se AÑADE.
          onAddTransformedImage={(url) => setF("images", [...form.images, url])}
          // Variante que SUSTITUYE la imagen en la posición `idx`.
          onReplaceImage={(idx, url) =>
            setF(
              "images",
              form.images.map((img, i) => (i === idx ? url : img)),
            )
          }
          onAddColorVariantOption={handleAddColorVariantOption}
          uploadingImage={uploadingImage}
          formVariants={form.variants}
          newVariantName={newVariantName}
          onNewVariantNameChange={setNewVariantName}
          newVariantOptions={newVariantOptions}
          onNewVariantOptionsChange={setNewVariantOptions}
          onAddVariantGroup={handleAddVariantGroup}
          onRemoveVariantGroup={(i) =>
            setF(
              "variants",
              form.variants.filter((_, idx) => idx !== i),
            )
          }
          onSaveProduct={handleSaveProduct}
        />
      </div>
    </MerchantLayout>
  );
};