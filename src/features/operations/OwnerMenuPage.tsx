import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  createCategory, loadOwnerDataForTenant, publicMenuPhoto, saveItem, setBranchItem,
  setPublication, toggleCategory, updateCategory, uploadMenuPhoto,
  type OwnerData, type Product,
} from '../../features/management/menuService';

type Props = { tenantId: string; restaurantName: string | null };
type ItemStatus = Product['status'];
type ItemDraft = { name: string; description: string; categoryId: string; price: string; popular: boolean; status: ItemStatus };
const blankItem = (): ItemDraft => ({ name: '', description: '', categoryId: '', price: '', popular: false, status: 'draft' });
const formatPrice = (centavos: number) => (centavos / 100).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'The menu change could not be saved.';

export function OwnerMenuPage({ tenantId, restaurantName }: Props) {
  const [data, setData] = useState<OwnerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [renamingCategoryId, setRenamingCategoryId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [draft, setDraft] = useState<ItemDraft>(blankItem);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  async function refreshData() {
    const next = await loadOwnerDataForTenant(tenantId);
    setData(next);
    setDraft(current => current.categoryId && next.categories.some(category => category.id === current.categoryId)
      ? current : { ...current, categoryId: next.categories[0]?.id ?? '' });
  }

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError('');
    loadOwnerDataForTenant(tenantId).then(next => {
      if (!mounted) return;
      setData(next);
      setDraft(current => ({ ...current, categoryId: current.categoryId || next.categories[0]?.id || '' }));
    }).catch(reason => {
      if (mounted) setError(errorMessage(reason));
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, [tenantId]);

  const activeBranches = useMemo(() => (data?.branches ?? []).filter(branch => branch.is_active), [data]);
  const defaultBranch = data?.branches.find(branch => branch.id === data.brand.default_branch_id);
  const publishedItems = data?.items.filter(item => item.status === 'published').length ?? 0;
  const draftItems = data?.items.filter(item => item.status === 'draft').length ?? 0;
  const archivedItems = data?.items.filter(item => item.status === 'archived').length ?? 0;
  const displayedItems = (data?.items ?? []).filter(item => showArchived ? item.status === 'archived' : item.status !== 'archived');

  function feedback(nextMessage = '', nextError = '') {
    setMessage(nextMessage);
    setError(nextError);
  }

  async function perform(action: () => Promise<void>, success: string) {
    setBusy(true);
    feedback();
    try {
      await action();
      await refreshData();
      setMessage(success);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = categoryName.trim();
    if (name.length < 2 || name.length > 100) {
      setError('Category names must be between 2 and 100 characters.');
      return;
    }
    await perform(async () => {
      await createCategory(tenantId, name);
      setCategoryName('');
    }, 'Category created. Publish it when it is ready to appear on the storefront.');
  }

  async function saveCategoryName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renamingCategoryId) return;
    const id = renamingCategoryId;
    await perform(async () => {
      await updateCategory(tenantId, id, renameValue);
      setRenamingCategoryId(null);
      setRenameValue('');
    }, 'Category name updated.');
  }

  function startEdit(item: Product) {
    setEditingItemId(item.id);
    setDraft({
      name: item.name,
      description: item.description,
      categoryId: item.category_id,
      price: (item.price_centavos / 100).toFixed(2),
      popular: item.is_popular,
      status: item.status,
    });
    setPhotoFile(null);
    feedback();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditingItemId(null);
    setDraft({ ...blankItem(), categoryId: data?.categories[0]?.id ?? '' });
    setPhotoFile(null);
  }

  async function saveMenuItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    const name = draft.name.trim();
    const description = draft.description.trim();
    const amount = Number(draft.price);
    if (name.length < 2 || name.length > 160) {
      setError('Item name must be between 2 and 160 characters.');
      return;
    }
    if (!data.categories.some(category => category.id === draft.categoryId)) {
      setError('Create or choose a menu category first.');
      return;
    }
    if (description.length > 600) {
      setError('The description must be 600 characters or fewer.');
      return;
    }
    if (!Number.isFinite(amount) || amount < 0 || amount > 1000000) {
      setError('Enter a valid price between ₱0 and ₱1,000,000.');
      return;
    }
    const selectedCategory = data.categories.find(category => category.id === draft.categoryId)!;
    if (draft.status === 'published' && !selectedCategory.is_published) {
      setError('Publish this item’s category first, then publish the item.');
      return;
    }
    if (draft.status === 'published' && activeBranches.length === 0) {
      setError('There is no active branch available to display this item. Ask the System Administrator to activate the default branch.');
      return;
    }
    if (photoFile && (!['image/jpeg','image/png','image/webp'].includes(photoFile.type) || photoFile.size <= 0 || photoFile.size > 3 * 1024 * 1024)) {
      setError('Choose a JPEG, PNG or WebP image up to 3 MB.');
      return;
    }
    await perform(async () => {
      const previous = editingItemId ? data.items.find(item => item.id === editingItemId) : undefined;
      const itemId = await saveItem(tenantId, editingItemId, {
        name,
        description,
        category_id: draft.categoryId,
        price_centavos: Math.round(amount * 100),
        is_popular: draft.popular,
        status: draft.status,
      });
      if (photoFile) await uploadMenuPhoto(tenantId, itemId, photoFile);
      for (const branch of activeBranches) {
        const existingAssignment = data.assignments.find(row => row.branch_id === branch.id && row.item_id === itemId);
        const newlyPublished = draft.status === 'published' && previous?.status !== 'published';
        const available = draft.status === 'published'
          ? (newlyPublished ? true : (existingAssignment?.is_available ?? true))
          : false;
        await setBranchItem(tenantId, branch.id, itemId, available, existingAssignment?.price_override_centavos ?? null);
      }
      setEditingItemId(null);
      setDraft({ ...blankItem(), categoryId: data.categories[0]?.id ?? '' });
      setPhotoFile(null);
    }, editingItemId ? 'Menu item updated.' : 'Menu item created.');
  }

  async function changeItemStatus(item: Product, status: ItemStatus) {
    if (!data) return;
    const category = data.categories.find(value => value.id === item.category_id);
    if (status === 'published' && !category?.is_published) {
      setError('Publish this item’s category first, then publish the item.');
      return;
    }
    if (status === 'published' && activeBranches.length === 0) {
      setError('There is no active branch available to publish this item.');
      return;
    }
    await perform(async () => {
      await saveItem(tenantId, item.id, {
        name: item.name, description: item.description, category_id: item.category_id,
        price_centavos: item.price_centavos, is_popular: item.is_popular, status,
      });
      for (const branch of activeBranches) {
        const assignment = data.assignments.find(row => row.branch_id === branch.id && row.item_id === item.id);
        await setBranchItem(tenantId, branch.id, item.id, status === 'published' ? true : false, assignment?.price_override_centavos ?? null);
      }
    }, status === 'published' ? 'Item published to active branches.' : status === 'archived' ? 'Item archived.' : 'Item moved to drafts.');
  }

  async function changeBranchAvailability(item: Product, branchId: string, available: boolean) {
    if (available && item.status !== 'published') {
      setError('Publish this menu item before making it available at a branch.');
      return;
    }
    const category = data?.categories.find(value => value.id === item.category_id);
    if (available && !category?.is_published) {
      setError('Publish this item’s category before making the item available.');
      return;
    }
    const current = data?.assignments.find(row => row.branch_id === branchId && row.item_id === item.id);
    await perform(async () => {
      await setBranchItem(tenantId, branchId, item.id, available, current?.price_override_centavos ?? null);
    }, available ? 'Item made available at this branch.' : 'Item hidden at this branch.');
  }

  async function toggleStorefront() {
    if (!data) return;
    const publish = data.brand.status !== 'published';
    await perform(async () => { await setPublication(tenantId, publish); },
      publish ? 'Storefront published. Add and publish categories and items to populate the menu.' : 'Storefront unpublished.');
  }

  const itemStatusLabel = (status: ItemStatus) => status === 'published' ? 'Published' : status === 'archived' ? 'Archived' : 'Draft';

  if (loading) return <main className="owner-content"><section className="owner-orders-empty"><h1>Menu</h1><p>Loading your restaurant menu…</p></section></main>;
  if (!data) return <main className="owner-content"><section className="owner-orders-empty"><h1>Menu</h1><p role="alert">{error || 'Menu service could not be loaded.'}</p><button type="button" onClick={() => { setLoading(true); void refreshData().catch(reason => setError(errorMessage(reason))).finally(() => setLoading(false)); }}>Retry</button></section></main>;

  return <main className="owner-content owner-menu-page">
    <header className="owner-menu-header">
      <div><p className="owner-menu-eyebrow">RESTAURANT SETUP</p><h1>{restaurantName ?? data.tenant.name} menu</h1><p>Add categories and menu items here. Items are only visible to customers after their category, item and branch availability are published.</p></div>
      <div className="owner-menu-publish">
        <span className={'owner-menu-status ' + (data.brand.status === 'published' ? 'is-published' : '')}>{data.brand.status === 'published' ? 'Storefront published' : data.brand.status === 'disabled' ? 'Storefront disabled' : 'Storefront draft'}</span>
        <button type="button" disabled={busy || data.brand.status === 'disabled'} onClick={() => void toggleStorefront()}>{busy ? 'Saving…' : data.brand.status === 'published' ? 'Unpublish storefront' : 'Publish storefront'}</button>
      </div>
    </header>

    {error && <div className="owner-menu-feedback is-error" role="alert"><strong>Couldn’t complete that action</strong><p>{error}</p></div>}
    {message && <div className="owner-menu-feedback is-success" role="status">{message}</div>}

    <section className="owner-menu-summary" aria-label="Menu summary">
      <article><span>Categories</span><strong>{data.categories.length}</strong><small>{data.categories.filter(category => category.is_published).length} published</small></article>
      <article><span>Menu items</span><strong>{data.items.filter(item => item.status !== 'archived').length}</strong><small>{publishedItems} published · {draftItems} drafts</small></article>
      <article><span>Active branches</span><strong>{activeBranches.length}</strong><small>{defaultBranch?.name ?? 'Default branch not found'}</small></article>
    </section>

    <div className="owner-menu-columns">
      <section className="owner-menu-panel">
        <div className="owner-menu-panel-heading"><div><h2>Menu categories</h2><p>Categories must be published before their dishes can appear publicly.</p></div></div>
        <form className="owner-menu-inline-form" onSubmit={event => void addCategory(event)}>
          <label><span>New category</span><input value={categoryName} maxLength={100} placeholder="e.g. Rice meals" onChange={event => setCategoryName(event.target.value)} disabled={busy}/></label>
          <button type="submit" disabled={busy || categoryName.trim().length < 2}>Add category</button>
        </form>
        {!data.categories.length ? <div className="owner-menu-empty"><strong>No categories yet</strong><p>Create your first category, such as Meals, Snacks, or Drinks.</p></div> :
        <div className="owner-menu-category-list">
          {data.categories.map(category => <article className="owner-menu-category" key={category.id}>
            <div className="owner-menu-category-main">
              {renamingCategoryId === category.id ? <form onSubmit={event => void saveCategoryName(event)} className="owner-menu-rename-form"><input aria-label="Category name" value={renameValue} maxLength={100} onChange={event => setRenameValue(event.target.value)} disabled={busy}/><button type="submit" disabled={busy || renameValue.trim().length < 2}>Save</button><button type="button" disabled={busy} onClick={() => setRenamingCategoryId(null)}>Cancel</button></form> :
              <><strong>{category.name}</strong><small>{data.items.filter(item => item.category_id === category.id && item.status !== 'archived').length} items</small></>}
            </div>
            <div className="owner-menu-category-actions">
              <span className={'owner-menu-status ' + (category.is_published ? 'is-published' : '')}>{category.is_published ? 'Published' : 'Draft'}</span>
              <button type="button" disabled={busy} onClick={() => void perform(() => toggleCategory(tenantId, category.id, !category.is_published), category.is_published ? 'Category hidden from the storefront.' : 'Category published.')}>{category.is_published ? 'Unpublish' : 'Publish'}</button>
              {renamingCategoryId !== category.id && <button type="button" className="is-secondary" disabled={busy} onClick={() => {setRenamingCategoryId(category.id);setRenameValue(category.name);}}>Rename</button>}
            </div>
          </article>)}
        </div>}
      </section>

      <section className="owner-menu-panel owner-menu-item-editor">
        <div className="owner-menu-panel-heading"><div><h2>{editingItemId ? 'Edit menu item' : 'Add a menu item'}</h2><p>Save drafts first, then publish once the item and category are ready.</p></div></div>
        {!data.categories.length ? <div className="owner-menu-empty"><strong>Create a category first</strong><p>A menu item must belong to a category before it can be saved.</p></div> :
        <form className="owner-menu-item-form" onSubmit={event => void saveMenuItem(event)}>
          <label><span>Item name</span><input required minLength={2} maxLength={160} value={draft.name} placeholder="e.g. Chicken rice bowl" onChange={event => setDraft(current => ({...current,name:event.target.value}))} disabled={busy}/></label>
          <label><span>Category</span><select value={draft.categoryId} onChange={event => setDraft(current => ({...current,categoryId:event.target.value}))} disabled={busy} required>{data.categories.map(category => <option key={category.id} value={category.id}>{category.name}{category.is_published ? '' : ' (draft)'}</option>)}</select></label>
          <label><span>Description</span><textarea rows={3} maxLength={600} value={draft.description} placeholder="Describe the dish, portion, or ingredients" onChange={event => setDraft(current => ({...current,description:event.target.value}))} disabled={busy}/></label>
          <label><span>Price (₱)</span><input required type="number" inputMode="decimal" min="0" max="1000000" step="0.01" value={draft.price} placeholder="0.00" onChange={event => setDraft(current => ({...current,price:event.target.value}))} disabled={busy}/></label>
          <label><span>Menu photo (optional)</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => setPhotoFile(event.target.files?.[0] ?? null)} disabled={busy}/><small>JPEG, PNG or WebP, up to 3 MB.</small></label>
          {editingItemId && data.items.find(item => item.id === editingItemId)?.image_path && !photoFile && <p className="owner-menu-photo-current">A photo is already attached. Choose a new image to replace it.</p>}
          <label className="owner-menu-popular"><input type="checkbox" checked={draft.popular} onChange={event => setDraft(current => ({...current,popular:event.target.checked}))} disabled={busy}/><span>Mark as popular</span></label>
          <label><span>Visibility</span><select value={draft.status} onChange={event => setDraft(current => ({...current,status:event.target.value as ItemStatus}))} disabled={busy}><option value="draft">Draft — hidden from customers</option><option value="published">Published — visible at active branches</option><option value="archived">Archived — removed from menu</option></select></label>
          <div className="owner-menu-form-actions"><button type="submit" disabled={busy || !draft.categoryId}>{busy ? 'Saving…' : editingItemId ? 'Save changes' : 'Add menu item'}</button>{editingItemId && <button type="button" className="is-secondary" disabled={busy} onClick={cancelEdit}>Cancel edit</button>}</div>
        </form>}
      </section>
    </div>

    <section className="owner-menu-panel owner-menu-items-panel">
      <div className="owner-menu-panel-heading"><div><h2>{showArchived ? 'Archived items' : 'Menu items'}</h2><p>Manage item details and control whether each active branch can serve the item.</p></div><button type="button" className="is-secondary" onClick={() => setShowArchived(value => !value)}>{showArchived ? 'Show active items' : 'Show archived (' + archivedItems + ')'}</button></div>
      {displayedItems.length === 0 ? <div className="owner-menu-empty"><strong>{showArchived ? 'No archived items' : 'No menu items yet'}</strong><p>{showArchived ? 'Archived items will appear here.' : 'Add your menu items above. No sample dishes are inserted automatically.'}</p></div> :
      <div className="owner-menu-item-list">{displayedItems.map(item => {
        const category = data.categories.find(value => value.id === item.category_id);
        return <article className="owner-menu-item" key={item.id}>
          {item.image_path ? <img className="owner-menu-item-photo" src={publicMenuPhoto(item.image_path) ?? ''} alt={item.name} /> : <div className="owner-menu-item-photo is-empty" aria-hidden="true">🍽️</div>}
          <div className="owner-menu-item-details"><div className="owner-menu-item-title"><h3>{item.name}</h3><strong>{formatPrice(item.price_centavos)}</strong></div><p>{item.description || 'No description added.'}</p><div className="owner-menu-item-meta"><span>{category?.name ?? 'Missing category'}</span><span className={'owner-menu-status ' + (item.status === 'published' ? 'is-published' : '')}>{itemStatusLabel(item.status)}</span>{item.is_popular && <span className="owner-menu-popular-tag">Popular</span>}</div>
          {activeBranches.length > 0 && item.status !== 'archived' && <div className="owner-menu-branch-availability"><strong>Branch availability</strong>{activeBranches.map(branch => {const assignment=data.assignments.find(value => value.branch_id === branch.id && value.item_id === item.id); return <label key={branch.id}><input type="checkbox" checked={assignment?.is_available === true} disabled={busy || item.status !== 'published' || !category?.is_published} onChange={event => void changeBranchAvailability(item,branch.id,event.target.checked)}/><span>{branch.name}</span></label>;})}</div>}
          </div>
          <div className="owner-menu-item-actions"><button type="button" className="is-secondary" disabled={busy} onClick={() => startEdit(item)}>Edit</button>{item.status !== 'published' ? <button type="button" disabled={busy || item.status === 'archived'} onClick={() => void changeItemStatus(item,'published')}>Publish item</button> : <button type="button" className="is-secondary" disabled={busy} onClick={() => void changeItemStatus(item,'draft')}>Move to drafts</button>}{item.status !== 'archived' && <button type="button" className="is-danger" disabled={busy} onClick={() => void changeItemStatus(item,'archived')}>Archive</button>}</div>
        </article>;
      })}</div>}
    </section>
  </main>;
}
