import React, { useState, useEffect } from 'react';
import { 
  Plus, Edit, Trash2, Calendar, DollarSign, Tag, 
  FileText, Loader2, X, PlusCircle, AlertCircle, Globe, Wallet
} from 'lucide-react';
import api from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';

const CATEGORIES = [
  'Food & Beverage',
  'Utilities',
  'Maintenance',
  'Salaries',
  'Laundry',
  'Other'
];

const Expenses = () => {
  const { activeHotel } = useAuth();
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState([]);
  const [filterCategory, setFilterCategory] = useState('All');
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    category: 'Food & Beverage',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    description: '',
    paymentMode: 'Cash',
    paymentBank: ''
  });
  const [errorMsg, setErrorMsg] = useState('');

  const bankOptions = activeHotel && activeHotel.onlinePaymentBanks
    ? activeHotel.onlinePaymentBanks.split(',').map(b => b.trim()).filter(Boolean)
    : [];

  const fetchExpenses = async () => {
    try {
      setLoading(true);
      const params = {};
      if (filterCategory !== 'All') params.category = filterCategory;

      const res = await api.get('/expenses', { params });
      if (res.data?.success) {
        setExpenses(res.data.data);
      }
    } catch (err) {
      console.error("Failed to fetch expenses:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, [filterCategory]);

  const handleOpenAddModal = () => {
    setEditingExpense(null);
    setFormData({
      title: '',
      category: 'Food & Beverage',
      amount: '',
      date: new Date().toISOString().split('T')[0],
      description: '',
      paymentMode: 'Cash',
      paymentBank: ''
    });
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (exp) => {
    setEditingExpense(exp);
    setFormData({
      title: exp.title,
      category: exp.category,
      amount: exp.amount,
      date: exp.date,
      description: exp.description || '',
      paymentMode: exp.paymentMode || 'Cash',
      paymentBank: exp.paymentBank || ''
    });
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!formData.title || !formData.amount || !formData.date) {
      setErrorMsg('Please fill in all required fields.');
      return;
    }

    try {
      if (editingExpense) {
        // Update
        const res = await api.put(`/expenses/${editingExpense.id}`, formData);
        if (res.data?.success) {
          setIsModalOpen(false);
          fetchExpenses();
        }
      } else {
        // Create
        const res = await api.post('/expenses', formData);
        if (res.data?.success) {
          setIsModalOpen(false);
          fetchExpenses();
        }
      }
    } catch (err) {
      console.error("Failed to save expense:", err);
      setErrorMsg(err.response?.data?.message || 'Error occurred while saving expense.');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this expense?")) return;

    try {
      const res = await api.delete(`/expenses/${id}`);
      if (res.data?.success) {
        fetchExpenses();
      }
    } catch (err) {
      console.error("Failed to delete expense:", err);
    }
  };

  const totalExpenseSum = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <div className="space-y-3.5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div>
          <h1 className="text-lg sm:text-xl font-black text-[#1A2E05]">Hotel Expenses</h1>
          <p className="text-xs sm:text-sm text-[#7A8A6A] font-bold">Track operational outflows, utility bills, employee wages, and custom charges.</p>
        </div>
        <button
          onClick={handleOpenAddModal}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-[#84A63C] text-white rounded-lg text-xs font-bold hover:bg-[#84A63C]/95 transition-all shadow-sm active:scale-95 shrink-0"
        >
          <Plus size={14} /> Log New Expense
        </button>
      </div>

      {/* KPI Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-white p-4 rounded-xl border border-[#DDE5D0] shadow-sm flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-xs font-bold text-[#7A8A6A]">Total Outflow / Expenses</span>
            <div className="text-lg font-black text-rose-600">₹{totalExpenseSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </div>
          <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
            <DollarSign size={18} />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#DDE5D0] shadow-sm flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-xs font-bold text-[#7A8A6A]">Logged Receipts</span>
            <div className="text-lg font-black text-[#1A2E05]">{expenses.length} Records</div>
          </div>
          <div className="p-2 bg-[#F0F3E8] text-[#84A63C] rounded-xl">
            <FileText size={18} />
          </div>
        </div>
      </div>

      {/* Filters & Content Area */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Tag size={13} className="text-[#84A63C]" />
            <span className="text-xs font-black text-[#1A2E05] uppercase tracking-wider">Filter Category</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setFilterCategory('All')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                filterCategory === 'All'
                  ? 'bg-[#84A63C] border-[#84A63C] text-white shadow-sm'
                  : 'bg-white border-[#DDE5D0] text-[#4A5E38] hover:bg-[#F5F7F0]'
              }`}
            >
              All Category
            </button>
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                  filterCategory === cat
                    ? 'bg-[#84A63C] border-[#84A63C] text-white shadow-sm'
                    : 'bg-white border-[#DDE5D0] text-[#4A5E38] hover:bg-[#F5F7F0]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Expenses Table */}
        <div className="bg-white border border-[#DDE5D0] rounded-xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2.5 text-[#7A8A6A]">
              <Loader2 className="animate-spin text-[#84A63C]" size={24} />
              <span className="text-xs sm:text-sm font-bold">Loading expenses list...</span>
            </div>
          ) : expenses.length === 0 ? (
            <div className="text-center py-12 text-[#7A8A6A] font-bold text-xs sm:text-sm space-y-1.5">
              <div>No expenses recorded yet.</div>
              <button
                onClick={handleOpenAddModal}
                className="text-xs text-[#84A63C] hover:underline font-extrabold"
              >
                Click here to add your first expense record
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F5F7F0] border-b border-[#DDE5D0] text-[#4A5E38] text-xs sm:text-sm font-extrabold uppercase tracking-wider select-none">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Payment Details</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DDE5D0]/30 text-xs sm:text-sm text-[#1A2E05] font-bold">
                  {expenses.map((exp) => {
                    const modeLower = (exp.paymentMode || '').toLowerCase();
                    return (
                      <tr key={exp.id} className="hover:bg-[#F5F7F0]/30 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap text-[#4A5E38]">
                          {exp.date.split('-').reverse().join('-')}
                        </td>
                        <td className="px-4 py-3 text-[#1A2E05]">{exp.title}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-[#84A63C]">{exp.category}</td>
                        <td className="px-4 py-3 max-w-xs truncate" title={exp.description || 'No description'}>
                          {exp.description || '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] ${
                            modeLower === 'online'
                              ? 'text-blue-600 bg-blue-50 border-blue-100'
                              : 'text-amber-600 bg-amber-50 border-amber-100'
                          }`}>
                            {modeLower === 'online' ? <Globe size={11} /> : <Wallet size={11} />}
                            {exp.paymentMode || 'Cash'}
                            {modeLower === 'online' && exp.paymentBank && ` (${exp.paymentBank})`}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-rose-600 font-black">
                          ₹{Number(exp.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap space-x-1.5">
                          <button
                            onClick={() => handleOpenEditModal(exp)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-all"
                            title="Edit"
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(exp.id)}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-md transition-all"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Slide-over Form Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-white border border-[#DDE5D0] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-3 bg-[#F5F7F0] border-b border-[#DDE5D0] flex justify-between items-center shrink-0">
              <div className="flex items-center gap-1.5 text-[#84A63C]">
                <PlusCircle size={15} />
                <span className="text-[10px] font-black uppercase tracking-wider text-[#1A2E05]">
                  {editingExpense ? 'Edit Expense Record' : 'Log New Expense'}
                </span>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 hover:bg-white/70 text-[#7A8A6A] rounded-full transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-3">
              {errorMsg && (
                <div className="flex items-center gap-1.5 p-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-[9px] font-bold">
                  <AlertCircle size={12} />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Title */}
              <div className="space-y-0.5">
                <label className="text-[9px] font-bold text-[#4A5E38]">Expense Title <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  placeholder="e.g. Laundry Bill, Diesel for Generator"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-[#F5F7F0] border border-[#DDE5D0] rounded-lg text-[10px] font-bold focus:outline-none focus:border-[#84A63C] focus:bg-white text-[#1A2E05]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Category */}
                <div className="space-y-0.5">
                  <label className="text-[9px] font-bold text-[#4A5E38]">Category <span className="text-red-500">*</span></label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-2 py-1.5 bg-[#F5F7F0] border border-[#DDE5D0] rounded-lg text-[10px] font-bold focus:outline-none focus:border-[#84A63C] focus:bg-white text-[#1A2E05] cursor-pointer"
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                {/* Amount */}
                <div className="space-y-0.5">
                  <label className="text-[9px] font-bold text-[#4A5E38]">Amount (Rs) <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full px-2 py-1.5 bg-[#F5F7F0] border border-[#DDE5D0] rounded-lg text-[10px] font-bold focus:outline-none focus:border-[#84A63C] focus:bg-white text-[#1A2E05]"
                    required
                  />
                </div>
              </div>

              {/* Date */}
              <div className="space-y-0.5">
                <label className="text-[9px] font-bold text-[#4A5E38]">Expense Date <span className="text-red-500">*</span></label>
                <div className="relative">
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full pl-2.5 pr-8 py-1.5 bg-[#F5F7F0] border border-[#DDE5D0] rounded-lg text-[10px] font-bold focus:outline-none focus:border-[#84A63C] focus:bg-white text-[#1A2E05] cursor-pointer"
                    required
                  />
                  <Calendar size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7A8A6A]" />
                </div>
              </div>

              {/* Payment Mode */}
              <div className="space-y-0.5">
                <label className="text-[9px] font-bold text-[#4A5E38]">Payment Mode <span className="text-red-500">*</span></label>
                <select
                  value={formData.paymentMode}
                  onChange={(e) => setFormData({ ...formData, paymentMode: e.target.value })}
                  className="w-full px-2 py-1.5 bg-[#F5F7F0] border border-[#DDE5D0] rounded-lg text-[10px] font-bold focus:outline-none focus:border-[#84A63C] focus:bg-white text-[#1A2E05] cursor-pointer"
                >
                  <option value="Cash">Cash</option>
                  <option value="Online">Online</option>
                </select>
              </div>

              {/* Deducted Bank Option (only for Online paymentMode) */}
              {formData.paymentMode === 'Online' && bankOptions.length > 0 && (
                <div className="space-y-0.5 animate-fade-in">
                  <label className="text-[9px] font-bold text-[#4A5E38]">Deducted From Bank/Wallet <span className="text-red-500">*</span></label>
                  <select
                    value={formData.paymentBank}
                    onChange={(e) => setFormData({ ...formData, paymentBank: e.target.value })}
                    className="w-full px-2 py-1.5 bg-[#F5F7F0] border border-[#DDE5D0] rounded-lg text-[10px] font-bold focus:outline-none focus:border-[#84A63C] focus:bg-white text-[#1A2E05] cursor-pointer"
                    required
                  >
                    <option value="">-- Select Bank/Wallet --</option>
                    {bankOptions.map(bank => (
                      <option key={bank} value={bank}>{bank}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Description */}
              <div className="space-y-0.5">
                <label className="text-[9px] font-bold text-[#4A5E38]">Description (Optional)</label>
                <textarea
                  placeholder="Provide additional details..."
                  rows="2"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-[#F5F7F0] border border-[#DDE5D0] rounded-lg text-[10px] font-bold focus:outline-none focus:border-[#84A63C] focus:bg-white text-[#1A2E05] resize-none"
                />
              </div>

              {/* Sticky Footer inside modal container */}
              <div className="pt-3 border-t border-[#DDE5D0] flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-1.5 text-[10px] font-bold text-[#7A8A6A] hover:bg-[#F0F3E8] hover:text-[#1A2E05] transition-all rounded-lg border border-[#DDE5D0]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-1.5 text-[10px] font-bold bg-[#84A63C] text-white rounded-lg hover:opacity-90 shadow-sm transition-all active:scale-[0.98]"
                >
                  {editingExpense ? 'Save Changes' : 'Log Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Expenses;
