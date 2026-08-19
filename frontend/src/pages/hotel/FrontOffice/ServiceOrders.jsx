import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, Trash2, ShoppingBag, Loader2, Calendar, DollarSign, Percent, Info, X, Eye, Download, Edit
} from 'lucide-react';
import api from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { generateExtraChargePdf } from '../../../utils/extraChargePdfGenerator';

const ServiceOrders = () => {
  const { activeHotel } = useAuth();
  const [activeBookings, setActiveBookings] = useState([]);
  const [historyList, setHistoryList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [previewCharge, setPreviewCharge] = useState(null);
  const [editingCharge, setEditingCharge] = useState(null);

  // Form state
  const [roomNo, setRoomNo] = useState('');
  const [guestName, setGuestName] = useState('');
  const [bookingId, setBookingId] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState('');
  const [gstOption, setGstOption] = useState('none'); // 'none', 'inclusive', 'exclusive'
  const [gstRate, setGstRate] = useState(5);
  const [isCustomGst, setIsCustomGst] = useState(false);
  const [customGstVal, setCustomGstVal] = useState('');
  const [notes, setNotes] = useState('');

  // Fetch active bookings (checked-in guests)
  const fetchActiveBookings = async () => {
    try {
      const res = await api.get('/bookings/active?status=Active');
      if (res.data?.success) {
        setActiveBookings(res.data.data || []);
      }
    } catch (err) {
      console.error('Error fetching active guests:', err);
    }
  };

  // Fetch extra charges history
  const fetchHistory = async () => {
    try {
      setLoading(true);
      const res = await api.get('/extra-charges');
      if (res.data?.success) {
        setHistoryList(res.data.data || []);
      }
    } catch (err) {
      console.error('Error fetching history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveBookings();
    fetchHistory();
  }, []);
  // Deduplicate group bookings into single combined options
  const formattedDropdownOptions = [];
  const processedGroupIds = new Set();

  for (const b of activeBookings) {
    if (b.groupBookingId && b.groupBookings && b.groupBookings.length > 1) {
      if (processedGroupIds.has(b.groupBookingId)) continue;
      processedGroupIds.add(b.groupBookingId);

      const allGroupRooms = [...new Set(
        b.groupBookings
          .map(gb => gb.Room?.roomNumber || gb.previousRoomNumber)
          .filter(Boolean)
      )].join(', ');

      formattedDropdownOptions.push({
        id: b.id,
        bookingId: b.id,
        value: `Rooms ${allGroupRooms}`,
        guestName: b.guestName,
        isGroup: true,
        label: `Rooms ${allGroupRooms} - ${b.guestName}`
      });
    } else {
      const roomNum = b.Room?.roomNumber || b.previousRoomNumber || '';
      formattedDropdownOptions.push({
        id: b.id,
        bookingId: b.id,
        value: `Room ${roomNum}`,
        guestName: b.guestName,
        isGroup: false,
        label: `Room ${roomNum} - ${b.guestName}`
      });
    }
  }

  const groupOptions = formattedDropdownOptions.filter(o => o.isGroup);
  const singleOptions = formattedDropdownOptions.filter(o => !o.isGroup);

  const handleRoomSelect = (val) => {
    setRoomNo(val);
    const matched = formattedDropdownOptions.find(o => o.value === val);
    if (matched) {
      setGuestName(matched.guestName || '');
      setBookingId(matched.bookingId);
    } else {
      setGuestName('');
      setBookingId('');
    }
  };

  // Calculations
  const calculatedGstRate = isCustomGst ? Number(customGstVal || 0) : Number(gstRate);
  const subtotal = (parseInt(qty) || 1) * (parseFloat(price) || 0);

  let gstAmount = 0;
  let grandTotal = 0;

  if (gstOption === 'none') {
    gstAmount = 0;
    grandTotal = subtotal;
  } else if (gstOption === 'inclusive') {
    const basePrice = subtotal / (1 + (calculatedGstRate / 100));
    gstAmount = subtotal - basePrice;
    grandTotal = subtotal;
  } else { // 'exclusive'
    gstAmount = subtotal * (calculatedGstRate / 100);
    grandTotal = subtotal + gstAmount;
  }

  const handleCancelEdit = () => {
    setEditingCharge(null);
    setRoomNo('');
    setGuestName('');
    setBookingId('');
    setServiceName('');
    setQty(1);
    setPrice('');
    setGstOption('none');
    setGstRate(5);
    setIsCustomGst(false);
    setCustomGstVal('');
    setNotes('');
  };

  const handleStartEdit = (charge) => {
    setEditingCharge(charge);
    setRoomNo(charge.roomNumber);
    setGuestName(charge.guestName);
    setBookingId(charge.bookingId);
    setServiceName(charge.serviceName);
    setQty(charge.qty);
    setPrice(String(charge.price));
    setGstOption(charge.gstOption);
    setNotes(charge.notes || '');

    const presetRates = [5, 12, 18, 28];
    if (presetRates.includes(Number(charge.gstRate))) {
      setGstRate(Number(charge.gstRate));
      setIsCustomGst(false);
      setCustomGstVal('');
    } else {
      setIsCustomGst(true);
      setCustomGstVal(String(charge.gstRate));
    }
  };

  const handleAddOrder = async (e) => {
    e.preventDefault();
    if (!roomNo) return alert('Please select a room.');
    if (!serviceName.trim()) return alert('Please enter service/item name.');
    if (!price || parseFloat(price) <= 0) return alert('Please enter a valid price.');

    try {
      setIsSaving(true);
      const payload = {
        roomNumber: roomNo,
        guestName,
        bookingId,
        serviceName: serviceName.trim(),
        qty: parseInt(qty) || 1,
        price: parseFloat(price) || 0,
        gstOption,
        gstRate: calculatedGstRate,
        notes: notes.trim()
      };

      let res;
      if (editingCharge) {
        res = await api.put(`/extra-charges/${editingCharge.id}`, payload);
      } else {
        res = await api.post('/extra-charges', payload);
      }

      if (res.data?.success) {
        alert(editingCharge ? 'Service Order updated successfully!' : 'Service Order added successfully!');
        handleCancelEdit();
        fetchHistory();
      }
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || `Failed to ${editingCharge ? 'update' : 'add'} service order.`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this service charge order?')) return;

    try {
      const res = await api.delete(`/extra-charges/${id}`);
      if (res.data?.success) {
        alert('Service charge order deleted successfully.');
        fetchHistory();
      }
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || 'Failed to delete service charge order.');
    }
  };

  // Overall Summary Calculations
  const getChargeFinancials = (charge) => {
    const qtyNum = parseInt(charge.qty) || 1;
    const priceNum = parseFloat(charge.price) || 0;
    const itemSubtotal = qtyNum * priceNum;
    const isInclusive = charge.gstOption === 'inclusive';
    const isExclusive = charge.gstOption === 'exclusive';
    const rateNum = Number(charge.gstRate || 0);

    let baseAmt = itemSubtotal;
    let gstAmt = 0;
    let grandTot = itemSubtotal;

    if (charge.grandTotal !== undefined && charge.grandTotal !== null && Number(charge.grandTotal) > 0) {
      grandTot = Number(charge.grandTotal);
      if (isInclusive && rateNum > 0) {
        baseAmt = grandTot / (1 + rateNum / 100);
        gstAmt = grandTot - baseAmt;
      } else if (isExclusive && rateNum > 0) {
        baseAmt = itemSubtotal;
        gstAmt = grandTot - baseAmt;
      } else {
        baseAmt = grandTot;
        gstAmt = 0;
      }
    } else {
      if (isInclusive && rateNum > 0) {
        baseAmt = itemSubtotal / (1 + rateNum / 100);
        gstAmt = itemSubtotal - baseAmt;
        grandTot = itemSubtotal;
      } else if (isExclusive && rateNum > 0) {
        baseAmt = itemSubtotal;
        gstAmt = itemSubtotal * (rateNum / 100);
        grandTot = itemSubtotal + gstAmt;
      }
    }

    return { baseAmt, gstAmt, grandTot };
  };

  const totalStats = historyList.reduce((acc, charge) => {
    const { baseAmt, gstAmt, grandTot } = getChargeFinancials(charge);
    acc.withoutGst += baseAmt;
    acc.gstAmount += gstAmt;
    acc.withGst += grandTot;
    return acc;
  }, { withoutGst: 0, gstAmount: 0, withGst: 0 });

  return (
    <div className="space-y-4 pb-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1A2E05] tracking-tight">Service Orders & Extras</h1>
        <p className="text-xs font-medium text-[#7A8A6A] mt-0.5">Record outside food, water bottles, laundry, or extra items for active guests</p>
      </div>

      {/* Summary KPI Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
        <div className="bg-white p-3 sm:p-3.5 rounded-xl border border-[#DDE5D0] shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[9px] sm:text-[10px] font-black text-[#7A8A6A] uppercase tracking-wider block">Total (Without GST)</span>
            <span className="text-base sm:text-lg font-black text-[#1A2E05]">₹{totalStats.withoutGst.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div className="w-8 h-8 sm:w-9 sm:h-9 bg-[#84A63C]/10 rounded-lg flex items-center justify-center text-[#84A63C] font-bold text-[11px]">
            Base
          </div>
        </div>

        <div className="bg-white p-3 sm:p-3.5 rounded-xl border border-[#DDE5D0] shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[9px] sm:text-[10px] font-black text-[#7A8A6A] uppercase tracking-wider block">Total GST</span>
            <span className="text-base sm:text-lg font-black text-[#84A63C]">₹{totalStats.gstAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div className="w-8 h-8 sm:w-9 sm:h-9 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-700 font-bold text-[11px]">
            GST
          </div>
        </div>

        <div className="bg-white p-3 sm:p-3.5 rounded-xl border border-[#DDE5D0] shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[9px] sm:text-[10px] font-black text-[#7A8A6A] uppercase tracking-wider block">Total (With GST)</span>
            <span className="text-base sm:text-lg font-black text-emerald-800">₹{totalStats.withGst.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div className="w-8 h-8 sm:w-9 sm:h-9 bg-emerald-100 rounded-lg flex items-center justify-center text-emerald-900 font-bold text-[11px]">
            Total
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[285px_1fr] gap-3.5 lg:gap-4 items-start">
        {/* Left Form Panel */}
        <form
          onSubmit={handleAddOrder}
          className={`p-3 sm:p-3.5 rounded-xl border transition-all duration-300 space-y-2 w-full ${
            editingCharge
              ? 'bg-amber-50/10 border-amber-400 shadow-lg shadow-amber-500/5'
              : 'bg-white border-[#DDE5D0] shadow-2xs'
          }`}
        >
          <div className="flex items-center gap-1.5 border-b border-[#DDE5D0]/60 pb-1 mb-0.5">
            <ShoppingBag size={15} className="text-[#84A63C]" />
            <h2 className="text-xs font-black text-[#1A2E05] uppercase tracking-wider">
              {editingCharge ? 'Edit Service Order' : 'New Service Order'}
            </h2>
          </div>

          {editingCharge && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold px-2 py-1 rounded-md flex items-center gap-1 animate-pulse">
              <Info size={12} className="text-amber-600 shrink-0" />
              <span>Editing order for {String(editingCharge.roomNumber || '').toLowerCase().includes('room') ? editingCharge.roomNumber : `Room ${editingCharge.roomNumber}`}.</span>
            </div>
          )}

          {/* Active Room Dropdown */}
          <div className="space-y-0.5">
            <label className="text-[10px] font-black text-[#4A5E38] uppercase tracking-wider block">Select Active Room</label>
            <select
              value={roomNo}
              onChange={(e) => handleRoomSelect(e.target.value)}
              className="w-full px-2 py-1.5 bg-[#F0F3E8] border border-[#DDE5D0] rounded-md text-xs font-semibold text-[#1A2E05] focus:outline-none focus:bg-white focus:border-[#84A63C] transition-all cursor-pointer"
            >
              <option value="">-- Choose Room --</option>
              {groupOptions.length > 0 && (
                <optgroup label="👥 Group Bookings">
                  {groupOptions.map(opt => (
                    <option key={opt.id} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </optgroup>
              )}
              {singleOptions.length > 0 && (
                <optgroup label="🏨 Single Room Bookings">
                  {singleOptions.map(opt => (
                    <option key={opt.id} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </optgroup>
              )}
              {formattedDropdownOptions.length === 0 && (
                <option value="" disabled>No active stays found</option>
              )}
            </select>
          </div>

          {/* Guest Name Readonly */}
          {guestName && (
            <div className="p-1.5 bg-[#84A63C]/5 border border-[#84A63C]/10 rounded-md space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold text-[#7A8A6A] uppercase tracking-wider">Guest Name</span>
                {roomNo.startsWith('Rooms ') && (
                  <span className="text-[9px] font-extrabold bg-[#84A63C]/20 text-[#1A2E05] px-1.5 py-0.5 rounded-full">
                    👥 Group Booking
                  </span>
                )}
              </div>
              <p className="text-xs font-bold text-[#1A2E05]">{guestName}</p>
            </div>
          )}

          {/* Item Name / Service */}
          <div className="space-y-0.5">
            <label className="text-[10px] font-black text-[#4A5E38] uppercase tracking-wider block">Service / Item Name</label>
            <input
              type="text"
              placeholder="e.g. Water Bottle, Outside Biryani, Laundry"
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              className="w-full px-2 py-1.5 bg-[#F0F3E8] border border-[#DDE5D0] rounded-md text-xs font-semibold text-[#1A2E05] focus:outline-none focus:bg-white focus:border-[#84A63C] transition-all"
            />
          </div>

          {/* Qty & Price */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-0.5">
              <label className="text-[10px] font-black text-[#4A5E38] uppercase tracking-wider block">Quantity</label>
              <input
                type="number"
                min="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-full px-2 py-1.5 bg-[#F0F3E8] border border-[#DDE5D0] rounded-md text-xs font-semibold text-[#1A2E05] focus:outline-none focus:bg-white focus:border-[#84A63C] transition-all"
              />
            </div>
            <div className="space-y-0.5">
              <label className="text-[10px] font-black text-[#4A5E38] uppercase tracking-wider block">Price (Per Unit ₹)</label>
              <input
                type="number"
                step="any"
                placeholder="0.00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full px-2 py-1.5 bg-[#F0F3E8] border border-[#DDE5D0] rounded-md text-xs font-semibold text-[#1A2E05] focus:outline-none focus:bg-white focus:border-[#84A63C] transition-all"
              />
            </div>
          </div>

          {/* GST Calculator Section */}
          <div className="space-y-1 border-t border-[#DDE5D0]/60 pt-1.5">
            <label className="text-[10px] font-black text-[#4A5E38] uppercase tracking-wider block">GST Option</label>
            <div className="flex gap-1">
              {[
                { value: 'none', label: 'No GST' },
                { value: 'inclusive', label: 'Inclusive' },
                { value: 'exclusive', label: 'Exclusive' }
              ].map(opt => {
                const isActive = gstOption === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setGstOption(opt.value)}
                    className={`flex-1 py-1 px-1.5 rounded-md border text-[10px] font-bold transition-all bg-white justify-center flex items-center gap-1 cursor-pointer ${
                      isActive
                        ? 'border-[#84A63C] text-[#5C7A1F] bg-[#84A63C]/5 ring-1 ring-[#84A63C] shadow-2xs'
                        : 'border-[#DDE5D0] text-[#7A8A6A] hover:bg-[#F5F7F0]'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* GST Rate Selector */}
          {gstOption !== 'none' && (
            <div className="space-y-1 animate-fade-in">
              <label className="text-[10px] font-black text-[#4A5E38] uppercase tracking-wider block">GST Rate (%)</label>
              <div className="flex flex-wrap gap-1 items-center">
                {[5, 12, 18, 28].map(rate => {
                  const isSelected = !isCustomGst && gstRate === rate;
                  return (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => {
                        setIsCustomGst(false);
                        setGstRate(rate);
                      }}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all border cursor-pointer ${
                        isSelected
                          ? 'bg-[#84A63C] border-[#84A63C] text-white shadow-2xs'
                          : 'bg-white border-[#DDE5D0] text-[#4A5E38] hover:bg-[#F5F7F0]'
                      }`}
                    >
                      {rate}%
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setIsCustomGst(true)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all border cursor-pointer ${
                    isCustomGst
                      ? 'bg-[#84A63C] border-[#84A63C] text-white shadow-2xs'
                      : 'bg-white border-[#DDE5D0] text-[#4A5E38] hover:bg-[#F5F7F0]'
                  }`}
                >
                  Custom
                </button>
                {isCustomGst && (
                  <div className="flex items-center gap-1 shrink-0 ml-1">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      max="100"
                      value={customGstVal}
                      onChange={(e) => setCustomGstVal(e.target.value)}
                      className="w-9 px-1 py-0.5 bg-white border border-[#DDE5D0] focus:border-[#84A63C] focus:outline-none rounded text-[10px] font-bold text-center"
                      placeholder="%"
                    />
                    <span className="text-[10px] font-bold text-[#4A5E38]">%</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Note / Remarks */}
          <div className="space-y-0.5">
            <label className="text-[10px] font-black text-[#4A5E38] uppercase tracking-wider block">Remarks / Notes</label>
            <textarea
              placeholder="Any details/notes..."
              rows={1}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-2 py-1 bg-[#F0F3E8] border border-[#DDE5D0] rounded-md text-xs font-semibold text-[#1A2E05] focus:outline-none focus:bg-white focus:border-[#84A63C] transition-all resize-none"
            />
          </div>

          {/* Calculator Output */}
          <div className="bg-[#84A63C]/5 border border-[#84A63C]/10 rounded-md p-2 space-y-0.5 text-xs font-bold">
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-[#7A8A6A]">Subtotal (Without GST):</span>
              <span className="text-[#1A2E05]">₹{subtotal.toFixed(2)}</span>
            </div>
            {gstOption !== 'none' && (
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-[#7A8A6A]">GST Amount ({calculatedGstRate}%):</span>
                <span className="text-[#5C7A1F]">₹{gstAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="border-t border-[#DDE5D0] pt-0.5 flex justify-between items-center text-xs">
              <span className="text-[#7A8A6A]">Grand Total (With GST):</span>
              <span className="text-emerald-700 text-xs font-black">₹{grandTotal.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex gap-1.5 pt-0.5">
            {editingCharge && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="w-1/3 py-1.5 bg-[#F0F3E8] border border-[#DDE5D0] text-[#4A5E38] font-bold text-xs rounded-md hover:bg-[#E2E8D5] transition-all cursor-pointer"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={isSaving}
              className={`${editingCharge ? 'w-2/3' : 'w-full'} py-2 bg-[#84A63C] text-white font-black text-xs rounded-md shadow-2xs hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 cursor-pointer`}
            >
              {isSaving ? (
                <Loader2 size={13} className="animate-spin" />
              ) : editingCharge ? (
                <Edit size={13} />
              ) : (
                <Plus size={13} />
              )}
              {editingCharge ? 'Save Changes' : 'Add Service Order'}
            </button>
          </div>
        </form>

        {/* Right History Table Panel */}
        <div className="bg-white p-3 sm:p-3.5 rounded-xl border border-[#DDE5D0] shadow-2xs w-full min-w-0 space-y-2.5">
          <div className="flex justify-between items-center border-b border-[#DDE5D0]/60 pb-1.5">
            <div className="flex items-center gap-1.5">
              <Calendar size={16} className="text-[#84A63C]" />
              <h2 className="text-xs font-black text-[#1A2E05] uppercase tracking-wider">Service Orders History</h2>
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-8 gap-1.5 text-[#7A8A6A]">
              <Loader2 size={20} className="animate-spin text-[#84A63C]" />
              <span className="text-xs font-bold">Loading transaction history...</span>
            </div>
          ) : historyList.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-[#DDE5D0]/70">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#F9FAFA] border-b border-[#DDE5D0] text-[#4A5E38] font-bold text-[10px]">
                    <th className="p-2 sm:px-2.5 sm:py-2">Date</th>
                    <th className="p-2 sm:px-2.5 sm:py-2">Room</th>
                    <th className="p-2 sm:px-2.5 sm:py-2">Guest Name</th>
                    <th className="p-2 sm:px-2.5 sm:py-2">Item / Service</th>
                    <th className="p-2 sm:px-2.5 sm:py-2 text-center">Qty</th>
                    <th className="p-2 sm:px-2.5 sm:py-2 text-right">Base (Without GST)</th>
                    <th className="p-2 sm:px-2.5 sm:py-2 text-center">GST</th>
                    <th className="p-2 sm:px-2.5 sm:py-2 text-right">Total (With GST)</th>
                    <th className="p-2 sm:px-2.5 sm:py-2 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DDE5D0]/40 text-[#1C2B12] font-semibold text-xs">
                  {historyList.map((charge) => {
                    const dateFormatted = new Date(charge.createdAt).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric'
                    });
                    const { baseAmt, gstAmt, grandTot } = getChargeFinancials(charge);
                    const isEditingRow = editingCharge?.id === charge.id;
                    const rawRoomStr = String(charge.roomNumber || '').trim();
                    const roomLabel = (rawRoomStr.toLowerCase().startsWith('room') || rawRoomStr.toLowerCase().startsWith('rooms'))
                      ? rawRoomStr
                      : `Room ${rawRoomStr}`;

                    return (
                      <tr
                        key={charge.id}
                        className={`transition-all duration-300 ${
                          isEditingRow
                            ? 'bg-amber-100/50 hover:bg-amber-100/70 border-l-4 border-l-amber-500'
                            : 'hover:bg-[#F5F7F0]/30 border-l-4 border-l-transparent'
                        }`}
                      >
                        <td className="p-2 sm:px-2.5 sm:py-2 whitespace-nowrap text-[#7A8A6A] font-bold">{dateFormatted}</td>
                        <td className="p-2 sm:px-2.5 sm:py-2 whitespace-nowrap"><span className="bg-[#84A63C]/10 text-[#5C7A1F] px-1.5 py-0.5 rounded-md font-bold text-[10px]">{roomLabel}</span></td>
                        <td className="p-2 sm:px-2.5 sm:py-2 whitespace-nowrap font-black">{charge.guestName}</td>
                        <td className="p-2 sm:px-2.5 sm:py-2 whitespace-nowrap font-bold text-[#1A2E05]">
                          <div>{charge.serviceName}</div>
                          {charge.notes && <div className="text-[9px] text-[#7A8A6A] font-normal italic">Notes: {charge.notes}</div>}
                        </td>
                        <td className="p-2 sm:px-2.5 sm:py-2 text-center">{charge.qty}</td>
                        <td className="p-2 sm:px-2.5 sm:py-2 text-right font-medium">₹{baseAmt.toFixed(2)}</td>
                        <td className="p-2 sm:px-2.5 sm:py-2 text-center uppercase text-[10px] whitespace-nowrap font-bold text-[#84A63C]">
                          {charge.gstOption === 'none' ? 'No GST' : `₹${gstAmt.toFixed(2)} (${charge.gstRate}%)`}
                        </td>
                        <td className="p-2 sm:px-2.5 sm:py-2 text-right font-black text-emerald-700">₹{grandTot.toFixed(2)}</td>
                        <td className="p-2 sm:px-2.5 sm:py-2 text-center flex justify-center items-center gap-1">
                          <button
                            onClick={() => setPreviewCharge(charge)}
                            className="p-1 text-blue-600 hover:bg-blue-50 rounded-md transition-all"
                            title="Preview Bill"
                          >
                            <Eye size={13} />
                          </button>
                          
                          {charge.Booking?.status !== 'Completed' ? (
                            <>
                              <button
                                onClick={() => handleStartEdit(charge)}
                                className="p-1 text-amber-600 hover:bg-amber-50 rounded-md transition-all"
                                title="Edit Service Order"
                              >
                                <Edit size={13} />
                              </button>
                              <button
                                onClick={() => generateExtraChargePdf(charge)}
                                className="p-1 text-[#84A63C] hover:bg-[#84A63C]/10 rounded-md transition-all"
                                title="Download PDF"
                              >
                                <Download size={13} />
                              </button>
                              <button
                                onClick={() => handleDelete(charge.id)}
                                className="p-1 text-red-600 hover:bg-red-50 rounded-md transition-all"
                                title="Delete"
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          ) : (
                            <>
                              <span className="text-[9px] text-[#7A8A6A] bg-[#F0F3E8] px-1.5 py-0.5 rounded-md font-bold border border-[#DDE5D0]">Checked Out</span>
                              <button
                                onClick={() => generateExtraChargePdf(charge)}
                                className="p-1 text-[#84A63C] hover:bg-[#84A63C]/10 rounded-md transition-all"
                                title="Download PDF"
                              >
                                <Download size={13} />
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-[#F5F7F0] border-t border-[#DDE5D0] font-black text-xs text-[#1A2E05]">
                  <tr>
                    <td colSpan={5} className="p-2 sm:px-2.5 sm:py-2 uppercase tracking-wider text-right text-[#4A5E38] text-[10px]">Summary Total:</td>
                    <td className="p-2 sm:px-2.5 sm:py-2 text-right text-[#1A2E05]">₹{totalStats.withoutGst.toFixed(2)}</td>
                    <td className="p-2 sm:px-2.5 sm:py-2 text-center text-[#84A63C]">₹{totalStats.gstAmount.toFixed(2)}</td>
                    <td className="p-2 sm:px-2.5 sm:py-2 text-right text-emerald-800 font-black">₹{totalStats.withGst.toFixed(2)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 border border-dashed border-[#DDE5D0] rounded-2xl text-[#7A8A6A] font-bold text-xs">
              No service orders or extra charges recorded yet.
            </div>
          )}
        </div>
      </div>

      {/* Receipt Preview Modal */}
      <ViewReceiptModal
        isOpen={!!previewCharge}
        onClose={() => setPreviewCharge(null)}
        charge={previewCharge}
      />
    </div>
  );
};

const ViewReceiptModal = ({ isOpen, onClose, charge }) => {
  const [pdfUrl, setPdfUrl] = useState(null);

  useEffect(() => {
    if (isOpen && charge) {
      document.body.style.overflow = 'hidden';
      const renderPreview = async () => {
        try {
          const pdfBlob = await generateExtraChargePdf(charge, 'blob');
          const url = URL.createObjectURL(pdfBlob);
          setPdfUrl(url);
        } catch (err) {
          console.error("Error generating preview PDF:", err);
        }
      };
      renderPreview();
    } else {
      document.body.style.overflow = 'unset';
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
        setPdfUrl(null);
      }
    }
    return () => {
      document.body.style.overflow = 'unset';
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [isOpen, charge]);

  if (!isOpen || !charge) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-sm overflow-hidden animate-fade-in">
      {/* Document View Workspace */}
      <div className="w-full h-[90vh] max-w-5xl bg-white shadow-2xl rounded-2xl overflow-hidden border border-white/10 flex flex-col my-auto">
        <div className="bg-[#1C2B12] px-4 py-3 sm:px-5 sm:py-3.5 flex justify-between items-center border-b border-white/10 shrink-0">
          <span className="text-xs sm:text-sm font-black text-white uppercase tracking-wider">Service Receipt Preview</span>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => generateExtraChargePdf(charge)}
              className="flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 bg-[#84A63C] text-white font-black text-xs rounded-xl shadow-md hover:opacity-90 active:scale-[0.98] transition-all"
            >
              <Download size={14} /> Download Receipt PDF
            </button>
            <button
              onClick={onClose}
              className="p-1.5 bg-white/10 hover:bg-white/20 text-white hover:text-red-400 rounded-xl transition-all"
              title="Close Preview"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        
        <div className="flex-1 bg-gray-100 overflow-hidden">
          {pdfUrl ? (
            <iframe
              src={pdfUrl}
              className="w-full h-full border-0"
              title="Service Receipt PDF"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 text-gray-500 justify-center h-full">
              <Loader2 className="animate-spin text-[#84A63C]" size={40} />
              <p className="text-sm font-bold">Generating PDF Preview...</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ServiceOrders;