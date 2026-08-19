import React, { useState, useEffect } from 'react';
import { 
  Search, Plus, Minus, X, Utensils, Trash2, ShoppingCart, CheckCircle2, ChevronRight, Printer, RefreshCw, FileText, Receipt
} from 'lucide-react';
import api from '../../../services/api';

const initialCategories = [
  "Starters",
  "Main Course",
  "Rice & Breads",
  "Beverages",
  "Desserts"
];

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

const GenerateKot = () => {
  const [categories, setCategories] = useState(initialCategories);
  const [menuItems, setMenuItems] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("Starters");
  const [cart, setCart] = useState([]);
  const [orderType, setOrderType] = useState("Room No");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Add Dish State
  const [isAddDishModalOpen, setIsAddDishModalOpen] = useState(false);
  const [showCartMobile, setShowCartMobile] = useState(false);
  const [newDish, setNewDish] = useState({
    name: '', category: 'Starters', price: ''
  });

  // KOT Billing History State
  const [viewHistory, setViewHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  
  // Active bookings list
  const [activeBookings, setActiveBookings] = useState([]);

  const fetchActiveGuests = async () => {
    try {
      const res = await api.get('/bookings/active?status=Active');
      if (res.data?.success) {
        setActiveBookings(res.data.data || []);
      }
    } catch (err) {
      console.error('Error fetching active bookings:', err);
    }
  };

  const fetchHistory = async () => {
    setIsHistoryLoading(true);
    try {
      const res = await api.get('/kots');
      if (res.data?.success) {
        setHistory(res.data.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch order history", err);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  useEffect(() => {
    fetchMenuItems();
    fetchHistory();
    fetchActiveGuests();
  }, []);

  const fetchMenuItems = async () => {
    try {
      const res = await api.get('/food-items');
      if (res.data?.success) {
        const fetchedItems = (res.data.data || []).map(i => ({
          ...i,
          price: parseFloat(i.price) || 0
        }));
        setMenuItems(fetchedItems);
        const uniqueCats = Array.from(new Set(fetchedItems.map(i => i.category))).filter(Boolean);
        if (uniqueCats.length > 0) {
          setCategories(uniqueCats);
          if (!uniqueCats.includes(selectedCategory)) {
            setSelectedCategory(uniqueCats[0]);
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch menu items", err);
    }
  };

  const handleAddDish = async () => {
    if (!newDish.name || !newDish.price) {
      return alert("Please provide a name and price for the dish.");
    }
    
    try {
      const payload = {
        name: newDish.name,
        price: parseFloat(newDish.price) || 0,
        category: newDish.category
      };
      const res = await api.post('/food-items', payload);
      
      if (res.data?.success) {
        setMenuItems([...menuItems, res.data.data]);
        if (!categories.includes(res.data.data.category)) {
          setCategories([...categories, res.data.data.category]);
        }
        setIsAddDishModalOpen(false);
        setNewDish({ name: '', category: categories[0] || 'Starters', price: '' });
      }
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Failed to add dish.");
    }
  };

  const handleDeleteDish = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this dish?")) return;

    try {
      const res = await api.delete(`/food-items/${id}`);
      if (res.data?.success) {
        setMenuItems(prev => prev.filter(item => item.id !== id));
      }
    } catch (err) {
      console.error(err);
      alert("Failed to delete dish.");
    }
  };
  
  // Customer details
  const [customerInfo, setCustomerInfo] = useState({
    mobile: '', name: '', address: '', locality: '', roomNo: ''
  });
  
  const [paymentMode, setPaymentMode] = useState("Due");
  const [isComplimentary, setIsComplimentary] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleRoomNoChange = (val) => {
    setCustomerInfo(prev => {
      const nextInfo = { ...prev, roomNo: val };
      const matched = activeBookings.find(b => String(b.Room?.roomNumber) === String(val));
      if (matched) {
        nextInfo.name = matched.guestName || '';
        nextInfo.mobile = matched.customerMobile || '';
      } else {
        nextInfo.name = '';
        nextInfo.mobile = '';
      }
      return nextInfo;
    });
  };

  const filteredItems = menuItems.filter(item => 
    item.category === selectedCategory && 
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleItemClick = (item) => {
    addToCart(item);
  };

  const addToCart = (item) => {
    setCart(prev => {
      const existing = prev.find(cartItem => cartItem.id === item.id);
      if (existing) {
        return prev.map(cartItem => 
          cartItem.id === existing.id 
            ? { ...cartItem, qty: cartItem.qty + 1 }
            : cartItem
        );
      }
      return [...prev, { ...item, qty: 1 }];
    });
  };

  const updateQty = (itemId, delta) => {
    setCart(prev => prev.map(item => {
      if (item.id === itemId) {
        const newQty = item.qty + delta;
        return newQty > 0 ? { ...item, qty: newQty } : null;
      }
      return item;
    }).filter(Boolean));
  };

  const removeItem = (itemId) => {
    setCart(prev => prev.filter(item => item.id !== itemId));
  };

  const printKotTicket = (kot) => {
    const activeHotel = JSON.parse(localStorage.getItem('activeHotel') || '{}');
    const hotelName = activeHotel.name || 'Hotel';
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) return;

    const dateStr = new Date(kot.createdAt).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });

    const parsedItems = parseKotItems(kot.items);
    const itemsRows = parsedItems.map(item => `
      <tr>
        <td style="padding: 5px 0;">${item.name}</td>
        <td style="padding: 5px 0; text-align: center;">${item.quantity || item.qty}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>KOT Ticket - ${kot.kotNumber}</title>
          <style>
            body {
              font-family: 'Courier New', Courier, monospace;
              color: #000;
              padding: 20px;
              font-size: 12px;
              line-height: 1.4;
            }
            .text-center { text-align: center; }
            .header { margin-bottom: 15px; border-bottom: 1px dashed #000; padding-bottom: 10px; }
            .title { font-size: 14px; font-weight: bold; margin: 0 0 5px 0; }
            .details { margin-bottom: 15px; }
            .details p { margin: 3px 0; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 15px; border-bottom: 1px dashed #000; }
            th { border-bottom: 1px dashed #000; padding: 5px 0; }
            @media print {
              body { padding: 0; }
              @page { size: 80mm auto; margin: 0; }
            }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="text-center header">
            <h1 class="title">KITCHEN ORDER TICKET</h1>
            <p style="margin: 0; font-size: 10px;">${hotelName}</p>
          </div>
          <div class="details">
            <p><strong>KOT NO  :</strong> ${kot.kotNumber}</p>
            <p><strong>DATE    :</strong> ${dateStr}</p>
            <p><strong>ROOM NO  :</strong> Room ${kot.roomNumber}</p>
            <p><strong>GUEST    :</strong> ${kot.guestName.toUpperCase()}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th style="text-align: left;">Item</th>
                <th style="text-align: center;">Qty</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
          </table>
          ${kot.notes ? `<div style="border: 1px solid #000; padding: 5px; margin-top: 10px; font-style: italic;">Notes: "${kot.notes}"</div>` : ''}
          <div class="text-center" style="margin-top: 25px; border-top: 1px dashed #000; padding-top: 10px; font-size: 10px;">
            KITCHEN COPY
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const printKotBill = (kot) => {
    const activeHotel = JSON.parse(localStorage.getItem('activeHotel') || '{}');
    const hotelName = (activeHotel.name || 'Hotel').toUpperCase();
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) return;

    const dateStr = new Date(kot.createdAt).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });

    const parsedItems = parseKotItems(kot.items);
    const itemsRows = parsedItems.map(item => `
      <tr>
        <td style="padding: 5px 0;">${item.name}</td>
        <td style="padding: 5px 0; text-align: center;">${item.quantity || item.qty}</td>
        <td style="padding: 5px 0; text-align: right;">₹${parseFloat(item.price).toFixed(2)}</td>
        <td style="padding: 5px 0; text-align: right;">₹${((item.quantity || item.qty) * item.price).toFixed(2)}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Guest Receipt - ${kot.kotNumber}</title>
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
            @media print {
              body { padding: 0; }
              @page { size: 80mm auto; margin: 0; }
            }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="text-center header">
            <h1 class="title">${hotelName}</h1>
            <p style="margin: 0; font-size: 10px;">Restaurant Receipt</p>
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
                <th style="text-align: center;">Qty</th>
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
          <div class="text-center" style="margin-top: 25px; border-top: 1px dashed #000; padding-top: 10px; font-size: 10px;">
            Thank You for Dining with Us!
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleSaveOrder = async (printType) => {
    if (cart.length === 0) return alert("Please add items to the order.");
    
    if (orderType === "Room No" && !customerInfo.roomNo) {
      return alert("Please enter a Room Number.");
    }
    
    setIsSaving(true);

    const matchedBooking = activeBookings.find(b => String(b.Room?.roomNumber) === String(customerInfo.roomNo));
    
    const orderData = {
      roomNumber: String(customerInfo.roomNo || 'Walkin'),
      guestName: customerInfo.name || 'Walk-in Guest',
      bookingId: matchedBooking ? matchedBooking.id : null,
      items: cart.map(item => ({
        name: item.name,
        price: item.price,
        quantity: item.qty
      })),
      notes: isComplimentary ? 'Complimentary Order' : '',
      paymentMode: isComplimentary 
        ? 'Room Charge' 
        : (paymentMode === 'Due' ? 'Room Charge' : paymentMode)
    };

    try {
      const response = await api.post('/kots', orderData);
      if (response.data?.success) {
        const savedKot = response.data.data;
        
        // Trigger print based on printType
        if (printType.includes('Print')) {
          if (printType.includes('KOT')) {
            printKotTicket(savedKot);
          } else {
            printKotBill(savedKot);
          }
        }
        
        alert(`Order successful!`);
        setCart([]);
        setCustomerInfo({ mobile: '', name: '', address: '', locality: '', roomNo: '' });
        setIsComplimentary(false);
        fetchHistory();
        fetchActiveGuests();
      }
    } catch (error) {
      console.error(error);
      alert(error.response?.data?.message || "Failed to save order.");
    } finally {
      setIsSaving(false);
    }
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const cgst = subtotal * 0.025;
  const sgst = subtotal * 0.025;
  const serviceCharge = subtotal * 0.05;
  const grandTotal = subtotal + cgst + sgst + serviceCharge;

  const filteredHistory = history.filter(item => {
    const q = historySearch.toLowerCase();
    const roomMatch = item.roomNumber && item.roomNumber.toLowerCase().includes(q);
    const nameMatch = item.guestName && item.guestName.toLowerCase().includes(q);
    const idMatch = item.kotNumber && item.kotNumber.toLowerCase().includes(q);
    return roomMatch || nameMatch || idMatch;
  });

  return (
    <div className="flex flex-col h-[calc(100vh-72px)] lg:h-[calc(100vh-140px)] font-sans overflow-hidden">
      
      {/* Top Header */}
      <div className="flex items-center justify-between gap-3 mb-3 lg:mb-6 shrink-0 px-1">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-[#1A2E05] tracking-tight">KOT Management</h1>
          <p className="text-xs font-medium text-[#7A8A6A] mt-0.5 hidden sm:block">Kitchen Order Tickets &amp; Point of Sale</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Tab Selector */}
          <div className="bg-[#F0F3E8] p-1 rounded-xl flex gap-1 mr-2 border border-[#DDE5D0]">
            <button 
              onClick={() => setViewHistory(false)}
              className={`px-3 lg:px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                !viewHistory 
                  ? 'bg-[#84A63C] text-white shadow-sm' 
                  : 'text-[#7A8A6A] hover:text-[#1A2E05]'
              }`}
            >
              POS Menu
            </button>
            <button 
              onClick={() => { setViewHistory(true); fetchHistory(); }}
              className={`px-3 lg:px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewHistory 
                  ? 'bg-[#84A63C] text-white shadow-sm' 
                  : 'text-[#7A8A6A] hover:text-[#1A2E05]'
              }`}
            >
              Billing History
            </button>
          </div>

          {/* Mobile cart button */}
          {!viewHistory && (
            <button
              className="lg:hidden flex items-center gap-1.5 bg-white border border-[#DDE5D0] text-[#84A63C] px-3 py-2 rounded-xl text-xs font-bold shadow-sm"
              onClick={() => setShowCartMobile(true)}
            >
              <ShoppingCart size={16} />
              Cart {cart.length > 0 && <span className="bg-[#84A63C] text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]">{cart.length}</span>}
            </button>
          )}
          {!viewHistory && (
            <button onClick={() => setIsAddDishModalOpen(true)} className="bg-[#84A63C] text-white hover:bg-[#6e8a32] px-3 lg:px-4 py-2 lg:py-2.5 rounded-xl text-xs lg:text-sm font-bold shadow-md flex items-center gap-1.5 transition-all active:scale-95">
              <Plus size={15} strokeWidth={2.5} /> Add Dish
            </button>
          )}
        </div>
      </div>

      {/* ── MOBILE CATEGORY TABS (horizontal scroll, hidden on lg+) ── */}
      {!viewHistory && (
        <div className="lg:hidden shrink-0 mb-2 overflow-x-auto no-scrollbar">
          <div className="flex gap-2 px-1 pb-1" style={{ width: 'max-content' }}>
            {categories.map((cat, idx) => (
              <button
                key={idx}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 ${
                  selectedCategory === cat
                    ? 'bg-[#84A63C] text-white shadow-sm'
                    : 'bg-white border border-[#DDE5D0] text-[#7A8A6A]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── MAIN CONTENT ROW ── */}
      <div className="flex flex-row gap-5 flex-1 min-h-0">
        
        {viewHistory ? (
          <div className="flex-1 bg-white border border-[#DDE5D0] rounded-2xl shadow-sm flex flex-col min-w-0 overflow-hidden">
            {/* History Header / Search bar */}
            <div className="p-3 lg:p-4 border-b border-[#DDE5D0] flex gap-3 items-center bg-[#F0F3E8]/50">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A8A6A]" />
                <input 
                  type="text" 
                  placeholder="Search by room, guest name or KOT number..." 
                  value={historySearch}
                  onChange={e => setHistorySearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-white border border-[#DDE5D0] rounded-xl text-sm font-bold focus:outline-none focus:border-[#84A63C] transition-all shadow-sm"
                />
              </div>
              <button 
                onClick={fetchHistory}
                disabled={isHistoryLoading}
                className="p-2 bg-white border border-[#DDE5D0] text-[#7A8A6A] hover:text-[#84A63C] rounded-xl shadow-sm transition-all flex items-center justify-center"
                title="Refresh History"
              >
                <RefreshCw size={15} className={isHistoryLoading ? 'animate-spin' : ''} />
              </button>
              <div className="px-3 py-2 bg-white border border-[#DDE5D0] rounded-xl text-xs font-bold text-[#1A2E05] shadow-sm shrink-0">
                {filteredHistory.length} Bills
              </div>
            </div>

            {/* History List / Table */}
            <div className="flex-1 overflow-auto p-4 custom-scrollbar">
              {isHistoryLoading && history.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-[#7A8A6A] py-20">
                  <RefreshCw size={24} className="animate-spin mb-3 text-[#84A63C]" />
                  <p className="text-sm font-bold uppercase tracking-widest">Loading history...</p>
                </div>
              ) : filteredHistory.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-[#7A8A6A] py-20">
                  <FileText size={40} className="mb-3 opacity-20 text-[#84A63C]" />
                  <p className="text-sm font-bold uppercase tracking-widest">No billing history found</p>
                </div>
              ) : (
                <div className="overflow-x-auto min-w-full">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#DDE5D0] text-[10px] font-black text-[#7A8A6A] uppercase tracking-widest bg-[#F0F3E8]/30">
                        <th className="py-3 px-4">Date & Time</th>
                        <th className="py-3 px-4">Room / Type</th>
                        <th className="py-3 px-4">Guest Details</th>
                        <th className="py-3 px-4">Items Ordered</th>
                        <th className="py-3 px-4 text-right">Total Amount</th>
                        <th className="py-3 px-4 text-center">Payment</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#DDE5D0]">
                      {filteredHistory.map((item) => (
                        <tr key={item.id} className="hover:bg-[#F0F3E8]/20 transition-all text-xs font-bold text-[#1A2E05]">
                          <td className="py-3 px-4 text-[#7A8A6A] whitespace-nowrap">
                            {formatDateTime(item.createdAt)}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className={`inline-block px-2.5 py-1 rounded-lg text-[10px] font-black uppercase ${
                              item.roomNumber && item.roomNumber !== 'Walkin'
                                ? 'bg-[#F0F3E8] text-[#84A63C]' 
                                : 'bg-[#E8ECE0] text-[#7A8A6A]'
                            }`}>
                              {item.roomNumber && item.roomNumber !== 'Walkin' ? `Room ${item.roomNumber}` : 'Walk-in'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-bold">{item.guestName || 'Walk-in'}</div>
                          </td>
                          <td className="py-3 px-4 max-w-[280px]">
                            <div className="truncate text-[#212529] font-medium" title={parseKotItems(item.items).map(i => `${i.name} x${i.quantity || i.qty}`).join(', ')}>
                              {parseKotItems(item.items).map(i => `${i.name} x${i.quantity || i.qty}`).join(', ')}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-black text-[#2E7D32] whitespace-nowrap">
                            ₹{parseFloat(item.grandTotal || 0).toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <span className="text-[10px] font-extrabold uppercase tracking-wide bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                              {item.paymentMode}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                              item.status === 'Served' 
                                ? 'bg-green-100 text-green-700' 
                                : item.status === 'Cancelled' 
                                  ? 'bg-red-100 text-red-700' 
                                  : 'bg-yellow-100 text-yellow-700'
                            }`}>
                              {item.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              <button 
                                onClick={() => printKotBill(item)}
                                className="p-1.5 bg-[#84A63C] text-white hover:bg-[#6e8a32] rounded-lg transition-colors shadow-sm flex items-center justify-center gap-1 text-[10px]"
                                title="Print Invoice"
                              >
                                <Receipt size={12} />
                                Invoice
                              </button>
                              <button 
                                onClick={() => printKotTicket(item)}
                                className="p-1.5 bg-[#1C2B22] text-white hover:bg-[#15250D] rounded-lg transition-colors shadow-sm flex items-center justify-center gap-1 text-[10px]"
                                title="Print KOT Slip"
                              >
                                <Printer size={12} />
                                KOT
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Left Column - Categories (desktop only) */}
            <div className="hidden lg:flex w-[240px] bg-white border border-[#DDE5D0] rounded-2xl shadow-sm flex-col shrink-0 overflow-hidden">
              <div className="p-4 border-b border-[#DDE5D0] bg-[#F0F3E8]/50">
                <h2 className="text-[11px] font-black text-[#7A8A6A] uppercase tracking-widest">Menu Categories</h2>
              </div>
              <div className="flex-1 overflow-y-auto no-scrollbar p-3 flex flex-col gap-1">
                {categories.map((cat, idx) => (
                  <div 
                    key={idx}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-4 py-3 rounded-xl text-[13px] font-bold cursor-pointer transition-all flex items-center justify-between group ${
                      selectedCategory === cat 
                        ? 'bg-[#F0F3E8] text-[#84A63C]' 
                        : 'text-[#7A8A6A] hover:bg-gray-50 hover:text-[#1A2E05]'
                    }`}
                  >
                    <span className="truncate pr-2">{cat}</span>
                    <ChevronRight size={14} className={`shrink-0 transition-transform ${selectedCategory === cat ? 'translate-x-1' : 'opacity-0 group-hover:opacity-50'}`} />
                  </div>
                ))}
              </div>
            </div>

            {/* Middle Column - Menu Items (always visible) */}
            <div className="flex-1 bg-white border border-[#DDE5D0] rounded-2xl shadow-sm flex flex-col min-w-0 overflow-hidden">
              <div className="p-3 lg:p-4 border-b border-[#DDE5D0] flex gap-2 items-center bg-[#F0F3E8]/50">
                <div className="relative flex-1">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A8A6A]" />
                  <input 
                    type="text" 
                    placeholder="Search menu items..." 
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-white border border-[#DDE5D0] rounded-xl text-sm font-bold focus:outline-none focus:border-[#84A63C] transition-all shadow-sm"
                  />
                </div>
                <div className="px-3 py-2 bg-white border border-[#DDE5D0] rounded-xl text-xs font-bold text-[#1A2E05] shadow-sm shrink-0">
                  {filteredItems.length} Items
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-3 lg:p-4 custom-scrollbar">
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2 lg:gap-3">
                  {filteredItems.map(item => {
                    const cartItem = cart.find(c => c.id === item.id);
                    return (
                      <div 
                        key={item.id} 
                        onClick={() => handleItemClick(item)}
                        className={`bg-white border rounded-xl p-3 lg:p-4 flex flex-col justify-between min-h-[90px] cursor-pointer hover:shadow-md transition-all group relative overflow-hidden active:scale-95 ${
                          cartItem ? 'border-[#84A63C] bg-[#84A63C]/5' : 'border-[#DDE5D0]'
                        }`}
                      >
                        <div className="absolute top-0 right-0 w-12 h-12 bg-gradient-to-br from-[#F0F3E8] to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-bl-full pointer-events-none"></div>
                        
                        <div className="flex justify-between items-start gap-1 relative z-10">
                          <h3 className="text-[12px] lg:text-[13px] font-bold text-[#1A2E05] leading-tight line-clamp-2">
                            {item.name}
                          </h3>
                          <button 
                            onClick={(e) => handleDeleteDish(e, item.id)}
                            className="text-[#DDE5D0] hover:text-red-500 hover:bg-red-50 p-1 rounded-lg transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                            title="Delete Dish"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                        
                        <div className="mt-2 flex items-center justify-between relative z-10" onClick={(e) => e.stopPropagation()}>
                          <span className="text-xs font-black text-[#84A63C]">₹{parseFloat(item.price || 0).toFixed(2)}</span>
                          {cartItem ? (
                            <div className="flex items-center gap-1.5 bg-[#F0F3E8] rounded-lg px-1.5 py-0.5 shadow-sm border border-[#DDE5D0]">
                              <button
                                onClick={() => updateQty(cartItem.id, -1)}
                                className="p-0.5 hover:bg-white rounded text-[#7A8A6A] hover:text-red-500 transition-colors"
                              >
                                <Minus size={10} strokeWidth={3} />
                              </button>
                              <span className="text-[10px] font-bold text-[#1A2E05] min-w-[10px] text-center">
                                {cartItem.qty}
                              </span>
                              <button
                                onClick={() => updateQty(cartItem.id, 1)}
                                className="p-0.5 hover:bg-white rounded text-[#7A8A6A] hover:text-[#84A63C] transition-colors"
                              >
                                <Plus size={10} strokeWidth={3} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleItemClick(item)}
                              className="w-6 h-6 rounded-full bg-[#F0F3E8] text-[#84A63C] hover:bg-[#84A63C] hover:text-white flex items-center justify-center transition-all duration-200 active:scale-90"
                            >
                              <Plus size={12} strokeWidth={3} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {filteredItems.length === 0 && (
                    <div className="col-span-full py-16 flex flex-col items-center justify-center text-[#7A8A6A]">
                      <Utensils size={40} className="mb-3 opacity-20" />
                      <p className="text-sm font-bold uppercase tracking-widest">No items found</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column - Order/Cart */}
            <div className={`lg:w-[380px] bg-white border border-[#DDE5D0] rounded-2xl shadow-sm flex-col shrink-0 overflow-hidden ${showCartMobile ? 'flex fixed inset-0 z-40 w-full' : 'hidden'} lg:flex`}>
              
              {/* Order Types */}
              <div className="p-4 border-b border-[#DDE5D0] bg-[#F0F3E8]/50">
                <div className="bg-[#E8ECE0] p-1 rounded-xl flex gap-1">
                  {["Room No", "Delivery", "Pick Up"].map(type => (
                    <button 
                      key={type}
                      onClick={() => setOrderType(type)}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                        orderType === type 
                          ? 'bg-white text-[#1A2E05] shadow-sm' 
                          : 'text-[#7A8A6A] hover:text-[#1A2E05]'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Customer Details Form */}
              <div className="p-4 border-b border-[#DDE5D0] bg-white">
                {orderType !== "Room No" ? (
                  <div className="space-y-3">
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="text-[10px] font-bold text-[#7A8A6A] uppercase tracking-wider mb-1 block">Mobile No.</label>
                        <input 
                          type="text" 
                          value={customerInfo.mobile}
                          onChange={e => setCustomerInfo({...customerInfo, mobile: e.target.value})}
                          className="w-full border border-[#DDE5D0] bg-[#F0F3E8]/50 rounded-xl px-3 py-2 text-sm font-bold focus:bg-white focus:border-[#84A63C] outline-none transition-colors" 
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] font-bold text-[#7A8A6A] uppercase tracking-wider mb-1 block">Name</label>
                        <input 
                          type="text" 
                          value={customerInfo.name}
                          onChange={e => setCustomerInfo({...customerInfo, name: e.target.value})}
                          className="w-full border border-[#DDE5D0] bg-[#F0F3E8]/50 rounded-xl px-3 py-2 text-sm font-bold focus:bg-white focus:border-[#84A63C] outline-none transition-colors" 
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-[10px] font-bold text-[#7A8A6A] uppercase tracking-wider mb-1 block">Room No</label>
                        <select 
                          value={customerInfo.roomNo}
                          onChange={e => handleRoomNoChange(e.target.value)}
                          className="w-full border border-[#DDE5D0] bg-[#F0F3E8]/50 rounded-xl px-3 py-2.5 text-xs font-bold focus:bg-white focus:border-[#84A63C] outline-none transition-colors" 
                        >
                          <option value="">Select Room</option>
                          {activeBookings.map(b => (
                            <option key={b.id} value={b.Room?.roomNumber || ''}>
                              Room {b.Room?.roomNumber || 'N/A'}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] font-bold text-[#7A8A6A] uppercase tracking-wider mb-1 block">Guest Name</label>
                        <select 
                          value={customerInfo.name}
                          onChange={e => {
                            const selectedName = e.target.value;
                            const matched = activeBookings.find(b => b.guestName === selectedName);
                            if (matched) {
                              setCustomerInfo(prev => ({
                                ...prev,
                                name: selectedName,
                                roomNo: matched.Room?.roomNumber || '',
                                mobile: matched.customerMobile || ''
                              }));
                            } else {
                              setCustomerInfo(prev => ({
                                ...prev,
                                name: selectedName
                              }));
                            }
                          }}
                          className="w-full border border-[#DDE5D0] bg-[#F0F3E8]/50 rounded-xl px-3 py-2.5 text-xs font-bold focus:bg-white focus:border-[#84A63C] outline-none transition-colors" 
                        >
                          <option value="">Select Guest</option>
                          {activeBookings.map(b => (
                            <option key={b.id} value={b.guestName || ''}>
                              {b.guestName}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button 
                        type="button"
                        onClick={() => {
                          if (customerInfo.roomNo) {
                            setViewHistory(true);
                            setHistorySearch(customerInfo.roomNo);
                          } else {
                            alert("Please select a Room Number first.");
                          }
                        }}
                        className="px-4 py-2 bg-[#F0F3E8] text-[#84A63C] font-bold text-xs rounded-xl hover:bg-[#E8ECE0] transition-colors whitespace-nowrap"
                      >
                        View KOT
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Cart Table Header */}
              <div className="flex px-4 py-2.5 bg-[#F9FAFA] border-b border-[#DDE5D0] text-[10px] font-black text-[#7A8A6A] uppercase tracking-widest">
                <div className="flex-1">Item</div>
                <div className="w-[80px] text-center">Qty</div>
                <div className="w-[60px] text-right">Price</div>
              </div>

              {/* Cart Items */}
              <div className="flex-1 overflow-y-auto p-2 custom-scrollbar bg-white">
                {cart.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-[#212529]">
                    <div className="w-20 h-20 rounded-full bg-[#E8F5E9] flex items-center justify-center mb-4">
                      <ShoppingCart size={28} className="text-[#2E7D32]" />
                    </div>
                    <h3 className="text-base font-bold text-[#212529] mb-1">Empty Order</h3>
                    <p className="text-sm font-medium opacity-80">Add items from the menu</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {cart.map(item => (
                      <div key={item.id} className="flex items-center p-2 hover:bg-[#F0F3E8]/50 rounded-xl transition-colors group">
                        <div className="flex-1 pr-2">
                           <div className="text-[14px] font-semibold text-[#212529] leading-tight line-clamp-2">
                             {item.name}
                           </div>
                           <div className="text-[12px] font-medium text-[#424242] mt-0.5">₹{parseFloat(item.price || 0).toFixed(2)} / ea</div>
                        </div>
                        <div className="w-[80px] flex items-center justify-center">
                          <div className="flex items-center bg-white border border-[#DDE5D0] rounded-lg shadow-sm overflow-hidden">
                            <button onClick={() => updateQty(item.id, -1)} className="px-2 py-1.5 hover:bg-[#F0F3E8] text-[#7A8A6A] hover:text-red-500 transition-colors"><Minus size={12} strokeWidth={3} /></button>
                            <span className="w-6 text-[12px] font-bold text-center">{item.qty}</span>
                            <button onClick={() => updateQty(item.id, 1)} className="px-2 py-1.5 hover:bg-[#F0F3E8] text-[#7A8A6A] hover:text-[#84A63C] transition-colors"><Plus size={12} strokeWidth={3} /></button>
                          </div>
                        </div>
                        <div className="w-[60px] text-right pl-2">
                           <div className="text-[14px] font-bold text-[#212529]">₹{(parseFloat(item.price || 0) * item.qty).toFixed(0)}</div>
                        </div>
                        <button 
                          onClick={() => removeItem(item.id)}
                          className="ml-2 text-[#DDE5D0] group-hover:text-red-400 p-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Bottom Actions */}
              <div className="border-t border-[#DDE5D0] bg-white flex flex-col shadow-[0_-4px_10px_rgba(0,0,0,0.02)] relative z-20">
               {/* Close button for mobile cart */}
               <button
                 className="lg:hidden self-end m-2 text-[#7A8A6A] hover:text-[#1A2E05]"
                 onClick={() => setShowCartMobile(false)}
               >
                 ✕ Close
               </button>
                <div className="px-5 py-4 border-b border-[#DDE5D0] flex items-center justify-between bg-[#F9FAFA]">
                  <label className="flex items-center gap-2.5 cursor-pointer group">
                    <div className="relative flex items-center justify-center">
                      <input 
                        type="checkbox" 
                        checked={isComplimentary}
                        onChange={(e) => setIsComplimentary(e.target.checked)}
                        className="peer appearance-none w-5 h-5 border-2 border-[#DDE5D0] rounded-md checked:bg-[#84A63C] checked:border-[#84A63C] cursor-pointer transition-all" 
                      />
                      <CheckCircle2 size={14} className="absolute text-white opacity-0 peer-checked:opacity-100 pointer-events-none" strokeWidth={3} />
                    </div>
                    <span className="font-bold text-[12px] text-[#7A8A6A] uppercase tracking-wider group-hover:text-[#1A2E05] transition-colors">Complimentary</span>
                  </label>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[12px] font-medium text-[#212529]">Total</span>
                    <span className="text-2xl font-bold text-[#2E7D32]">₹{isComplimentary ? '0' : grandTotal.toFixed(0)}</span>
                  </div>
                </div>

                {/* Payment Types */}
                <div className="flex bg-white text-[11px] font-bold uppercase tracking-wider border-b border-[#DDE5D0]">
                  {['Cash', 'Card', 'Due', 'Other'].map(mode => (
                    <div 
                      key={mode}
                      onClick={() => setPaymentMode(mode)}
                      className={`flex-1 py-3 text-center cursor-pointer transition-all border-b-2 ${
                        paymentMode === mode 
                          ? 'border-[#84A63C] text-[#84A63C] bg-[#F0F3E8]/30' 
                          : 'border-transparent text-[#7A8A6A] hover:bg-[#F9FAFA]'
                      }`}
                    >
                      {mode}
                    </div>
                  ))}
                </div>

                {/* Action Buttons */}
                <div className="p-4">
                  <button 
                    disabled={isSaving} 
                    onClick={() => handleSaveOrder('Save & Print')} 
                    className="w-full py-3 bg-[#84A63C] text-white hover:bg-[#6e8a32] rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                  >
                    <Printer size={15} /> Save &amp; Print Bill
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Add Dish Modal */}
      {isAddDishModalOpen && (
        <div className="fixed inset-0 bg-[#1C2B22]/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] animate-slide-up">
            <div className="flex justify-between items-center p-5 border-b border-[#DDE5D0] bg-[#F9FAFA]">
              <h2 className="text-base font-bold text-[#1A2E05] flex items-center gap-2">
                <div className="p-1.5 bg-[#F0F3E8] text-[#84A63C] rounded-lg"><Utensils size={16} /></div> 
                Add New Dish
              </h2>
              <button onClick={() => setIsAddDishModalOpen(false)} className="p-2 text-[#7A8A6A] hover:bg-[#F0F3E8] hover:text-red-500 rounded-xl transition-colors"><X size={20} /></button>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto flex flex-col gap-5 bg-white">
              <div>
                <label className="block text-[10px] font-bold text-[#7A8A6A] uppercase tracking-wider mb-1.5">Dish Name</label>
                <input 
                  type="text" 
                  value={newDish.name}
                  onChange={e => setNewDish({...newDish, name: e.target.value})}
                  className="w-full border border-[#DDE5D0] bg-[#F0F3E8]/30 rounded-xl px-4 py-2.5 text-sm font-bold focus:bg-white focus:border-[#84A63C] outline-none transition-colors shadow-sm" 
                  placeholder="e.g. Garlic Naan"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#7A8A6A] uppercase tracking-wider mb-1.5">Category</label>
                <div className="flex gap-3">
                  <select 
                    value={newDish.category}
                    onChange={e => setNewDish({...newDish, category: e.target.value})}
                    className="flex-1 border border-[#DDE5D0] bg-[#F0F3E8]/30 rounded-xl px-4 py-2.5 text-sm font-bold focus:bg-white focus:border-[#84A63C] outline-none transition-colors shadow-sm cursor-pointer"
                  >
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input 
                    type="text"
                    placeholder="Or type new..."
                    onChange={e => { if(e.target.value) setNewDish({...newDish, category: e.target.value}) }}
                    className="flex-1 border border-[#DDE5D0] bg-[#F0F3E8]/30 rounded-xl px-4 py-2.5 text-sm font-bold focus:bg-white focus:border-[#84A63C] outline-none transition-colors shadow-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#7A8A6A] uppercase tracking-wider mb-1.5">Base Price (₹)</label>
                <input 
                  type="number" 
                  value={newDish.price}
                  onChange={e => setNewDish({...newDish, price: e.target.value})}
                  className="w-full border border-[#DDE5D0] bg-[#F0F3E8]/30 rounded-xl px-4 py-2.5 text-sm font-bold focus:bg-white focus:border-[#84A63C] outline-none transition-colors shadow-sm" 
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="p-5 border-t border-[#DDE5D0] bg-[#F9FAFA] flex justify-end gap-3 shrink-0">
              <button onClick={() => setIsAddDishModalOpen(false)} className="px-6 py-2.5 border border-[#DDE5D0] bg-white rounded-xl text-[#7A8A6A] text-sm font-bold hover:bg-[#F0F3E8] hover:text-[#1A2E05] transition-colors shadow-sm">Cancel</button>
              <button onClick={handleAddDish} className="px-6 py-2.5 bg-[#84A63C] text-white rounded-xl text-sm font-bold hover:bg-[#6e8a32] transition-colors shadow-md">Add Dish</button>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{
        __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: #DDE5D0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: #7A8A6A;
        }
        @keyframes slideUp { 
          from { opacity: 0; transform: translateY(20px); } 
          to { opacity: 1; transform: translateY(0); } 
        }
        .animate-slide-up { animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}} />
    </div>
  );
};

export default GenerateKot;
