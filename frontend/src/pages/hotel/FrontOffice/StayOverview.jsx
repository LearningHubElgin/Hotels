import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, Search, X, User, Phone, Calendar, Users as UsersIcon,
  CheckCircle2, AlertTriangle, Info, CreditCard, MapPin, Clock, ChevronRight,
  Layers, Loader2, Globe, Mail, Landmark, Banknote, Bed, UserMinus, LayoutGrid, FileText, Trash2, Edit, Download, LogOut, MoreVertical,
  Wrench, RefreshCw, ArrowLeftRight
} from 'lucide-react';
import api from '../../../services/api';
import { generateCheckInVoucher } from '../../../utils/pdfGenerator';
import AddGuestModal from '../../../components/AddGuestModal';
import GuestDetailModal from '../../../components/GuestDetailModal';
import CheckoutConfirmModal from '../../../components/CheckoutConfirmModal';
import EarlyCheckinWarningModal from '../../../components/EarlyCheckinWarningModal';
import QuickCheckInModal from '../../../components/QuickCheckInModal';
import { useAuth } from '../../../context/AuthContext';
import { cleanRoomNumber } from '../../../utils/roomHelper';



const isTruthy = (v) => v === true || v === 1 || v === '1' || v === 'true';

const formatCutoffTimeStr = (timeStr) => {
  if (!timeStr) return '11:30 AM';
  const clean = String(timeStr).trim();
  if (clean.toUpperCase().includes('AM') || clean.toUpperCase().includes('PM')) {
    return clean;
  }
  const parts = clean.split(':');
  if (parts.length < 2) return clean;
  let h = parseInt(parts[0], 10);
  let m = parseInt(parts[1], 10);
  if (isNaN(h)) return clean;
  if (isNaN(m)) m = 0;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  h = h ? h : 12;
  const minutesStr = m < 10 ? '0' + m : m;
  return `${h}:${minutesStr} ${ampm}`;
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

const formatMoney = (val) => {
  const num = Number(val || 0);
  return num % 1 === 0
    ? num.toLocaleString('en-IN')
    : num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const checkIfMultipleRoom = (room, activeBookings) => {
  if (room.status !== 'occupied') return false;
  const booking = activeBookings.find(b => b.roomId === room.id || (b.groupBookings && b.groupBookings.some(gb => gb.roomId === room.id)));
  return !!(booking && booking.groupBookings && booking.groupBookings.length > 1);
};

const getActiveGuestName = (room, activeBookings) => {
  if (room.status !== 'occupied') return null;
  const booking = activeBookings.find(b => b.roomId === room.id || (b.groupBookings && b.groupBookings.some(gb => gb.roomId === room.id)));
  return booking ? booking.guestName : null;
};

const getRoomCardExtraAmount = (room, activeBookings) => {
  if (room.status !== 'occupied') return 0;
  const booking = activeBookings.find(b => b.roomId === room.id || (b.groupBookings && b.groupBookings.some(gb => gb.roomId === room.id)));
  if (!booking) return 0;

  const foodCharges = Number(booking.foodCharges || 0);
  const extraCharges = Number(booking.extraCharges || 0);
  return foodCharges + extraCharges;
};

const computeBookingBaseAmount = (booking, room) => {
  if (!booking) return 0;

  const groupList = (booking.groupBookings && booking.groupBookings.length > 0)
    ? booking.groupBookings
    : [booking];

  return groupList.reduce((sum, gb) => {
    let amt = Number(gb.totalAmount || 0);

    if (amt === 0 && gb.previousRoomNumber) {
      const checkInStr = gb.checkInDate ? gb.checkInDate.split('T')[0] : '';
      const checkOutStr = gb.checkOutDate ? gb.checkOutDate.split('T')[0] : '';
      let shiftDateStr = gb.shiftDate || (gb.updatedAt ? gb.updatedAt.split('T')[0] : '');
      if (shiftDateStr > checkInStr) {
        const cIn = new Date(checkInStr);
        const totalDays = Math.max(1, Math.ceil(Math.abs(new Date(checkOutStr) - cIn) / (1000 * 60 * 60 * 24)));
        const prevDays = Math.min(totalDays - 1, Math.ceil(Math.abs(new Date(shiftDateStr) - cIn) / (1000 * 60 * 60 * 24)));
        const prevRatesList = String(gb.previousRoomRate || '').split(/→|->|,|>/).map(s => Number(s.trim())).filter(n => !isNaN(n));
        const pRate = prevRatesList[0] || (gb.Room?.pricePerNight ? Number(gb.Room.pricePerNight) : 0);
        const prevTotal = pRate * prevDays;
        let curPrice = Number(gb.Room?.pricePerNight || pRate);
        if (gb.gstOption === 'inclusive' && Number(gb.gstRate || 0) > 0) {
          curPrice = Math.round((curPrice / (1 + Number(gb.gstRate) / 100)) * 100) / 100;
        }
        amt = prevTotal + (totalDays - prevDays) * curPrice;
      }
    } else if (amt === 0 && (gb.Room?.pricePerNight || room?.pricePerNight)) {
      let rate = Number(gb.Room?.pricePerNight || room?.pricePerNight || 0);
      if (gb.gstOption === 'inclusive' && Number(gb.gstRate || 0) > 0) {
        rate = Math.round((rate / (1 + Number(gb.gstRate) / 100)) * 100) / 100;
      }
      const cIn = gb.checkInDate ? new Date(gb.checkInDate.split('T')[0]) : null;
      const cOut = gb.checkOutDate ? new Date(gb.checkOutDate.split('T')[0]) : null;
      const days = (cIn && cOut) ? Math.max(1, Math.ceil(Math.abs(cOut - cIn) / (1000 * 60 * 60 * 24))) : 1;
      amt = rate * days;
    }

    return sum + amt;
  }, 0);
};

const getShiftModalBreakdown = (roomToShift) => {
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

    allRoomsInOrder.forEach((rmNum, idx) => {
      const isCurrent = idx === allRoomsInOrder.length - 1;
      let days = 0;
      let startStr = '', endStr = '';

      if (idx === 0) {
        days = prevDays;
        startStr = formatShortWithTime(b.checkInDate, b.checkInTime, '12:00 PM');
        const firstShiftT = shiftTimesList[0] || actualShiftTime;
        endStr = firstShiftT ? formatShortWithTime(shiftDateStr, firstShiftT, '02:00 PM') : '';
      } else {
        const prevStepTime = shiftTimesList[idx - 1] || actualShiftTime;
        startStr = formatShortWithTime(shiftDateStr, prevStepTime, '02:00 PM');

        if (!isCurrent) {
          days = 0;
          const thisStepTime = shiftTimesList[idx] || actualShiftTime;
          endStr = formatShortWithTime(shiftDateStr, thisStepTime, '02:00 PM');
        } else {
          days = curDays;
          endStr = formatShortWithTime(b.checkOutDate, b.checkOutTime, '11:00 AM');
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

      const dateRangeStr = (startStr && endStr && startStr !== endStr)
        ? `${startStr} ──> ${endStr}`
        : startStr;

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

const getRoomCardBookingTotal = (room, activeBookings, activeHotel) => {
  if (room.status !== 'occupied') return null;
  const booking = activeBookings.find(b => b.roomId === room.id || (b.groupBookings && b.groupBookings.some(gb => gb.roomId === room.id)));
  if (!booking) return null;

  let baseAmount = 0;
  const groupList = (booking.groupBookings && booking.groupBookings.length > 0) ? booking.groupBookings : [booking];

  groupList.forEach(gb => {
    let gbTotal = 0;
    if (gb.previousRoomNumber) {
      const bd = getShiftModalBreakdown({ booking: gb });
      gbTotal = bd.reduce((sum, it) => sum + Number(it.total || 0), 0);
    } else {
      gbTotal = Number(gb.totalAmount || 0);
    }
    baseAmount += gbTotal;
  });

  const isGroup = booking.groupBookings && booking.groupBookings.length > 0;
  const discount = isGroup
    ? booking.groupBookings.reduce((sum, gb) => sum + Number(gb.discount || 0), 0)
    : Number(booking.discount || 0);

  const netBase = Math.max(0, baseAmount - discount);
  const gstOption = booking.gstOption || 'none';
  const gstRate = Number(booking.gstRate !== undefined && booking.gstRate !== null ? booking.gstRate : (activeHotel?.defaultGstRate !== undefined ? Number(activeHotel.defaultGstRate) : 12));

  let total = netBase;
  if (gstOption === 'exclusive') {
    const gstAmount = gstRate > 0 ? Math.round((netBase * (gstRate / 100)) * 100) / 100 : 0;
    total = netBase + gstAmount;
  } else {
    total = netBase;
  }

  const foodCharges = Number(booking.foodCharges || 0);
  const extraCharges = Number(booking.extraCharges || 0);
  total += (foodCharges + extraCharges);

  return Math.round(total * 100) / 100;
};

const getRoomCardPendingAmount = (room, activeBookings, activeHotel) => {
  if (room.status !== 'occupied') return null;
  const booking = activeBookings.find(b => b.roomId === room.id || (b.groupBookings && b.groupBookings.some(gb => gb.roomId === room.id)));
  if (!booking) return null;

  let baseAmount = 0;
  const groupList = (booking.groupBookings && booking.groupBookings.length > 0) ? booking.groupBookings : [booking];

  groupList.forEach(gb => {
    let gbTotal = 0;
    if (gb.previousRoomNumber) {
      const bd = getShiftModalBreakdown({ booking: gb });
      gbTotal = bd.reduce((sum, it) => sum + Number(it.total || 0), 0);
    } else {
      gbTotal = Number(gb.totalAmount || 0);
    }
    baseAmount += gbTotal;
  });

  const isGroup = booking.groupBookings && booking.groupBookings.length > 0;
  const discount = isGroup
    ? booking.groupBookings.reduce((sum, gb) => sum + Number(gb.discount || 0), 0)
    : Number(booking.discount || 0);

  let amountPaid = 0;
  if (isGroup) {
    amountPaid = booking.groupBookings.reduce((sum, gb) => sum + Number(gb.amountPaid || 0), 0);
  } else {
    amountPaid = Number(booking.amountPaid || 0);
  }

  const netBase = Math.max(0, baseAmount - discount);
  const gstOption = booking.gstOption || 'none';
  const gstRate = Number(booking.gstRate !== undefined && booking.gstRate !== null ? booking.gstRate : (activeHotel?.defaultGstRate !== undefined ? Number(activeHotel.defaultGstRate) : 12));

  let total = netBase;
  if (gstOption === 'exclusive') {
    const gstAmount = gstRate > 0 ? Math.round((netBase * (gstRate / 100)) * 100) / 100 : 0;
    total = netBase + gstAmount;
  } else {
    total = netBase;
  }

  const foodCharges = Number(booking.foodCharges || 0);
  const extraCharges = Number(booking.extraCharges || 0);
  total += (foodCharges + extraCharges);

  return Math.max(0, Math.round((total - amountPaid) * 100) / 100);
};

const StatCard = ({ label, value, icon: Icon, color }) => (
  <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#DDE5D0] shadow-md shadow-[#84A63C]/5 flex items-center gap-4 group hover:shadow-md transition-all duration-500">
    <div className={`p-3 bg-[#F0F3E8] rounded-xl ${color} group-hover:scale-110 transition-transform`}>
      <Icon size={20} className="w-5 h-5" strokeWidth={2.5} />
    </div>
    <div>
      <p className="text-[10px] sm:text-xs font-bold text-[#4A5E38] uppercase tracking-wider">{label}</p>
      <p className="text-lg sm:text-xl font-black text-[#1A2E05] tracking-tight mt-0.5">{value}</p>
    </div>
  </div>
);

const DEFAULT_ROOM_CARD_COLORS = {
  occupiedBg: '#1C2B12',
  occupiedText: '#FFFFFF',
  multipleBg: '#115E59',
  multipleText: '#FFFFFF',
  availableBg: '#FFFFFF',
  availableText: '#1A2E05',
  reservedBg: '#EFF6FF',
  reservedText: '#1E3A8A',
  cleaningBg: '#E0F2FE',
  cleaningText: '#0284C7',
  maintenanceBg: '#FEF3C7',
  maintenanceText: '#D97706'
};

const getCustomRoomColors = (activeHotel) => {
  if (!activeHotel?.roomCardColors) return DEFAULT_ROOM_CARD_COLORS;
  if (typeof activeHotel.roomCardColors === 'object') return { ...DEFAULT_ROOM_CARD_COLORS, ...activeHotel.roomCardColors };
  try {
    return { ...DEFAULT_ROOM_CARD_COLORS, ...JSON.parse(activeHotel.roomCardColors) };
  } catch (e) {
    return DEFAULT_ROOM_CARD_COLORS;
  }
};

const RoomCard = ({ room, onClick, onDownload, onDelete, onEdit, onUpdateStatus, onShiftRoom, bookingTotal, pendingAmount, extraAmount, isMultipleRoom, todayReservation, activeGuestName }) => {
  const { activeHotel } = useAuth();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = React.useRef(null);

  useEffect(() => {
    if (!showMenu) return;
    const closeMenu = (e) => {
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      setShowMenu(false);
    };
    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
  }, [showMenu]);

  const displayGuestName = activeGuestName || room.guestName;
  const customColors = getCustomRoomColors(activeHotel);

  const getCustomCardStyle = (status) => {
    if (todayReservation) {
      return {
        backgroundColor: customColors.reservedBg,
        color: customColors.reservedText,
        borderColor: customColors.reservedText ? customColors.reservedText + '40' : '#93C5FD'
      };
    }
    switch (status) {
      case 'available':
        return {
          backgroundColor: customColors.availableBg,
          color: customColors.availableText,
          borderColor: '#DDE5D0'
        };
      case 'occupied':
        return {
          backgroundColor: isMultipleRoom ? (customColors.multipleBg || '#115E59') : customColors.occupiedBg,
          color: isMultipleRoom ? (customColors.multipleText || '#FFFFFF') : customColors.occupiedText,
          borderColor: 'transparent'
        };
      case 'maintenance':
        return {
          backgroundColor: customColors.maintenanceBg,
          color: customColors.maintenanceText,
          borderColor: customColors.maintenanceText ? customColors.maintenanceText + '40' : '#FCD34D'
        };
      case 'cleaning':
        return {
          backgroundColor: customColors.cleaningBg,
          color: customColors.cleaningText,
          borderColor: customColors.cleaningText ? customColors.cleaningText + '40' : '#93C5FD'
        };
      default:
        return {
          backgroundColor: customColors.availableBg,
          color: customColors.availableText,
          borderColor: '#DDE5D0'
        };
    }
  };

  const cardStyle = getCustomCardStyle(room.status);

  return (
    <div className="relative group">
      {/* Room card */}
      <button
        onClick={() => onClick(room)}
        style={cardStyle}
        className="w-full h-28 sm:h-40 rounded-lg sm:rounded-xl border-2 transition-all duration-500 flex flex-col items-center justify-center gap-1 sm:gap-2 overflow-hidden shadow-sm hover:shadow-md"
      >
        <span className="text-xl sm:text-3xl font-bold tracking-tight transition-transform group-hover:scale-110 duration-500" style={{ color: cardStyle.color }}>{room.roomNumber}</span>
        {activeHotel?.hasRoomType !== false && (
          <span className="text-[8px] sm:text-[9px] uppercase font-extrabold tracking-widest opacity-70" style={{ color: cardStyle.color }}>
            {room.type}
          </span>
        )}
        <div className="flex flex-col items-center gap-1 mt-1">
          {/* Price displayed where Room Type used to be */}
          <span className="text-[10px] sm:text-xs font-bold tracking-widest px-2 py-0.5 sm:px-3 sm:py-1 rounded-full bg-black/10 text-current font-extrabold" style={{ color: cardStyle.color }}>
            ₹{room.status === 'occupied' && bookingTotal != null ? Number(bookingTotal).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : room.pricePerNight}
          </span>
          {room.status === 'occupied' && pendingAmount != null && (
            pendingAmount > 0 ? (() => {
              const extras = Number(extraAmount || 0);
              const roomDueOnly = Math.max(0, Number(pendingAmount) - extras);
              return (
                <span className="bg-red-500 text-white font-black text-[9px] sm:text-[10px] px-2 py-0.5 rounded-full shadow-md animate-pulse tracking-wide">
                  Due: ₹{roomDueOnly.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{extras > 0 ? ` +${extras.toFixed(2)}` : ''}
                </span>
              );
            })() : (
              <span className="bg-emerald-600 text-white font-black text-[9px] sm:text-[10px] px-2.5 py-0.5 rounded-full shadow-md tracking-wide flex items-center gap-1">
                <CheckCircle2 size={11} strokeWidth={3} className="shrink-0" />
                <span>Paid</span>
              </span>
            )
          )}
        </div>
        <div className="absolute inset-x-0 bottom-0 py-1 sm:py-2 border-t border-black/10 bg-black/5 transition-all duration-500">
          <p className="text-[8px] sm:text-xs font-bold truncate px-2 sm:px-4 flex items-center justify-center gap-1" style={{ color: cardStyle.color }}>
            {room.status === 'cleaning' && <RefreshCw size={10} className="sm:w-3 sm:h-3 animate-spin shrink-0" />}
            {room.status === 'maintenance' && <Wrench size={10} className="sm:w-3 sm:h-3 animate-pulse shrink-0" />}
            <span>
              {room.status === 'occupied'
                ? (displayGuestName || 'Occupied')
                : (todayReservation
                  ? `Reserved: ${todayReservation.guestName}`
                  : (room.status ? room.status.charAt(0).toUpperCase() + room.status.slice(1) : 'Available'))
              }
            </span>
          </p>
        </div>
      </button>

      {/* Download button for occupied rooms - stays at the top-left of the card */}
      {room.status === 'occupied' && (
        <button
          onClick={(e) => { e.stopPropagation(); onDownload(room.id); }}
          style={{ color: cardStyle.color }}
          className="absolute top-2 left-2 sm:top-3 sm:left-3 p-1.5 sm:p-2 rounded-lg shadow-xs transition-all active:scale-95 border border-black/15 bg-black/15 hover:bg-black/30 z-30"
          title="Download Voucher"
        >
          <Download size={12} className="sm:w-3.5 sm:h-3.5" />
        </button>
      )}

      {/* Three-dot dropdown menu */}
      <div ref={menuRef} className="absolute top-2 right-2 sm:top-3 sm:right-3 z-35">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          style={{ color: cardStyle.color }}
          className="p-1.5 sm:p-2 rounded-lg transition-all active:scale-95 border border-black/15 bg-black/15 hover:bg-black/30 shadow-xs"
          title="Room Options"
        >
          <MoreVertical size={12} className="sm:w-3.5 sm:h-3.5" />
        </button>

        {showMenu && (
          <div className="absolute right-0 mt-1 bg-white border border-[#DDE5D0] shadow-xl rounded-xl py-1 z-50 flex flex-col min-w-[140px] animate-fade-in">
            {room.status === 'occupied' && onShiftRoom && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                  onShiftRoom(room);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#F0F3E8] text-[#1A2E05] text-[10px] sm:text-xs font-bold flex items-center gap-1.5 transition-all"
              >
                <ArrowLeftRight size={12} className="text-[#84A63C]" />
                Shift Room
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (room.status === 'occupied') return;
                setShowMenu(false);
                onEdit(room);
              }}
              disabled={room.status === 'occupied'}
              className={`w-full text-left px-3 py-1.5 text-[10px] sm:text-xs font-bold flex items-center gap-1.5 transition-all ${room.status === 'occupied'
                ? 'text-gray-400 cursor-not-allowed opacity-50'
                : 'hover:bg-[#F0F3E8] text-[#1A2E05]'
                }`}
              title={room.status === 'occupied' ? 'Cannot edit room setup while occupied' : 'Edit Room'}
            >
              <Edit size={12} className={room.status === 'occupied' ? 'text-gray-400' : 'text-[#84A63C]'} />
              Edit
            </button>
            {activeHotel?.allowRoomDelete !== false && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  if (room.status === 'occupied') return;
                  const roomId = room.id;
                  const roomNum = room.roomNumber;
                  setShowMenu(false);
                  // Use setTimeout to ensure menu is closed before confirm dialog
                  setTimeout(() => {
                    if (window.confirm(`Are you sure you want to delete Room ${roomNum}? This cannot be undone.`)) {
                      onDelete(roomId, roomNum);
                    }
                  }, 0);
                }}
                disabled={room.status === 'occupied'}
                className={`w-full text-left px-3 py-1.5 text-[10px] sm:text-xs font-bold flex items-center gap-1.5 transition-all ${room.status === 'occupied'
                  ? 'text-gray-400 cursor-not-allowed opacity-50'
                  : 'hover:bg-red-50 text-red-600'
                  }`}
                title={room.status === 'occupied' ? 'Cannot delete occupied room' : 'Delete Room'}
              >
                <Trash2 size={12} className={room.status === 'occupied' ? 'text-gray-400' : 'text-red-500'} />
                Delete
              </button>
            )}
            {room.status !== 'occupied' && onUpdateStatus && (
              <>
                <div className="border-t border-[#F0F3E8] my-1" />
                {room.status !== 'available' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                      onUpdateStatus(room.id, 'available');
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[#F0F3E8] text-[#1A2E05] text-[10px] sm:text-xs font-bold flex items-center gap-1.5 transition-all"
                  >
                    <CheckCircle2 size={12} className="text-emerald-500" />
                    Set as Available
                  </button>
                )}
                {room.status !== 'maintenance' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                      onUpdateStatus(room.id, 'maintenance');
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[#F0F3E8] text-[#1A2E05] text-[10px] sm:text-xs font-bold flex items-center gap-1.5 transition-all"
                  >
                    <AlertTriangle size={12} className="text-amber-500" />
                    Set as Maintenance
                  </button>
                )}
                {room.status !== 'cleaning' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                      onUpdateStatus(room.id, 'cleaning');
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[#F0F3E8] text-[#1A2E05] text-[10px] sm:text-xs font-bold flex items-center gap-1.5 transition-all"
                  >
                    <Clock size={12} className="text-blue-500" />
                    Set as Cleaning
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const AddRoomModal = ({ isOpen, onClose, onAdd, onEdit, initialFloor, editRoomData }) => {
  const { activeHotel } = useAuth();
  const roomTypesList = Array.isArray(activeHotel?.roomTypes)
    ? activeHotel.roomTypes.map(rt => rt.name).filter(Boolean)
    : [];
  const defaultType = roomTypesList[0] || 'Deluxe Room';

  const [formData, setFormData] = useState({ roomNumber: '', type: defaultType, floor: initialFloor || 1, pricePerNight: 2500 });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (editRoomData) {
      setFormData(editRoomData);
    } else {
      setFormData({ roomNumber: '', type: defaultType, floor: (initialFloor || 1).toString(), pricePerNight: 2500 });
    }
  }, [editRoomData, initialFloor, isOpen, defaultType]);

  const isOccupied = editRoomData?.status === 'occupied';

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (isOccupied) return;
    setLoading(true);
    if (editRoomData) {
      await onEdit(editRoomData.id, formData);
    } else {
      await onAdd(formData);
    }
    setLoading(false);
    if (!editRoomData) {
      setFormData({ roomNumber: '', type: defaultType, floor: (initialFloor || 1).toString(), pricePerNight: 2500 });
    }
  };

  return createPortal(
    <div className="fixed inset-0 w-screen h-screen z-[110] flex items-center justify-center p-4 sm:p-8 bg-black/60 backdrop-blur-sm animate-fade-in overflow-hidden">
      <div className="bg-white w-full sm:max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-slide-up relative">
        <div className="p-6 border-b border-[#DDE5D0] flex items-center justify-between">
          <h3 className="text-xl font-bold text-[#1A2E05]">{editRoomData ? 'Edit Room' : 'Add New Room'}</h3>
          <button onClick={onClose} className="p-2 hover:bg-[#F0F3E8] rounded-lg transition-all"><X size={20} className="text-[#7A8A6A]" /></button>
        </div>
        <div className="p-6 sm:p-8 space-y-5">
          {isOccupied && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-3 text-xs font-bold flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-600 shrink-0" />
              <span>This room is currently occupied. Room Number, Floor, Type & Rate cannot be edited while occupied. Use <strong>Shift Room</strong> or <strong>Guest Billing</strong> instead.</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#4A5E38] ml-1">Room Number</label>
              <input
                type="text"
                placeholder="101"
                disabled={isOccupied}
                value={formData.roomNumber}
                onChange={(e) => setFormData({ ...formData, roomNumber: e.target.value })}
                className={`w-full px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${isOccupied ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-[#F0F3E8] border-[#DDE5D0] focus:bg-white focus:border-[#84A63C]'}`}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#4A5E38] ml-1">Floor</label>
              <input
                type="text"
                disabled={isOccupied}
                value={formData.floor}
                onChange={(e) => setFormData({ ...formData, floor: e.target.value })}
                className={`w-full px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${isOccupied ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-[#F0F3E8] border-[#DDE5D0] focus:bg-white focus:border-[#84A63C]'}`}
              />
            </div>
          </div>
          {activeHotel?.hasRoomType !== false && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#4A5E38] ml-1">Room Type</label>
              <select
                disabled={isOccupied}
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className={`w-full px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${isOccupied ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-[#F0F3E8] border-[#DDE5D0] focus:bg-white focus:border-[#84A63C] cursor-pointer'}`}
              >
                {roomTypesList.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#4A5E38] ml-1">Price per Night (₹)</label>
            <input
              type="number"
              step="any"
              disabled={isOccupied}
              value={formData.pricePerNight}
              onChange={(e) => setFormData({ ...formData, pricePerNight: parseFloat(e.target.value) })}
              onWheel={(e) => e.target.blur()}
              className={`w-full px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${isOccupied ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-[#F0F3E8] border-[#DDE5D0] focus:bg-white focus:border-[#84A63C]'}`}
            />
          </div>
        </div>
        <div className="p-6 bg-[#F0F3E8] border-t border-[#DDE5D0] flex gap-3">
          <button onClick={onClose} disabled={loading} className="flex-1 py-3 text-sm font-semibold text-[#7A8A6A] hover:text-[#1A2E05] transition-colors disabled:opacity-50">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={loading || isOccupied}
            className="flex-[2] py-3 bg-[#84A63C] text-white rounded-xl text-sm font-semibold hover:opacity-90 shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : (editRoomData ? <Edit size={16} /> : <Plus size={16} />)}
            {loading ? (editRoomData ? 'Updating...' : 'Creating...') : (editRoomData ? 'Update Room' : 'Add Room')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

const AddFloorModal = ({ isOpen, onClose, onAdd }) => {
  const [floor, setFloor] = useState('');
  if (!isOpen) return null;
  return createPortal(
    <div className="fixed inset-0 w-screen h-screen z-[110] flex items-center justify-center p-4 sm:p-8 bg-black/60 backdrop-blur-sm animate-fade-in overflow-hidden">
      <div className="bg-white w-full sm:max-w-xs rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-slide-up relative">
        <div className="p-5 border-b border-[#DDE5D0] flex items-center justify-between">
          <h3 className="text-lg font-bold text-[#1A2E05]">Add Floor</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-[#F0F3E8] rounded-lg transition-all"><X size={18} className="text-[#7A8A6A]" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#4A5E38] ml-1">Floor Name/Number</label>
            <input type="text" placeholder="e.g. Ground, 1st, 2nd" value={floor} onChange={(e) => setFloor(e.target.value)} className="w-full px-4 py-2.5 bg-[#F0F3E8] border border-[#DDE5D0] rounded-xl text-sm font-medium focus:outline-none focus:bg-white focus:border-[#84A63C] transition-all" />
          </div>
          <button onClick={() => { onAdd(floor.toString().trim()); setFloor(''); }} className="w-full py-3 bg-[#1C2B12] text-white rounded-xl text-sm font-bold hover:opacity-90 transition-all shadow-lg shadow-black/10">Initialize Floor</button>
        </div>
      </div>
    </div>,
    document.body
  );
};

const ConflictModal = ({ isOpen, onClose, conflict }) => {
  if (!isOpen || !conflict) return null;
  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-slide-up p-8 text-center">
        <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <Calendar size={32} className="text-orange-600" />
        </div>
        <h3 className="text-xl font-bold text-[#1A2E05] mb-2">Room Already Reserved!</h3>
        <p className="text-sm text-[#7A8A6A] mb-8">This room is already booked during your selected dates.</p>
        <button onClick={onClose} className="w-full py-4 bg-[#1A2E05] text-white rounded-xl text-sm font-bold hover:opacity-90 transition-all">Select Other Room/Dates</button>
      </div>
    </div>,
    document.body
  );
};

// Module-level in-memory cache for instant navigation without loading lag
let stayOverviewCache = {
  roomsByFloor: null,
  allFloors: null,
  activeBookings: null
};

const StayOverview = () => {
  const { activeHotel, refreshHotel } = useAuth();
  const roomTypesList = Array.isArray(activeHotel?.roomTypes)
    ? activeHotel.roomTypes.map(rt => rt.name).filter(Boolean)
    : [];
  const [activeTab, setActiveTab] = useState('rooms');
  const [roomsByFloor, setRoomsByFloor] = useState(stayOverviewCache.roomsByFloor || []);
  const [activeBookings, setActiveBookings] = useState(stayOverviewCache.activeBookings || []);
  const [allFloors, setAllFloors] = useState(stayOverviewCache.allFloors || []);
  const [isRefreshing, setIsRefreshing] = useState(!stayOverviewCache.roomsByFloor);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [isAddRoomModalOpen, setIsAddRoomModalOpen] = useState(false);
  const [isAddFloorModalOpen, setIsAddFloorModalOpen] = useState(false);
  const [activeFloorForNewRoom, setActiveFloorForNewRoom] = useState(null);
  const [roomToEdit, setRoomToEdit] = useState(null);
  const [floorFilter, setFloorFilter] = useState('All');
  const [roomTypeFilter, setRoomTypeFilter] = useState('All');
  const [conflictData, setConflictData] = useState(null);
  const [isConflictOpen, setIsConflictOpen] = useState(false);
  const [earlyWarningBooking, setEarlyWarningBooking] = useState(null);
  const [isEarlyWarningOpen, setIsEarlyWarningOpen] = useState(false);
  const [isGuestDetailModalOpen, setIsGuestDetailModalOpen] = useState(false);
  const [selectedActiveBooking, setSelectedActiveBooking] = useState(null);
  const [loadingGuestDetail, setLoadingGuestDetail] = useState(false);
  const [checkoutData, setCheckoutData] = useState(null);
  const [selectedRoomForStatus, setSelectedRoomForStatus] = useState(null);
  const [quickCheckInBooking, setQuickCheckInBooking] = useState(null);
  const [isQuickCheckInOpen, setIsQuickCheckInOpen] = useState(false);
  const [roomToShift, setRoomToShift] = useState(null);
  const [selectedNewRoomId, setSelectedNewRoomId] = useState('');
  const [newRoomPriceInput, setNewRoomPriceInput] = useState('');
  const [sameDayChargeOption, setSameDayChargeOption] = useState('charge_previous'); // 'charge_previous' | 'no_charge'
  const [shiftingLoading, setShiftingLoading] = useState(false);

  const handleOpenRoomShift = async (room) => {
    let booking = activeBookings.find(b => b.roomId === room.id || (b.groupBookings && b.groupBookings.some(gb => gb.roomId === room.id)));
    if (!booking) {
      try {
        const response = await api.get(`/bookings/room/${room.id}`);
        booking = response.data.data;
      } catch (err) {
        console.error('Error fetching booking for room shift:', err);
      }
    }

    if (booking && booking.groupBookings && booking.groupBookings.length > 0) {
      const matchingGb = booking.groupBookings.find(gb => gb.roomId === room.id);
      if (matchingGb) {
        booking = matchingGb;
      }
    }

    setRoomToShift({ room, booking });
    setSelectedNewRoomId('');
  };

  const handleConfirmRoomShift = async () => {
    if (!roomToShift || !selectedNewRoomId) return;
    const targetBooking = roomToShift.booking;
    if (!targetBooking) {
      alert("Could not find active booking record for this room.");
      return;
    }

    setShiftingLoading(true);
    try {
      const oldRoomId = roomToShift.room.id;
      const newRoomId = Number(selectedNewRoomId);
      const breakdown = getShiftModalBreakdown(roomToShift);
      const currentStep = breakdown ? breakdown.find(item => item.isCurrent) : null;
      const actualOldRate = currentStep && currentStep.rate !== undefined && currentStep.rate !== null && !isNaN(Number(currentStep.rate))
        ? Number(currentStep.rate)
        : Number(roomToShift.room.pricePerNight || 0);

      const currentPrevNumStr = targetBooking.previousRoomNumber;
      const oldRoomNumStr = String(roomToShift.room.roomNumber);
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
        previousRoomType: roomToShift.room.type || roomToShift.room.roomType,
        newRoomPrice: newRoomPriceInput !== '' ? Number(newRoomPriceInput) : undefined,
        shiftDate: new Date().toISOString().split('T')[0],
        shiftTime: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
        sameDayChargeOption
      });

      setRoomToShift(null);
      setSelectedNewRoomId('');
      setNewRoomPriceInput('');
      await fetchRooms();
      await fetchActiveBookings();
    } catch (error) {
      console.error('Error shifting room:', error);
      alert(error.response?.data?.message || 'Failed to shift room');
    } finally {
      setShiftingLoading(false);
    }
  };

  const executeQuickCheckIn = async (bookingId, checkInDate, checkInTime) => {
    try {
      await api.put(`/bookings/${bookingId}/checkin`, { checkInDate, checkInTime });
      await fetchRooms();
      await fetchActiveBookings();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to check in guest');
      throw error;
    }
  };

  const handleUpdateRoomStatus = async (roomId, newStatus) => {
    // Optimistic UI update to make the transition instant on the screen
    setRoomsByFloor(prev => prev.map(floor => ({
      ...floor,
      rooms: floor.rooms.map(room =>
        room.id === roomId
          ? { ...room, status: newStatus, guestName: newStatus === 'available' ? null : room.guestName }
          : room
      )
    })));

    try {
      await api.put(`/rooms/${roomId}`, { status: newStatus });
      await fetchRooms();
      setSelectedRoomForStatus(null);
    } catch (err) {
      console.error("Failed to update status:", err);
      alert("Failed to update room status");
      await fetchRooms(); // Revert back to original state on failure
    }
  };

  useEffect(() => {
    const isAnyModalOpen = isBookingModalOpen || isAddRoomModalOpen || isAddFloorModalOpen || isConflictOpen || isGuestDetailModalOpen || !!checkoutData;
    if (isAnyModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isBookingModalOpen, isAddRoomModalOpen, isAddFloorModalOpen, isConflictOpen, isGuestDetailModalOpen, checkoutData]);

  useEffect(() => {
    const loadData = async () => {
      setIsRefreshing(true);
      if (refreshHotel && activeHotel?.id) {
        refreshHotel(activeHotel.id);
      }
      await Promise.all([
        fetchRooms(),
        fetchActiveBookings()
      ]);
      setIsRefreshing(false);
    };
    loadData();
  }, [activeTab]);

  const fetchRooms = async () => {
    try {
      const response = await api.get('/rooms');
      const rooms = response.data?.data || [];

      const grouped = rooms.reduce((acc, room) => {
        const floor = room.floor;
        if (!acc[floor]) acc[floor] = [];
        acc[floor].push(room);
        return acc;
      }, {});

      const formatted = Object.keys(grouped).map(floor => ({
        floor: floor,
        rooms: grouped[floor]
      })).sort((a, b) => {
        const aNum = Number(a.floor);
        const bNum = Number(b.floor);
        if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
        return String(a.floor).localeCompare(String(b.floor), undefined, { numeric: true, sensitivity: 'base' });
      });

      stayOverviewCache.roomsByFloor = formatted;
      setRoomsByFloor(formatted);
      const floors = [...new Set(rooms.map(r => r.floor.toString()))].sort((a, b) => {
        const aNum = Number(a);
        const bNum = Number(b);
        if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
        return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
      });
      stayOverviewCache.allFloors = floors;
      setAllFloors(floors);
    } catch (error) {
      console.error('Error fetching rooms:', error);
    }
  };

  const fetchActiveBookings = async () => {
    try {
      const response = await api.get('/bookings/active');
      const activeData = response.data?.data || [];
      stayOverviewCache.activeBookings = activeData;
      setActiveBookings(activeData);
    } catch (error) {
      console.error('Error fetching active bookings:', error);
    }
  };

  const getTodayReservation = (room, bookings) => {
    if (!bookings || !bookings.length) return null;
    return bookings.find(b => {
      if (b.status !== 'Confirmed') return false;
      if (!isToday(b.checkInDate)) return false;
      if (b.groupBookings && b.groupBookings.length > 0) {
        return b.groupBookings.some(gb => Number(gb.roomId) === Number(room.id));
      }
      return Number(b.roomId) === Number(room.id);
    });
  };

  const handleRoomClick = async (room) => {
    const todayRes = getTodayReservation(room, activeBookings);
    if (todayRes && room.status === 'available') {
      setSelectedRoom(room);
      setSelectedActiveBooking(todayRes);
      setIsGuestDetailModalOpen(true);
      return;
    }

    if (room.status === 'available') {
      setSelectedActiveBooking(null);
      setSelectedRoom(room);
      setIsBookingModalOpen(true);
    } else if (room.status === 'occupied') {
      setSelectedRoom(room);
      setIsGuestDetailModalOpen(true);
      setLoadingGuestDetail(true);
      try {
        const response = await api.get(`/bookings/room/${room.id}`);
        const booking = response.data.data;
        setSelectedActiveBooking(booking || null);
      } catch (error) {
        console.error('Error fetching active booking:', error);
        setSelectedActiveBooking(null);
      } finally {
        setLoadingGuestDetail(false);
      }
    } else if (room.status === 'maintenance' || room.status === 'cleaning') {
      setSelectedRoomForStatus(room);
    }
  };

  const handleGuestCheckout = async (options) => {
    if (!selectedRoom) return;
    const singleRoomId = options?.singleRoomId || null;
    if (selectedActiveBooking) {
      setCheckoutData({
        booking: selectedActiveBooking,
        room: selectedRoom,
        singleRoomId: singleRoomId
      });
    } else {
      if (window.confirm(`No active booking found. Force check-out and release Room ${selectedRoom.roomNumber}?`)) {
        try {
          await api.put(`/rooms/${selectedRoom.id}`, { status: 'available', guestName: null });
          setIsGuestDetailModalOpen(false);
          fetchRooms();
        } catch (error) {
          console.error(error);
        }
      }
    }
  };

  const handleGuestEdit = () => {
    setIsGuestDetailModalOpen(false);
    setIsBookingModalOpen(true);
  };

  const handleBookingConfirm = async (bookingData) => {
    try {
      if (selectedActiveBooking) {
        await api.put(`/bookings/${selectedActiveBooking.id}`, bookingData);
      } else {
        await api.post('/bookings', bookingData);
      }
      await fetchRooms();
      await fetchActiveBookings();
      setIsBookingModalOpen(false);
      setSelectedActiveBooking(null);
    } catch (error) {
      if (error.response?.status === 409) {
        setConflictData(error.response.data.conflict);
        setIsConflictOpen(true);
      } else {
        console.error('Error booking/updating room:', error);
        alert(error.response?.data?.message || 'Failed to complete booking action');
      }
    }
  };

  const executeCheckout = async (checkOutDate, checkOutTime) => {
    if (!checkoutData || !checkoutData.booking) return;
    try {
      const payload = { checkOutDate, checkOutTime };
      if (checkoutData.singleRoomId) {
        payload.singleRoomId = checkoutData.singleRoomId;
      }
      await api.put(`/bookings/${checkoutData.booking.id}/checkout`, payload);
      setCheckoutData(null);
      setIsGuestDetailModalOpen(false);
      if (activeTab === 'rooms') fetchRooms();
      else fetchActiveBookings();
    } catch (error) {
      console.error('Error checking out:', error);
      alert('Failed to check out');
    }
  };

  const handleCheckOut = async (roomId) => {
    try {
      const response = await api.get(`/bookings/room/${roomId}`);
      const booking = response.data.data;
      const room = roomsByFloor.flatMap(f => f.rooms).find(r => r.id === roomId) || { id: roomId, roomNumber: booking?.roomNumber || 'N/A' };

      if (booking) {
        setCheckoutData({ booking, room });
      } else {
        if (window.confirm(`No active booking found. Release Room ${room.roomNumber || 'N/A'}?`)) {
          await api.put(`/rooms/${roomId}`, { status: 'available', guestName: null });
          fetchRooms();
        }
      }
    } catch (error) {
      console.error('Error checking out:', error);
      alert('Failed to check out');
    }
  };

  const isToday = (dateStr) => {
    if (!dateStr) return false;
    const dOnly = dateStr.split('T')[0];
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return dOnly === `${yyyy}-${mm}-${dd}`;
  };

  const handleCancelCheckin = async (bookingId) => {
    const confirmMsg = `Are you sure you want to cancel this check-in?\n\nThis will completely delete the booking, release the room, and clear any associated payment history.\n\nThis action CANNOT be undone.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await api.delete(`/bookings/${bookingId}`);
      if (activeTab === 'rooms') fetchRooms();
      else fetchActiveBookings();
    } catch (error) {
      console.error('Error cancelling booking:', error);
      alert(error.response?.data?.message || 'Failed to cancel check-in');
    }
  };

  const handleDownloadVoucher = async (roomId) => {
    try {
      const response = await api.get(`/bookings/room/${roomId}`);
      if (response.data.data) {
        await generateCheckInVoucher(response.data.data);
      } else {
        alert("Active booking not found for this room.");
      }
    } catch (error) {
      console.error('Error downloading voucher:', error);
      alert('Failed to generate voucher');
    }
  };

  const handleDeleteRoom = async (roomId, roomNumber) => {
    try {
      await api.delete(`/rooms/${roomId}`);
      await fetchRooms();
    } catch (error) {
      console.error('Error deleting room:', error);
      alert(error.response?.data?.message || 'Failed to delete room');
    }
  };

  const handleAddRoom = async (newRoomData) => {
    try {
      await api.post('/rooms', newRoomData);
      await fetchRooms();
      setIsAddRoomModalOpen(false);
    } catch (error) {
      console.error('Error adding room:', error);
      alert(error.response?.data?.message || 'Failed to add room');
    }
  };

  const handleEditRoom = async (roomId, updatedData) => {
    try {
      await api.put(`/rooms/${roomId}`, updatedData);
      await fetchRooms();
      setIsAddRoomModalOpen(false);
      setRoomToEdit(null);
    } catch (error) {
      console.error('Error editing room:', error);
      alert(error.response?.data?.message || 'Failed to edit room');
    }
  };

  const openEditRoomModal = (room) => {
    setRoomToEdit(room);
    setIsAddRoomModalOpen(true);
  };

  const closeRoomModal = () => {
    setIsAddRoomModalOpen(false);
    setRoomToEdit(null);
  };

  const handleAddFloor = (floorNumber) => {
    const floorStr = floorNumber.toString();
    if (allFloors.includes(floorStr)) {
      alert('Floor already exists');
      return;
    }
    setAllFloors(prev => [...prev, floorStr].sort((a, b) => {
      const aNum = Number(a);
      const bNum = Number(b);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
    }));
    setIsAddFloorModalOpen(false);
    setActiveFloorForNewRoom(floorStr);
    setIsAddRoomModalOpen(true);
  };

  const floorsToDisplay = floorFilter === 'All' ? allFloors : [floorFilter];

  return (
    <div className="space-y-4 pb-6 relative">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-[#1A2E05] tracking-tight flex items-center gap-2">
              <span>Stay Overview</span>
            </h1>
            {isRefreshing && (
              <span className="bg-[#84A63C]/15 text-[#2E4018] text-[11px] font-black px-3.5 py-1.5 rounded-full border border-[#84A63C]/40 shadow-sm flex items-center gap-2 animate-fade-in">
                <Loader2 size={15} className="text-[#84A63C] animate-spin shrink-0" />
                <span>Syncing Rooms...</span>
              </span>
            )}
            {isTruthy(activeHotel?.enableAutoExtendCheckout) && (
              <span className="bg-[#84A63C]/10 text-[#4A5E38] text-[10px] font-black px-3 py-1.5 rounded-full border border-[#84A63C]/30 shadow-xs flex items-center gap-1.5 animate-fade-in" title="Auto-Extend Overdue Checkouts & Charges is enabled for this hotel">
                <Clock size={13} className="text-[#84A63C] shrink-0" />
                <span>Auto-Extend Cutoff Time: <strong className="text-[#1A2E05] font-black">{formatCutoffTimeStr(activeHotel.autoExtendCutoffTime)}</strong></span>
              </span>
            )}
          </div>
          <p className="text-xs font-medium text-[#4A5E38] mt-0.5">Real-time Hotel Status</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex bg-[#F0F3E8] p-1.5 rounded-2xl border border-[#DDE5D0] shadow-sm">
            <button onClick={() => setActiveTab('rooms')} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black transition-all ${activeTab === 'rooms' ? 'bg-[#1C2B12] text-white shadow-lg' : 'text-[#4A5E38] hover:text-[#1A2E05]'}`}>
              <LayoutGrid size={16} /> Rooms
            </button>
            <button onClick={() => setActiveTab('guests')} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black transition-all ${activeTab === 'guests' ? 'bg-[#1C2B12] text-white shadow-lg' : 'text-[#4A5E38] hover:text-[#1A2E05]'}`}>
              <UsersIcon size={16} /> Current Guests ({activeBookings.length})
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'rooms' ? (
        <div className="space-y-6 animate-fade-in">
          <div className="flex flex-wrap items-center gap-3 w-full overflow-x-auto no-scrollbar pb-2">
            <button onClick={() => setFloorFilter('All')} className={`px-6 py-2 rounded-xl text-[10px] font-black transition-all border ${floorFilter === 'All' ? 'bg-[#84A63C] text-white border-[#84A63C]' : 'bg-white text-[#4A5E38] border-[#DDE5D0] hover:border-[#84A63C]'}`}>All Floors</button>
            {allFloors.map(floor => (
              <button key={floor} onClick={() => setFloorFilter(floor.toString())} className={`px-6 py-2 rounded-xl text-[10px] font-black transition-all border ${floorFilter === floor.toString() ? 'bg-[#84A63C] text-white border-[#84A63C]' : 'bg-white text-[#4A5E38] border-[#DDE5D0] hover:border-[#84A63C]'}`}>Floor {floor}</button>
            ))}

            {activeHotel?.hasRoomType !== false && (
              <div className="flex items-center gap-2 pl-2">
                <span className="text-[10px] font-black text-[#4A5E38] uppercase tracking-wider">Room Type:</span>
                <select
                  value={roomTypeFilter}
                  onChange={(e) => setRoomTypeFilter(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-[#DDE5D0] rounded-xl text-[10px] font-black text-[#4A5E38] focus:outline-none focus:border-[#84A63C] cursor-pointer"
                >
                  <option value="All">All Types</option>
                  {roomTypesList.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            )}

            <button onClick={() => setIsAddFloorModalOpen(true)} className="ml-auto flex items-center gap-2 px-6 py-2 bg-[#1C2B12] text-white rounded-xl text-[10px] font-black hover:opacity-90 shadow-lg shadow-black/10 transition-all active:scale-[0.98]">
              <Plus size={14} /> Add Floor
            </button>
          </div>

          {allFloors.length === 0 && isRefreshing ? (
            <div className="flex flex-col items-center justify-center min-h-[300px] bg-white rounded-3xl border border-[#DDE5D0] shadow-sm p-8 space-y-4 animate-fade-in">
              <div className="w-14 h-14 bg-[#84A63C]/10 rounded-2xl flex items-center justify-center relative shadow-inner">
                <Loader2 size={28} className="text-[#84A63C] animate-spin" />
                <span className="absolute w-3 h-3 bg-[#84A63C]/40 rounded-full animate-ping" />
              </div>
              <div className="text-center">
                <h3 className="text-sm font-black text-[#1A2E05]">Synchronizing Stay Overview...</h3>
                <p className="text-xs font-bold text-[#7A8A6A] mt-1">Loading room & floor status</p>
              </div>
            </div>
          ) : (
            <div className="space-y-10">
              {floorsToDisplay.map((floor) => {
                const floorData = roomsByFloor.find(f => f.floor.toString() === floor.toString()) || { floor, rooms: [] };
                const filteredRooms = (activeHotel?.hasRoomType === false || roomTypeFilter === 'All')
                  ? floorData.rooms
                  : floorData.rooms.filter(room => room.type === roomTypeFilter);

                if (filteredRooms.length === 0 && roomTypeFilter !== 'All') return null;

                return (
                  <div key={floor} className="space-y-4">
                    <div className="flex items-center justify-between px-4 border-l-4 border-[#84A63C] py-1 bg-[#F0F3E8]/30 rounded-r-2xl">
                      <div>
                        <h3 className="text-sm font-black text-[#1A2E05]">Floor {floor}</h3>
                        <p className="text-[10px] font-bold text-[#4A5E38]">{filteredRooms.length} {activeHotel?.hasRoomType !== false && roomTypeFilter !== 'All' ? roomTypeFilter : 'Units'} Configured</p>
                      </div>
                      {activeHotel?.allowRoomAdd !== false && (
                        <button onClick={() => { setActiveFloorForNewRoom(floor); setIsAddRoomModalOpen(true); }} className="p-2 bg-white border border-[#DDE5D0] text-[#84A63C] hover:bg-[#84A63C] hover:text-white rounded-xl transition-all shadow-sm">
                          <Plus size={20} />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                      {filteredRooms.map((room) => (
                        <RoomCard
                          key={room.id}
                          room={room}
                          onClick={handleRoomClick}
                          onDownload={handleDownloadVoucher}
                          onDelete={handleDeleteRoom}
                          onEdit={openEditRoomModal}
                          onUpdateStatus={handleUpdateRoomStatus}
                          onShiftRoom={handleOpenRoomShift}
                          bookingTotal={getRoomCardBookingTotal(room, activeBookings, activeHotel)}
                          pendingAmount={getRoomCardPendingAmount(room, activeBookings, activeHotel)}
                          extraAmount={getRoomCardExtraAmount(room, activeBookings)}
                          isMultipleRoom={checkIfMultipleRoom(room, activeBookings)}
                          todayReservation={getTodayReservation(room, activeBookings)}
                          activeGuestName={getActiveGuestName(room, activeBookings)}
                        />
                      ))}

                      {activeHotel?.allowRoomAdd !== false && (
                        <button onClick={() => { setActiveFloorForNewRoom(floor); setIsAddRoomModalOpen(true); }} className="h-32 sm:h-40 rounded-lg sm:rounded-xl border-2 border-dashed border-[#C8D4B4] flex flex-col items-center justify-center gap-2 text-[#7A8A6A] hover:text-[#5C7A1F] hover:border-[#84A63C]/30 transition-all group">
                          <Plus size={28} strokeWidth={1.5} className="group-hover:scale-110 transition-transform" />
                          <span className="text-[10px] font-black">New Room</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="animate-fade-in space-y-6">
          <div className="bg-white rounded-3xl border border-[#DDE5D0] shadow-xl shadow-[#84A63C]/5 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-[#F0F3E8] border-b border-[#DDE5D0] text-[#4A5E38] text-[10px] font-extrabold uppercase tracking-wider select-none">
                    <th className="px-6 py-4">Room</th>
                    <th className="px-6 py-4">Guest Details</th>
                    <th className="px-6 py-4">Check-In</th>
                    <th className="px-6 py-4">Check-Out</th>
                    <th className="px-6 py-4">Financials</th>
                    <th className="px-6 py-4">Payment</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DDE5D0]/40 text-xs text-[#1A2E05] font-bold">
                  {isRefreshing ? (
                    <tr><td colSpan="7" className="px-6 py-20 text-center"><Loader2 className="animate-spin mx-auto text-[#84A63C]" size={32} /></td></tr>
                  ) : activeBookings.length === 0 ? (
                    <tr><td colSpan="7" className="px-6 py-20 text-center text-[#4A5E38] font-bold text-xs">No active guests found</td></tr>
                  ) : activeBookings.map((booking) => {
                    let baseAmount = 0;
                    let discount = 0;
                    let paid = 0;
                    if (booking.groupBookings?.length > 0) {
                      baseAmount = booking.groupBookings.reduce((sum, b) => sum + Number(b.totalAmount || 0), 0);
                      discount = booking.groupBookings.reduce((sum, b) => sum + Number(b.discount || 0), 0);
                      paid = booking.groupBookings.reduce((sum, b) => sum + Number(b.amountPaid || 0), 0);
                    } else {
                      baseAmount = Number(booking.totalAmount || 0);
                      discount = Number(booking.discount || 0);
                      paid = Number(booking.amountPaid || 0);
                    }
                    const netBase = Math.max(0, baseAmount - discount);
                    const gstOption = booking.gstOption || 'none';
                    const gstRate = Number(booking.gstRate || 0);

                    let total = netBase;
                    if (gstOption === 'exclusive') {
                      const gstAmount = Math.round((netBase * (gstRate / 100)) * 100) / 100;
                      total = netBase + gstAmount;
                    } else {
                      total = netBase;
                    }

                    const foodTotal = Number(booking.foodCharges || 0);
                    const extraTotal = Number(booking.extraCharges || 0);
                    const extrasCombined = foodTotal + extraTotal;
                    total += extrasCombined;
                    const pending = Math.max(0, total - paid);
                    return (
                      <tr key={booking.id} className="hover:bg-[#F5F7F0]/30 transition-colors">
                        <td className="px-6 py-4.5 whitespace-nowrap">
                          <span className="inline-flex items-center justify-center px-3 py-1.5 bg-[#1C2B12] text-white rounded-xl text-xs font-black tracking-widest">{booking.Room?.roomNumber}</span>
                        </td>
                        <td className="px-6 py-4.5 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className="w-8.5 h-8.5 bg-[#84A63C]/10 rounded-xl flex items-center justify-center text-[#84A63C] font-black text-xs shrink-0">{booking.guestName ? booking.guestName[0].toUpperCase() : 'G'}</div>
                            <div>
                              <p className="text-sm font-black text-[#1A2E05]">{booking.guestName}</p>
                              <p className="text-[10px] text-[#7A8A6A] font-bold mt-0.5">{booking.phone}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4.5 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-[#1A2E05]">{new Date(booking.checkInDate).toLocaleDateString('en-GB').replace(/\//g, '-')}</span>
                            <span className="text-[9px] text-[#7A8A6A] font-bold mt-0.5">{booking.checkInTime ? booking.checkInTime : '12:00 PM'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4.5 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-[#1A2E05]">{new Date(booking.checkOutDate).toLocaleDateString('en-GB').replace(/\//g, '-')}</span>
                            <span className="text-[9px] text-[#7A8A6A] font-bold mt-0.5">{booking.checkOutTime ? booking.checkOutTime : '11:00 AM'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4.5 whitespace-nowrap">
                          <div className="space-y-0.5">
                            <div className="text-xs font-bold text-[#1A2E05]">Total: <span className="font-extrabold">₹{total.toLocaleString()}</span></div>
                            {extrasCombined > 0 && (
                              <div className="text-[10px] font-bold text-amber-700">Extras: <span>+₹{extrasCombined.toLocaleString()}</span></div>
                            )}
                            <div className="text-[10px] font-bold text-emerald-600">Paid: <span>₹{paid.toLocaleString()}</span></div>
                            {pending > 0 ? (
                              <div className="text-[10px] font-bold text-rose-600">Due: <span>₹{pending.toLocaleString()}</span></div>
                            ) : (
                              <div className="text-[10px] font-black text-emerald-600 flex items-center gap-1 mt-0.5">
                                <CheckCircle2 size={11} strokeWidth={3} className="shrink-0 text-emerald-600" />
                                <span>Paid (No Due)</span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4.5 whitespace-nowrap">
                          <div className="flex flex-col gap-1 items-start">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[8px] font-black border uppercase tracking-wider ${booking.status === 'Active'
                              ? 'bg-green-50 text-green-700 border-green-100'
                              : 'bg-blue-50 text-blue-700 border-blue-100'
                              }`}>
                              {booking.status === 'Active' ? 'Active' : 'Reserved'}
                            </span>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[8px] font-black border uppercase tracking-wider ${booking.paymentStatus === 'Paid'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                              : booking.paymentStatus === 'Partial'
                                ? 'bg-amber-50 text-amber-700 border-amber-100'
                                : 'bg-rose-50 text-rose-700 border-rose-100'
                              }`}>
                              {booking.paymentStatus}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4.5 text-right whitespace-nowrap space-x-1.5">
                          {booking.status === 'Confirmed' && (
                            <button
                              onClick={async () => {
                                const now = new Date();
                                const yyyy = now.getFullYear();
                                const mm = String(now.getMonth() + 1).padStart(2, '0');
                                const dd = String(now.getDate()).padStart(2, '0');
                                const todayYMD = `${yyyy}-${mm}-${dd}`;
                                const checkInYMD = booking.checkInDate ? booking.checkInDate.split('T')[0] : '';
                                if (checkInYMD && checkInYMD > todayYMD) {
                                  setEarlyWarningBooking(booking);
                                  setIsEarlyWarningOpen(true);
                                  return;
                                }

                                setQuickCheckInBooking(booking);
                                setIsQuickCheckInOpen(true);
                              }}
                              className="px-3 py-1.5 bg-[#84A63C] text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:opacity-90 transition-all inline-flex items-center"
                              title="Check-in Guest"
                            >
                              Check-In
                            </button>
                          )}
                          <button
                            onClick={() => { setSelectedRoom(booking.Room); setSelectedActiveBooking(booking); setIsBookingModalOpen(true); }}
                            className="p-2 text-[#7A8A6A] hover:text-[#84A63C] hover:bg-[#F0F3E8] rounded-xl transition-all border border-[#DDE5D0] shadow-sm inline-flex items-center"
                            title="Edit Booking"
                          >
                            <Edit size={14} />
                          </button>
                          {booking.status === 'Active' && (
                            <button
                              onClick={() => handleOpenRoomShift(booking.Room || { id: booking.roomId, roomNumber: booking.roomNumber, status: 'occupied' })}
                              className="p-2 text-[#7A8A6A] hover:text-[#84A63C] hover:bg-[#F0F3E8] rounded-xl transition-all border border-[#DDE5D0] shadow-sm inline-flex items-center"
                              title="Shift Room"
                            >
                              <ArrowLeftRight size={14} />
                            </button>
                          )}
                          <button
                            onClick={() => { setSelectedRoom(booking.Room); setSelectedActiveBooking(booking); setIsGuestDetailModalOpen(true); }}
                            className="p-2 text-[#7A8A6A] hover:text-[#1A2E05] hover:bg-[#F0F3E8] rounded-xl transition-all border border-[#DDE5D0] shadow-sm inline-flex items-center"
                            title="View Guest Details"
                          >
                            <Info size={14} />
                          </button>
                          <button
                            onClick={() => handleDownloadVoucher(booking.roomId)}
                            className="p-2 text-[#7A8A6A] hover:text-[#84A63C] hover:bg-[#F0F3E8] rounded-xl transition-all border border-[#DDE5D0] shadow-sm inline-flex items-center"
                            title="Download Check-In Voucher"
                          >
                            <Download size={14} />
                          </button>
                          {(booking.status === 'Confirmed' || (booking.status === 'Active' && isToday(booking.checkInDate))) && (
                            <button
                              onClick={() => handleCancelCheckin(booking.id)}
                              className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition-all border border-rose-100 shadow-sm inline-flex items-center"
                              title={booking.status === 'Confirmed' ? 'Cancel Reservation' : 'Cancel Check-in'}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                          {booking.status === 'Active' && (
                            <button
                              onClick={() => handleCheckOut(booking.roomId)}
                              className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition-all border border-rose-100 shadow-sm inline-flex items-center"
                              title="Check-out Guest"
                            >
                              <UserMinus size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {(() => {
        const customColors = getCustomRoomColors(activeHotel);
        return (
          <div className="flex flex-wrap items-center gap-6 py-8 border-t border-[#DDE5D0]">
            <div className="flex items-center gap-3 px-4 py-2 rounded-xl shadow-xs border border-[#DDE5D0]" style={{ backgroundColor: customColors.availableBg, color: customColors.availableText }}>
              <div className="w-2.5 h-2.5 rounded-full border border-black/20" style={{ backgroundColor: customColors.availableText || '#15803D' }}></div>
              <span className="text-xs font-bold" style={{ color: customColors.availableText }}>Available</span>
            </div>
            <div className="flex items-center gap-3 px-4 py-2 rounded-xl shadow-md border border-transparent" style={{ backgroundColor: customColors.occupiedBg, color: customColors.occupiedText }}>
              <div className="w-2.5 h-2.5 rounded-full bg-white/40"></div>
              <span className="text-xs font-bold" style={{ color: customColors.occupiedText }}>Occupied</span>
            </div>
            <div className="flex items-center gap-3 px-4 py-2 rounded-xl shadow-md border border-transparent" style={{ backgroundColor: customColors.multipleBg || '#115E59', color: customColors.multipleText || '#FFFFFF' }}>
              <div className="w-2.5 h-2.5 rounded-full bg-white/40"></div>
              <span className="text-xs font-bold" style={{ color: customColors.multipleText || '#FFFFFF' }}>Multiple Rooms</span>
            </div>
            <div className="flex items-center gap-3 px-4 py-2 rounded-xl shadow-xs border border-[#DDE5D0]" style={{ backgroundColor: customColors.maintenanceBg, color: customColors.maintenanceText }}>
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: customColors.maintenanceText || '#B45309' }}></div>
              <span className="text-xs font-bold" style={{ color: customColors.maintenanceText }}>Maintenance</span>
            </div>
            <div className="flex items-center gap-3 px-4 py-2 rounded-xl shadow-xs border border-[#DDE5D0]" style={{ backgroundColor: customColors.cleaningBg, color: customColors.cleaningText }}>
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: customColors.cleaningText || '#0369A1' }}></div>
              <span className="text-xs font-bold" style={{ color: customColors.cleaningText }}>Cleaning</span>
            </div>
          </div>
        );
      })()}

      <AddGuestModal
        initialData={selectedActiveBooking}
        preSelectedRoomId={selectedRoom?.id}
        isOpen={isBookingModalOpen}
        onClose={() => {
          setIsBookingModalOpen(false);
          setSelectedActiveBooking(null);
        }}
        onConfirm={handleBookingConfirm}
      />
      <AddRoomModal isOpen={isAddRoomModalOpen} onClose={closeRoomModal} onAdd={handleAddRoom} onEdit={handleEditRoom} initialFloor={activeFloorForNewRoom} editRoomData={roomToEdit} />
      <AddFloorModal isOpen={isAddFloorModalOpen} onClose={() => setIsAddFloorModalOpen(false)} onAdd={handleAddFloor} />
      <ConflictModal isOpen={isConflictOpen} onClose={() => setIsConflictOpen(false)} conflict={conflictData} />
      <EarlyCheckinWarningModal
        isOpen={isEarlyWarningOpen}
        onClose={() => setIsEarlyWarningOpen(false)}
        booking={earlyWarningBooking}
        onEdit={(bookingToEdit) => {
          setSelectedRoom(bookingToEdit.Room);
          setSelectedActiveBooking(bookingToEdit);
          setIsBookingModalOpen(true);
        }}
      />
      <GuestDetailModal
        isOpen={isGuestDetailModalOpen}
        onClose={() => setIsGuestDetailModalOpen(false)}
        booking={selectedActiveBooking}
        room={selectedRoom}
        loading={loadingGuestDetail}
        onCheckOut={handleGuestCheckout}
        onCheckIn={() => {
          setIsGuestDetailModalOpen(false);
          if (selectedActiveBooking) {
            setQuickCheckInBooking(selectedActiveBooking);
            setIsQuickCheckInOpen(true);
          }
        }}
        onEdit={handleGuestEdit}
        onDeleteSuccess={async () => {
          await fetchRooms();
          await fetchActiveBookings();
          if (selectedRoom?.id) {
            try {
              const response = await api.get(`/bookings/room/${selectedRoom.id}`);
              if (response.data.data) {
                setSelectedActiveBooking(response.data.data);
              }
            } catch (err) {
              console.error('Error refreshing active booking details:', err);
            }
          }
        }}
      />
      {checkoutData && (
        <CheckoutConfirmModal
          isOpen={!!checkoutData}
          onClose={() => setCheckoutData(null)}
          onConfirm={executeCheckout}
          booking={checkoutData.booking}
          room={checkoutData.room}
        />
      )}

      {selectedRoomForStatus && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-sm rounded-[2rem] p-6 border border-[#DDE5D0] shadow-2xl animate-slide-up text-center relative">
            <button
              onClick={() => setSelectedRoomForStatus(null)}
              className="absolute top-4 right-4 p-1.5 hover:bg-[#F0F3E8] rounded-full text-[#7A8A6A] hover:text-[#1A2E05] transition-all"
            >
              <X size={18} />
            </button>

            <div className="w-12 h-12 rounded-full bg-[#F0F3E8] flex items-center justify-center mx-auto mb-4 text-[#84A63C]">
              <Bed size={24} />
            </div>

            <h3 className="text-base font-black text-[#1A2E05]">Update Room {selectedRoomForStatus.roomNumber}</h3>
            <p className="text-[10px] font-bold text-[#7A8A6A] mt-1 uppercase tracking-wider mb-5">
              Current Status: <span className="text-[#84A63C]">{selectedRoomForStatus.status}</span>
            </p>

            <div className="space-y-2">
              {[
                { status: 'available', label: 'Available', color: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200' },
                { status: 'maintenance', label: 'Maintenance', color: 'bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200' },
                { status: 'cleaning', label: 'Cleaning', color: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200' }
              ].map(opt => (
                <button
                  key={opt.status}
                  type="button"
                  onClick={() => handleUpdateRoomStatus(selectedRoomForStatus.id, opt.status)}
                  className={`w-full py-3 px-4 border rounded-2xl text-xs font-black transition-all active:scale-[0.98] ${opt.color}`}
                >
                  Set as {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Room Shift Modal */}
      {roomToShift && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl border border-[#DDE5D0] shadow-2xl max-w-md w-full p-6 space-y-5 animate-slide-up relative">
            <div className="flex items-center justify-between border-b border-[#DDE5D0] pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-[#84A63C]/10 text-[#84A63C] rounded-2xl">
                  <ArrowLeftRight size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-[#1A2E05]">Shift Room</h3>
                  <p className="text-xs font-semibold text-[#4A5E38]">Change assigned room for active guest</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRoomToShift(null)}
                className="p-2 text-[#7A8A6A] hover:text-[#1A2E05] hover:bg-[#F0F3E8] rounded-xl transition-all"
              >
                <X size={18} />
              </button>
            </div>

            <div className="bg-[#F5F7F0] p-4 rounded-2xl border border-[#DDE5D0] space-y-2.5">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-[#4A5E38]">Guest Name:</span>
                <span className="font-black text-[#1A2E05]">
                  {roomToShift.booking?.guestName || roomToShift.room.guestName || 'Active Guest'}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-[#4A5E38]">Current Room:</span>
                <span className="font-black text-[#1A2E05] px-2.5 py-0.5 bg-white rounded-lg border border-[#DDE5D0]">
                  Room {roomToShift.room.roomNumber} ({roomToShift.room.type || 'Standard'})
                </span>
              </div>

              {/* Detailed Breakdown per Room */}
              {(() => {
                const breakdown = getShiftModalBreakdown(roomToShift);
                if (!breakdown || breakdown.length === 0) return null;
                return (
                  <div className="pt-2 border-t border-[#DDE5D0]/60 space-y-2">
                    <span className="text-[10px] font-black uppercase text-[#4A5E38] tracking-wider block">Stay & Billing Breakdown per Room:</span>
                    <div className="space-y-1.5">
                      {breakdown.map((item, idx) => {
                        if (item.isSameDayShift || item.days === 0) {
                          return (
                            <div key={idx} className="bg-white p-2.5 rounded-xl border border-amber-200/80 flex items-center justify-between text-xs shadow-2xs">
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                                  Room {item.roomNumber} (Prev)
                                </span>
                                <span className="text-[11px] font-semibold text-gray-600">
                                  {item.startStr || item.dateRangeStr} <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 font-bold ml-1">Same-Day Shift</span>
                                </span>
                              </div>
                              <span className="font-extrabold text-gray-700 text-xs">
                                {item.total > 0 ? `₹${formatMoney(item.total)}` : '₹0.00 (No Charge)'}
                              </span>
                            </div>
                          );
                        }

                        return (
                          <div key={idx} className="bg-white p-2.5 rounded-xl border border-[#DDE5D0] flex flex-col sm:flex-row sm:items-center justify-between gap-1 shadow-2xs">
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${item.isCurrent ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-amber-100 text-amber-900 border border-amber-200'
                                }`}>
                                Room {item.roomNumber} ({item.isCurrent ? 'Current' : 'Prev'})
                              </span>
                              {item.dateRangeStr && (
                                <span className="text-[11px] font-semibold text-[#4A5E38]">
                                  {item.dateRangeStr} ({item.days} {item.days === 1 ? 'Night' : 'Nights'})
                                </span>
                              )}
                            </div>
                            <div className="flex items-center justify-between sm:justify-end gap-3 text-xs border-t sm:border-t-0 pt-1 sm:pt-0 border-gray-100">
                              <span className="text-[11px] font-semibold text-[#7A8A6A]">₹{formatMoney(item.rate)}/night</span>
                              <span className="font-extrabold text-[#1A2E05]">₹{formatMoney(item.total)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-black text-[#4A5E38] uppercase tracking-wider block">
                Select New Room *
              </label>
              <select
                value={selectedNewRoomId}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedNewRoomId(val);
                  const selRoom = roomsByFloor.flatMap(f => f.rooms).find(r => r.id === Number(val));
                  if (selRoom) {
                    setNewRoomPriceInput(String(selRoom.pricePerNight || ''));
                  }
                }}
                className="w-full px-3.5 py-2.5 bg-[#FBFDF8] border border-[#DDE5D0] rounded-xl text-xs sm:text-sm font-bold text-[#1A2E05] focus:outline-none focus:border-[#84A63C] cursor-pointer"
              >
                <option value="">-- Select Available Room --</option>
                {roomsByFloor.flatMap(f => f.rooms).map(r => (
                  <option
                    key={r.id}
                    value={r.id}
                    disabled={r.id === roomToShift.room.id || r.status !== 'available'}
                  >
                    Room {r.roomNumber} - {r.type} (₹{r.pricePerNight}/night) {r.id === roomToShift.room.id ? '🔵 Current Room' : r.status === 'available' ? '✅ Available' : `🔴 ${r.status}`}
                  </option>
                ))}
              </select>
            </div>

            {selectedNewRoomId && (
              <div className="space-y-3 animate-fade-in">
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-[#4A5E38] uppercase tracking-wider block">
                    New Room Price (₹ / Night)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={newRoomPriceInput}
                    onChange={(e) => setNewRoomPriceInput(e.target.value)}
                    placeholder="Enter new room price per night"
                    className="w-full px-3.5 py-2.5 bg-[#FBFDF8] border border-[#DDE5D0] rounded-xl text-xs sm:text-sm font-bold text-[#1A2E05] focus:outline-none focus:border-[#84A63C]"
                  />
                </div>

                <div className="space-y-1.5 pt-1">
                  <label className="text-xs font-black text-[#4A5E38] uppercase tracking-wider block">
                    Previous Room Billing Option (Shift Day) *
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSameDayChargeOption('no_charge')}
                      className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between gap-1.5 cursor-pointer ${sameDayChargeOption === 'no_charge'
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
                        Previous Room {roomToShift?.room?.roomNumber} is <strong>₹0.00 (No Charge)</strong> for shift day.
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSameDayChargeOption('charge_previous')}
                      className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between gap-1.5 cursor-pointer ${sameDayChargeOption === 'charge_previous'
                          ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-500/20 text-emerald-950 font-bold shadow-xs'
                          : 'bg-white border-[#DDE5D0] text-gray-700 hover:bg-[#F5F7F0]'
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-xs text-emerald-900">💵 Charge Previous Room Rate</span>
                        {sameDayChargeOption === 'charge_previous' && (
                          <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                        )}
                      </div>
                      <span className="text-[10px] text-gray-500 font-semibold leading-tight">
                        Charge Previous Room {roomToShift?.room?.roomNumber} at rate (<strong>₹{roomToShift?.room?.pricePerNight || '0'}/night</strong>).
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#DDE5D0]">
              <button
                type="button"
                onClick={() => {
                  setRoomToShift(null);
                  setSelectedNewRoomId('');
                  setNewRoomPriceInput('');
                }}
                className="px-5 py-2.5 border border-[#DDE5D0] text-[#4A5E38] hover:bg-[#F0F3E8] rounded-xl text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!selectedNewRoomId || Number(selectedNewRoomId) === roomToShift.room.id || shiftingLoading}
                onClick={handleConfirmRoomShift}
                className="px-5 py-2.5 bg-[#84A63C] text-white rounded-xl text-xs font-black hover:bg-[#6c8a2f] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
              >
                {shiftingLoading ? <Loader2 size={14} className="animate-spin" /> : <ArrowLeftRight size={14} />}
                <span>Confirm Room Shift</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <QuickCheckInModal
        isOpen={isQuickCheckInOpen}
        onClose={() => { setIsQuickCheckInOpen(false); setQuickCheckInBooking(null); }}
        booking={quickCheckInBooking}
        onConfirm={executeQuickCheckIn}
      />

      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(60px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes topProgress {
          0% { transform: translateX(-100%); width: 40%; }
          50% { transform: translateX(50%); width: 60%; }
          100% { transform: translateX(250%); width: 40%; }
        }
        .animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }
        .animate-slide-up { animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-top-progress { animation: topProgress 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </div>
  );
};

export default StayOverview;