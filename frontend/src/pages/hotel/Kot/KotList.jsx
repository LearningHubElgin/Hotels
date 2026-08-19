import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, Printer, Eye, Trash2, Edit2, CheckCircle2, AlertCircle, X, ChevronLeft, ChevronRight, Loader2, DollarSign } from 'lucide-react';
import api from '../../../services/api';

const parseKotItems = (items) => {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  if (typeof items === 'string') {
    try {
      const parsed = JSON.parse(items);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }
  return [];
};

const ViewKotModal = ({ isOpen, onClose, kot, onPrint, onStatusChange, onBillingChange }) => {
  if (!isOpen || !kot) return null;

  const dateStr = kot.createdAt ? new Date(kot.createdAt).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }) : 'N/A';

  const statusColors = {
    'Pending': 'bg-yellow-50 text-yellow-700 border-yellow-200',
    'In Progress': 'bg-blue-50 text-blue-700 border-blue-200',
    'Served': 'bg-green-50 text-green-700 border-green-200',
    'Cancelled': 'bg-red-50 text-red-700 border-red-200'
  };

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-slide-up">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#DDE5D0] flex items-center justify-between bg-[#1C2B22] text-white shrink-0">
          <div>
            <h2 className="text-sm sm:text-base font-bold">KOT Details - {kot.kotNumber}</h2>
            <p className="text-[10px] text-white/70 font-semibold">{dateStr}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-xl text-white/80 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Receipt Body */}
        <div className="p-5 overflow-y-auto no-scrollbar flex-1 space-y-5">
          {/* Header Info */}
          <div className="border border-[#DDE5D0] rounded-xl p-4 bg-[#F8FAF6] grid grid-cols-2 gap-3 text-xs font-bold text-[#4A5E38]">
            <div>
              <span className="text-[9px] text-[#7A8A6A] block uppercase">Guest Name</span>
              <span className="text-[#1A2E05] text-sm uppercase">{kot.guestName}</span>
            </div>
            <div>
              <span className="text-[9px] text-[#7A8A6A] block uppercase">Room Number</span>
              <span className="text-[#1A2E05] text-sm">Room {kot.roomNumber}</span>
            </div>
            <div>
              <span className="text-[9px] text-[#7A8A6A] block uppercase">Settlement mode</span>
              <span className="text-blue-600 uppercase">{kot.paymentMode}</span>
            </div>
            <div>
              <span className="text-[9px] text-[#7A8A6A] block uppercase">Preparation status</span>
              <span className={`inline-block border px-2 py-0.5 rounded-full text-[9px] font-black ${statusColors[kot.status]}`}>
                {kot.status}
              </span>
            </div>
            {kot.notes && (
              <div className="col-span-2 mt-1 pt-2 border-t border-[#DDE5D0]/60">
                <span className="text-[9px] text-[#7A8A6A] block uppercase">Chef Instructions</span>
                <span className="text-[#1A2E05] font-medium italic">"{kot.notes}"</span>
              </div>
            )}
          </div>

          {/* Items Table */}
          <div className="space-y-2">
            <h3 className="text-xs font-black text-[#1A2E05] uppercase tracking-wider">Ordered Dishes</h3>
            <div className="border border-[#DDE5D0] rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs font-bold">
                <thead>
                  <tr className="bg-[#F0F3E8] border-b border-[#DDE5D0] text-[#4A5E38] text-[10px]">
                    <th className="p-3">Dish / Item</th>
                    <th className="p-3 text-center">Qty</th>
                    <th className="p-3 text-right">Price</th>
                    <th className="p-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F3E8] text-[#1A2E05]">
                  {parseKotItems(kot.items).map((item, idx) => (
                    <tr key={idx}>
                      <td className="p-3 font-semibold">{item.name}</td>
                      <td className="p-3 text-center">{item.quantity}</td>
                      <td className="p-3 text-right">₹{item.price}</td>
                      <td className="p-3 text-right">₹{item.quantity * item.price}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pricing breakdown */}
          <div className="border border-[#DDE5D0] rounded-xl p-4 bg-[#F8FAF6] space-y-1.5 text-xs font-bold text-[#4A5E38]">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="text-[#1A2E05]">₹{parseFloat(kot.subtotal).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[10px] text-[#7A8A6A]">
              <span>CGST (2.5%)</span>
              <span>₹{parseFloat(kot.cgst).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[10px] text-[#7A8A6A]">
              <span>SGST (2.5%)</span>
              <span>₹{parseFloat(kot.sgst).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[10px] text-[#7A8A6A]">
              <span>Service Charge (5%)</span>
              <span>₹{parseFloat(kot.serviceCharge || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm font-extrabold text-[#1A2E05] pt-2 border-t border-dashed border-[#DDE5D0]">
              <span>Grand Total</span>
              <span>₹{parseFloat(kot.grandTotal).toFixed(2)}</span>
            </div>
          </div>

          {/* Admin Workflow Controllers */}
          <div className="border border-[#DDE5D0] rounded-xl p-4 space-y-3 bg-[#F8FAF6]">
            <h3 className="text-[10px] font-black text-[#1A2E05] uppercase tracking-wider">Update KOT Statuses</h3>
            <div className="grid grid-cols-2 gap-3.5">
              <div className="space-y-1">
                <span className="text-[9px] font-bold text-[#7A8A6A]">Preparation Status</span>
                <select
                  value={kot.status}
                  onChange={(e) => onStatusChange(kot.id, e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-[#DDE5D0] rounded-lg text-xs font-bold focus:outline-none focus:border-[#84A63C]"
                >
                  <option value="Pending">Pending</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Served">Served</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>

              <div className="space-y-1">
                <span className="text-[9px] font-bold text-[#7A8A6A]">Billing Status</span>
                <select
                  value={kot.billingStatus}
                  onChange={(e) => onBillingChange(kot.id, e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-[#DDE5D0] rounded-lg text-xs font-bold focus:outline-none focus:border-[#84A63C]"
                >
                  <option value="Unbilled">Unbilled</option>
                  <option value="Billed">Billed</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 bg-gray-50 border-t border-[#DDE5D0] flex gap-3 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-xs font-bold text-[#7A8A6A] hover:bg-[#F0F3E8] hover:text-[#1A2E05] border border-[#DDE5D0] rounded-xl transition-all"
          >
            Close
          </button>
          <button
            onClick={() => onPrint(kot)}
            className="flex-1 py-2 bg-[#84A63C] text-white rounded-xl text-xs font-bold hover:bg-[#6C892E] shadow-md flex items-center justify-center gap-1.5 active:scale-95 transition-all"
          >
            <Printer size={14} /> Print Bill
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

const KotList = () => {
  const [kots, setKots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [billingFilter, setBillingFilter] = useState('');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  // Selected KOT for viewing details
  const [selectedKot, setSelectedKot] = useState(null);
  const [isViewOpen, setIsViewOpen] = useState(false);

  useEffect(() => {
    fetchKots();
  }, [currentPage, statusFilter, billingFilter]);

  // Reset page when search/filters change
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchKots();
  };

  const fetchKots = async () => {
    try {
      setLoading(true);
      const res = await api.get('/kots', {
        params: {
          page: currentPage,
          limit: 10,
          search: searchQuery,
          status: statusFilter,
          billingStatus: billingFilter
        }
      });
      if (res.data?.success) {
        setKots(res.data.data || []);
        setTotalPages(res.data.totalPages || 1);
        setTotalRecords(res.data.totalRecords || 0);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (id, status) => {
    try {
      const res = await api.put(`/kots/${id}/status`, { status });
      if (res.data?.success) {
        // Update local state
        setKots(prev => prev.map(k => k.id === id ? { ...k, status } : k));
        if (selectedKot && selectedKot.id === id) {
          setSelectedKot(prev => ({ ...prev, status }));
        }
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update preparation status');
    }
  };

  const handleBillingChange = async (id, billingStatus) => {
    try {
      const res = await api.put(`/kots/${id}/billing`, { billingStatus });
      if (res.data?.success) {
        // Update local state
        setKots(prev => prev.map(k => k.id === id ? { ...k, billingStatus } : k));
        if (selectedKot && selectedKot.id === id) {
          setSelectedKot(prev => ({ ...prev, billingStatus }));
        }
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update billing status');
    }
  };

  const handleDeleteKot = async (id) => {
    if (!window.confirm('Are you sure you want to delete this KOT?')) return;
    try {
      const res = await api.delete(`/kots/${id}`);
      if (res.data?.success) {
        setKots(prev => prev.filter(k => k.id !== id));
        alert('KOT deleted successfully');
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete KOT');
    }
  };

  // Beautiful receipt printing layout
  const handlePrintKot = (kot) => {
    const activeHotel = JSON.parse(localStorage.getItem('activeHotel') || '{}');
    const hotelName = (activeHotel.name || 'Hotel').toUpperCase();
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) return;

    const dateStr = new Date(kot.createdAt).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });

    const itemsRows = parseKotItems(kot.items).map(item => `
      <tr>
        <td style="padding: 5px 0;">${item.name}</td>
        <td style="padding: 5px 0; text-align: center;">${item.quantity}</td>
        <td style="padding: 5px 0; text-align: right;">₹${item.price}</td>
        <td style="padding: 5px 0; text-align: right;">₹${item.quantity * item.price}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Print KOT - ${kot.kotNumber}</title>
          <style>
            body {
              font-family: 'Courier New', Courier, monospace;
              color: #000;
              padding: 20px;
              font-size: 12px;
              line-height: 1.4;
            }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .header { margin-bottom: 15px; border-bottom: 1px dashed #000; padding-bottom: 10px; }
            .title { font-size: 14px; font-weight: bold; margin: 0 0 5px 0; }
            .details { margin-bottom: 15px; }
            .details p { margin: 3px 0; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 15px; border-bottom: 1px dashed #000; }
            th { border-bottom: 1px dashed #000; padding: 5px 0; }
            .totals { margin-bottom: 15px; }
            .totals p { margin: 3px 0; display: flex; justify-content: space-between; }
            .notes { border: 1px solid #000; padding: 6px; margin-top: 10px; font-style: italic; }
            @media print {
              body { padding: 0; }
              @page { size: 80mm auto; margin: 0; }
            }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="text-center header">
            <h1 class="title">${hotelName}</h1>
            <p style="margin: 0; font-size: 10px;">Restaurant & Kitchen Order Ticket</p>
          </div>
          <div class="details">
            <p><strong>KOT NO  :</strong> ${kot.kotNumber}</p>
            <p><strong>DATE    :</strong> ${dateStr}</p>
            <p><strong>ROOM NO  :</strong> Room ${kot.roomNumber}</p>
            <p><strong>GUEST    :</strong> ${kot.guestName.toUpperCase()}</p>
            <p><strong>PAY TYPE :</strong> ${kot.paymentMode.toUpperCase()}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th style="text-align: left;">Item</th>
                <th>Qty</th>
                <th class="text-right">Price</th>
                <th class="text-right">Amt</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
          </table>
          <div class="totals">
            <p><span>Subtotal:</span> <span>₹${parseFloat(kot.subtotal).toFixed(2)}</span></p>
            <p><span>CGST (2.5%):</span> <span>₹${parseFloat(kot.cgst).toFixed(2)}</span></p>
            <p><span>SGST (2.5%):</span> <span>₹${parseFloat(kot.sgst).toFixed(2)}</span></p>
            <p><span>Service Charge (5%):</span> <span>₹${parseFloat(kot.serviceCharge || 0).toFixed(2)}</span></p>
            <p style="font-weight: bold; border-top: 1px dashed #000; padding-top: 5px;">
              <span>Grand Total:</span> <span>₹${parseFloat(kot.grandTotal).toFixed(2)}</span>
            </p>
          </div>
          ${kot.notes ? `<div class="notes">Instructions: "${kot.notes}"</div>` : ''}
          <div class="text-center" style="margin-top: 25px; border-top: 1px dashed #000; padding-top: 10px; font-size: 10px;">
            Thank You! Kitchen Copy
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const statusBadges = {
    'Pending': 'bg-yellow-100 text-yellow-800 border-yellow-200/50',
    'In Progress': 'bg-blue-100 text-blue-800 border-blue-200/50',
    'Served': 'bg-green-100 text-green-800 border-green-200/50',
    'Cancelled': 'bg-red-100 text-red-800 border-red-200/50'
  };

  const billingBadges = {
    'Unbilled': 'bg-orange-100 text-orange-800 border-orange-200/50',
    'Billed': 'bg-green-100 text-green-800 border-green-200/50'
  };

  return (
    <div className="space-y-4 pb-12 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-[#1A2E05] tracking-tight">KOT Bills & History</h1>
        <p className="text-xs font-medium text-[#7A8A6A] mt-0.5">Manage generated kitchen tickets, payments, and settlements</p>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-5 rounded-3xl border border-[#DDE5D0] shadow-sm">
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-[#4A5E38] uppercase">Search KOT</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A8A6A]" />
              <input
                type="text"
                placeholder="Search KOT No, Room, Guest..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-[#F0F3E8] border border-[#DDE5D0] rounded-xl text-xs font-bold focus:outline-none focus:bg-white focus:border-[#84A63C]"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-[#4A5E38] uppercase">Prep Status</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2.5 bg-[#F0F3E8] border border-[#DDE5D0] rounded-xl text-xs font-bold focus:outline-none focus:bg-white"
            >
              <option value="">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="In Progress">In Progress</option>
              <option value="Served">Served</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-[#4A5E38] uppercase">Billing Status</label>
            <select
              value={billingFilter}
              onChange={(e) => {
                setBillingFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2.5 bg-[#F0F3E8] border border-[#DDE5D0] rounded-xl text-xs font-bold focus:outline-none focus:bg-white"
            >
              <option value="">All Billing Statuses</option>
              <option value="Unbilled">Unbilled</option>
              <option value="Billed">Billed</option>
            </select>
          </div>

          <div>
            <button
              type="submit"
              className="w-full py-2.5 bg-[#1C2B22] text-white hover:bg-[#2A3E31] rounded-xl text-xs font-bold transition-all shadow-md"
            >
              Apply Filters
            </button>
          </div>
        </form>
      </div>

      {/* Desktop List Table */}
      <div className="bg-white rounded-3xl border border-[#DDE5D0] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-bold min-w-[900px]">
            <thead>
              <tr className="bg-[#F0F3E8] border-b border-[#DDE5D0] text-[#4A5E38] text-[10px] uppercase">
                <th className="p-4">KOT Number</th>
                <th className="p-4">Room No.</th>
                <th className="p-4">Guest Name</th>
                <th className="p-4">Date & Time</th>
                <th className="p-4">Items Count</th>
                <th className="p-4 text-right">Grand Total</th>
                <th className="p-4">Payment</th>
                <th className="p-4">Prep Status</th>
                <th className="p-4">Billing</th>
                <th className="p-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F3E8] text-[#1A2E05]">
              {loading ? (
                <tr>
                  <td colSpan="10" className="py-12 text-center">
                    <Loader2 size={28} className="animate-spin text-[#84A63C] mx-auto" />
                  </td>
                </tr>
              ) : kots.length === 0 ? (
                <tr>
                  <td colSpan="10" className="py-12 text-center text-[#7A8A6A]">
                    No kitchen tickets found matching filters.
                  </td>
                </tr>
              ) : (
                kots.map(kot => {
                  const date = new Date(kot.createdAt).toLocaleString('en-IN', {
                    dateStyle: 'short',
                    timeStyle: 'short'
                  });
                  const parsedItems = parseKotItems(kot.items);
                  const itemsCount = parsedItems.reduce((sum, i) => sum + i.quantity, 0);

                  return (
                    <tr key={kot.id} className="hover:bg-[#F8FAF6] transition-colors">
                      <td className="p-4 font-bold text-[#84A63C]">{kot.kotNumber}</td>
                      <td className="p-4 font-extrabold text-sm">Room {kot.roomNumber}</td>
                      <td className="p-4 uppercase truncate max-w-[120px]">{kot.guestName}</td>
                      <td className="p-4 text-[#7A8A6A] font-medium">{date}</td>
                      <td className="p-4 text-center">{itemsCount}</td>
                      <td className="p-4 text-right text-sm font-extrabold">₹{parseFloat(kot.grandTotal).toLocaleString()}</td>
                      <td className="p-4 uppercase text-[10px] text-blue-600">{kot.paymentMode}</td>
                      <td className="p-4">
                        <span className={`inline-block border px-2 py-0.5 rounded-full text-[9px] font-black ${statusBadges[kot.status]}`}>
                          {kot.status}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`inline-block border px-2 py-0.5 rounded-full text-[9px] font-black ${billingBadges[kot.billingStatus]}`}>
                          {kot.billingStatus}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => {
                              setSelectedKot(kot);
                              setIsViewOpen(true);
                            }}
                            className="p-1.5 bg-[#F0F3E8] hover:bg-[#E2E8D5] text-[#4A5E38] rounded-lg transition-colors"
                            title="View / Edit details"
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            onClick={() => handlePrintKot(kot)}
                            className="p-1.5 bg-[#F0F3E8] hover:bg-[#E2E8D5] text-[#4A5E38] rounded-lg transition-colors"
                            title="Print KOT Copy"
                          >
                            <Printer size={14} />
                          </button>
                          {kot.billingStatus === 'Unbilled' && (
                            <button
                              onClick={() => handleDeleteKot(kot.id)}
                              className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors"
                              title="Delete KOT"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-4 bg-white border-t border-[#DDE5D0] flex items-center justify-between">
            <span className="text-xs font-bold text-[#7A8A6A]">
              Showing page {currentPage} of {totalPages} ({totalRecords} records)
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                className="p-1.5 border border-[#DDE5D0] hover:bg-[#F0F3E8] rounded-lg disabled:opacity-40 transition-all text-[#4A5E38]"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                className="p-1.5 border border-[#DDE5D0] hover:bg-[#F0F3E8] rounded-lg disabled:opacity-40 transition-all text-[#4A5E38]"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Details View Modal */}
      <ViewKotModal
        isOpen={isViewOpen}
        onClose={() => {
          setIsViewOpen(false);
          setSelectedKot(null);
        }}
        kot={selectedKot}
        onPrint={handlePrintKot}
        onStatusChange={handleStatusChange}
        onBillingChange={handleBillingChange}
      />
    </div>
  );
};

export default KotList;
