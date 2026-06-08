import { useState, useEffect } from 'react';
import Topbar from '../components/Topbar';
import Sidebar from '../components/Sidebar';
import { apiFetch, parseError, hasAccess } from '../utils/api';

// Only 'full' access can create/edit recipes; 'view' (manager) is read-only
const canEdit = hasAccess('production_recipes', 'full');

const ProductRecipePage = () => {
  const [recipes, setRecipes] = useState([]);
  const [products, setProducts] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
  const [copySearchTerm, setCopySearchTerm] = useState('');

  const [form, setForm] = useState({
    product: '',
    name: '',
    is_active: true,
    items: []
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [recipesRes, productsRes, materialsRes] = await Promise.all([
        apiFetch('/production/recipes/'),
        apiFetch('/master-data/products/'),
        apiFetch('/master-data/raw-materials-and-consumables/')
      ]);

      if (recipesRes?.ok) {
        const data = await recipesRes.json();
        const recipeList = Array.isArray(data) ? data : (data.results ?? []);
        setRecipes(recipeList);
        if (recipeList.length > 0 && !selectedRecipe) {
          setSelectedRecipe(recipeList[0]);
        }
      }
      if (productsRes?.ok) {
        const data = await productsRes.json();
        setProducts(Array.isArray(data) ? data : (data.results ?? []));
      }
      if (materialsRes?.ok) {
        const data = await materialsRes.json();
        setRawMaterials(Array.isArray(data) ? data : (data.results ?? []));
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRecipe = (recipe) => {
    setSelectedRecipe(recipe);
    setIsEditing(false);
  };

  const startCreate = () => {
    setSelectedRecipe(null);
    setIsEditing(true);
    setForm({
      product: '',
      name: '',
      is_active: true,
      items: [{ material: '', quantity: '' }]
    });
  };

  const startEdit = () => {
    setIsEditing(true);
    setForm({
      product: selectedRecipe.product,
      name: selectedRecipe.name,
      is_active: selectedRecipe.is_active,
      items: selectedRecipe.items.map(it => ({ material: it.material, quantity: it.quantity }))
    });
  };

  const cancelEdit = () => {
    setIsEditing(false);
    if (!selectedRecipe && recipes.length > 0) {
      setSelectedRecipe(recipes[0]);
    }
  };

  const handleCopyFromModal = (templateId) => {
    const template = recipes.find(r => r.id === parseInt(templateId));
    if (template) {
      const newItems = template.items.map(it => ({ material: it.material, quantity: it.quantity }));
      setForm({ ...form, items: newItems.length > 0 ? newItems : [{ material: '', quantity: '' }] });
      setIsCopyModalOpen(false);
      setCopySearchTerm('');
    }
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...form.items];
    newItems[index][field] = value;
    setForm({ ...form, items: newItems });
  };

  const addItem = () => {
    setForm({ ...form, items: [...form.items, { material: '', quantity: '' }] });
  };

  const removeItem = (index) => {
    const newItems = form.items.filter((_, i) => i !== index);
    setForm({ ...form, items: newItems });
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');

    if (!form.product || !form.name) {
      setError('Product and Recipe Name are required.');
      setSubmitting(false);
      return;
    }

    const payload = {
      ...form,
      items: form.items
        .filter(it => it.material && it.quantity)
        .map(it => ({
          material: parseInt(it.material),
          quantity: parseFloat(it.quantity)
        }))
    };

    const endpoint = selectedRecipe ? `/production/recipes/${selectedRecipe.id}/` : '/production/recipes/';
    const method = selectedRecipe ? 'PUT' : 'POST';

    try {
      const res = await apiFetch(endpoint, {
        method,
        body: JSON.stringify(payload)
      });
      if (res && res.ok) {
        const savedRecipe = await res.json();
        await fetchData();
        setSelectedRecipe(savedRecipe);
        setIsEditing(false);
      } else {
        const data = await res.json();
        setError(parseError(data));
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      <div className="md:ml-16">
        <Topbar />
        <main className="h-[calc(100-64px)] overflow-hidden">
          <div className="flex h-[calc(100vh-64px)]">
            
            {/* Left Sidebar: Recipe List */}
            <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
              <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <div>
                  <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Recipes</h2>
                  <p className="text-[9px] text-orange-500 font-semibold uppercase tracking-widest mt-0.5">Confidential</p>
                </div>
                {canEdit && (
                  <button
                    onClick={startCreate}
                    className="p-1.5 rounded-full bg-orange-500 text-white hover:bg-orange-600 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Search Bar */}
              <div className="p-3 border-b border-gray-100">
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search product or recipe..."
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-9 pr-3 py-1.5 text-xs focus:ring-1 focus:ring-orange-500 outline-none"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {recipes.filter(r => 
                  r.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                  r.product_name.toLowerCase().includes(searchTerm.toLowerCase())
                ).length === 0 ? (
                  <p className="p-8 text-center text-xs text-gray-400">No matching recipes</p>
                ) : (
                  recipes.filter(r => 
                    r.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                    r.product_name.toLowerCase().includes(searchTerm.toLowerCase())
                  ).map(recipe => (
                    <button
                      key={recipe.id}
                      onClick={() => handleSelectRecipe(recipe)}
                      className={`w-full text-left p-4 border-b border-gray-50 transition-all ${
                        selectedRecipe?.id === recipe.id && !isEditing 
                          ? 'bg-orange-50 border-l-4 border-l-orange-500' 
                          : 'hover:bg-gray-50 border-l-4 border-l-transparent'
                      }`}
                    >
                      <p className="font-bold text-gray-900 text-sm truncate">{recipe.name}</p>
                      <p className="text-[10px] text-gray-500 uppercase font-medium mt-0.5 truncate">{recipe.product_name}</p>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Right Pane: Details or Form */}
            <div className="flex-1 bg-slate-50 overflow-y-auto">
              {!isEditing && selectedRecipe ? (
                <div className="p-8 max-w-4xl mx-auto">
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

                    {/* Header */}
                    <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <h1 className="text-2xl font-bold text-gray-900">{selectedRecipe.name}</h1>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${selectedRecipe.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {selectedRecipe.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        {/* "Produces" callout */}
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Produces</span>
                          <svg className="w-3.5 h-3.5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                          </svg>
                          <span className="text-sm font-bold text-orange-600">{selectedRecipe.product_name}</span>
                          {selectedRecipe.product_unit_symbol && (
                            <span className="text-xs text-gray-400">({selectedRecipe.product_unit_symbol})</span>
                          )}
                        </div>
                      </div>
                      {canEdit && (
                        <button
                          onClick={startEdit}
                          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-bold transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Edit Recipe
                        </button>
                      )}
                    </div>

                    {/* Ingredients label */}
                    <div className="px-8 pt-5 pb-2">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                        Ingredients — {selectedRecipe.items.length} material{selectedRecipe.items.length !== 1 ? 's' : ''}
                      </p>
                    </div>

                    <div className="pb-4">
                      <table className="w-full text-left">
                        <thead className="bg-gray-50 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-y border-gray-100">
                          <tr>
                            <th className="px-8 py-3 w-16">#</th>
                            <th className="px-4 py-3">Ingredient</th>
                            <th className="px-8 py-3 text-right">Required Quantity</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {selectedRecipe.items.map((item, idx) => (
                            <tr key={item.id} className="hover:bg-orange-50/30 transition-colors">
                              <td className="px-8 py-4 text-xs text-gray-300 font-mono">{String(idx + 1).padStart(2, '0')}</td>
                              <td className="px-4 py-4">
                                <span className="text-sm font-semibold text-gray-800">{item.material_name}</span>
                              </td>
                              <td className="px-8 py-4 text-right">
                                <span className="font-mono font-bold text-gray-900 text-base">{parseFloat(item.quantity).toLocaleString()}</span>
                                <span className="text-xs text-gray-400 ml-1.5">{item.unit_symbol}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                  </div>
                </div>
              ) : isEditing ? (
                <div className="p-8 max-w-4xl mx-auto">
                  <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
                    <div className="px-8 py-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                      <h2 className="text-lg font-bold text-gray-900">{selectedRecipe ? 'Edit Recipe' : 'New Recipe'}</h2>
                      <div className="flex gap-3">
                        <button onClick={cancelEdit} className="px-4 py-1.5 rounded-lg border border-gray-300 text-xs font-bold text-gray-600 hover:bg-white transition-all">Cancel</button>
                        <button 
                          onClick={handleSubmit} 
                          disabled={submitting}
                          className="px-6 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-bold hover:bg-orange-600 disabled:opacity-50 transition-all"
                        >
                          {submitting ? 'Saving...' : 'Save Changes'}
                        </button>
                      </div>
                    </div>

                    <div className="p-8">
                      {error && <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium">{error}</div>}
                      
                      <div className="grid grid-cols-2 gap-6 mb-8">
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Target Product</label>
                          <select
                            value={form.product}
                            onChange={(e) => setForm({ ...form, product: e.target.value })}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                          >
                            <option value="">Select product...</option>
                            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Recipe Title</label>
                          <input
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            placeholder="e.g. Standard Production Mix"
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                          />
                        </div>
                      </div>

                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xs font-bold text-gray-900 uppercase tracking-widest">Recipe Materials</h3>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setIsCopyModalOpen(true)}
                            className="text-indigo-600 hover:text-indigo-700 text-[10px] font-bold flex items-center gap-1 bg-indigo-50 px-3 py-1 rounded-full transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            Copy Formula
                          </button>
                          <button
                            type="button"
                            onClick={addItem}
                            className="text-orange-600 hover:text-orange-700 text-[10px] font-bold flex items-center gap-1 bg-orange-50 px-3 py-1 rounded-full transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Add Row
                          </button>
                        </div>
                      </div>

                      <div className="border border-gray-100 rounded-xl overflow-hidden">
                        <table className="w-full text-left">
                          <thead className="bg-gray-50 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100">
                            <tr>
                              <th className="px-4 py-3">Material</th>
                              <th className="px-4 py-3 w-40">Quantity</th>
                              <th className="px-4 py-3 w-12"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {form.items.map((item, index) => (
                              <tr key={index} className="hover:bg-gray-50/50">
                                <td className="px-4 py-2">
                                  <select
                                    value={item.material}
                                    onChange={(e) => handleItemChange(index, 'material', e.target.value)}
                                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-1 focus:ring-orange-500 outline-none"
                                  >
                                    <option value="">Select...</option>
                                    {rawMaterials.map(m => (
                                      <option key={m.id} value={m.id}>
                                        {m.name} {m.unit_symbol ? `(${m.unit_symbol})` : ''}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="px-4 py-2">
                                  <input
                                    type="number"
                                    value={item.quantity}
                                    onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                                    placeholder="0.00"
                                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-1 focus:ring-orange-500 outline-none font-mono"
                                  />
                                </td>
                                <td className="px-4 py-2 text-center">
                                  <button
                                    type="button"
                                    onClick={() => removeItem(index)}
                                    className="text-gray-300 hover:text-red-500 transition-colors"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400 p-12 text-center">
                  <div>
                    <svg className="w-16 h-16 mx-auto mb-4 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    <p className="text-sm">Select a recipe from the list to view details or create a new one.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Copy Formula Modal */}
      {isCopyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest">Copy Formula</h3>
              <button 
                onClick={() => setIsCopyModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="p-4 border-b border-gray-100">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  autoFocus
                  placeholder="Search recipes or products to copy from..."
                  value={copySearchTerm}
                  onChange={(e) => setCopySearchTerm(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>
            </div>

            <div className="overflow-y-auto p-2 flex-1 bg-slate-50">
              {recipes.filter(r => 
                r.name.toLowerCase().includes(copySearchTerm.toLowerCase()) || 
                r.product_name.toLowerCase().includes(copySearchTerm.toLowerCase())
              ).length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-400">No matching recipes found</div>
              ) : (
                <div className="space-y-1">
                  {recipes.filter(r => 
                    r.name.toLowerCase().includes(copySearchTerm.toLowerCase()) || 
                    r.product_name.toLowerCase().includes(copySearchTerm.toLowerCase())
                  ).map(recipe => (
                    <button
                      key={recipe.id}
                      onClick={() => handleCopyFromModal(recipe.id)}
                      className="w-full text-left p-3 rounded-xl border border-transparent hover:bg-white hover:border-gray-200 hover:shadow-sm transition-all flex justify-between items-center group"
                    >
                      <div>
                        <div className="font-bold text-gray-900 text-sm">{recipe.name}</div>
                        <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mt-0.5">{recipe.product_name}</div>
                      </div>
                      <span className="text-xs font-bold text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copy
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductRecipePage;
