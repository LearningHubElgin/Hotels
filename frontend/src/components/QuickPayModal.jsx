import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DollarSign, X, Edit, Trash2, Eye, Download, Calendar, Clock, Wallet } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { cleanRoomNumber } from '../utils/roomHelper';
import { generatePaymentReceipt } from '../utils/paymentReceiptGenerator';
import { getAutoPaymentSerialNo, getNextPaymentSerialNo } from '../utils/paymentSerialNumberGenerator';

// Format a "HH:MM" 24-hr string to "HH:MM AM/PM"
const formatTime12hr = (timeStr, fallback = '12:00 PM') => {
  if (!timeStr) return fallback;
  const upper = timeStr.toUpperCase();
  if (upper.includes('AM') || upper.includes('PM')) return upper;
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h)) return fallback;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, '0')}:${String(m || 0).padStart(2, '0')} ${ampm}`;
};

// Helper to format date string YYYY-MM-DD to DD-MM-YYYY
const formatDateDMY = (dateStr) => {
  if (!dateStr) return '';
  const plain = dateStr.split('T')[0];
  const [y, m, d] = plain.split('-');
  if (!y || !m || !d) return dateStr;
  return `${d}-${m}-${y}`;
};

// Helper to convert DD-MM-YYYY to YYYY-MM-DD
const convertDMYToYMD = (dmyStr) => {
  if (!dmyStr) return '';
  const parts = dmyStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return dmyStr;
};

// Helper to convert 12hr time to 24hr time format
const convert12hrTo24hr = (time12) => {
  if (!time12) return '12:00';
  const match = time12.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) {
    if (time12.includes(':')) return time12.substring(0, 5);
    return '12:00';
  }
  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const ampm = match[3].toUpperCase();
  if (ampm === "PM" && hours < 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;
  return `${hours.toString().padStart(2, '0')}:${minutes}`;
};

const QuickPayModal = ({ isOpen, onClose, bill, onSave, allBills = [] }) => {
  const { activeHotel } = useAuth();
  const isRowEditable = bill && (
    bill.status !== 'Completed' ||
    activeHotel?.allowPaymentEdit === true ||
    // Always allow payment if there is still pending amount (even after checkout)
    (() => {
      if (!bill) return false;
      const isGroup = bill.groupBookings && bill.groupBookings.length > 1;
      let base = Number(bill.totalAmount || 0);
      let disc = Number(bill.discount || 0);
      if (isGroup) {
        base = bill.groupBookings.reduce((s, b) => s + Number(b.totalAmount || 0), 0);
        disc = bill.groupBookings.reduce((s, b) => s + Number(b.discount || 0), 0);
      }
      const gstRate = Number(bill.gstRate !== undefined && bill.gstRate !== null ? bill.gstRate : (activeHotel?.defaultGstRate !== undefined ? Number(activeHotel.defaultGstRate) : 12));
      const sub = base - disc;
      const roomTotal = sub;
      const extras = Number(bill.extraCharges || 0);
      const grandTotal = roomTotal + extras;
      const paid = isGroup
        ? bill.groupBookings.reduce((s, b) => s + Number(b.amountPaid || 0), 0)
        : Number(bill.amountPaid || 0);
      return (grandTotal - paid) > 0.01;
    })()
  );
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState('Cash');
  const [payBank, setPayBank] = useState('');
  const [payDate, setPayDate] = useState('');
  const [payTime, setPayTime] = useState('');
  const [paidFor, setPaidFor] = useState('Room'); // 'Room' or 'Extras'
  const [activeTab, setActiveTab] = useState('total'); // 'total', 'room', 'extras'
  const [historyList, setHistoryList] = useState([]);
  const [pendingPopup, setPendingPopup] = useState(null); // null | { roomPending, extrasPending }
  const [serialNoInput, setSerialNoInput] = useState('');

  // Inline edit state
  const [editingIdx, setEditingIdx] = useState(null);
  const [editTxData, setEditTxData] = useState({ amount: '', date: '', time: '', paymentMode: 'Cash', paymentBank: '', paidFor: 'Room', serialNumber: '' });

  const banksList = activeHotel && activeHotel.onlinePaymentBanks
    ? activeHotel.onlinePaymentBanks.split(',').map(b => b.trim()).filter(Boolean)
    : [];

  useEffect(() => {
    if (activeTab === 'room') {
      setPaidFor('Room');
    } else if (activeTab === 'extras') {
      setPaidFor('Extras');
    }
    setPayAmount(''); // Reset amount when tab changes
  }, [activeTab]);

  // Reset modal state only on initial open
  useEffect(() => {
    if (isOpen) {
      setPayAmount('');
      setPayMode('Cash');
      setPayBank(banksList[0] || '');
      setPaidFor('Room');
      setActiveTab('total');
      setEditingIdx(null);

      const nextNum = getNextPaymentSerialNo(allBills);
      setSerialNoInput(nextNum);

      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      setPayDate(`${yyyy}-${mm}-${dd}`);

      const hh = String(now.getHours()).padStart(2, '0');
      const min = String(now.getMinutes()).padStart(2, '0');
      setPayTime(`${hh}:${min}`);
    }
  }, [isOpen, allBills]);

  useEffect(() => {
    if (isOpen && bill) {
      document.body.style.overflow = 'hidden';
      let parsed = [];
      try {
        if (bill.paymentHistory) {
          parsed = JSON.parse(bill.paymentHistory);
        }
      } catch (err) {
        console.error("Error parsing payment history", err);
      }

      let isGroup = bill.groupBookings && bill.groupBookings.length > 1;
      const prevPaidTotal = isGroup
        ? bill.groupBookings.reduce((sum, b) => sum + Number(b.amountPaid || 0), 0)
        : Number(bill.amountPaid || 0);

      if (parsed.length === 0 && prevPaidTotal > 0) {
        const checkInDateFormatted = bill.checkInDate ? bill.checkInDate.split('T')[0].split('-').reverse().join('-') : 'N/A';
        const checkInTimeFormatted = bill.checkInTime ? formatTime12hr(bill.checkInTime) : (bill.createdAt ? new Date(bill.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : '12:00 PM');
        parsed = [{
          amount: prevPaidTotal,
          date: checkInDateFormatted,
          time: checkInTimeFormatted,
          paymentMode: bill.paymentMode || 'Cash',
          paymentBank: bill.paymentBank || null,
          paidFor: 'Room'
        }];
      }
      setHistoryList(parsed);
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, bill]);

  if (!isOpen || !bill) return null;

  const cleanRoomNumber = (roomNum) => {
    if (!roomNum) return '';
    return String(roomNum).replace(/^R-/i, '');
  };

  let isGroup = bill.groupBookings && bill.groupBookings.length > 1;

  let roomDisplayElements = bill.previousRoomNumber ? (
    <span>
      <span className="text-orange-600 font-bold">R-{cleanRoomNumber(bill.previousRoomNumber)} → </span>
      <span>{cleanRoomNumber(bill.Room?.roomNumber || bill.roomId)}</span>
    </span>
  ) : (
    <span>R-{cleanRoomNumber(bill.Room?.roomNumber || bill.roomId)}</span>
  );

  if (isGroup) {
    roomDisplayElements = (
      <div className="flex flex-wrap gap-1">
        {bill.groupBookings.map((b, i) => (
          <span key={b.id || i}>
            {b.previousRoomNumber ? (
              <span className="text-orange-600 font-bold">R-{cleanRoomNumber(b.previousRoomNumber)} → {cleanRoomNumber(b.Room?.roomNumber || b.roomId)}</span>
            ) : (
              `R-${cleanRoomNumber(b.Room?.roomNumber || b.roomId)}`
            )}
            {i < bill.groupBookings.length - 1 ? ',' : ''}
          </span>
        ))}
      </div>
    );
  }

  const getShiftedBaseForSingle = (b) => {
    // If totalAmount is already saved and valid, use it directly
    const savedTotal = Number(b.totalAmount || bill.totalAmount || 0);
    if (savedTotal > 0 && !isNaN(savedTotal)) {
      return savedTotal;
    }

    const prevRoomNum = b.previousRoomNumber || bill.previousRoomNumber;
    if (prevRoomNum) {
      const checkInStr = b.checkInDate ? b.checkInDate.split('T')[0] : (bill.checkInDate ? bill.checkInDate.split('T')[0] : '');
      const checkOutStr = b.checkOutDate ? b.checkOutDate.split('T')[0] : (bill.checkOutDate ? bill.checkOutDate.split('T')[0] : '');
      if (checkInStr && checkOutStr) {
        const cIn = new Date(checkInStr);
        const cOut = new Date(checkOutStr);
        const totalStayDays = Math.max(1, Math.ceil(Math.abs(cOut - cIn) / (1000 * 60 * 60 * 24)));
        let shiftDateStr = b.shiftDate || bill.shiftDate || (b.updatedAt ? b.updatedAt.split('T')[0] : (bill.updatedAt ? bill.updatedAt.split('T')[0] : ''));
        const todayStr = new Date().toISOString().split('T')[0];

        if (!shiftDateStr || shiftDateStr < checkInStr || shiftDateStr > checkOutStr) {
          if (todayStr > checkInStr && todayStr <= checkOutStr) shiftDateStr = todayStr;
          else shiftDateStr = new Date(cIn.getTime() + Math.max(1, Math.floor(totalStayDays / 2)) * 86400000).toISOString().split('T')[0];
        }

        // Allow prevDays = 0 when shift happens on check-in day
        let prevDays = Math.max(0, Math.ceil(Math.abs(new Date(shiftDateStr) - cIn) / (1000 * 60 * 60 * 24)));
        if (prevDays >= totalStayDays) prevDays = Math.max(0, totalStayDays - 1);
        const curDays = Math.max(1, totalStayDays - prevDays);

        const prevRateVal = b.previousRoomRate !== undefined && b.previousRoomRate !== null ? b.previousRoomRate : bill.previousRoomRate;
        const prevRatesList = String(prevRateVal || '').split(/→|->|,|>/).map(s => Number(s.trim())).filter(n => !isNaN(n));
        const defaultPrevRate = prevRatesList.length > 0
          ? prevRatesList[0]
          : (b.Room?.pricePerNight ? Number(b.Room.pricePerNight) : (bill.Room?.pricePerNight ? Number(bill.Room.pricePerNight) : 0));
        const curRate = b.Room?.pricePerNight ? Number(b.Room.pricePerNight) : (bill.Room?.pricePerNight ? Number(bill.Room.pricePerNight) : defaultPrevRate);

        // Calculate per-room totals for previous rooms
        const prevRooms = String(prevRoomNum).split(/→|->|,|>/).map(s => s.trim()).filter(Boolean);
        let prevTotalSum = 0;
        if (prevRooms.length > 0 && prevDays > 0) {
          let remainingPrevDays = prevDays;
          prevRooms.forEach((rm, pIdx) => {
            const days = pIdx === 0 ? Math.max(0, remainingPrevDays - (prevRooms.length - 1)) : 1;
            const pRate = prevRatesList[pIdx] !== undefined ? prevRatesList[pIdx] : defaultPrevRate;
            prevTotalSum += days * pRate;
          });
        }

        return prevTotalSum + (curDays * curRate);
      }
    }
    return Number(b.totalAmount || bill.totalAmount || 0);
  };

  let baseAmount = 0;
  if (isGroup) {
    baseAmount = bill.groupBookings.reduce((sum, b) => sum + getShiftedBaseForSingle(b), 0);
  } else {
    baseAmount = getShiftedBaseForSingle(bill);
  }

  let discount = Number(bill.discount || 0);
  if (isGroup) {
    discount = bill.groupBookings.reduce((sum, b) => sum + Number(b.discount || 0), 0);
  }

  const gstRate = Number(bill.gstRate !== undefined && bill.gstRate !== null ? bill.gstRate : (activeHotel?.defaultGstRate !== undefined ? Number(activeHotel.defaultGstRate) : 12));
  const gstOption = bill.gstOption || 'none';

  let rawTotalPaid = Math.round(historyList.reduce((sum, h) => sum + Number(h.amount || 0), 0) * 100) / 100;
  let netRoomTotal = Math.max(0, baseAmount - discount);
  if (gstOption === 'inclusive' && rawTotalPaid > netRoomTotal && Math.abs(rawTotalPaid - Math.round(netRoomTotal * (1 + gstRate / 100))) < 1.5) {
    netRoomTotal = rawTotalPaid;
  }

  let roomGstAmount = 0;
  let roomGrandTotal = netRoomTotal;

  if (gstOption === 'inclusive' || (gstOption === 'exclusive' && gstRate > 0)) {
    roomGrandTotal = netRoomTotal;
    const preTaxSub = Math.round((netRoomTotal / (1 + gstRate / 100)) * 100) / 100;
    roomGstAmount = Math.round((netRoomTotal - preTaxSub) * 100) / 100;
  } else {
    roomGstAmount = 0;
    roomGrandTotal = netRoomTotal;
  }

  const extrasGrandTotal = Math.round(Number(bill.extraCharges || 0) * 100) / 100;
  const totalGrandTotal = Math.round((roomGrandTotal + extrasGrandTotal) * 100) / 100;

  const hasExtras = extrasGrandTotal > 0 || historyList.some(h => h.paidFor === 'Food' || h.paidFor === 'Extras');

  let totalPaidAll = rawTotalPaid;
  const totalPaidExtras = Math.round(historyList.reduce((sum, h) => {
    const isExtra = h.paidFor === 'Food' || h.paidFor === 'Extras';
    return isExtra ? sum + Number(h.amount || 0) : sum;
  }, 0) * 100) / 100;
  const totalPaidRoom = Math.round((totalPaidAll - totalPaidExtras) * 100) / 100;

  // Tab-specific display variables
  let displayGrandTotal = totalGrandTotal;
  let displayTotalPaid = totalPaidAll;
  let displayPendingDue = Math.round((totalGrandTotal - totalPaidAll) * 100) / 100;

  if (activeTab === 'room') {
    displayGrandTotal = roomGrandTotal;
    displayTotalPaid = totalPaidRoom;
    displayPendingDue = Math.round((roomGrandTotal - totalPaidRoom) * 100) / 100;
  } else if (activeTab === 'extras') {
    displayGrandTotal = extrasGrandTotal;
    displayTotalPaid = totalPaidExtras;
    displayPendingDue = Math.round((extrasGrandTotal - totalPaidExtras) * 100) / 100;
  }

  if (Math.abs(displayPendingDue) < 0.01) {
    displayPendingDue = 0;
  }

  const saveAndUpdateHistory = async (updatedHistory) => {
    const newTotalPaid = updatedHistory.reduce((sum, h) => sum + Number(h.amount || 0), 0);
    const pendingDue = totalGrandTotal - newTotalPaid;
    const paymentStatus = pendingDue <= 0.1 ? 'Paid' : (newTotalPaid === 0 ? 'Pending' : 'Partial');

    try {
      await api.put(`/bookings/${bill.id}`, {
        paymentHistory: JSON.stringify(updatedHistory),
        amountPaid: newTotalPaid,
        paymentStatus
      });
      setHistoryList(updatedHistory);
      onSave(); // Refresh parent table list
    } catch (err) {
      console.error("Error saving payment", err);
      alert("Failed to save transaction");
    }
  };

  const handleAddPayment = async () => {
    const amt = Number(payAmount);
    if (isNaN(amt) || amt <= 0) {
      alert("Please enter a valid amount greater than 0");
      return;
    }

    let currentDate = '';
    if (payDate) {
      const parts = payDate.split('-');
      if (parts.length === 3) {
        currentDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    }
    if (!currentDate) {
      const today = new Date();
      currentDate = today.toLocaleDateString('en-GB').replace(/\//g, '-');
    }

    let currentTime = '';
    if (payTime) {
      currentTime = formatTime12hr(payTime);
    }
    if (!currentTime) {
      const today = new Date();
      currentTime = today.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();
    }

    const pendingRoom = Math.max(0, roomGrandTotal - totalPaidRoom);
    const pendingExtras = Math.max(0, extrasGrandTotal - totalPaidExtras);
    const totalPendingAll = pendingRoom + pendingExtras;

    const assignedSerial = activeHotel?.enablePaymentSerialNumber
      ? (String(serialNoInput || '').trim() || getNextPaymentSerialNo(allBills))
      : undefined;

    let newEntries = [];
    if (activeTab === 'room') {
      newEntries = [{ amount: amt, date: currentDate, time: currentTime, paymentMode: payMode, paymentBank: payMode === 'Online' ? payBank : null, paidFor: 'Room', serialNumber: assignedSerial }];
    } else if (activeTab === 'extras') {
      newEntries = [{ amount: amt, date: currentDate, time: currentTime, paymentMode: payMode, paymentBank: payMode === 'Online' ? payBank : null, paidFor: 'Extras', serialNumber: assignedSerial }];
    } else {
      // activeTab === 'total'
      // Automatically allocate: Room dues first, then Extras
      if (hasExtras && pendingRoom > 0.01 && pendingExtras > 0.01) {
        const roomShare = Math.min(amt, pendingRoom);
        const extrasShare = Math.max(0, amt - roomShare);

        if (roomShare > 0.01) {
          newEntries.push({ amount: roomShare, date: currentDate, time: currentTime, paymentMode: payMode, paymentBank: payMode === 'Online' ? payBank : null, paidFor: 'Room', serialNumber: assignedSerial });
        }
        if (extrasShare > 0.01) {
          newEntries.push({ amount: extrasShare, date: currentDate, time: currentTime, paymentMode: payMode, paymentBank: payMode === 'Online' ? payBank : null, paidFor: 'Extras', serialNumber: assignedSerial });
        }
      } else {
        // Fallback if only one has outstanding dues
        const targetPaidFor = (pendingExtras > 0.01 && pendingRoom <= 0.01) ? 'Extras' : 'Room';
        newEntries = [{ amount: amt, date: currentDate, time: currentTime, paymentMode: payMode, paymentBank: payMode === 'Online' ? payBank : null, paidFor: targetPaidFor, serialNumber: assignedSerial }];
      }
    }

    const updatedHistory = [...historyList, ...newEntries];
    await saveAndUpdateHistory(updatedHistory);
    setPayAmount('');
    setPaidFor(activeTab === 'extras' ? 'Extras' : 'Room');
    if (activeHotel?.enablePaymentSerialNumber) {
      setSerialNoInput(getNextPaymentSerialNo(allBills));
    }

    // After payment: compute new pending amounts and show popup if any pending
    const newTotalPaidAll = updatedHistory.reduce((s, h) => s + Number(h.amount || 0), 0);
    const newTotalPaidExtras = updatedHistory.reduce((s, h) => {
      return (h.paidFor === 'Food' || h.paidFor === 'Extras') ? s + Number(h.amount || 0) : s;
    }, 0);
    const newTotalPaidRoom = newTotalPaidAll - newTotalPaidExtras;
    const roomPending = Math.max(0, roomGrandTotal - newTotalPaidRoom);
    const extrasPending = Math.max(0, extrasGrandTotal - newTotalPaidExtras);
    if (roomPending > 0.01 || extrasPending > 0.01) {
      setTimeout(() => {
        setPendingPopup({ roomPending, extrasPending });
      }, 500);
    }
  };

  const startEditTx = (idx, tx) => {
    setEditingIdx(idx);
    setEditTxData({
      amount: tx.amount,
      date: convertDMYToYMD(tx.date),
      time: convert12hrTo24hr(tx.time),
      paymentMode: tx.paymentMode || 'Cash',
      paymentBank: tx.paymentBank || '',
      paidFor: tx.paidFor || 'Room',
      serialNumber: tx.serialNumber || getAutoPaymentSerialNo(tx, idx, bill, allBills)
    });
  };

  const saveEditTx = async (idx) => {
    const amt = Number(editTxData.amount);
    if (isNaN(amt) || amt <= 0) {
      alert("Please enter a valid amount");
      return;
    }
    const updated = [...historyList];
    updated[idx] = {
      ...updated[idx],
      amount: amt,
      date: formatDateDMY(editTxData.date), // converts YYYY-MM-DD -> DD-MM-YYYY
      time: formatTime12hr(editTxData.time), // converts HH:MM -> HH:MM AM/PM
      paymentMode: editTxData.paymentMode,
      paymentBank: editTxData.paymentMode === 'Online' ? editTxData.paymentBank : null,
      paidFor: editTxData.paidFor || 'Room',
      serialNumber: editTxData.serialNumber ? String(editTxData.serialNumber).trim() : updated[idx].serialNumber
    };
    await saveAndUpdateHistory(updated);
    setEditingIdx(null);
  };

  const deleteTx = async (idx) => {
    if (!window.confirm("Are you sure you want to delete this payment transaction?")) return;
    const updated = historyList.filter((_, i) => i !== idx);
    await saveAndUpdateHistory(updated);
    setEditingIdx(null);
  };

  const roomDisplayStr = isGroup
    ? bill.groupBookings.map(b => `R-${cleanRoomNumber(b.Room?.roomNumber || b.roomId)}`).join(', ')
    : `R-${cleanRoomNumber(bill.Room?.roomNumber)}`;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto animate-fade-in">
      <div className="w-full max-w-6xl bg-white shadow-2xl sm:rounded-xl rounded-lg overflow-y-auto md:overflow-hidden border border-[#DDE5D0] flex flex-col md:flex-row md:h-[82vh] md:min-h-[650px] md:max-h-[820px] max-h-[95vh] animate-slide-up relative">

        {/* Pending Bill Alert Popup Overlay */}
        {pendingPopup && (
          <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm rounded-3xl animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl border border-[#DDE5D0] w-[320px] max-w-[90vw] overflow-hidden">
              {/* Header */}
              <div className="bg-amber-50 border-b border-amber-200 px-5 py-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-black text-amber-900">Payment Collected ✓</h4>
                  <p className="text-xs font-semibold text-amber-700 mt-0.5">Some dues are still pending</p>
                </div>
              </div>
              {/* Body */}
              <div className="px-5 py-4 space-y-3">
                {pendingPopup.roomPending > 0.01 && (
                  <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <div>
                      <p className="text-[10px] font-black text-red-500 uppercase tracking-wider">Room Bill Pending</p>
                      <p className="text-[10px] font-semibold text-red-400 mt-0.5">Stay charges not fully settled</p>
                    </div>
                    <span className="text-base font-black text-red-600 ml-3 shrink-0">
                      ₹{pendingPopup.roomPending.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
                {pendingPopup.extrasPending > 0.01 && (
                  <div className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
                    <div>
                      <p className="text-[10px] font-black text-orange-500 uppercase tracking-wider">Extras Bill Pending</p>
                      <p className="text-[10px] font-semibold text-orange-400 mt-0.5">Services / food charges not settled</p>
                    </div>
                    <span className="text-base font-black text-orange-600 ml-3 shrink-0">
                      ₹{pendingPopup.extrasPending.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between bg-[#F0F3E8] border border-[#DDE5D0] rounded-xl px-4 py-3">
                  <p className="text-xs font-black text-[#4A5E38] uppercase tracking-wider">Total Pending</p>
                  <span className="text-lg font-black text-[#1A2E05]">
                    ₹{((pendingPopup.roomPending || 0) + (pendingPopup.extrasPending || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
              {/* Footer */}
              <div className="px-5 pb-5">
                <button
                  onClick={() => setPendingPopup(null)}
                  className="w-full py-2.5 bg-[#1A2E05] hover:bg-[#2D4A0E] text-white text-xs font-black rounded-xl transition-all"
                >
                  Got It, Continue →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Left Side: Summary & New Payment Form */}
        <div className="flex-1 p-3.5 sm:p-6 md:p-7 sm:rounded-t-3xl rounded-t-xl md:rounded-t-none md:rounded-l-3xl border-b md:border-b-0 md:border-r border-[#DDE5D0] bg-[#FBFDF8] flex flex-col justify-between md:overflow-y-auto md:h-full">
          <div>
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[9px] sm:text-[10px] font-black text-[#84A63C] bg-[#84A63C]/10 border border-[#84A63C]/20 px-2.5 py-0.5 rounded-full uppercase tracking-wider shrink-0">Quick Pay</span>
                <h2 className="text-sm sm:text-base font-black text-[#1A2E05] leading-tight">{bill.guestName}</h2>
                <span className="text-[10px] sm:text-xs font-bold text-[#4A5E38] bg-[#EAF0DE] border border-[#DDE5D0] px-2 py-0.5 rounded-lg">{roomDisplayElements}</span>
              </div>
              <button onClick={onClose} className="md:hidden p-1.5 text-[#7A8A6A] hover:bg-[#F0F3E8] rounded-xl"><X size={18} /></button>
            </div>

            {/* Premium Tab Options */}
            {hasExtras && (
              <div className="flex bg-[#F0F3E8] p-1 rounded-2xl mb-3.5 border border-[#DDE5D0]/60 shadow-inner">
                {[
                  { id: 'total', label: 'Total Bill' },
                  { id: 'room', label: 'Room Bill' },
                  { id: 'extras', label: 'Extras Bill' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 py-1.5 rounded-xl text-[10px] sm:text-xs font-extrabold transition-all ${activeTab === tab.id
                        ? 'bg-white text-[#1A2E05] shadow-sm'
                        : 'text-[#7A8A6A] hover:text-[#1A2E05]'
                      }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            {/* Calculations Panel */}
            <div className="grid grid-cols-3 gap-2 mb-3.5">
              <div className="bg-white p-2.5 sm:p-3 rounded-2xl border border-[#DDE5D0] shadow-xs flex flex-col justify-center text-center sm:text-left">
                <p className="text-[8px] sm:text-[9px] font-black text-[#7A8A6A] uppercase tracking-wider">Grand Total</p>
                <p className="text-xs sm:text-sm font-black text-[#1A2E05] mt-1">₹{displayGrandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div className="bg-emerald-50/80 p-2.5 sm:p-3 rounded-2xl border border-emerald-200/80 shadow-xs flex flex-col justify-center text-center sm:text-left">
                <p className="text-[8px] sm:text-[9px] font-black text-emerald-800 uppercase tracking-wider">Total Paid</p>
                <p className="text-xs sm:text-sm font-black text-emerald-700 mt-1">₹{displayTotalPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div className="bg-rose-50/80 p-2.5 sm:p-3 rounded-2xl border border-rose-200/80 shadow-xs flex flex-col justify-center text-center sm:text-left">
                <p className="text-[8px] sm:text-[9px] font-black text-rose-800 uppercase tracking-wider">Pending Due</p>
                <p className={`text-xs sm:text-sm font-black mt-1 ${displayPendingDue <= 0.1 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  ₹{displayPendingDue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                {activeTab === 'total' && hasExtras && (
                  <div className="mt-1.5 pt-1 border-t border-rose-200/60 space-y-0.5">
                    {(roomGrandTotal - totalPaidRoom) > 0.01 && (
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[9px] text-[#7A8A6A] font-bold">🏠 Room</span>
                        <span className="text-[9px] font-black text-red-600">
                          ₹{Math.max(0, roomGrandTotal - totalPaidRoom).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                    {(extrasGrandTotal - totalPaidExtras) > 0.01 && (
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[9px] text-[#7A8A6A] font-bold">🍽️ Extra</span>
                        <span className="text-[9px] font-black text-orange-600">
                          ₹{Math.max(0, extrasGrandTotal - totalPaidExtras).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Record Payment Form */}
            <div className="space-y-3 bg-white p-3.5 sm:p-4 rounded-2xl border border-[#DDE5D0] shadow-xs">
              <h3 className="text-xs font-black text-[#1A2E05] uppercase tracking-wider flex items-center gap-1.5">
                <DollarSign size={14} className="text-[#84A63C]" /> Record New Payment
              </h3>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[9px] sm:text-[10px] font-black text-[#4A5E38] uppercase tracking-wider">Payment Amount (₹)</label>
                  {isRowEditable && displayPendingDue > 0.01 && (
                    <button
                      type="button"
                      disabled={!isRowEditable}
                      onClick={() => setPayAmount(Number(displayPendingDue.toFixed(2)).toString())}
                      className="text-[8px] sm:text-[9px] font-black text-[#84A63C] border border-[#84A63C]/40 bg-[#84A63C]/10 hover:bg-[#84A63C]/20 px-2 py-0.5 rounded-full transition-all"
                    >
                      ⚡ Pay All Pending (₹{displayPendingDue.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })})
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  step="any"
                  onWheel={(e) => e.target.blur()}
                  placeholder={isRowEditable ? "Enter amount to pay..." : "Billing locked (Fully paid)"}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  disabled={!isRowEditable}
                  className="w-full px-3.5 py-2.5 bg-[#F5F7F0] border border-[#DDE5D0] rounded-xl text-sm sm:text-base font-bold text-[#1A2E05] focus:outline-none focus:bg-white focus:border-[#84A63C] transition-all disabled:opacity-60 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                {/* Auto-split / allocation preview */}
                {(() => {
                  const enteredAmt = Number(payAmount);
                  if (!enteredAmt || enteredAmt <= 0) return null;

                  const pendingRoom = Math.max(0, roomGrandTotal - totalPaidRoom);
                  const pendingExtras = Math.max(0, extrasGrandTotal - totalPaidExtras);
                  const totalPendingAll = pendingRoom + pendingExtras;

                  // Tab-aware allocation
                  let roomShare = 0;
                  let extrasShare = 0;
                  let label = 'Allocation Preview';
                  let isGreen = false;

                  if (activeTab === 'room') {
                    roomShare = enteredAmt;
                    extrasShare = 0;
                    isGreen = Math.abs(enteredAmt - pendingRoom) < 0.5;
                  } else if (activeTab === 'extras') {
                    roomShare = 0;
                    extrasShare = enteredAmt;
                    isGreen = Math.abs(enteredAmt - pendingExtras) < 0.5;
                  } else {
                    // Total tab: room first, then extras
                    roomShare = Math.min(enteredAmt, pendingRoom);
                    extrasShare = Math.max(0, Math.min(pendingExtras, enteredAmt - roomShare));
                    const isExactTotal = Math.abs(enteredAmt - totalPendingAll) < 0.5 && pendingRoom > 0.01 && pendingExtras > 0.01;
                    if (isExactTotal) {
                      label = '✓ Auto-Split Preview';
                      isGreen = true;
                    }
                  }

                  const showExtrasRow = hasExtras && (activeTab === 'extras' || activeTab === 'total');
                  const showRoomRow = activeTab === 'room' || activeTab === 'total';
                  const isAutoSplit = activeTab === 'total' && Math.abs(enteredAmt - totalPendingAll) < 0.5 && pendingRoom > 0.01 && pendingExtras > 0.01;

                  return (
                    <div className={`mt-2 rounded-xl border px-3 py-2 space-y-1 ${isGreen ? 'bg-green-50/80 border-green-200' : 'bg-[#F9FAFA] border-[#DDE5D0]'}`}>
                      <p className={`text-[8px] font-black uppercase tracking-wider mb-1 ${isGreen ? 'text-green-600' : 'text-[#7A8A6A]'}`}>
                        {label}
                      </p>
                      {showRoomRow && (
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] font-bold text-[#4A5E38]">🏠 Room Bill</span>
                          <span className="text-[9px] font-black text-[#1A2E05]">₹{roomShare.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      )}
                      {showExtrasRow && (
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] font-bold text-[#4A5E38]">🍽️ Extras Bill</span>
                          <span className="text-[9px] font-black text-[#1A2E05]">₹{extrasShare.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      )}
                      {isAutoSplit && (
                        <p className="text-[8px] text-green-600 font-bold mt-1">Will be auto-saved as 2 separate entries</p>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div>
                <label className="text-[9px] sm:text-[10px] font-black text-[#4A5E38] uppercase tracking-wider block mb-1">Payment Mode</label>
                <div className="flex gap-2">
                   {['Cash', 'Online', 'Card'].map(m => (
                    <button
                      key={m}
                      type="button"
                      disabled={!isRowEditable}
                      onClick={() => setPayMode(m)}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-1.5 ${payMode === m
                          ? 'bg-[#84A63C] border-[#84A63C] text-white shadow-sm'
                          : 'bg-[#F0F3E8] border-[#DDE5D0] text-[#7A8A6A] hover:bg-[#E2E8D5]'
                        } disabled:opacity-60 disabled:cursor-not-allowed`}
                    >
                      <span>{m === 'Cash' ? '💵' : (m === 'Card' ? '💳' : '📱')}</span>
                      <span>{m === 'Card' ? 'Card' : m}</span>
                    </button>
                  ))}
                </div>
              </div>

              {payMode === 'Online' && banksList.length > 0 && (
                <div>
                  <label className="text-[9px] sm:text-[10px] font-black text-[#4A5E38] uppercase tracking-wider block mb-1">Select Bank / Wallet</label>
                  <select
                    value={payBank}
                    onChange={(e) => setPayBank(e.target.value)}
                    disabled={!isRowEditable}
                    className="w-full px-3 py-2 bg-[#F5F7F0] border border-[#DDE5D0] rounded-xl text-xs sm:text-sm font-bold text-[#1A2E05] focus:outline-none focus:bg-white focus:border-[#84A63C] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {banksList.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] sm:text-[10px] font-black text-[#4A5E38] uppercase tracking-wider block mb-1">Payment Date</label>
                  <input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    disabled={!isRowEditable}
                    className="w-full px-3 py-1.5 bg-[#F5F7F0] border border-[#DDE5D0] rounded-xl text-xs font-bold text-[#1A2E05] focus:outline-none focus:bg-white focus:border-[#84A63C] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="text-[9px] sm:text-[10px] font-black text-[#4A5E38] uppercase tracking-wider block mb-1">Payment Time</label>
                  <input
                    type="time"
                    value={payTime}
                    onChange={(e) => setPayTime(e.target.value)}
                    disabled={!isRowEditable}
                    className="w-full px-3 py-1.5 bg-[#F5F7F0] border border-[#DDE5D0] rounded-xl text-xs font-bold text-[#1A2E05] focus:outline-none focus:bg-white focus:border-[#84A63C] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {activeHotel?.enablePaymentSerialNumber === true && (
                <div>
                  <label className="text-[9px] sm:text-[10px] font-black text-[#4A5E38] uppercase tracking-wider block mb-1">
                    Payment Serial Number
                  </label>
                  <input
                    type="text"
                    value={serialNoInput}
                    onChange={(e) => setSerialNoInput(e.target.value)}
                    disabled={!isRowEditable}
                    placeholder="e.g. 1"
                    className="w-full px-3.5 py-2 bg-[#F5F7F0] border border-[#DDE5D0] rounded-xl text-xs sm:text-sm font-black text-[#1A2E05] focus:outline-none focus:bg-white focus:border-[#84A63C] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>
              )}

              <button
                type="button"
                disabled={!isRowEditable}
                onClick={handleAddPayment}
                className="w-full py-2.5 bg-[#84A63C] hover:bg-[#729231] text-white font-black text-xs sm:text-sm rounded-xl shadow-md shadow-[#84A63C]/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:bg-gray-400 disabled:shadow-none disabled:cursor-not-allowed mt-2"
              >
                <DollarSign size={16} /> {isRowEditable ? 'Add Payment' : 'Billing Locked (Fully Paid)'}
              </button>
            </div>
          </div>

          <button
            onClick={onClose}
            className="hidden md:flex w-full mt-4 py-2.5 border border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 bg-red-50/20 rounded-xl text-xs font-black transition-all items-center justify-center gap-1.5"
          >
            <X size={15} /> Close Ledger
          </button>
        </div>

        {/* Right Side: Ledger Transactions History */}
        <div className="flex-[1.25] p-3.5 sm:p-6 md:p-7 sm:rounded-b-3xl rounded-b-xl md:rounded-b-none md:rounded-r-3xl bg-white flex flex-col justify-between md:overflow-y-auto md:h-full md:max-h-none">
          <div className="flex justify-between items-center mb-3.5 sm:mb-5">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black text-[#1A2E05] uppercase tracking-wider">Transaction Ledger</h3>
              <span className="text-[10px] font-extrabold bg-[#F0F3E8] text-[#4A5E38] border border-[#DDE5D0] px-2 py-0.5 rounded-full">
                {historyList.length} {historyList.length === 1 ? 'Entry' : 'Entries'}
              </span>
            </div>
            <button onClick={onClose} className="hidden md:block p-1.5 text-[#7A8A6A] hover:bg-[#F0F3E8] rounded-xl"><X size={20} /></button>
          </div>

          <div className="flex-1 md:overflow-y-auto pr-1 space-y-3 md:max-h-none custom-top-scrollbar">
            {historyList.length > 0 ? (
              historyList.map((item, idx) => {
                const isEditing = editingIdx === idx;

                const today = new Date();
                const pad2 = (n) => String(n).padStart(2, '0');
                const todayDMY = `${pad2(today.getDate())}-${pad2(today.getMonth() + 1)}-${today.getFullYear()}`;
                const isTodayItem = (item.date === todayDMY);
                const isOldPayment = !isTodayItem;

                const allowEditOld = activeHotel?.allowEditOldPayments === true || activeHotel?.allowEditOldPayments === 1 || activeHotel?.allowEditOldPayments === '1' || activeHotel?.allowEditOldPayments === 'true';
                const allowPaymentEdit = activeHotel?.allowPaymentEdit === true || activeHotel?.allowPaymentEdit === 1 || activeHotel?.allowPaymentEdit === '1' || activeHotel?.allowPaymentEdit === 'true';

                let canEditThisItem = isRowEditable;

                // Rule 1: If it is an old/past date payment and allowEditOldPayments is OFF, block edit/delete even if guest has NOT checked out
                if (isOldPayment && !allowEditOld) {
                  canEditThisItem = false;
                }

                // Rule 2: If guest is checked out and allowPaymentEdit is OFF, block edit/delete unless it's a today payment
                if (bill.status === 'Completed' && !allowPaymentEdit && !isTodayItem) {
                  canEditThisItem = false;
                }

                return (
                  <div key={idx} className="p-3 sm:p-3.5 bg-white border border-[#DDE5D0] hover:border-[#84A63C]/40 sm:rounded-2xl rounded-xl shadow-xs hover:shadow-md transition-all">
                    {isEditing ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-[8px] font-black text-[#4A5E38] uppercase block mb-0.5">Amount (₹)</label>
                            <input
                              type="number"
                              step="any"
                              onWheel={(e) => e.target.blur()}
                              value={editTxData.amount}
                              onChange={(e) => setEditTxData(prev => ({ ...prev, amount: e.target.value }))}
                              className="w-full px-2.5 py-1.5 bg-[#F5F7F0] border border-[#DDE5D0] rounded-xl text-xs font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </div>
                          <div>
                            <label className="text-[8px] font-black text-[#4A5E38] uppercase block mb-0.5">Date</label>
                            <input
                              type="date"
                              value={editTxData.date}
                              onChange={(e) => setEditTxData(prev => ({ ...prev, date: e.target.value }))}
                              className="w-full px-2.5 py-1.5 bg-[#F5F7F0] border border-[#DDE5D0] rounded-xl text-xs font-bold"
                            />
                          </div>
                          <div>
                            <label className="text-[8px] font-black text-[#4A5E38] uppercase block mb-0.5">Time</label>
                            <input
                              type="time"
                              value={editTxData.time}
                              onChange={(e) => setEditTxData(prev => ({ ...prev, time: e.target.value }))}
                              className="w-full px-2.5 py-1.5 bg-[#F5F7F0] border border-[#DDE5D0] rounded-xl text-xs font-bold"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-[8px] font-black text-[#4A5E38] uppercase block mb-0.5">Mode</label>
                            <select
                              value={editTxData.paymentMode}
                              onChange={(e) => setEditTxData(prev => ({ ...prev, paymentMode: e.target.value, paymentBank: e.target.value === 'Online' ? banksList[0] || '' : '' }))}
                              className="w-full px-2.5 py-1.5 bg-[#F5F7F0] border border-[#DDE5D0] rounded-xl text-xs font-bold"
                            >
                              <option value="Cash">Cash</option>
                              <option value="Online">Online / UPI</option>
                              <option value="Card">Card / POS</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[8px] font-black text-[#4A5E38] uppercase block mb-0.5">Paid For</label>
                            <select
                              value={editTxData.paidFor || 'Room'}
                              onChange={(e) => setEditTxData(prev => ({ ...prev, paidFor: e.target.value }))}
                              className="w-full px-2.5 py-1.5 bg-[#F5F7F0] border border-[#DDE5D0] rounded-xl text-xs font-bold"
                            >
                              <option value="Room">Room / General</option>
                              <option value="Extras">Extras / Services</option>
                            </select>
                          </div>
                          {activeHotel?.enablePaymentSerialNumber === true ? (
                            <div>
                              <label className="text-[8px] font-black text-[#4A5E38] uppercase block mb-0.5">Serial No.</label>
                              <input
                                type="text"
                                value={editTxData.serialNumber || ''}
                                onChange={(e) => setEditTxData(prev => ({ ...prev, serialNumber: e.target.value }))}
                                placeholder="1"
                                className="w-full px-2.5 py-1.5 bg-[#F5F7F0] border border-[#DDE5D0] rounded-xl text-xs font-bold"
                              />
                            </div>
                          ) : (
                            editTxData.paymentMode === 'Online' && banksList.length > 0 && (
                              <div>
                                <label className="text-[8px] font-black text-[#4A5E38] uppercase block mb-0.5">Bank / Wallet</label>
                                <select
                                  value={editTxData.paymentBank || ''}
                                  onChange={(e) => setEditTxData(prev => ({ ...prev, paymentBank: e.target.value }))}
                                  className="w-full px-2.5 py-1.5 bg-[#F5F7F0] border border-[#DDE5D0] rounded-xl text-xs font-bold"
                                >
                                  {banksList.map(b => (
                                    <option key={b} value={b}>{b}</option>
                                  ))}
                                </select>
                              </div>
                            )
                          )}
                        </div>

                        {activeHotel?.enablePaymentSerialNumber === true && editTxData.paymentMode === 'Online' && banksList.length > 0 && (
                          <div className="w-full">
                            <label className="text-[8px] font-black text-[#4A5E38] uppercase block mb-0.5">Bank / Wallet</label>
                            <select
                              value={editTxData.paymentBank || ''}
                              onChange={(e) => setEditTxData(prev => ({ ...prev, paymentBank: e.target.value }))}
                              className="w-full px-2.5 py-1.5 bg-[#F5F7F0] border border-[#DDE5D0] rounded-xl text-xs font-bold"
                            >
                              {banksList.map(b => (
                                <option key={b} value={b}>{b}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div className="flex gap-2 justify-end pt-1">
                          <button onClick={() => setEditingIdx(null)} className="px-3.5 py-1.5 text-xs font-bold text-[#7A8A6A] hover:bg-[#F0F3E8] rounded-xl border border-[#DDE5D0]">Cancel</button>
                          <button onClick={() => saveEditTx(idx)} className="px-3.5 py-1.5 text-xs font-black bg-[#84A63C] text-white rounded-xl shadow-sm hover:opacity-90">Save Changes</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center py-0.5">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            {activeHotel?.enablePaymentSerialNumber === true && (
                              <span className="text-[10px] font-black px-2 py-0.5 bg-[#EEF4E3] text-[#1A2E05] border border-[#D3E2BD] rounded-lg">
                                #{item.serialNumber || getAutoPaymentSerialNo(item, idx, bill, allBills)}
                              </span>
                            )}
                            <span className="text-sm sm:text-base font-black text-[#1A2E05]">₹{Number(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            <span className={`text-[9px] sm:text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${item.paymentMode === 'Online' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                item.paymentMode === 'Cash' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-purple-50 text-purple-700 border-purple-200'
                              }`}>
                              {item.paymentMode} {item.paymentBank ? `(${item.paymentBank})` : ''}
                            </span>
                            {hasExtras && (
                              item.paidFor === 'Food' || item.paidFor === 'Extras' ? (
                                <span className="text-[8px] font-black px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
                                  Extras
                                </span>
                              ) : (
                                <span className="text-[8px] font-black px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
                                  Room
                                </span>
                              )
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1 text-[9px] sm:text-[10px] font-bold text-[#7A8A6A] flex-wrap">
                            <Calendar size={11} className="text-[#84A63C]" /> <span>{item.date}</span>
                            <span className="mx-0.5 text-gray-300">•</span>
                            <Clock size={11} className="text-[#84A63C]" /> <span>{item.time}</span>
                          </div>
                        </div>

                        <div className="flex gap-1 items-center justify-end border-t border-gray-100 sm:border-t-0 pt-1.5 sm:pt-0">
                          <button onClick={() => generatePaymentReceipt(bill, { ...item, serialNumber: item.serialNumber || getAutoPaymentSerialNo(item, idx, bill, allBills) }, true)} className="p-1.5 text-[#7A8A6A] hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Preview Receipt"><Eye size={14} /></button>
                          <button onClick={() => generatePaymentReceipt(bill, { ...item, serialNumber: item.serialNumber || getAutoPaymentSerialNo(item, idx, bill, allBills) }, false)} className="p-1.5 text-[#7A8A6A] hover:text-green-600 hover:bg-green-50 rounded-lg transition-all" title="Download Receipt"><Download size={14} /></button>
                          {canEditThisItem ? (
                            <>
                              <button onClick={() => startEditTx(idx, item)} className="p-1.5 text-[#7A8A6A] hover:text-[#84A63C] hover:bg-[#F0F3E8] rounded-lg transition-all" title="Edit"><Edit size={14} /></button>
                              <button onClick={() => deleteTx(idx)} className="p-1.5 text-[#7A8A6A] hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" title="Delete"><Trash2 size={14} /></button>
                            </>
                          ) : (
                            <span className="text-[9px] font-bold text-[#7A8A6A]/60 italic px-1">
                              {isOldPayment ? "Past date payment locked" : "Payment locked"}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12 text-[#7A8A6A] font-bold text-xs space-y-1 bg-[#F9FAFA] border border-dashed border-[#DDE5D0] rounded-2xl">
                <div className="text-sm font-black text-[#1A2E05]">No transactions recorded yet</div>
                <div className="text-[11px] font-normal text-[#7A8A6A]">Record a new payment on the left to add a entry to this ledger.</div>
              </div>
            )}
          </div>

          <button
            onClick={onClose}
            className="md:hidden w-full mt-3 py-2 border border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 bg-red-50/20 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5"
          >
            <X size={14} /> Close Ledger
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default QuickPayModal;
