import { useEffect, useState, type FormEvent } from 'react';
import {
  deleteMenuItem, getOrCreateMenuCategory, loadOwnerDataForTenant, publicMenuPhoto,
  saveItem, uploadMenuPhoto, type OwnerData, type Product,
} from '../management/menuService';
import { ProductExtrasManager } from '../management/ProductExtrasManager';
import '../management/management.css';

type Props = { tenantId: string; restaurantName: string | null };
type ProductForm = { name: string; description: string; price: string; categoryName: string };
const emptyForm: ProductForm = { name: '', description: '', price: '', categoryName: '' };
const formatError = (error: unknown) => error instanceof Error ? error.message : 'Unable to save the menu change.';

// Reuse the last loaded menu when owners switch workspace sections. Refresh quietly
// in the background so menu editing doesn't restart with a loading screen each time.
const ownerMenuCache = new Map<string, OwnerData>();

export function OwnerMenuPage({ tenantId }: Props) {
  const [data, setData] = useState<OwnerData | null>(() => ownerMenuCache.get(tenantId) ?? null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchProduct, setSearchProduct] = useState('');
  const [loading, setLoading] = useState(() => !ownerMenuCache.has(tenantId));
  const [error, setError] = useState('');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [savingForm, setSavingForm] = useState(false);
  const [savingCustomizations, setSavingCustomizations] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteProductTarget, setDeleteProductTarget] = useState<Product | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(!ownerMenuCache.has(tenantId));
    setError('');
    async function loadMenu() {
      try {
        const next = await loadOwnerDataForTenant(tenantId);
        ownerMenuCache.set(tenantId, next);
        if (active) setData(next);
      } catch (reason) {
        if (active) setError(formatError(reason));
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadMenu();
    return () => { active = false; };
  }, [tenantId]);

  const categories = data?.categories ?? [];
  const products = (data?.items ?? []).filter((item) => item.status !== 'archived');
  const query = searchProduct.trim().toLowerCase();
  const filteredProducts = products.filter((product) => {
    const categoryMatch = selectedCategory === 'all' || product.category_id === selectedCategory;
    const category = categories.find((item) => item.id === product.category_id);
    const searchMatch = !query
      || product.name.toLowerCase().includes(query)
      || product.description.toLowerCase().includes(query)
      || Boolean(category?.name.toLowerCase().includes(query));
    return categoryMatch && searchMatch;
  });

  async function refreshMenu() {
    const next = await loadOwnerDataForTenant(tenantId);
    ownerMenuCache.set(tenantId, next);
    setData(next);
    return next;
  }

  async function runCustomizationChange(_label: string, work: () => Promise<unknown>) {
    if (savingCustomizations) return null;
    setSavingCustomizations(true);
    setError('');
    try {
      await work();
      return await refreshMenu();
    } catch (reason) {
      setError(formatError(reason));
      return null;
    } finally {
      setSavingCustomizations(false);
    }
  }

  function openAdd() {
    setEditingProduct(null);
    setIsAddingProduct(true);
    setForm(emptyForm);
    setImageFile(null);
    setImagePreview('');
    setError('');
  }

  function openEdit(product: Product) {
    setIsAddingProduct(false);
    setEditingProduct(product);
    const category = categories.find((item) => item.id === product.category_id);
    setForm({ name: product.name, description: product.description, price: (product.price_centavos / 100).toFixed(2), categoryName: category?.name ?? '' });
    setImageFile(null);
    setImagePreview(publicMenuPhoto(product.image_path) ?? '');
    setError('');
  }

  function closeProductModal() {
    if (savingForm) return;
    setEditingProduct(null);
    setIsAddingProduct(false);
    setForm(emptyForm);
    setImageFile(null);
    setImagePreview('');
  }

  function handleImageChange(file: File | undefined) {
    if (!file) return;
    setError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Use a JPG, PNG, or WEBP image.');
      return;
    }
    if (file.size <= 0 || file.size > 5 * 1024 * 1024) {
      setError('Product images must be 5 MB or smaller.');
      return;
    }
    setImageFile(file);
    // Keep uploaded file data out of DOM URL sinks; show its name until the
    // server validates and stores the image.
    setImagePreview('');
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    const name = form.name.trim();
    const description = form.description.trim();
    const categoryName = form.categoryName.trim();
    const price = Number(form.price);

    if (!name) { setError('Product name is required.'); return; }
    if (name.length > 160) { setError('Product names must be 160 characters or fewer.'); return; }
    if (description.length > 600) { setError('Product descriptions must be 600 characters or fewer.'); return; }
    if (!Number.isFinite(price) || price < 0 || price > 1000000) { setError('Enter a valid price between ₱0 and ₱1,000,000.'); return; }
    if (!categoryName || categoryName.length > 100) { setError('Category is required (up to 100 characters).'); return; }
    if (imageFile && (!['image/jpeg', 'image/png', 'image/webp'].includes(imageFile.type) || imageFile.size <= 0 || imageFile.size > 5 * 1024 * 1024)) {
      setError('Choose a JPG, PNG, or WEBP image up to 5 MB.');
      return;
    }

    setSavingForm(true);
    setError('');
    try {
      const categoryId = await getOrCreateMenuCategory(tenantId, categoryName);
      const wasAdding = !editingProduct;
      const isPopular = editingProduct?.is_popular ?? false;
      const priceCentavos = Math.round(price * 100);
      const itemId = await saveItem(tenantId, editingProduct?.id ?? null, {
        name, description, category_id: categoryId, price_centavos: priceCentavos,
        is_popular: isPopular, status: 'published',
      });

      // If a later photo upload fails, keep the saved item in edit mode so retry
      // updates this record instead of creating a duplicate menu item.
      if (wasAdding) {
        setEditingProduct({
          id: itemId, tenant_id: tenantId, category_id: categoryId, name, description,
          image_path: null, price_centavos: priceCentavos, status: 'published',
          is_popular: isPopular, sort_order: data.items.length,
        });
        setIsAddingProduct(false);
      }

      if (imageFile) await uploadMenuPhoto(tenantId, itemId, imageFile);
      await refreshMenu();
      setEditingProduct(null);
      setIsAddingProduct(false);
      setForm(emptyForm);
      setImageFile(null);
      setImagePreview('');
    } catch (reason) {
      setError(formatError(reason));
      try { await refreshMenu(); } catch { /* Preserve the original save/upload error. */ }
    } finally {
      setSavingForm(false);
    }
  }

  function openDeleteConfirmation(product: Product) {
    if (deletingId) return;
    setDeleteProductTarget(product);
    setError('');
  }

  function closeDeleteConfirmation() {
    if (!deletingId) setDeleteProductTarget(null);
  }

  async function removeProduct(product: Product) {
    setDeletingId(product.id);
    setError('');
    try {
      await deleteMenuItem(tenantId, product.id);
      setData((current) => {
        if (!current) return current;
        const next = { ...current, items: current.items.filter((item) => item.id !== product.id), assignments: current.assignments.filter((item) => item.item_id !== product.id) };
        ownerMenuCache.set(tenantId, next);
        return next;
      });
    } catch (reason) {
      setError(formatError(reason));
    } finally {
      setDeletingId(null);
      setDeleteProductTarget(null);
    }
  }

  if (loading) {
    return <main className="owner-content"><section className="owner-orders-empty"><h1>Menu</h1><p>Loading products…</p></section></main>;
  }
  if (!data) {
    return <main className="owner-content"><section className="owner-orders-empty">
      <h1>Menu</h1><p role="alert">{error || 'The restaurant menu could not be loaded.'}</p>
      <button type="button" onClick={() => {
        setLoading(true);
        setError('');
        void loadOwnerDataForTenant(tenantId).then((next) => { ownerMenuCache.set(tenantId, next); setData(next); })
          .catch((reason: unknown) => setError(formatError(reason)))
          .finally(() => setLoading(false));
      }}>Retry</button>
    </section></main>;
  }

  return (
    <main className="owner-content">
      <section className="restaurant-page restaurant-menu-page">
        {error && <div className="restaurant-dashboard-error" role="alert">{error}</div>}

        <div className="restaurant-menu-management-card">
          <p className="restaurant-menu-branch-help">This menu is shared across all branches. Kitchen staff manage item availability separately for each branch.</p>
          <div className="restaurant-menu-search">
            <label className="restaurant-menu-search-label" htmlFor="restaurant-product-search">Search products</label>
            <div className="restaurant-menu-search-input-wrap">
              <input id="restaurant-product-search" type="text" role="searchbox" value={searchProduct}
                onChange={(event) => setSearchProduct(event.target.value)} placeholder="Search by product name, description, or category"/>
              {searchProduct && <button type="button" className="restaurant-menu-search-clear" onClick={() => setSearchProduct('')} aria-label="Clear product search">×</button>}
            </div>
            <button className="button restaurant-menu-add-button restaurant-compact-action" type="button" onClick={openAdd} disabled={loading}>+ Add Product</button>
          </div>

          <div className="restaurant-menu-toolbar">
            <div className="restaurant-menu-categories" aria-label="Product categories">
              <button className={selectedCategory === 'all' ? 'is-active' : ''} type="button" onClick={() => setSelectedCategory('all')}>All</button>
              {categories.map((category) => <button key={category.id} className={selectedCategory === category.id ? 'is-active' : ''} type="button" onClick={() => setSelectedCategory(category.id)}>{category.name}</button>)}
            </div>
          </div>

          {loading ? <div className="restaurant-dashboard-empty">Loading products…</div>
            : !products.length ? <div className="restaurant-dashboard-empty"><strong>No products yet.</strong><p>Add your first product to start building the restaurant menu.</p></div>
            : !filteredProducts.length ? <div className="restaurant-dashboard-empty">No products match this filter.</div>
            : <div className="restaurant-menu-grid">
              {filteredProducts.map((product) => {
                return <article className="product-card restaurant-management-product-card" key={product.id}>
                  <div className="product-card-main">
                    <div className="product-card-media">
                      {publicMenuPhoto(product.image_path)
                        ? <img className="product-card-image" src={publicMenuPhoto(product.image_path) ?? ''} alt="" loading="lazy"/>
                        : <div className="product-card-image product-card-image-placeholder" aria-hidden="true"><span>{product.name.charAt(0).toUpperCase()}</span></div>}
                    </div>
                    <div className="product-card-content">
                      <h3>{product.name}</h3>
                      <span className="product-card-price">₱{(product.price_centavos / 100).toFixed(2)}</span>
                      <p>{product.description || 'No description.'}</p>
                    </div>
                  </div>
                  <div className="restaurant-management-product-actions">
                    <button className="button restaurant-management-product-icon" type="button" disabled={deletingId === product.id}
                      onClick={() => openEdit(product)} aria-label={'Edit ' + product.name}>✎</button>
                    <button className="button restaurant-management-product-icon is-danger" type="button" disabled={deletingId === product.id}
                      onClick={() => openDeleteConfirmation(product)} aria-label={'Delete ' + product.name}>
                      {deletingId === product.id ? '…' : '×'}
                    </button>
                  </div>
                </article>;
              })}
            </div>}
        </div>

        <div className="owner-menu-customization-settings">
          <ProductExtrasManager
            key={tenantId}
            data={data}
            busy={savingCustomizations || savingForm}
            run={runCustomizationChange}
            showPhotos={false}
          />
        </div>

        {deleteProductTarget && <div className="restaurant-delete-modal-backdrop"
          onMouseDown={(event) => { if (event.target === event.currentTarget && !deletingId) closeDeleteConfirmation(); }}>
          <div className="restaurant-delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-product-modal-title">
            <div className="restaurant-delete-modal-icon" aria-hidden="true">!</div>
            <h2 id="delete-product-modal-title">Delete product?</h2>
            <p>Are you sure you want to delete <strong>{deleteProductTarget.name}</strong>?</p>
            <span className="restaurant-delete-modal-note">This will remove the product from this restaurant’s menu and all branch assignments.</span>
            <div className="restaurant-delete-modal-actions">
              <button className="button button-secondary" type="button" disabled={Boolean(deletingId)} onClick={closeDeleteConfirmation}>Cancel</button>
              <button className="button restaurant-delete-confirm-button" type="button" disabled={Boolean(deletingId)} onClick={() => void removeProduct(deleteProductTarget)}>
                {deletingId === deleteProductTarget.id ? 'Deleting…' : 'Delete Product'}
              </button>
            </div>
          </div>
        </div>}

        {(editingProduct || isAddingProduct) && <div className="restaurant-product-modal-backdrop"
          onMouseDown={(event) => { if (event.target === event.currentTarget && !savingForm) closeProductModal(); }}>
          <div className="restaurant-product-modal restaurant-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="product-modal-title">
            <button className="restaurant-product-modal-close" type="button" disabled={savingForm} onClick={closeProductModal} aria-label="Close product form">×</button>
            <h2 id="product-modal-title">{isAddingProduct ? 'Add Product' : 'Edit Product'}</h2>
            <form className="restaurant-product-form" onSubmit={(event) => void saveProduct(event)}>
              <div className="restaurant-product-image-picker">
                {imageFile ? <div className="restaurant-product-image-placeholder">Selected image<br/><strong>{imageFile.name}</strong></div>
                  : imagePreview ? <img src={imagePreview} alt="Product preview" className="restaurant-product-image-preview"/>
                    : <div className="restaurant-product-image-placeholder">No product image</div>}
                <label className="button button-secondary" htmlFor="product-image-input">{imagePreview || imageFile ? 'Change Image' : 'Add Image'}</label>
                <input id="product-image-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => handleImageChange(event.target.files?.[0])} disabled={savingForm}/>
                <small>JPG, PNG, or WEBP · maximum 5 MB</small>
              </div>
              <label>Product name<input value={form.name} maxLength={160} onChange={(event) => setForm(current => ({ ...current, name: event.target.value }))} required autoFocus disabled={savingForm}/></label>
              <label>Description<textarea value={form.description} maxLength={600} onChange={(event) => setForm(current => ({ ...current, description: event.target.value }))} disabled={savingForm}/></label>
              <label>Price<input type="number" min="0" max="1000000" step="0.01" value={form.price} onChange={(event) => setForm(current => ({ ...current, price: event.target.value }))} required disabled={savingForm}/></label>
              <label>Category
                <input list="restaurant-product-categories" value={form.categoryName} maxLength={100} placeholder="Enter or choose a category"
                  onChange={(event) => setForm(current => ({ ...current, categoryName: event.target.value }))} required disabled={savingForm}/>
                <datalist id="restaurant-product-categories">{categories.map((category) => <option key={category.id} value={category.name}/>)}</datalist>
                <span className="restaurant-product-category-hint">Choose an existing category or enter a new one. New categories are added automatically.</span>
              </label>
              <div className="restaurant-product-form-actions">
                <button className="button button-secondary" type="button" disabled={savingForm} onClick={closeProductModal}>Cancel</button>
                <button className="button button-primary" type="submit" disabled={savingForm}>{savingForm ? 'Saving…' : isAddingProduct ? 'Add Product' : 'Save Changes'}</button>
              </div>
            </form>
          </div>
        </div>}
      </section>
    </main>
  );
}
