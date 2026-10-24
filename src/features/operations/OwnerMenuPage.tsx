import { useEffect, useState, type FormEvent } from 'react';
import {
  deleteMenuItem, getOrCreateMenuCategory, loadOwnerDataForTenant, publicMenuPhoto,
  saveItem, setBranchItem, uploadMenuPhoto, type OwnerData, type Product,
} from '../management/menuService';

type Props = { tenantId: string; restaurantName: string | null };
type ProductForm = { name: string; description: string; price: string; categoryName: string };
const emptyForm: ProductForm = { name: '', description: '', price: '', categoryName: '' };
const formatError = (error: unknown) => error instanceof Error ? error.message : 'Unable to save the menu change.';\n\n// Reuse the last loaded menu when owners switch workspace sections. Refresh quietly\n// in the background so menu editing doesn't restart with a loading screen each time.\nconst ownerMenuCache = new Map<string, OwnerData>();

export function OwnerMenuPage({ tenantId }: Props) {
  const [data, setData] = useState<OwnerData | null>(() => ownerMenuCache.get(tenantId) ?? null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showUnavailable, setShowUnavailable] = useState(true);
  const [searchProduct, setSearchProduct] = useState('');
  const [loading, setLoading] = useState(() => !ownerMenuCache.has(tenantId));
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [savingForm, setSavingForm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteProductTarget, setDeleteProductTarget] = useState<Product | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    async function loadMenu() {
      try {
        const next = await loadOwnerDataForTenant(tenantId);
        ownerMenuCache.set(tenantId, next);\n        if (active) setData(next);
      } catch (reason) {
        if (active) setError(formatError(reason));
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadMenu();
    return () => { active = false; };
  }, [tenantId]);

  useEffect(() => {
    if (imagePreview.startsWith('blob:')) {
      return () => URL.revokeObjectURL(imagePreview);
    }
    return undefined;
  }, [imagePreview]);

  const categories = data?.categories ?? [];
  const products = (data?.items ?? []).filter((item) => item.status !== 'archived');
  const activeBranches = (data?.branches ?? []).filter((branch) => branch.is_active);
  const defaultBranch = data?.branches.find((branch) => branch.id === data?.brand.default_branch_id);
  const branchAssignment = (product: Product) => data?.assignments.find(
    (assignment) => assignment.branch_id === defaultBranch?.id && assignment.item_id === product.id,
  );
  const isAvailable = (product: Product) => {
    const category = categories.find((item) => item.id === product.category_id);
    return product.status === 'published' && category?.is_published === true && branchAssignment(product)?.is_available === true;
  };

  const query = searchProduct.trim().toLowerCase();
  const filteredProducts = products.filter((product) => {
    const categoryMatch = selectedCategory === 'all' || product.category_id === selectedCategory;
    const availabilityMatch = showUnavailable || isAvailable(product);
    const category = categories.find((item) => item.id === product.category_id);
    const searchMatch = !query
      || product.name.toLowerCase().includes(query)
      || product.description.toLowerCase().includes(query)
      || Boolean(category?.name.toLowerCase().includes(query));
    return categoryMatch && availabilityMatch && searchMatch;
  });

  async function refreshMenu() {
    const next = await loadOwnerDataForTenant(tenantId);
    setData(next);
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
    setImagePreview(URL.createObjectURL(file));
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

      for (const branch of activeBranches) {
        const existing = data.assignments.find((assignment) => assignment.branch_id === branch.id && assignment.item_id === itemId);
        const available = existing ? existing.is_available : true;
        await setBranchItem(tenantId, branch.id, itemId, available, existing?.price_override_centavos ?? null);
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

  async function toggleAvailability(product: Product) {
    if (!data || !defaultBranch || !defaultBranch.is_active) {
      setError('The default restaurant branch is not active. Ask the System Administrator to check branch settings.');
      return;
    }
    const makeAvailable = !isAvailable(product);
    if (makeAvailable && activeBranches.length === 0) {
      setError('There is no active branch available for this product.');
      return;
    }
    setSavingId(product.id);
    setError('');
    try {
      const category = categories.find((item) => item.id === product.category_id);
      if (makeAvailable && category) await getOrCreateMenuCategory(tenantId, category.name);
      await saveItem(tenantId, product.id, {
        name: product.name, description: product.description, category_id: product.category_id,
        price_centavos: product.price_centavos, is_popular: product.is_popular, status: 'published',
      });
      for (const branch of activeBranches) {
        const existing = data.assignments.find((assignment) => assignment.branch_id === branch.id && assignment.item_id === product.id);
        await setBranchItem(tenantId, branch.id, product.id, makeAvailable, existing?.price_override_centavos ?? null);
      }
      await refreshMenu();
    } catch (reason) {
      setError(formatError(reason));
    } finally {
      setSavingId(null);
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
      setData((current) => {\n        if (!current) return current;\n        const next = { ...current, items: current.items.filter((item) => item.id !== product.id), assignments: current.assignments.filter((item) => item.item_id !== product.id) };\n        ownerMenuCache.set(tenantId, next);\n        return next;\n      });
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
          <div className="restaurant-menu-section-header">
            <div>
              <h2>Menu</h2>
              <p>Manage the products customers can order from your restaurant.</p>
            </div>
            <button className="button restaurant-menu-add-button restaurant-compact-action" type="button" onClick={openAdd} disabled={loading}>+ Add Product</button>
          </div>

          <div className="restaurant-menu-search">
            <label className="restaurant-menu-search-label" htmlFor="restaurant-product-search">Search products</label>
            <div className="restaurant-menu-search-input-wrap">
              <input id="restaurant-product-search" type="text" role="searchbox" value={searchProduct}
                onChange={(event) => setSearchProduct(event.target.value)} placeholder="Search by product name, description, or category"/>
              {searchProduct && <button type="button" className="restaurant-menu-search-clear" onClick={() => setSearchProduct('')} aria-label="Clear product search">×</button>}
            </div>
          </div>

          <div className="restaurant-menu-toolbar">
            <div className="restaurant-menu-categories" aria-label="Product categories">
              <button className={selectedCategory === 'all' ? 'is-active' : ''} type="button" onClick={() => setSelectedCategory('all')}>All</button>
              {categories.map((category) => <button key={category.id} className={selectedCategory === category.id ? 'is-active' : ''} type="button" onClick={() => setSelectedCategory(category.id)}>{category.name}</button>)}
            </div>
            <div className="restaurant-menu-toggle">
              <button type="button" role="switch" aria-checked={showUnavailable} aria-label="Show unavailable products"
                className={'w2t-switch' + (showUnavailable ? ' is-on' : '')} onClick={() => setShowUnavailable(value => !value)}><span/></button>
              <span>Show unavailable</span>
            </div>
          </div>

          {loading ? <div className="restaurant-dashboard-empty">Loading products…</div>
            : !products.length ? <div className="restaurant-dashboard-empty"><strong>No products yet.</strong><p>Add your first product to start building the restaurant menu.</p></div>
            : !filteredProducts.length ? <div className="restaurant-dashboard-empty">No products match this filter.</div>
            : <div className="restaurant-menu-grid">
              {filteredProducts.map((product) => {
                const available = isAvailable(product);
                return <article className={'product-card restaurant-management-product-card' + (available ? '' : ' product-card-sold-out')} key={product.id}>
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
                  <div className="restaurant-management-product-status">{available ? 'Available' : 'Unavailable'}</div>
                  <div className="restaurant-management-product-actions">
                    <button className="button restaurant-management-product-icon" type="button" disabled={savingId === product.id || deletingId === product.id}
                      onClick={() => void toggleAvailability(product)} aria-label={available ? 'Mark ' + product.name + ' unavailable' : 'Make ' + product.name + ' available'}>
                      {savingId === product.id ? '…' : available ? '−' : '+'}
                    </button>
                    <button className="button restaurant-management-product-icon" type="button" disabled={savingId === product.id || deletingId === product.id}
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
                {imagePreview ? <img src={imagePreview} alt="Product preview" className="restaurant-product-image-preview"/>
                  : <div className="restaurant-product-image-placeholder">No product image</div>}
                <label className="button button-secondary" htmlFor="product-image-input">{imagePreview ? 'Change Image' : 'Add Image'}</label>
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
