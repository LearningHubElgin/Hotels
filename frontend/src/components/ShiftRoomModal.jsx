import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowLeftRight, CheckCircle2, Loader2, Calendar, Clock } from 'lucide-react';
import api from '../services/api';
import { cleanRoomNumber } from '../utils/roomHelper';

const formatMoney = (val) => {
  const num = Number(val || 0);
  return num % 1 === 0
    ? num.toLocaleString('en-IN')
    : num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatTime12hr = (timeStr) => {
  if (!timeStr) return '';
  const str = String(timeStr).trim();
  if (str.toUpperCase().includes('AM') || str.toUpperCase().includes('PM')) {
    return str;
  }
  const parts = str.split(':');
  let hour = parseInt(parts[0], 10);
  const min = parts[1] ? parts[1].substring(0, 2) : '00';
  if (isNaN(hour)) return str;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${String(hour).padStart(2, '0')}:${min} ${ampm}`;
};

export const getShiftModalBreakdown = (roomToShift, activeShiftDate, activeShiftTime) => {
  if (!roomToShift || !roomToShift.booking) return [];
  const primaryB = roomToShift.booking;
  const groupList = (primaryB.groupBookings && primaryB.groupBookings.length > 0)
    ? primaryB.groupBookings
    : [primaryB];

  const formatShortWithTime = (dateVal, timeVal, defaultTime = '02:00 PM') => {
    if (!dateVal) return '';
    let day = '', month = '';
    if (typeof dateVal === 'string') {
      const parts = dateVal.split(/[/|-]/);
      if (parts.length === 3) {
        let p1 = parseInt(parts[0], 10), p2 = parseInt(parts[1], 10), p3 = parseInt(parts[2], 10);
        let dObj;
        if (p3 > 1000) dObj = new Date(p3, p2 - 1, p1);
        else if (p1 > 1000) dObj = new Date(p1, p2 - 1, p3);
        if (dObj && !isNaN(dObj.getTime())) {
          day = dObj.getDate().toString().padStart(2, '0');
          month = dObj.toLocaleString('en-US', { month: 'short' });
        }
      }
    }
    if (!day) {
      const d = new Date(dateVal);
      if (!isNaN(d.getTime())) {
        day = d.getDate().toString().padStart(2, '0');
        month = d.toLocaleString('en-US', { month: 'short' });
      }
    }
    const rawTime = timeVal || defaultTime;
    const formattedTime = rawTime ? formatTime12hr(rawTime) : '';
    return `${day} ${month}${formattedTime ? ` @ ${formattedTime}` : ''}`;
  };

  const allItems = [];

  groupList.forEach(b => {
    const checkInStr = b.checkInDate ? b.checkInDate.split('T')[0] : '';
    const checkOutStr = b.checkOutDate ? b.checkOutDate.split('T')[0] : '';
    if (!checkInStr || !checkOutStr) return;

    const cIn = new Date(checkInStr);
    const cOut = new Date(checkOutStr);
    const totalStayDays = Math.max(1, Math.ceil(Math.abs(cOut - cIn) / (1000 * 60 * 60 * 24)));

    let shiftDateStr = b.shiftDate || (b.updatedAt ? b.updatedAt.split('T')[0] : '');
    const todayStr = new Date().toISOString().split('T')[0];

    if (!shiftDateStr || shiftDateStr < checkInStr || shiftDateStr > checkOutStr) {
      if (todayStr > checkInStr && todayStr <= checkOutStr) shiftDateStr = todayStr;
      else shiftDateStr = new Date(cIn.getTime() + Math.max(1, Math.floor(totalStayDays / 2)) * 86400000).toISOString().split('T')[0];
    }

    let prevDays = 0;
    if (shiftDateStr > checkInStr) {
      prevDays = Math.min(totalStayDays - 1, Math.ceil(Math.abs(new Date(shiftDateStr) - cIn) / (1000 * 60 * 60 * 24)));
    }
    const curDays = Math.max(1, totalStayDays - prevDays);

    const prevRatesList = String(b.previousRoomRate || '').split(/→|->|,|>/).map(s => Number(s.trim())).filter(n => !isNaN(n));
    const defaultPrevRate = prevRatesList.length > 0
      ? prevRatesList[0]
      : (b.Room?.pricePerNight ? Number(b.Room.pricePerNight) : 0);
    const rawPrevStr = String(b.previousRoomNumber || '');
    const prevRooms = rawPrevStr.split(/→|->|,|>/).map(s => cleanRoomNumber(s.trim())).filter(Boolean);
    const curRoomNum = b.Room?.roomNumber || cleanRoomNumber(b.roomNumber) || 'Current';
    let roomTotalSum = Math.max(0, parseFloat(b.totalAmount || 0) - parseFloat(b.discount || 0));

    if (!b.previousRoomNumber || prevRooms.length === 0) {
      const startStr = formatShortWithTime(b.checkInDate, b.checkInTime, '12:00 PM');
      const endStr = formatShortWithTime(b.checkOutDate, b.checkOutTime, '11:00 AM');
      allItems.push({
        roomNumber: curRoomNum,
        days: totalStayDays,
        rate: totalStayDays > 0 ? (roomTotalSum / totalStayDays) : Number(b.Room?.pricePerNight || 0),
        total: roomTotalSum,
        isCurrent: true,
        isSameDayShift: false,
        startStr,
        endStr,
        dateRangeStr: `${startStr} → ${endStr}`
      });
      return;
    }

    const allRoomsInOrder = [...prevRooms];
    if (curRoomNum && allRoomsInOrder[allRoomsInOrder.length - 1] !== curRoomNum) {
      allRoomsInOrder.push(curRoomNum);
    }

    const actualShiftTime = b.shiftTime
      || (b.updatedAt ? new Date(b.updatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '12:00 PM');

    const items = [];
    const rawShiftTimesStr = b.shiftTime || b.roomShiftTimes || '';
    const shiftTimesList = String(rawShiftTimesStr).split(/→|->|,|>/).map(s => s.trim()).filter(Boolean);
    const fallbackShiftTime = shiftTimesList.length > 0 ? shiftTimesList[shiftTimesList.length - 1] : actualShiftTime;

    allRoomsInOrder.forEach((rmNum, idx) => {
      const isCurrent = idx === allRoomsInOrder.length - 1;
      let days = 0;
      let startStr = '', endStr = '';

      if (idx === 0) {
        days = prevDays;
        startStr = formatShortWithTime(b.checkInDate, b.checkInTime, '12:00 PM');
        const firstShiftT = shiftTimesList[0] || fallbackShiftTime;
        endStr = firstShiftT ? formatShortWithTime(shiftDateStr, firstShiftT, '02:00 PM') : '';
      } else {
        const prevStepTime = shiftTimesList[idx - 1] || shiftTimesList[0] || fallbackShiftTime;
        startStr = formatShortWithTime(shiftDateStr, prevStepTime, '02:00 PM');

        if (!isCurrent) {
          days = 0;
          const thisStepTime = shiftTimesList[idx] || prevStepTime;
          endStr = formatShortWithTime(shiftDateStr, thisStepTime, '02:00 PM');
        } else {
          days = curDays;
          const currentRoomEndT = activeShiftTime ? formatTime12hr(activeShiftTime) : (shiftTimesList[idx] || formatTime12hr(b.checkOutTime) || '11:00 AM');
          const currentRoomEndD = activeShiftDate || shiftDateStr;
          endStr = formatShortWithTime(currentRoomEndD, currentRoomEndT, '11:00 AM');
        }
      }

      const isSameDayShift = (days === 0);
      let rate = 0;
      let total = 0;

      if (isSameDayShift) {
        days = 0;
        const pRate = prevRatesList[idx] !== undefined && !isNaN(prevRatesList[idx]) ? prevRatesList[idx] : 0;
        rate = pRate;
        total = pRate;
      } else if (!isCurrent) {
        rate = prevRatesList[idx] !== undefined && !isNaN(prevRatesList[idx]) ? prevRatesList[idx] : defaultPrevRate;
        total = days * rate;
      }

      const dateRangeStr = (startStr && endStr)
        ? `${startStr} ──> ${endStr}`
        : (startStr || endStr);

      items.push({
        roomNumber: rmNum,
        days,
        rate,
        total,
        isCurrent,
        isSameDayShift,
        startStr,
        endStr,
        dateRangeStr
      });
    });

    const prevTotalSum = items.filter(it => !it.isCurrent).reduce((sum, it) => sum + it.total, 0);
    const curIdx = items.findIndex(it => it.isCurrent);
    if (curIdx !== -1) {
      const curDaysCount = items[curIdx].days;
      const calcRem = roomTotalSum - prevTotalSum;
      let curRate = (curDaysCount > 0 && calcRem > 0)
        ? (calcRem / curDaysCount)
        : (Number(b.Room?.pricePerNight || 0) || defaultPrevRate);
      let curTotal = curDaysCount * curRate;

      if (curTotal === 0 && roomTotalSum > prevTotalSum) {
        curTotal = roomTotalSum - prevTotalSum;
        curRate = curDaysCount > 0 ? (curTotal / curDaysCount) : curRate;
      }

      items[curIdx].total = curTotal;
      items[curIdx].rate = curRate;
    }

    allItems.push(...items);
  });

  return allItems;
};

const ShiftRoomModal = ({
  isOpen,
  onClose,
  roomToShift,
  roomsByFloor = [],
  onShiftSuccess
}) => {
  const [selectedNewRoomId, setSelectedNewRoomId] = useState('');
  const [newRoomPriceInput, setNewRoomPriceInput] = useState('');
  const [shiftDate, setShiftDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [shiftTime, setShiftTime] = useState(() => {
    const today = new Date();
    const hh = String(today.getHours()).padStart(2, '0');
    const mm = String(today.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  });
  const [sameDayChargeOption, setSameDayChargeOption] = useState('no_charge');
  const [shiftingLoading, setShiftingLoading] = useState(false);
  const [internalRooms, setInternalRooms] = useState([]);

  useEffect(() => {
    if (isOpen && roomToShift) {
      setSelectedNewRoomId('');
      setNewRoomPriceInput('');
      setSameDayChargeOption(roomToShift.booking?.sameDayChargeOption || 'no_charge');
      const today = new Date();
      setShiftDate(today.toISOString().split('T')[0]);
      const hh = String(today.getHours()).padStart(2, '0');
      const mm = String(today.getMinutes()).padStart(2, '0');
      setShiftTime(`${hh}:${mm}`);
    }
  }, [isOpen, roomToShift]);

  useEffect(() => {
    if (isOpen && (!roomsByFloor || roomsByFloor.length === 0)) {
      api.get('/rooms').then(res => {
        if (res.data?.data) {
          setInternalRooms(res.data.data);
        }
      }).catch(err => console.error('Error fetching rooms in ShiftRoomModal:', err));
    }
  }, [isOpen, roomsByFloor]);

  if (!isOpen || !roomToShift) return null;

  const allAvailableRooms = (roomsByFloor && roomsByFloor.length > 0)
    ? roomsByFloor.flatMap(f => f.rooms || [])
    : internalRooms;
  const breakdown = getShiftModalBreakdown(roomToShift, shiftDate, shiftTime);

  const handleConfirmRoomShift = async () => {
    if (!roomToShift || !selectedNewRoomId) return;
    const targetBooking = roomToShift.booking;
    if (!targetBooking) {
      alert("Could not find active booking record for this room.");
      return;
    }

    setShiftingLoading(true);
    try {
      const oldRoomId = roomToShift.room?.id;
      const newRoomId = Number(selectedNewRoomId);
      const currentStep = breakdown ? breakdown.find(item => item.isCurrent) : null;
      const actualOldRate = currentStep && currentStep.rate !== undefined && currentStep.rate !== null && !isNaN(Number(currentStep.rate))
        ? Number(currentStep.rate)
        : Number(roomToShift.room?.pricePerNight || 0);

      const currentPrevNumStr = targetBooking.previousRoomNumber;
      const oldRoomNumStr = String(roomToShift.room?.roomNumber || '');
      let fullPrevNum = oldRoomNumStr;
      if (currentPrevNumStr) {
        const parts = currentPrevNumStr.split(/→|->|,|>/).map(s => s.trim()).filter(Boolean);
        if (parts[parts.length - 1] !== oldRoomNumStr) {
          fullPrevNum = `${currentPrevNumStr} → ${oldRoomNumStr}`;
        } else {
          fullPrevNum = currentPrevNumStr;
        }
      }

      await api.put(`/bookings/${targetBooking.id}`, {
        roomId: newRoomId,
        previousRoomId: oldRoomId,
        previousRoomNumber: fullPrevNum,
        previousRoomRate: actualOldRate,
        previousRoomType: roomToShift.room?.type || roomToShift.room?.roomType,
        newRoomPrice: newRoomPriceInput !== '' ? Number(newRoomPriceInput) : undefined,
        shiftDate: shiftDate || new Date().toISOString().split('T')[0],
        shiftTime: formatTime12hr(shiftTime),
        sameDayChargeOption
      });

      if (onShiftSuccess) {
        await onShiftSuccess();
      }
      onClose();
    } catch (error) {
      console.error('Error shifting room:', error);
      alert(error.response?.data?.message || 'Failed to shift room');
    } finally {
      setShiftingLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 md:p-6 animate-fade-in overflow-y-auto">
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-[#DDE5D0] shadow-2xl max-w-4xl w-full p-3.5 sm:p-5 lg:p-6 space-y-3 sm:space-y-4 animate-slide-up relative my-auto max-h-[96vh] sm:max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#DDE5D0] pb-2.5 sm:pb-3 shrink-0">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2 bg-[#84A63C]/10 text-[#84A63C] rounded-xl">
              <ArrowLeftRight size={18} className="sm:w-5 sm:h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-[#1A2E05]">Shift Room</h3>
              <p className="text-[11px] sm:text-xs font-semibold text-[#4A5E38]">Change assigned room for active guest</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 sm:p-2 text-[#7A8A6A] hover:text-[#1A2E05] hover:bg-[#F0F3E8] rounded-xl transition-all cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* 2-Column Scrollable Form Body */}
        <div className="overflow-y-auto pr-0.5 flex-1 custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 lg:gap-5 items-start">
            {/* LEFT COLUMN: Current Stay Details & Room Selection */}
            <div className="space-y-2.5 sm:space-y-3">
              {/* Guest & Room Summary */}
              <div className="bg-[#F5F7F0] p-3 sm:p-3.5 rounded-xl sm:rounded-2xl border border-[#DDE5D0] space-y-2">
                <div className="flex justify-between items-center text-xs sm:text-sm">
                  <span className="font-bold text-[#4A5E38]">Guest Name:</span>
                  <span className="font-black text-[#1A2E05]">
                    {roomToShift.booking?.guestName || roomToShift.room.guestName || 'Active Guest'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs sm:text-sm">
                  <span className="font-bold text-[#4A5E38]">Current Room:</span>
                  <span className="font-black text-[#1A2E05] px-2.5 py-0.5 bg-white rounded-lg border border-[#DDE5D0] shadow-2xs text-xs sm:text-sm">
                    Room {roomToShift.room.roomNumber} ({roomToShift.room.type || 'Standard'})
                  </span>
                </div>

                {/* Stay & Billing Breakdown per Room */}
                {breakdown && breakdown.length > 0 && (
                  <div className="pt-2 border-t border-[#DDE5D0]/60 space-y-1.5">
                    <span className="text-[10px] font-black uppercase text-[#4A5E38] tracking-wider block">
                      Stay & Billing Breakdown:
                    </span>
                    <div className="space-y-1.5 max-h-36 sm:max-h-44 overflow-y-auto pr-1 custom-scrollbar">
                      {breakdown.map((item, idx) => {
                        if (item.isSameDayShift || item.days === 0) {
                          return (
                            <div key={idx} className="bg-white p-2 sm:p-2.5 rounded-xl border border-amber-200/80 flex items-center justify-between text-xs shadow-2xs gap-2">
                              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 flex-wrap sm:flex-nowrap">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-200 shrink-0 whitespace-nowrap">
                                  Room {item.roomNumber} (Prev)
                                </span>
                                <span className="text-[10px] sm:text-[11px] font-semibold text-gray-600 truncate">
                                  {item.dateRangeStr || item.startStr}
                                </span>
                                <span className="text-[9px] text-amber-800 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200 font-bold shrink-0 whitespace-nowrap">
                                  Same-Day Shift
                                </span>
                              </div>
                              <span className="font-extrabold text-gray-800 text-xs shrink-0 whitespace-nowrap">
                                {item.total > 0 ? `₹${formatMoney(item.total)}` : '₹0.00 (No Charge)'}
                              </span>
                            </div>
                          );
                        }

                        return (
                          <div key={idx} className="bg-white p-2 sm:p-2.5 rounded-xl border border-[#DDE5D0] flex items-center justify-between gap-2 shadow-2xs">
                            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 flex-wrap sm:flex-nowrap">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold shrink-0 whitespace-nowrap ${item.isCurrent
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                    : 'bg-amber-100 text-amber-900 border border-amber-200'
                                  }`}
                              >
                                Room {item.roomNumber} ({item.isCurrent ? 'Current' : 'Prev'})
                              </span>
                              {item.dateRangeStr && (
                                <span className="text-[10px] sm:text-[11px] font-semibold text-[#4A5E38] truncate">
                                  {item.dateRangeStr} ({item.days} {item.days === 1 ? 'Night' : 'Nights'})
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs shrink-0 whitespace-nowrap">
                              <span className="text-[10px] sm:text-[11px] font-semibold text-[#7A8A6A]">₹{formatMoney(item.rate)}/n</span>
                              <span className="font-extrabold text-[#1A2E05]">₹{formatMoney(item.total)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Select New Room */}
              <div className="space-y-1 bg-[#FBFDF8] p-2.5 sm:p-3 rounded-xl sm:rounded-2xl border border-[#DDE5D0]">
                <label className="text-[10px] sm:text-xs font-black text-[#4A5E38] uppercase tracking-wider block">
                  Select New Room *
                </label>
                <select
                  value={selectedNewRoomId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedNewRoomId(val);
                    const selRoom = allAvailableRooms.find(r => r.id === Number(val));
                    if (selRoom) {
                      setNewRoomPriceInput(String(selRoom.pricePerNight || ''));
                    }
                  }}
                  className="w-full px-3 py-2 sm:px-3.5 sm:py-2.5 bg-white border border-[#DDE5D0] rounded-xl text-xs sm:text-sm font-bold text-[#1A2E05] focus:outline-none focus:border-[#84A63C] cursor-pointer shadow-2xs"
                >
                  <option value="">-- Select Available Room --</option>
                  {allAvailableRooms.map(r => (
                    <option
                      key={r.id}
                      value={r.id}
                      disabled={r.id === roomToShift.room.id || r.status !== 'available'}
                    >
                      Room {r.roomNumber} - {r.type} (₹{r.pricePerNight}/night){' '}
                      {r.id === roomToShift.room.id
                        ? '🔵 Current Room'
                        : r.status === 'available'
                          ? '✅ Available'
                          : `🔴 ${r.status}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* RIGHT COLUMN: Shift Date/Time, Pricing & Billing Options */}
            <div className="space-y-2.5 sm:space-y-3">
              {/* Shift Date & Time Selection (Side-by-side even on mobile) */}
              <div className="bg-[#FBFDF8] p-2.5 sm:p-3 rounded-xl sm:rounded-2xl border border-[#DDE5D0] space-y-1.5">
                <span className="text-[10px] sm:text-xs font-black text-[#4A5E38] uppercase tracking-wider block">
                  Shift Date &amp; Time *
                </span>
                <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                  {/* Shift Date Card */}
                  <div className="bg-white border border-[#DDE5D0] rounded-xl p-2 sm:p-2.5 shadow-2xs focus-within:border-[#84A63C] focus-within:ring-2 focus-within:ring-[#84A63C]/15 transition-all">
                    <div className="flex items-center gap-1 mb-1 text-[#4A5E38]">
                      <Calendar size={13} className="text-[#84A63C] shrink-0" />
                      <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-[#4A5E38]">Shift Date</span>
                    </div>
                    <input
                      type="date"
                      value={shiftDate}
                      onChange={(e) => setShiftDate(e.target.value)}
                      className="w-full bg-transparent text-xs sm:text-sm font-bold text-[#1A2E05] focus:outline-none p-0 border-none cursor-pointer"
                    />
                  </div>

                  {/* Shift Time Card */}
                  <div className="bg-white border border-[#DDE5D0] rounded-xl p-2 sm:p-2.5 shadow-2xs focus-within:border-[#84A63C] focus-within:ring-2 focus-within:ring-[#84A63C]/15 transition-all">
                    <div className="flex items-center gap-1 mb-1 text-[#4A5E38]">
                      <Clock size={13} className="text-[#84A63C] shrink-0" />
                      <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-[#4A5E38]">Shift Time</span>
                    </div>
                    <input
                      type="time"
                      value={shiftTime}
                      onChange={(e) => setShiftTime(e.target.value)}
                      className="w-full bg-transparent text-xs sm:text-sm font-bold text-[#1A2E05] focus:outline-none p-0 border-none cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* New Room Price */}
              <div className="bg-[#FBFDF8] p-2.5 sm:p-3 rounded-xl sm:rounded-2xl border border-[#DDE5D0] space-y-1">
                <label className="text-[10px] sm:text-xs font-black text-[#4A5E38] uppercase tracking-wider block">
                  New Room Price (₹ / Night) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={newRoomPriceInput}
                  onChange={(e) => setNewRoomPriceInput(e.target.value)}
                  placeholder={selectedNewRoomId ? "Enter price per night" : "Select a new room first"}
                  className="w-full px-3 py-2 sm:px-3.5 sm:py-2.5 bg-white border border-[#DDE5D0] rounded-xl text-xs sm:text-sm font-bold text-[#1A2E05] focus:outline-none focus:border-[#84A63C] shadow-2xs"
                />
              </div>

              {/* Previous Room Billing Option */}
              <div className="bg-[#FBFDF8] p-2.5 sm:p-3 rounded-xl sm:rounded-2xl border border-[#DDE5D0] space-y-1.5">
                <label className="text-[10px] sm:text-xs font-black text-[#4A5E38] uppercase tracking-wider block">
                  Previous Room Billing Option (Shift Day) *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSameDayChargeOption('no_charge')}
                    className={`p-2 sm:p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between gap-0.5 cursor-pointer ${sameDayChargeOption === 'no_charge'
                        ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-500/20 text-emerald-950 font-bold shadow-xs'
                        : 'bg-white border-[#DDE5D0] text-gray-700 hover:bg-[#F5F7F0]'
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-xs text-emerald-900">🆓 No Charge</span>
                      {sameDayChargeOption === 'no_charge' && (
                        <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                      )}
                    </div>
                    <span className="text-[10px] text-gray-500 font-semibold leading-tight">
                      Previous room is <strong>₹0.00</strong> for shift day.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSameDayChargeOption('charge_previous')}
                    className={`p-2 sm:p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between gap-0.5 cursor-pointer ${sameDayChargeOption === 'charge_previous'
                        ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-500/20 text-emerald-950 font-bold shadow-xs'
                        : 'bg-white border-[#DDE5D0] text-gray-700 hover:bg-[#F5F7F0]'
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-xs text-emerald-900">💵 Charge Rate</span>
                      {sameDayChargeOption === 'charge_previous' && (
                        <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                      )}
                    </div>
                    <span className="text-[10px] text-gray-500 font-semibold leading-tight">
                      Charge previous rate (<strong>₹{roomToShift?.room?.pricePerNight || '0'}</strong>).
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 sm:gap-3 pt-2 sm:pt-2.5 border-t border-[#DDE5D0] shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 sm:px-5 sm:py-2.5 border border-[#DDE5D0] text-[#4A5E38] hover:bg-[#F0F3E8] rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selectedNewRoomId || Number(selectedNewRoomId) === roomToShift.room.id || shiftingLoading}
            onClick={handleConfirmRoomShift}
            className="px-4 py-2 sm:px-6 sm:py-2.5 bg-[#84A63C] text-white rounded-xl text-xs font-black hover:bg-[#6c8a2f] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 sm:gap-2 shadow-sm cursor-pointer"
          >
            {shiftingLoading ? <Loader2 size={13} className="animate-spin" /> : <ArrowLeftRight size={13} />}
            <span>Confirm Room Shift</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ShiftRoomModal;
