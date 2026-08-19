import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Plus, Edit, Trash2, Search, Filter, Eye, Wrench, X, 
  AlertCircle, ShieldCheck, Tag, Info, ArrowLeftRight
} from 'lucide-react';
import api from '../../../services/api';
import AssetDetailsModal from '../../../components/AssetDetailsModal';

const CATEGORIES = [
  'Electronics',
  'Furniture',
  'Plumbing',
  'AC & Heating',
  'Kitchen Appliances',
  'Laundry Equipment',
  'Other'
];

const STATUSES = [
  'Active',
  'Under Maintenance',
  'Under Repair',
  'Damaged',
  'Disposed'
];

const AssetList = () => {
  const [searchParams] = useSearchParams();
  const filterTrouble = searchParams.get('filter') === 'trouble';

  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterStatus, setFilterStatus] = useState(filterTrouble ? 'Trouble' : 'All');
  
  // Modals
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  const [selectedAssetId, setSelectedAssetId] = useState(null);

  // Rooms and Location selections
  const [rooms, setRooms] = useState([]);
  const [locationSelect, setLocationSelect] = useState('');
  const [customLocation, setCustomLocation] = useState('');

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    category: 'Electronics',
    brand: '',
    serialNumber: '',
    purchaseDate: '',
    purchasePrice: '',
    location: '',
    status: 'Active',
    notes: ''
  });
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetchAssets();
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    try {
      const res = await api.get('/rooms');
      if (res.data?.success) {
        setRooms(res.data.data || []);
      }
    } catch (error) {
      console.error('Error fetching rooms for assets:', error);
    }
  };

  const fetchAssets = async () => {
    try {
      setLoading(true);
      const res = await api.get('/assets');
      if (res.data?.success) {
        setAssets(res.data.data);
      }
    } catch (error) {
      console.error('Error fetching assets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAddModal = () => {
    setEditingAsset(null);
    setFormData({
      name: '',
      category: 'Electronics',
      brand: '',
      serialNumber: '',
      purchaseDate: new Date().toISOString().split('T')[0],
      purchasePrice: '',
      location: '',
      status: 'Active',
      notes: ''
    });
    setLocationSelect('');
    setCustomLocation('');
    setErrorMsg('');
    setIsFormModalOpen(true);
  };

  const handleOpenEditModal = (asset) => {
    setEditingAsset(asset);
    setFormData({
      name: asset.name || '',
      category: asset.category || 'Electronics',
      brand: asset.brand || '',
      serialNumber: asset.serialNumber || '',
      purchaseDate: asset.purchaseDate || '',
      purchasePrice: asset.purchasePrice || '',
      location: asset.location || '',
      status: asset.status || 'Active',
      notes: asset.notes || ''
    });

    const initialLocation = asset.location || '';
    const standardOptions = [
      ...rooms.map(r => `Room ${r.roomNumber}`)
    ];
    if (standardOptions.includes(initialLocation)) {
      setLocationSelect(initialLocation);
      setCustomLocation('');
    } else {
      setLocationSelect(initialLocation ? 'Other / Manual Entry' : '');
      setCustomLocation(initialLocation);
    }

    setErrorMsg('');
    setIsFormModalOpen(true);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.category || !formData.location) {
      setErrorMsg('Name, Category, and Location are required.');
      return;
    }

    try {
      if (editingAsset) {
        const res = await api.put(`/assets/${editingAsset.id}`, formData);
        if (res.data?.success) {
          fetchAssets();
          setIsFormModalOpen(false);
        }
      } else {
        const res = await api.post('/assets', formData);
        if (res.data?.success) {
          fetchAssets();
          setIsFormModalOpen(false);
        }
      }
    } catch (error) {
      console.error('Error saving asset:', error);
      setErrorMsg(error.response?.data?.message || 'Failed to save asset.');
    }
  };

  const handleDeleteAsset = async (id) => {
    if (!window.confirm('Are you sure you want to delete this asset? All related service log logs will be permanently deleted.')) {
      return;
    }

    try {
      const res = await api.delete(`/assets/${id}`);
      if (res.data?.success) {
        fetchAssets();
      }
    } catch (error) {
      console.error('Error deleting asset:', error);
      alert('Failed to delete asset');
    }
  };

  // Filtered Assets
  const filteredAssets = assets.filter(asset => {
    // Search match
    const query = searchQuery.toLowerCase();
    const matchesSearch = 
      asset.name.toLowerCase().includes(query) ||
      asset.assetId.toLowerCase().includes(query) ||
      (asset.brand && asset.brand.toLowerCase().includes(query)) ||
      asset.location.toLowerCase().includes(query);

    // Category filter
    const matchesCategory = filterCategory === 'All' || asset.category === filterCategory;

    // Status filter
    let matchesStatus = true;
    if (filterStatus === 'Trouble') {
      matchesStatus = ['Under Maintenance', 'Under Repair', 'Damaged'].includes(asset.status);
    } else if (filterStatus !== 'All') {
      matchesStatus = asset.status === filterStatus;
    }

    return matchesSearch && matchesCategory && matchesStatus;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Asset Inventory</h1>
          <p className="text-gray-500 text-sm">Register physical property items, manage statuses, and inspect purchase value.</p>
        </div>
        <button 
          onClick={handleOpenAddModal}
          className="flex items-center gap-2 bg-[#8BA73B] text-white px-4 py-2.5 rounded-xl hover:bg-[#768F31] transition-colors shadow-sm font-semibold text-sm"
        >
          <Plus size={16} /> Add Asset
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        {/* Search */}
        <div className="relative w-full md:max-w-md">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input 
            type="text" 
            placeholder="Search by name, tag, brand, location..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-[#1A2E05] font-bold focus:outline-none focus:border-emerald-500 placeholder-gray-500"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
          {/* Category Filter */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs font-bold text-[#4A5E38] uppercase tracking-wider">Category:</span>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-[#1A2E05] font-bold focus:outline-none focus:border-emerald-500 w-full sm:w-auto"
            >
              <option value="All">All Categories</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs font-bold text-[#4A5E38] uppercase tracking-wider">Status:</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-[#1A2E05] font-bold focus:outline-none focus:border-emerald-500 w-full sm:w-auto"
            >
              <option value="All">All Statuses</option>
              <option value="Trouble">Needs Service</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Assets Table */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-500"></div>
        </div>
      ) : filteredAssets.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center text-gray-400 shadow-sm">
          <Info size={40} className="mx-auto mb-2 text-gray-300" />
          No assets found matching the filter criteria.
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-400 uppercase">
                  <th className="px-6 py-4">Asset ID</th>
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4">Category</th>
                  <th className="px-6 py-4">Location</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Price</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-sm text-gray-700">
                {filteredAssets.map(asset => (
                  <tr key={asset.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-gray-500">{asset.assetId}</td>
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-bold text-gray-800">{asset.name}</div>
                        {asset.brand && <div className="text-xs text-gray-400">{asset.brand}</div>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg">
                        {asset.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-600">{asset.location}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 text-xs font-bold rounded-lg ${
                        asset.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/50' :
                        asset.status === 'Under Maintenance' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200/50' :
                        asset.status === 'Under Repair' ? 'bg-orange-50 text-orange-700 border border-orange-200/50' :
                        asset.status === 'Damaged' ? 'bg-red-50 text-red-700 border border-red-200/50' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {asset.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-semibold text-gray-600">
                      {parseFloat(asset.purchasePrice) > 0 ? `₹${parseFloat(asset.purchasePrice).toLocaleString('en-IN')}` : '—'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        {/* View details / History button */}
                        <button
                          onClick={() => setSelectedAssetId(asset.id)}
                          title="View Details"
                          className="p-2 text-blue-500 hover:bg-blue-50 rounded-xl transition-colors"
                        >
                          <Eye size={16} />
                        </button>
                        {/* Edit button */}
                        <button
                          onClick={() => handleOpenEditModal(asset)}
                          title="Edit Details"
                          className="p-2 text-amber-500 hover:bg-amber-50 rounded-xl transition-colors"
                        >
                          <Edit size={16} />
                        </button>
                        {/* Delete button */}
                        <button
                          onClick={() => handleDeleteAsset(asset.id)}
                          title="Delete Asset"
                          className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Form Modal (Add / Edit Asset) */}
      {isFormModalOpen && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
            {/* Form Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-800">
                {editingAsset ? 'Edit Asset Details' : 'Add New Asset'}
              </h3>
              <button 
                onClick={() => setIsFormModalOpen(false)}
                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              {errorMsg && (
                <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 text-xs font-medium rounded-xl border border-red-100">
                  <AlertCircle size={16} /> {errorMsg}
                </div>
              )}

              {/* Grid 2 Columns */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Asset Name */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#4A5E38] uppercase tracking-wider">Asset Name *</label>
                  <input 
                    type="text" 
                    placeholder="e.g. LG AC 1.5 Ton"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm text-[#1A2E05] font-bold focus:outline-none focus:border-emerald-500 placeholder-gray-500"
                    required
                  />
                </div>

                {/* Category */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#4A5E38] uppercase tracking-wider">Category *</label>
                  <select 
                    value={formData.category}
                    onChange={(e) => setFormData({...formData, category: e.target.value})}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-[#1A2E05] font-bold bg-white focus:outline-none focus:border-emerald-500"
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {/* Brand */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#4A5E38] uppercase tracking-wider">Brand</label>
                  <input 
                    type="text" 
                    placeholder="e.g. LG Electronics"
                    value={formData.brand}
                    onChange={(e) => setFormData({...formData, brand: e.target.value})}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm text-[#1A2E05] font-bold focus:outline-none focus:border-emerald-500 placeholder-gray-500"
                  />
                </div>

                {/* Location */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#4A5E38] uppercase tracking-wider">Location *</label>
                  <select 
                    value={locationSelect}
                    onChange={(e) => {
                      const val = e.target.value;
                      setLocationSelect(val);
                      if (val !== 'Other / Manual Entry') {
                        setFormData(prev => ({ ...prev, location: val }));
                      } else {
                        setFormData(prev => ({ ...prev, location: customLocation }));
                      }
                    }}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-[#1A2E05] font-bold bg-white focus:outline-none focus:border-emerald-500"
                    required
                  >
                    <option value="" disabled>-- Select Location --</option>
                    {rooms.map(r => (
                      <option key={r.id} value={`Room ${r.roomNumber}`}>{`Room ${r.roomNumber}`}</option>
                    ))}

                    <option value="Other / Manual Entry">Other / Manual Entry</option>
                  </select>
                </div>

                {locationSelect === 'Other / Manual Entry' && (
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs font-bold text-[#4A5E38] uppercase tracking-wider">Specify Manual Location *</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Server Room / Rooftop / Garden"
                      value={customLocation}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomLocation(val);
                        setFormData(prev => ({ ...prev, location: val }));
                      }}
                      className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm text-[#1A2E05] font-bold focus:outline-none focus:border-emerald-500 placeholder-gray-500"
                      required
                    />
                  </div>
                )}

                {/* Serial Number */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#4A5E38] uppercase tracking-wider">Serial Number</label>
                  <input 
                    type="text" 
                    placeholder="e.g. SN-98317-293"
                    value={formData.serialNumber}
                    onChange={(e) => setFormData({...formData, serialNumber: e.target.value})}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm text-[#1A2E05] font-bold focus:outline-none focus:border-emerald-500 placeholder-gray-500"
                  />
                </div>

                {/* Purchase Price */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#4A5E38] uppercase tracking-wider">Purchase Price (₹)</label>
                  <input 
                    type="number" 
                    placeholder="e.g. 42000"
                    value={formData.purchasePrice}
                    onChange={(e) => setFormData({...formData, purchasePrice: e.target.value})}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm text-[#1A2E05] font-bold focus:outline-none focus:border-emerald-500 placeholder-gray-500"
                  />
                </div>

                {/* Purchase Date */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#4A5E38] uppercase tracking-wider">Purchase Date</label>
                  <input 
                    type="date" 
                    value={formData.purchaseDate}
                    onChange={(e) => setFormData({...formData, purchaseDate: e.target.value})}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm text-[#1A2E05] font-bold focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Status */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#4A5E38] uppercase tracking-wider">Asset Status</label>
                  <select 
                    value={formData.status}
                    onChange={(e) => setFormData({...formData, status: e.target.value})}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-[#1A2E05] font-bold bg-white focus:outline-none focus:border-emerald-500"
                  >
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#4A5E38] uppercase tracking-wider">Notes / Specifications</label>
                <textarea 
                  rows="3"
                  placeholder="Warranty terms, supplier contact details..."
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm text-[#1A2E05] font-bold focus:outline-none focus:border-emerald-500 placeholder-gray-500"
                ></textarea>
              </div>

              {/* Form Footer */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#8BA73B] text-white rounded-xl text-sm font-semibold hover:bg-[#768F31] transition-colors"
                >
                  Save Asset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Details/Audit Timeline Modal */}
      {selectedAssetId && (
        <AssetDetailsModal 
          assetId={selectedAssetId} 
          onClose={() => setSelectedAssetId(null)} 
        />
      )}
    </div>
  );
};

export default AssetList;
