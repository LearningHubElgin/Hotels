import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Filter,
  Download,
  Eye,
  Calendar,
  Phone,
  User,
  History,
  Clock,
  Loader2,
  Hotel,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  X,
  CreditCard,
  FileText,
  UserCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  ArrowUpDown
} from 'lucide-react';
import api, { getUploadUrl } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { encodeUrlId } from '../../../utils/urlSecurity';
import { generateTaxInvoice } from '../../../utils/taxInvoiceGenerator';
import { generateCheckInVoucher } from '../../../utils/pdfGenerator';
import { downloadDocumentFile } from '../../../utils/fileDownloader';
import { cleanRoomNumber, formatInvoiceNumber } from '../../../utils/roomHelper';
import AddGuestModal from '../../../components/AddGuestModal';
import { getAutoRegNo } from '../../../utils/registrationNumberGenerator';

const formatTime12hr = (timeStr, fallback = '12:00 PM') => {
  if (!timeStr) return fallback;
  const upper = String(timeStr).toUpperCase().trim();
  if (upper.includes('AM') || upper.includes('PM')) {
    return upper;
  }
  try {
    const [hour, minute] = String(timeStr).split(':');
    const h = parseInt(hour, 10);
    if (isNaN(h)) return fallback;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHour = h % 12 || 12;
    const minStr = minute ? minute.substring(0, 2) : '00';
    return `${displayHour.toString().padStart(2, '0')}:${minStr.padStart(2, '0')} ${ampm}`;
  } catch (e) {
    return upper || fallback;
  }
};

const formatTransactionDateTime = (dateVal, timeVal) => {
  if (!dateVal && !timeVal) return 'N/A';
  let datePart = '';
  let timePart = timeVal ? formatTime12hr(timeVal) : '';

  if (typeof dateVal === 'string') {
    if (dateVal.includes('T')) {
      const d = new Date(dateVal);
      if (!isNaN(d.getTime())) {
        datePart = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        if (!timePart) {
          timePart = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
        }
      }
    } else {
      const cleanStr = dateVal.trim();
      const parts = cleanStr.split(/[/|-]/);
      if (parts.length === 3) {
        let p1 = parseInt(parts[0], 10);
        let p2 = parseInt(parts[1], 10);
        let p3 = parseInt(parts[2], 10);

        let day, month, year;
        if (p3 > 1000) {
          day = p1;
          month = p2;
          year = p3;
        } else if (p1 > 1000) {
          year = p1;
          month = p2;
          day = p3;
        }

        if (day && month && year) {
          const dObj = new Date(year, month - 1, day);
          if (!isNaN(dObj.getTime())) {
            datePart = dObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
          }
        }
      }
    }
  } else if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
    datePart = dateVal.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    if (!timePart) {
      timePart = dateVal.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    }
  }

  if (!datePart) {
    const d = new Date(dateVal);
    if (!isNaN(d.getTime())) {
      datePart = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } else {
      datePart = String(dateVal || '');
    }
  }

  return `${datePart}${timePart ? ` @ ${timePart}` : ''}`.trim() || 'N/A';
};

const formatDateAndTimeParts = (dateVal, timeVal) => {
  if (!dateVal && !timeVal) return { dateStr: 'N/A', timeStr: '' };
  let datePart = '';
  let timePart = timeVal ? formatTime12hr(timeVal) : '';

  if (typeof dateVal === 'string') {
    if (dateVal.includes('T')) {
      const d = new Date(dateVal);
      if (!isNaN(d.getTime())) {
        datePart = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        if (!timePart) {
          timePart = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
        }
      }
    } else {
      const cleanStr = dateVal.trim();
      const parts = cleanStr.split(/[/|-]/);
      if (parts.length === 3) {
        let p1 = parseInt(parts[0], 10);
        let p2 = parseInt(parts[1], 10);
        let p3 = parseInt(parts[2], 10);

        let day, month, year;
        if (p3 > 1000) {
          day = p1;
          month = p2;
          year = p3;
        } else if (p1 > 1000) {
          year = p1;
          month = p2;
          day = p3;
        }

        if (day && month && year) {
          const dObj = new Date(year, month - 1, day);
          if (!isNaN(dObj.getTime())) {
            datePart = dObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
          }
        }
      }
    }
  } else if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
    datePart = dateVal.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    if (!timePart) {
      timePart = dateVal.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    }
  }

  if (!datePart) {
    const d = new Date(dateVal);
    if (!isNaN(d.getTime())) {
      datePart = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } else {
      datePart = String(dateVal || '');
    }
  }

  return {
    dateStr: datePart || 'N/A',
    timeStr: timePart || ''
  };
};

const getRoomShiftBreakdown = (guest) => {
  if (!guest) return null;

  const rawPrevRm = guest.previousRoomNumber;
  if (!rawPrevRm) return null;

  const currentRm = cleanRoomNumber(guest.Room?.roomNumber || guest.roomId || '');
  let prevRooms = String(rawPrevRm).split(/→|->|,|>/).map(s => cleanRoomNumber(s.trim())).filter(Boolean);

  if (prevRooms.length === 0) return null;

  // Build complete sequence of rooms
  const allRoomsInOrder = [...prevRooms];
  if (currentRm && allRoomsInOrder[allRoomsInOrder.length - 1] !== currentRm) {
    allRoomsInOrder.push(currentRm);
  }

  if (allRoomsInOrder.length <= 1) return null;

  const checkInDateStr = guest.checkInDate ? guest.checkInDate.split('T')[0] : '';
  const checkOutDateStr = guest.checkOutDate ? guest.checkOutDate.split('T')[0] : '';

  const cIn = checkInDateStr ? new Date(checkInDateStr) : new Date();
  const cOut = checkOutDateStr ? new Date(checkOutDateStr) : new Date(cIn.getTime() + 86400000);
  const totalStayDays = Math.max(1, Math.ceil(Math.abs(cOut - cIn) / (1000 * 60 * 60 * 24)));

  let shiftDateStr = guest.shiftDate || (guest.updatedAt ? guest.updatedAt.split('T')[0] : '');
  const todayStr = new Date().toISOString().split('T')[0];

  if (!shiftDateStr || shiftDateStr < checkInDateStr || shiftDateStr > checkOutDateStr) {
    if (todayStr > checkInDateStr && todayStr <= checkOutDateStr) {
      shiftDateStr = todayStr;
    } else {
      const midTime = cIn.getTime() + Math.max(1, Math.floor(totalStayDays / 2)) * 86400000;
      shiftDateStr = new Date(midTime).toISOString().split('T')[0];
    }
  }

  const prevRatesList = String(guest.previousRoomRate || '').split(/→|->|,|>/).map(s => Number(s.trim())).filter(n => !isNaN(n));
  const defaultPrevRate = prevRatesList.length > 0 ? prevRatesList[0] : Number(guest.Room?.pricePerNight || 0);

  const prevTypesList = String(guest.previousRoomType || '').split(/→|->|,|>/).map(s => s.trim()).filter(Boolean);

  // Calculate Base Total for Booking
  let rawBaseTotal = parseFloat(guest.totalAmount || 0);
  const discount = parseFloat(guest.discount || 0);
  const gstRate = parseFloat(guest.gstRate !== undefined && guest.gstRate !== null ? guest.gstRate : 0);
  const gstOption = guest.gstOption || 'exclusive';
  const amountPaid = parseFloat(guest.amountPaid || 0);

  let baseRoomTotal = Math.max(0, rawBaseTotal - discount);

  let prevDays = 0;
  if (shiftDateStr > checkInDateStr) {
    prevDays = Math.min(totalStayDays - 1, Math.ceil(Math.abs(new Date(shiftDateStr) - cIn) / (1000 * 60 * 60 * 24)));
  }
  const curDays = Math.max(1, totalStayDays - prevDays);

  const shiftItems = [];

  const rawShiftTimesStr = guest.shiftTime || guest.roomShiftTimes || '';
  const shiftTimesList = String(rawShiftTimesStr).split(/→|->|,|>/).map(s => s.trim()).filter(Boolean);
  const fallbackShiftTime = guest.updatedAt ? new Date(guest.updatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '12:00 PM';

  allRoomsInOrder.forEach((rmNum, idx) => {
    const isCurrent = idx === allRoomsInOrder.length - 1;
    const type = prevTypesList[idx] || (isCurrent ? (guest.Room?.type || 'Deluxe') : (guest.previousRoomType || 'Deluxe'));

    let startParts, endParts;
    let days = 0;

    if (idx === 0) {
      startParts = formatDateAndTimeParts(guest.checkInDate, guest.checkInTime);
      const firstShiftT = shiftTimesList[0] || (allRoomsInOrder.length === 2 ? fallbackShiftTime : '12:00 PM');
      endParts = formatDateAndTimeParts(shiftDateStr, firstShiftT);
      days = prevDays;
    } else if (!isCurrent) {
      // Intermediate Room Shift (Same-day shift)
      const prevStepTime = shiftTimesList[idx - 1] || shiftTimesList[0] || fallbackShiftTime;
      const thisStepTime = shiftTimesList[idx] || prevStepTime;
      startParts = formatDateAndTimeParts(shiftDateStr, prevStepTime);
      endParts = formatDateAndTimeParts(shiftDateStr, thisStepTime);
      days = 0; // Same day shift = 0 nights!
    } else {
      const lastShiftTime = shiftTimesList[shiftTimesList.length - 1] || fallbackShiftTime;
      startParts = formatDateAndTimeParts(shiftDateStr, lastShiftTime);
      endParts = formatDateAndTimeParts(guest.checkOutDate, guest.checkOutTime);
      days = curDays;
    }

    const sameDayOptList = String(guest.sameDayChargeOption || 'no_charge').split(/→|->|,|>/).map(s => s.trim());
    const stepSameDayOpt = sameDayOptList[idx] || sameDayOptList[0] || 'no_charge';
    const isSameDayShift = days === 0 || (startParts.dateStr === endParts.dateStr && startParts.timeStr === endParts.timeStr);

    let rate = 0;
    let total = 0;

    if (isSameDayShift) {
      days = 0;
      const pRate = prevRatesList[idx] !== undefined && !isNaN(prevRatesList[idx]) ? prevRatesList[idx] : defaultPrevRate;
      rate = pRate;
      const hasShiftDayCharge = (stepSameDayOpt === 'charge_previous');
      total = hasShiftDayCharge ? pRate : 0;
    } else if (!isCurrent) {
      rate = prevRatesList[idx] !== undefined && !isNaN(prevRatesList[idx]) ? prevRatesList[idx] : defaultPrevRate;
      const shiftDayExtra = (stepSameDayOpt === 'charge_previous') ? rate : 0;
      total = (days * rate) + shiftDayExtra;
    }

    shiftItems.push({
      roomNumber: rmNum,
      roomType: type,
      rate,
      days,
      total,
      isCurrent,
      isSameDayShift,
      startParts,
      endParts,
      startSchedule: `${startParts.dateStr} @ ${startParts.timeStr}`,
      endSchedule: `${endParts.dateStr} @ ${endParts.timeStr}`,
      label: isCurrent ? 'Shifted Room (Current)' : (idx === 0 ? 'Initial Room Assignment' : `Shift Room ${idx}`)
    });
  });

  // Calculate current room total and rate to reconcile with baseRoomTotal
  const prevTotalSum = shiftItems.filter(it => !it.isCurrent).reduce((sum, it) => sum + it.total, 0);
  const curItemIndex = shiftItems.findIndex(it => it.isCurrent);
  if (curItemIndex !== -1) {
    const curDaysCount = shiftItems[curItemIndex].days;
    const curTotal = Math.max(0, baseRoomTotal - prevTotalSum);
    const curRate = curDaysCount > 0 ? (curTotal / curDaysCount) : Number(guest.Room?.pricePerNight || defaultPrevRate);

    shiftItems[curItemIndex].total = curTotal;
    shiftItems[curItemIndex].rate = curRate;
  }

  return {
    shiftItems,
    shiftDateStr,
    formattedShiftDate: formatTransactionDateTime(shiftDateStr, '02:00 PM')
  };
};

// Module-level in-memory cache for instant navigation without loading lag
let guestHistoryCache = {
  history: null,
  totalPages: 1,
  totalRecords: 0
};

const GuestHistory = () => {
  const navigate = useNavigate();
  const { activeHotel } = useAuth();
  const hasRoomType = activeHotel?.hasRoomType !== false;
  const [history, setHistory] = useState(guestHistoryCache.history || []);
  const [isRefreshing, setIsRefreshing] = useState(!guestHistoryCache.history);
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(guestHistoryCache.totalPages || 1);
  const [totalRecords, setTotalRecords] = useState(guestHistoryCache.totalRecords || 0);
  const [selectedGuest, setSelectedGuest] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState('personal');
  const [previewImage, setPreviewImage] = useState(null);
  const [sortField, setSortField] = useState(null); // 'invoiceNumber'
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc' | 'desc'

  // Repeat Check-In state
  const [showRepeatModal, setShowRepeatModal] = useState(false);
  const [repeatModalData, setRepeatModalData] = useState(null);
  const [selectedGuestsMap, setSelectedGuestsMap] = useState({});
  const [availableRooms, setAvailableRooms] = useState([]);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [isAddGuestOpen, setIsAddGuestOpen] = useState(false);
  const [prefilledRepeatData, setPrefilledRepeatData] = useState(null);

  const fetchHistory = async () => {
    try {
      setIsRefreshing(true);
      const response = await api.get('/bookings/history', {
        params: {
          search,
          startDate,
          endDate,
          page: currentPage,
          limit: 10
        }
      });
      const data = response.data?.data || [];
      const totalP = response.data?.totalPages || 1;
      const totalR = response.data?.totalRecords || 0;

      if (currentPage === 1 && !search && !startDate && !endDate) {
        guestHistoryCache.history = data;
        guestHistoryCache.totalPages = totalP;
        guestHistoryCache.totalRecords = totalR;
      }

      setHistory(data);
      setTotalPages(totalP);
      setTotalRecords(totalR);
    } catch (error) {
      console.error('Error fetching guest history:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [currentPage]);

  useEffect(() => {
    if (currentPage !== 1) {
      setCurrentPage(1);
    } else {
      fetchHistory();
    }
  }, [search, startDate, endDate]);

  useEffect(() => {
    if (showModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showModal]);

  const handleDownloadInvoice = async (bill) => {
    await generateTaxInvoice(bill);
  };

  const handlePreviewInvoice = async (bill) => {
    try {
      const blob = await generateTaxInvoice(bill, 'blob');
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err) {
      console.error('Preview failed:', err);
    }
  };

  const handleDownloadRegForm = async (guest) => {
    await generateCheckInVoucher(guest, 'save');
  };

  const handlePreviewRegForm = async (guest) => {
    try {
      const blob = await generateCheckInVoucher(guest, 'blob');
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err) {
      console.error('Preview Reg Form failed:', err);
    }
  };

  const handleOpenRepeatCheckInModal = async (item) => {
    try {
      const roomsRes = await api.get('/rooms');
      const avail = (roomsRes.data?.data || []).filter(r => r.status === 'available');
      setAvailableRooms(avail);
      if (avail.length > 0) {
        setSelectedRoomId(String(avail[0].id));
      } else {
        setSelectedRoomId('');
      }

      const guestsList = [];
      const primaryId = 'guest_primary';
      guestsList.push({
        id: primaryId,
        name: item.guestName || 'Primary Guest',
        phone: item.phone || '',
        email: item.email || '',
        age: item.age || 30,
        gender: item.gender || 'Male',
        nationality: item.nationality || 'Indian',
        idType: item.idType || 'Aadhar',
        idProof: item.idProof || '',
        address: item.address || '',
        passportNumber: item.passportNumber || '',
        passportExpiry: item.passportExpiry || '',
        visaNumber: item.visaNumber || '',
        visaType: item.visaType || 'Tourist',
        visaExpiry: item.visaExpiry || '',
        country: item.country || 'United States',
        guestGst: item.guestGst || '',
        companyName: item.companyName || '',
        companyAddress: item.companyAddress || '',
        aadhaarFront: item.originalAadhaarFront || item.aadhaarFront || null,
        aadhaarBack: item.originalAadhaarBack || item.aadhaarBack || null,
        guestPhoto: item.originalGuestPhoto || item.guestPhoto || null,
        isPrimary: true
      });

      const initialMap = { [primaryId]: true };

      // Parse extra guests
      let parsedExtra = [];
      try {
        if (item.extraGuests) {
          parsedExtra = typeof item.extraGuests === 'string'
            ? JSON.parse(item.extraGuests)
            : item.extraGuests;
        }
      } catch (e) { }

      if (Array.isArray(parsedExtra)) {
        parsedExtra.forEach((g, idx) => {
          if (g && (g.name || g.phone)) {
            const extraId = `guest_extra_${idx}`;
            guestsList.push({
              id: extraId,
              name: g.name || `Guest ${idx + 2}`,
              phone: g.phone || '',
              email: g.email || '',
              age: g.age || 25,
              gender: g.gender || 'Male',
              nationality: g.nationality || 'Indian',
              idType: g.idType || 'Aadhar',
              idProof: g.idNumber || g.idProof || '',
              address: g.address || item.address || '',
              passportNumber: g.passportNumber || '',
              passportExpiry: g.passportExpiry || '',
              visaNumber: g.visaNumber || '',
              visaType: g.visaType || 'Tourist',
              visaExpiry: g.visaExpiry || '',
              country: g.country || 'United States',
              idFront: g.idFront || null,
              idBack: g.idBack || null,
              isChild: !!g.isChild,
              isPrimary: false
            });
            initialMap[extraId] = true;
          }
        });
      }

      // If group booking with extra primary guests across sub-bookings
      if (item.groupBookings && item.groupBookings.length > 1) {
        item.groupBookings.forEach((gb, gbIdx) => {
          if (gb.guestName && gb.guestName.toLowerCase() !== item.guestName?.toLowerCase()) {
            const gbId = `group_guest_${gbIdx}`;
            if (!guestsList.some(existing => existing.name.toLowerCase() === gb.guestName.toLowerCase())) {
              guestsList.push({
                id: gbId,
                name: gb.guestName,
                phone: gb.phone || '',
                email: gb.email || '',
                age: gb.age || 30,
                gender: gb.gender || 'Male',
                nationality: gb.nationality || 'Indian',
                idType: gb.idType || 'Aadhar',
                idProof: gb.idProof || '',
                address: gb.address || item.address || '',
                isPrimary: false
              });
              initialMap[gbId] = true;
            }
          }
        });
      }

      setRepeatModalData({
        item,
        guests: guestsList
      });
      setSelectedGuestsMap(initialMap);
      setShowRepeatModal(true);
    } catch (err) {
      console.error('Error fetching rooms for repeat check-in:', err);
      alert('Failed to load room details for repeat check-in.');
    }
  };

  const handleProceedToRepeatCheckIn = () => {
    if (!repeatModalData) return;
    const checkedGuests = repeatModalData.guests.filter(g => selectedGuestsMap[g.id]);
    if (checkedGuests.length === 0) {
      return alert('Please select at least one guest for check-in.');
    }

    const primaryGuest = checkedGuests.find(g => g.isPrimary) || checkedGuests[0];
    const remainingGuests = checkedGuests.filter(g => g.id !== primaryGuest.id);

    const extraGuestsPayload = remainingGuests.map(g => ({
      name: g.name,
      phone: g.phone,
      age: g.age,
      gender: g.gender,
      nationality: g.nationality,
      idType: g.idType,
      idNumber: g.idProof,
      passportNumber: g.passportNumber,
      passportExpiry: g.passportExpiry,
      visaNumber: g.visaNumber,
      visaExpiry: g.visaExpiry,
      country: g.country,
      idFront: g.idFront,
      idBack: g.idBack,
      isChild: !!g.isChild
    }));

    const payload = {
      isRepeatCheckIn: true,
      guestName: primaryGuest.name,
      phone: primaryGuest.phone,
      email: primaryGuest.email,
      age: primaryGuest.age,
      gender: primaryGuest.gender,
      nationality: primaryGuest.nationality,
      idType: primaryGuest.idType,
      idProof: primaryGuest.idProof,
      address: primaryGuest.address,
      guestGst: primaryGuest.guestGst,
      companyName: primaryGuest.companyName,
      companyAddress: primaryGuest.companyAddress,
      passportNumber: primaryGuest.passportNumber,
      passportExpiry: primaryGuest.passportExpiry,
      visaNumber: primaryGuest.visaNumber,
      visaType: primaryGuest.visaType,
      visaExpiry: primaryGuest.visaExpiry,
      country: primaryGuest.country,
      aadhaarFront: primaryGuest.aadhaarFront,
      aadhaarBack: primaryGuest.aadhaarBack,
      guestPhoto: primaryGuest.guestPhoto,
      extraGuests: extraGuestsPayload,
      numberOfGuests: checkedGuests.length,
      selectedRoomId: selectedRoomId || null
    };

    setPrefilledRepeatData(payload);
    setShowRepeatModal(false);
    setIsAddGuestOpen(true);
  };

  const handleConfirmRepeatCheckIn = async (formDataPayload) => {
    try {
      await api.post('/bookings', formDataPayload);
      setIsAddGuestOpen(false);
      setPrefilledRepeatData(null);
      fetchHistory();
      alert('Guest repeat check-in completed successfully!');
    } catch (err) {
      console.error('Error repeating check-in:', err);
      alert(err.response?.data?.message || 'Failed to complete repeat check-in');
    }
  };

  const groupedHistory = [];
  const seenGroupBookingIds = new Set();

  history.forEach((item) => {
    if (item.groupBookingId) {
      if (!seenGroupBookingIds.has(item.groupBookingId)) {
        seenGroupBookingIds.add(item.groupBookingId);

        // Find all bookings in history with the same groupBookingId
        const groupItems = history.filter(h => h.groupBookingId === item.groupBookingId);

        // Format room shift chain (e.g. R-301 → 202 → 301)
        const formatRoomChain = (h) => {
          const curRm = cleanRoomNumber(h.Room?.roomNumber || h.roomId || '');
          const prevStr = h.previousRoomNumber ? String(h.previousRoomNumber).trim() : '';

          if (prevStr) {
            const parts = prevStr.split(/→|->|,|>/).map(s => cleanRoomNumber(s.trim())).filter(Boolean);
            if (curRm && parts[parts.length - 1] !== curRm) {
              parts.push(curRm);
            }
            if (parts.length > 0) {
              return `R-${parts.join(' → ')}`;
            }
          }

          return curRm ? `R-${curRm}` : 'N/A';
        };

        const roomNumbers = [...new Set(groupItems.map(formatRoomChain).filter(Boolean))];
        const roomTypes = groupItems
          .map(h => h.Room?.type)
          .filter(Boolean);

        // Create an aggregated group item
        const groupItem = {
          ...item,
          isGroup: true,
          roomNumbers: roomNumbers,
          roomTypes: roomTypes,
          groupBookings: groupItems,
          // Sum amounts
          amountPaid: groupItems.reduce((sum, h) => sum + parseFloat(h.amountPaid || 0), 0),
          totalAmount: groupItems.reduce((sum, h) => sum + parseFloat(h.totalAmount || 0), 0),
          discount: groupItems.reduce((sum, h) => sum + parseFloat(h.discount || 0), 0),
        };
        groupedHistory.push(groupItem);
      }
    } else {
      const formatRoomChain = (h) => {
        const curRm = cleanRoomNumber(h.Room?.roomNumber || h.roomId || '');
        const prevStr = h.previousRoomNumber ? String(h.previousRoomNumber).trim() : '';

        if (prevStr) {
          const parts = prevStr.split(/→|->|,|>/).map(s => cleanRoomNumber(s.trim())).filter(Boolean);
          if (curRm && parts[parts.length - 1] !== curRm) {
            parts.push(curRm);
          }
          if (parts.length > 0) {
            return `R-${parts.join(' → ')}`;
          }
        }

        return curRm ? `R-${curRm}` : 'N/A';
      };

      const singleRoomDisplay = formatRoomChain(item);

      groupedHistory.push({
        ...item,
        isGroup: false,
        roomNumbers: [singleRoomDisplay].filter(Boolean),
        roomTypes: [item.Room?.type].filter(Boolean),
        groupBookings: [item]
      });
    }
  });

  // Sort by latest checkout first, then by most recently updated
  groupedHistory.sort((a, b) => {
    const dateA = new Date(a.checkOutDate || 0);
    const dateB = new Date(b.checkOutDate || 0);
    if (dateB.getTime() !== dateA.getTime()) return dateB - dateA;
    const updA = new Date(a.updatedAt || 0);
    const updB = new Date(b.updatedAt || 0);
    return updB - updA;
  });

  const sortedGroupedHistory = useMemo(() => {
    if (!sortField) return groupedHistory;

    return [...groupedHistory].sort((a, b) => {
      if (sortField === 'registrationNumber') {
        const regA = a.registrationNumber || getAutoRegNo(a, history);
        const regB = b.registrationNumber || getAutoRegNo(b, history);
        const numA = parseInt(regA.replace(/\D/g, ''), 10);
        const numB = parseInt(regB.replace(/\D/g, ''), 10);
        let cmp = 0;
        if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
          cmp = numA - numB;
        } else {
          cmp = regA.localeCompare(regB, undefined, { numeric: true, sensitivity: 'base' });
        }
        return sortOrder === 'asc' ? cmp : -cmp;
      }
      if (sortField === 'invoiceNumber') {
        const invA = a.invoiceNumber || '';
        const invB = b.invoiceNumber || '';

        if (!invA && !invB) return 0;
        if (!invA) return 1;
        if (!invB) return -1;

        const numA = parseInt(invA.replace(/\D/g, ''), 10);
        const numB = parseInt(invB.replace(/\D/g, ''), 10);

        let cmp = 0;
        if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
          cmp = numA - numB;
        } else {
          cmp = invA.localeCompare(invB, undefined, { numeric: true, sensitivity: 'base' });
        }

        return sortOrder === 'asc' ? cmp : -cmp;
      }
      return 0;
    });
  }, [groupedHistory, sortField, sortOrder]);

  return (
    <div className="space-y-4 pb-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 sm:p-4 rounded-xl border border-[#DDE5D0] shadow-sm">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-10 h-10 bg-gradient-to-br from-[#F0F3E8] to-white rounded-xl flex items-center justify-center text-[#84A63C] shadow-inner">
            <History size={20} />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-black text-[#1A2E05] tracking-tight flex items-center gap-2">
              <span>Guest History</span>
              {isRefreshing && <Loader2 size={16} className="text-[#84A63C] animate-spin" title="Refreshing history in background..." />}
            </h1>
            <p className="text-xs font-bold text-[#2E4316] mt-0.5">Archive of all previous stays</p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <span className="px-3 py-1.5 bg-[#F9FAFA] border border-[#DDE5D0] rounded-lg text-xs font-black text-[#1A2E05]">
            Total Records: {totalRecords}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5 bg-white p-3 rounded-xl border border-[#DDE5D0] shadow-xs">
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A8A6A]" size={15} />
          <input
            type="text"
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-[#F5F7F0] border border-[#DDE5D0] rounded-lg text-xs font-semibold focus:outline-none focus:border-[#84A63C] transition-all text-[#1A2E05]"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:contents">
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A8A6A] sm:hidden" size={14} />
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full pl-8 sm:pl-3 pr-2 py-1.5 bg-[#F5F7F0] border border-[#DDE5D0] rounded-lg text-xs font-bold text-[#1A2E05]" />
          </div>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A8A6A] sm:hidden" size={14} />
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full pl-8 sm:pl-3 pr-2 py-1.5 bg-[#F5F7F0] border border-[#DDE5D0] rounded-lg text-xs font-bold text-[#1A2E05]" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#DDE5D0] shadow-2xs overflow-hidden">
        {/* Desktop View */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left min-w-[750px] text-xs">
            <thead>
              <tr className="bg-[#F5F7F0] border-b border-[#DDE5D0]">
                <th className="px-4 py-2.5 text-[11px] font-black text-[#1A2E05] uppercase tracking-wider">Guest Info</th>
                {activeHotel?.enableRegistrationNumber === true && (
                  <th
                    onClick={() => {
                      if (sortField === 'registrationNumber') {
                        setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortField('registrationNumber');
                        setSortOrder('asc');
                      }
                    }}
                    className="px-4 py-2.5 text-[11px] font-black text-[#1A2E05] uppercase tracking-wider cursor-pointer select-none hover:text-[#84A63C] transition-colors group/sort whitespace-nowrap"
                    title={`Click to sort by Reg. No. (${sortOrder === 'asc' ? 'Ascending' : 'Descending'})`}
                  >
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                      <span className="whitespace-nowrap">Reg. No.</span>
                      {sortField === 'registrationNumber' ? (
                        sortOrder === 'asc' ? (
                          <ArrowUp size={13} className="text-[#84A63C] shrink-0 stroke-[2.5]" />
                        ) : (
                          <ArrowDown size={13} className="text-[#84A63C] shrink-0 stroke-[2.5]" />
                        )
                      ) : (
                        <ArrowUpDown size={13} className="text-[#2E4316] shrink-0 opacity-75 group-hover/sort:opacity-100 transition-opacity" />
                      )}
                    </div>
                  </th>
                )}
                <th
                  onClick={() => {
                    if (sortField === 'invoiceNumber') {
                      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSortField('invoiceNumber');
                      setSortOrder('asc');
                    }
                  }}
                  className="px-4 py-2.5 text-[11px] font-black text-[#1A2E05] uppercase tracking-wider cursor-pointer select-none hover:text-[#84A63C] transition-colors group/sort"
                  title={`Click to sort by Bill Number (${sortOrder === 'asc' ? 'Ascending' : 'Descending'})`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>Bill No.</span>
                    {sortField === 'invoiceNumber' ? (
                      sortOrder === 'asc' ? (
                        <ArrowUp size={13} className="text-[#84A63C] shrink-0 stroke-[2.5]" />
                      ) : (
                        <ArrowDown size={13} className="text-[#84A63C] shrink-0 stroke-[2.5]" />
                      )
                    ) : (
                      <ArrowUpDown size={13} className="text-[#2E4316] shrink-0 opacity-75 group-hover/sort:opacity-100 transition-opacity" />
                    )}
                  </div>
                </th>
                <th className="px-4 py-2.5 text-[11px] font-black text-[#1A2E05] uppercase tracking-wider">Stay Period</th>
                <th className="px-4 py-2.5 text-[11px] font-black text-[#1A2E05] uppercase tracking-wider">Room Detail</th>
                <th className="px-4 py-2.5 text-[11px] font-black text-[#1A2E05] uppercase tracking-wider">Amount Paid</th>
                <th className="px-4 py-2.5 text-[11px] font-black text-[#1A2E05] uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F3E8]">
              {sortedGroupedHistory.length > 0 ? sortedGroupedHistory.map((item) => {
                const rawTotal = parseFloat(item.totalAmount || 0);
                const discount = parseFloat(item.discount || 0);
                const gstRate = parseFloat(item.gstRate !== undefined && item.gstRate !== null ? item.gstRate : 0);
                const gstOption = item.gstOption || 'exclusive';
                const amountPaid = parseFloat(item.amountPaid || 0);

                let grandTotal = Math.max(0, rawTotal - discount);
                if (gstOption === 'inclusive' && amountPaid > grandTotal && Math.abs(amountPaid - Math.round(grandTotal * (1 + gstRate / 100))) < 1.5) {
                  grandTotal = amountPaid;
                }

                let subTotal = grandTotal;
                let gstAmount = 0;

                if (gstOption === 'exclusive' && gstRate > 0) {
                  subTotal = grandTotal;
                  gstAmount = Number((subTotal * (gstRate / 100)).toFixed(2));
                } else if (gstOption === 'inclusive' && gstRate > 0) {
                  subTotal = Number((grandTotal / (1 + gstRate / 100)).toFixed(2));
                  gstAmount = Number((grandTotal - subTotal).toFixed(2));
                } else {
                  subTotal = grandTotal;
                  gstAmount = 0;
                }
                return (
                  <tr
                    key={item.id}
                    onClick={(e) => {
                      if (['INPUT', 'BUTTON', 'A', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) || e.target.closest('button') || e.target.closest('input')) {
                        return;
                      }
                      navigate(`/dashboard/front-office/guest-billing/${encodeUrlId(item.id)}`, { state: { bill: item } });
                    }}
                    className="hover:bg-[#F5F7F0] transition-colors group cursor-pointer"
                    title="Click to view full guest billing & stay details"
                  >
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#F0F3E8] to-white flex items-center justify-center font-black text-[#1C2B12] shadow-2xs border border-[#DDE5D0]/50 shrink-0">{item.guestName[0]}</div>
                        <div>
                          <p className="text-xs font-black text-[#1A2E05]">{item.guestName}</p>
                          {item.status === 'Cancelled' && (
                            <span className="inline-block px-1.5 py-0.5 mt-0.5 rounded text-[8.5px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                              Cancelled
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    {activeHotel?.enableRegistrationNumber === true && (
                      <td className="px-4 py-2 whitespace-nowrap">
                        {item.status === 'Cancelled' ? (
                          <span className="text-xs text-gray-400 font-bold">-</span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#EEF4E3] border border-[#D3E2BD] font-mono text-[#1A2E05] whitespace-nowrap">
                            {item.registrationNumber || getAutoRegNo(item, history)}
                          </span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-2">
                      {item.status === 'Cancelled' ? (
                        <span className="text-xs text-gray-400 font-bold">-</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#F5F7F0] border border-[#DDE5D0] font-mono text-[#1A2E05]">
                          {formatInvoiceNumber(item.invoiceNumber, activeHotel)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-col">
                        <span className="text-xs font-black text-[#1A2E05] tracking-tight">{new Date(item.checkInDate).toLocaleDateString()}</span>
                        <span className="text-[10px] font-bold text-[#2E4316] mt-0.5 flex items-center gap-1"><History size={10} /> {new Date(item.checkOutDate).toLocaleDateString()}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-col">
                        <span className="text-xs font-black text-[#1C2B12]">
                          {item.roomNumbers && item.roomNumbers.length > 0 ? item.roomNumbers.join(', ') : (item.Room?.roomNumber ? `R-${cleanRoomNumber(item.Room.roomNumber)}` : 'N/A')}
                        </span>
                        {hasRoomType && (
                          <span className="text-[10px] font-bold text-[#2E4316] mt-0.5">
                            {item.roomTypes ? [...new Set(item.roomTypes)].join(', ') : (item.Room?.type || 'N/A')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-col">
                        <span className="text-xs font-black text-[#1A2E05]">₹{parseFloat(item.amountPaid).toLocaleString()}</span>
                        {item.status === 'Cancelled' ? (() => {
                          let refund = null;
                          try {
                            const history = JSON.parse(item.paymentHistory || '[]');
                            refund = history.find(h => h.type === 'Refund' || h.amount < 0);
                          } catch (e) { }
                          if (refund) {
                            return (
                              <span className="text-[10px] font-bold text-rose-600 mt-0.5 block">
                                Refund: ₹{Math.abs(refund.amount).toLocaleString()} ({refund.paymentMode || 'Cash'})
                              </span>
                            );
                          }
                          return <span className="text-[10px] font-bold text-rose-600 mt-0.5 block">Cancelled (No Refund)</span>;
                        })() : (
                          <span className="text-[9.5px] font-bold text-[#2E4316] mt-0.5">
                            ₹{subTotal.toLocaleString()} + ₹{gstAmount.toLocaleString()} (GST {gstRate}%)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2 justify-end transition-all">
                        <button
                          onClick={() => handleOpenRepeatCheckInModal(item)}
                          title="Repeat Check-In for returning guest(s)"
                          className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-600 hover:text-white transition-all shadow-xs active:scale-95"
                        >
                          <UserCheck size={14} />
                          <span className="whitespace-nowrap">Repeat Check-In</span>
                        </button>
                        <button onClick={() => { setSelectedGuest(item); setActiveTab('personal'); setShowModal(true); }} className="p-2.5 text-[#7A8A6A] bg-white border border-[#DDE5D0] rounded-xl hover:bg-[#F0F3E8] hover:text-[#1C2B12] transition-all shadow-sm active:scale-95"><Eye size={16} /></button>
                        <button onClick={() => handleDownloadInvoice(item)} className="p-2.5 text-[#7A8A6A] bg-white border border-[#DDE5D0] rounded-xl hover:bg-[#84A63C] hover:text-white transition-all shadow-md active:scale-95"><Download size={16} /></button>
                      </div>
                    </td>
                  </tr>
                );
              }) : (
                <tr><td colSpan="6" className="py-20 text-center text-[#4A5E38] font-bold text-xs sm:text-sm">No history found.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="sm:hidden divide-y divide-[#F0F3E8]">
          {groupedHistory.length > 0 ? groupedHistory.map((item) => {
            const rawTotal = parseFloat(item.totalAmount || 0);
            const discount = parseFloat(item.discount || 0);
            const gstRate = parseFloat(item.gstRate !== undefined && item.gstRate !== null ? item.gstRate : 0);
            const gstOption = item.gstOption || 'exclusive';
            const amountPaid = parseFloat(item.amountPaid || 0);

            let grandTotal = Math.max(0, rawTotal - discount);
            if (gstOption === 'inclusive' && amountPaid > grandTotal && Math.abs(amountPaid - Math.round(grandTotal * (1 + gstRate / 100))) < 1.5) {
              grandTotal = amountPaid;
            }

            let subTotal = grandTotal;
            let gstAmount = 0;

            if (gstOption === 'exclusive' && gstRate > 0) {
              subTotal = grandTotal;
              gstAmount = Number((subTotal * (gstRate / 100)).toFixed(2));
            } else if (gstOption === 'inclusive' && gstRate > 0) {
              subTotal = Number((grandTotal / (1 + gstRate / 100)).toFixed(2));
              gstAmount = Number((grandTotal - subTotal).toFixed(2));
            } else {
              subTotal = grandTotal;
              gstAmount = 0;
            }
            return (
              <div key={item.id} className="p-5 active:bg-[#F9FAFA] transition-colors">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-2xl bg-[#F0F3E8] flex items-center justify-center font-black text-[#1A2E05]">{item.guestName[0]}</div>
                    <div>
                      <h4 className="text-sm font-black text-[#1A2E05]">{item.guestName}</h4>
                      <p className="text-xs font-bold text-[#7A8A6A]">{item.phone}</p>
                      {activeHotel?.enableRegistrationNumber === true && item.status !== 'Cancelled' && (
                        <p className="text-[10px] font-bold text-[#2C4012] bg-[#EEF4E3] px-1.5 py-0.5 rounded border border-[#D3E2BD] inline-block mt-0.5">Reg: {item.registrationNumber || getAutoRegNo(item, history)}</p>
                      )}
                      {item.status !== 'Cancelled' && (
                        <p className="text-[10px] font-mono text-[#7A8A6A] mt-0.5">Bill: {formatInvoiceNumber(item.invoiceNumber, activeHotel)}</p>
                      )}
                      <p className="text-[10px] font-bold text-[#4A5E38] mt-0.5">
                        Rooms: {item.roomNumbers && item.roomNumbers.length > 0 ? item.roomNumbers.join(', ') : cleanRoomNumber(item.Room?.roomNumber || item.roomId || '')}
                        {hasRoomType && item.roomTypes ? ` (${[...new Set(item.roomTypes)].join(', ')})` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black text-[#5C7A1F]">₹{parseFloat(item.amountPaid).toLocaleString()}</p>
                    <p className="text-[8px] font-bold text-[#7A8A6A] mt-0.5">
                      ₹{subTotal.toLocaleString()} + ₹{gstAmount.toLocaleString()} (GST {gstRate}%)
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between bg-[#F9FAFA] p-3 rounded-2xl border border-[#DDE5D0]/50">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-[#4A5E38] mb-1">Stay Period</span>
                    <span className="text-xs font-black text-[#1A2E05]">{new Date(item.checkInDate).toLocaleDateString()} → {new Date(item.checkOutDate).toLocaleDateString()}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleOpenRepeatCheckInModal(item)}
                      title="Repeat Check-In"
                      className="flex items-center gap-1 px-2.5 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl active:scale-95"
                    >
                      <UserCheck size={14} />
                      <span>Repeat</span>
                    </button>
                    <button onClick={() => { setSelectedGuest(item); setActiveTab('personal'); setShowModal(true); }} className="p-2.5 bg-white border border-[#DDE5D0] rounded-xl text-[#7A8A6A] shadow-sm active:scale-95"><Eye size={16} /></button>
                    <button onClick={() => handleDownloadInvoice(item)} className="p-2.5 bg-[#1C2B12] text-white rounded-xl shadow-lg active:scale-95"><Download size={16} /></button>
                  </div>
                </div>
              </div>
            );
          }) : (
            <div className="py-20 text-center text-[#4A5E38] font-bold text-xs sm:text-sm">No history found.</div>
          )}
        </div>

        <div className="bg-[#F9FAFA] px-6 py-6 flex items-center justify-between border-t border-[#DDE5D0]">
          <p className="text-xs sm:text-sm font-black text-[#4A5E38]">
            Page <span className="text-[#1A2E05]">{currentPage}</span> / <span className="text-[#1A2E05]">{totalPages}</span>
          </p>
          <div className="flex gap-3">
            <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="w-10 h-10 flex items-center justify-center rounded-xl border border-[#DDE5D0] bg-white text-[#1C2B12] disabled:opacity-30 shadow-sm active:scale-95 transition-all"><ChevronLeft size={18} /></button>
            <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="w-10 h-10 flex items-center justify-center rounded-xl border border-[#DDE5D0] bg-white text-[#1C2B12] disabled:opacity-30 shadow-sm active:scale-95 transition-all"><ChevronRight size={18} /></button>
          </div>
        </div>
      </div>

      {showModal && selectedGuest && createPortal(
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-[#1C2B12]/40 backdrop-blur-sm animate-fade-in" onClick={() => setShowModal(false)}>
          <div className="bg-white w-full max-w-2xl max-h-[90vh] rounded-3xl overflow-hidden shadow-2xl animate-slide-up flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="bg-[#1C2B12] py-3 px-4 sm:py-3.5 sm:px-5 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-base font-black border border-white/10">
                  {selectedGuest.guestName[0]}
                </div>
                <div>
                  <p className="text-[9px] font-black text-[#84A63C] leading-none mb-0.5">Guest Archive</p>
                  <h2 className="text-base sm:text-lg font-black tracking-tight leading-snug">{selectedGuest.guestName}</h2>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 flex items-center justify-center bg-white/10 rounded-lg hover:bg-white/20 transition-all"><X size={16} /></button>
            </div>

            {/* Tabs Navigation */}
            <div className="flex bg-[#F0F3E8] p-1.5 rounded-2xl mx-6 sm:mx-8 mt-6 shrink-0 border border-[#DDE5D0]/60">
              {[
                { id: 'personal', label: 'Personal Info' },
                { id: 'stay', label: 'Stay Details' },
                { id: 'financial', label: 'Financial Summary' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 py-2 text-center text-xs font-black rounded-xl transition-all duration-300 ${activeTab === tab.id
                    ? 'bg-[#1C2B12] text-white shadow-sm'
                    : 'text-[#4A5E38] hover:bg-[#F5F7F0] hover:text-[#1C2B12]'
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 sm:p-8 custom-scrollbar">

              {/* Personal Information Tab */}
              {activeTab === 'personal' && (() => {
                let extraGuestsList = [];
                try {
                  if (selectedGuest?.extraGuests) {
                    extraGuestsList = typeof selectedGuest.extraGuests === 'string'
                      ? JSON.parse(selectedGuest.extraGuests)
                      : selectedGuest.extraGuests;
                  }
                } catch (e) { }

                return (
                  <div className="animate-fade-in space-y-4">
                    <h3 className="text-[10px] font-black text-[#84A63C] uppercase tracking-widest flex items-center gap-2 mb-2">
                      <User size={12} /> Personal Information
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="bg-[#F9FAFA] rounded-2xl p-3 border border-[#DDE5D0]/50">
                        <span className="text-[10px] font-bold text-[#5C7A1F] block mb-0.5">Full Name</span>
                        <span className="text-xs font-bold text-[#1C2B12] flex items-center gap-1.5 capitalize flex-wrap">
                          {selectedGuest.guestName}
                          {activeHotel?.enablePerGuestRoomAssignment && (selectedGuest.assignedRoomNumber || selectedGuest.assignedRoomId || selectedGuest.Room?.roomNumber || selectedGuest.previousRoomNumber) && (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-md inline-block">
                              Room {selectedGuest.assignedRoomNumber || selectedGuest.assignedRoomId || cleanRoomNumber(selectedGuest.previousRoomNumber || selectedGuest.Room?.roomNumber)}
                            </span>
                          )}
                          {selectedGuest.isChild && (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200 rounded-md inline-block">
                              Child
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="bg-[#F9FAFA] rounded-2xl p-3 border border-[#DDE5D0]/50">
                        <span className="text-[10px] font-bold text-[#5C7A1F] block mb-0.5">Father / Guardian Name</span>
                        <span className="text-xs font-bold text-[#1C2B12]">{selectedGuest.fatherName || 'N/A'}</span>
                      </div>
                      <div className="bg-[#F9FAFA] rounded-2xl p-3 border border-[#DDE5D0]/50">
                        <span className="text-[10px] font-bold text-[#5C7A1F] block mb-0.5">Phone Number</span>
                        <span className="text-xs font-bold text-[#1C2B12]">{selectedGuest.phone || 'N/A'}</span>
                      </div>
                      <div className="bg-[#F9FAFA] rounded-2xl p-3 border border-[#DDE5D0]/50">
                        <span className="text-[10px] font-bold text-[#5C7A1F] block mb-0.5">Email Address</span>
                        <span className="text-xs font-bold text-[#1C2B12] break-all">{selectedGuest.email || 'N/A'}</span>
                      </div>
                      <div className="bg-[#F9FAFA] rounded-2xl p-3 border border-[#DDE5D0]/50">
                        <span className="text-[10px] font-bold text-[#5C7A1F] block mb-0.5">Nationality</span>
                        <span className="text-xs font-bold text-[#1C2B12]">{selectedGuest.nationality || 'N/A'}</span>
                      </div>
                      {selectedGuest.idProof && (
                        <div className="bg-[#F9FAFA] rounded-2xl p-3 border border-[#DDE5D0]/50">
                          <span className="text-[10px] font-bold text-[#5C7A1F] block mb-0.5">{selectedGuest.idType || 'ID Proof'}</span>
                          <span className="text-xs font-bold text-[#1C2B12]">{selectedGuest.idProof}</span>
                        </div>
                      )}
                      {selectedGuest.address && (
                        <div className="bg-[#F9FAFA] rounded-2xl p-3 border border-[#DDE5D0]/50 sm:col-span-2">
                          <span className="text-[10px] font-bold text-[#5C7A1F] block mb-0.5">Address</span>
                          <span className="text-xs font-bold text-[#1C2B12]">{selectedGuest.address}</span>
                        </div>
                      )}
                    </div>

                    {/* Primary Guest ID & Signature Verification */}
                    <div className="pt-4 border-t border-[#DDE5D0]/40 space-y-4">
                      <h4 className="text-xs font-black text-[#84A63C] uppercase tracking-widest flex items-center gap-2">
                        <CreditCard size={12} /> Primary Guest ID & Signature Verification
                      </h4>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Aadhaar Front Side */}
                        <div className="bg-[#F9FAFA] p-3 rounded-2xl border border-[#DDE5D0]/50 flex flex-col items-center">
                          <div className="w-full flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold text-[#5C7A1F]">Aadhaar Front Image</span>
                            {selectedGuest.aadhaarFront && (
                              <button
                                type="button"
                                onClick={() => downloadDocumentFile(selectedGuest.aadhaarFront, 'aadhaar_front')}
                                className="text-[#5C7A1F] hover:text-[#1A2E05] p-1 rounded hover:bg-[#E2E8D8] transition-colors"
                                title="Download Aadhaar Front Image"
                              >
                                <Download size={12} />
                              </button>
                            )}
                          </div>
                          {selectedGuest.aadhaarFront ? (
                            (() => {
                              const isPdf = selectedGuest.aadhaarFront.startsWith('data:application/pdf') || selectedGuest.aadhaarFront.toLowerCase().includes('.pdf');
                              return (
                                <div className="w-full h-32 rounded-xl overflow-hidden border border-[#DDE5D0]/50 bg-white">
                                  {isPdf ? (
                                    <div
                                      className="w-full h-full bg-red-50 text-red-700 flex flex-col items-center justify-center cursor-pointer hover:bg-red-100 transition-colors"
                                      onClick={() => window.open(getUploadUrl(selectedGuest.aadhaarFront), '_blank')}
                                    >
                                      <FileText size={32} className="text-red-500" />
                                      <span className="text-[10px] font-black mt-2 uppercase tracking-wide">PDF ID Document</span>
                                    </div>
                                  ) : (
                                    <img
                                      src={getUploadUrl(selectedGuest.aadhaarFront)}
                                      alt="Aadhaar Front"
                                      className="w-full h-full object-contain cursor-pointer hover:opacity-90 transition-opacity"
                                      onClick={() => setPreviewImage(getUploadUrl(selectedGuest.aadhaarFront))}
                                      title="Click to preview full size image"
                                    />
                                  )}
                                </div>
                              );
                            })()
                          ) : (
                            <div className="w-full h-32 rounded-xl bg-gray-50 border border-dashed border-[#DDE5D0] flex flex-col items-center justify-center text-[#7A8A6A]">
                              <CreditCard size={20} className="opacity-40" />
                              <span className="text-[9px] mt-1 font-bold">No Image Uploaded</span>
                            </div>
                          )}
                        </div>

                        {/* Aadhaar Back Side */}
                        <div className="bg-[#F9FAFA] p-3 rounded-2xl border border-[#DDE5D0]/50 flex flex-col items-center">
                          <div className="w-full flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold text-[#5C7A1F]">Aadhaar Back Image</span>
                            {selectedGuest.aadhaarBack && (
                              <button
                                type="button"
                                onClick={() => downloadDocumentFile(selectedGuest.aadhaarBack, 'aadhaar_back')}
                                className="text-[#5C7A1F] hover:text-[#1A2E05] p-1 rounded hover:bg-[#E2E8D8] transition-colors"
                                title="Download Aadhaar Back Image"
                              >
                                <Download size={12} />
                              </button>
                            )}
                          </div>
                          {selectedGuest.aadhaarBack ? (
                            (() => {
                              const isPdf = selectedGuest.aadhaarBack.startsWith('data:application/pdf') || selectedGuest.aadhaarBack.toLowerCase().includes('.pdf');
                              return (
                                <div className="w-full h-32 rounded-xl overflow-hidden border border-[#DDE5D0]/50 bg-white">
                                  {isPdf ? (
                                    <div
                                      className="w-full h-full bg-red-50 text-red-700 flex flex-col items-center justify-center cursor-pointer hover:bg-red-100 transition-colors"
                                      onClick={() => window.open(getUploadUrl(selectedGuest.aadhaarBack), '_blank')}
                                    >
                                      <FileText size={32} className="text-red-500" />
                                      <span className="text-[10px] font-black mt-2 uppercase tracking-wide">PDF ID Document</span>
                                    </div>
                                  ) : (
                                    <img
                                      src={getUploadUrl(selectedGuest.aadhaarBack)}
                                      alt="Aadhaar Back"
                                      className="w-full h-full object-contain cursor-pointer hover:opacity-90 transition-opacity"
                                      onClick={() => setPreviewImage(getUploadUrl(selectedGuest.aadhaarBack))}
                                      title="Click to preview full size image"
                                    />
                                  )}
                                </div>
                              );
                            })()
                          ) : (
                            <div className="w-full h-32 rounded-xl bg-gray-50 border border-dashed border-[#DDE5D0] flex flex-col items-center justify-center text-[#7A8A6A]">
                              <CreditCard size={20} className="opacity-40" />
                              <span className="text-[9px] mt-1 font-bold">No Image Uploaded</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Signature */}
                      {selectedGuest.signature && (
                        <div className="bg-[#F9FAFA] p-3 rounded-2xl border border-[#DDE5D0]/50 flex flex-col items-start w-full sm:w-1/2">
                          <div className="w-full flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold text-[#5C7A1F]">Guest Signature</span>
                            <button
                              type="button"
                              onClick={() => downloadDocumentFile(selectedGuest.signature, 'guest_signature')}
                              className="text-[#5C7A1F] hover:text-[#1A2E05] p-1 rounded hover:bg-[#E2E8D8] transition-colors"
                              title="Download Signature Image"
                            >
                              <Download size={12} />
                            </button>
                          </div>
                          <div className="w-full h-20 border border-[#DDE5D0]/50 rounded-xl overflow-hidden bg-white">
                            <img
                              src={getUploadUrl(selectedGuest.signature)}
                              alt="Guest Signature"
                              className="w-full h-full object-contain cursor-pointer hover:opacity-90 transition-opacity"
                              onClick={() => setPreviewImage(getUploadUrl(selectedGuest.signature))}
                              title="Click to preview signature"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Extra Registered Guests Section on Personal Info Tab */}
                    {extraGuestsList && extraGuestsList.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-[#DDE5D0]/40 space-y-3">
                        <h4 className="text-xs font-black text-[#84A63C] uppercase tracking-widest flex items-center gap-2">
                          <User size={12} /> Extra Registered Guests & ID Proofs ({extraGuestsList.length})
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {extraGuestsList.map((g, idx) => {
                            const frontImg = g.idFront || g.aadhaarFront || g.idProofFront;
                            const backImg = g.idBack || g.aadhaarBack || g.idProofBack;
                            return (
                              <div key={idx} className="bg-[#F9FAFA] rounded-2xl p-3.5 border border-[#DDE5D0]/50 space-y-2">
                                <div className="flex justify-between items-center">
                                  <span className="text-xs font-bold text-[#1C2B12] capitalize flex items-center gap-1.5 flex-wrap">
                                    {g.name || `Extra Guest ${idx + 1}`}
                                    {g.isChild && (
                                      <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200 rounded-md inline-block">
                                        Child
                                      </span>
                                    )}
                                    {activeHotel?.enablePerGuestRoomAssignment && (g.assignedRoomNumber || g.assignedRoomId) && (
                                      <span className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-md inline-block">
                                        Room {g.assignedRoomNumber || g.assignedRoomId}
                                      </span>
                                    )}
                                  </span>
                                  {g.gender && <span className="text-[10px] bg-[#F0F3E8] px-2 py-0.5 rounded-md font-bold text-[#4A5E38] capitalize">{g.gender} {g.age ? `(${g.age} yrs)` : ''}</span>}
                                </div>
                                {g.phone && (
                                  <div className="text-[10px] text-[#7A8A6A] font-bold flex items-center gap-1">
                                    <Phone size={10} /> {g.phone}
                                  </div>
                                )}
                                {(g.idType || g.idNumber || g.aadhaarNumber) && (
                                  <div className="text-[10px] text-[#4A5E38] font-bold pt-1 border-t border-[#DDE5D0]/20 flex justify-between">
                                    <span>ID: {g.idType || 'Aadhaar'}</span>
                                    <span className="font-mono text-[#1A2E05]">{g.idNumber || g.aadhaarNumber || 'N/A'}</span>
                                  </div>
                                )}
                                {(frontImg || backImg) && (
                                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#DDE5D0]/40">
                                    {frontImg && (
                                      <div className="space-y-1">
                                        <div className="flex items-center justify-between">
                                          <span className="text-[9px] font-bold text-[#5C7A1F]">ID Front</span>
                                          <button
                                            type="button"
                                            onClick={() => downloadDocumentFile(frontImg, `${g.name || 'extra_guest'}_id_front`)}
                                            className="text-[#5C7A1F] hover:text-[#1A2E05] p-0.5 rounded hover:bg-[#E2E8D8] transition-colors"
                                            title="Download ID Front Image"
                                          >
                                            <Download size={10} />
                                          </button>
                                        </div>
                                        <div
                                          className="h-20 rounded-xl overflow-hidden border border-[#DDE5D0] bg-white cursor-pointer hover:opacity-90 transition-opacity"
                                          onClick={() => setPreviewImage(getUploadUrl(frontImg))}
                                        >
                                          <img src={getUploadUrl(frontImg)} alt="ID Front" className="w-full h-full object-contain" />
                                        </div>
                                      </div>
                                    )}
                                    {backImg && (
                                      <div className="space-y-1">
                                        <div className="flex items-center justify-between">
                                          <span className="text-[9px] font-bold text-[#5C7A1F]">ID Back</span>
                                          <button
                                            type="button"
                                            onClick={() => downloadDocumentFile(backImg, `${g.name || 'extra_guest'}_id_back`)}
                                            className="text-[#5C7A1F] hover:text-[#1A2E05] p-0.5 rounded hover:bg-[#E2E8D8] transition-colors"
                                            title="Download ID Back Image"
                                          >
                                            <Download size={10} />
                                          </button>
                                        </div>
                                        <div
                                          className="h-20 rounded-xl overflow-hidden border border-[#DDE5D0] bg-white cursor-pointer hover:opacity-90 transition-opacity"
                                          onClick={() => setPreviewImage(getUploadUrl(backImg))}
                                        >
                                          <img src={getUploadUrl(backImg)} alt="ID Back" className="w-full h-full object-contain" />
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Stay Details Tab */}
              {activeTab === 'stay' && (() => {
                let extraGuestsList = [];
                try {
                  if (selectedGuest.extraGuests) {
                    extraGuestsList = typeof selectedGuest.extraGuests === 'string'
                      ? JSON.parse(selectedGuest.extraGuests)
                      : selectedGuest.extraGuests;
                  }
                } catch (e) {
                  console.error("Failed parsing extraGuests in stay details", e);
                }

                return (
                  <div className="animate-fade-in space-y-4">
                    <h3 className="text-xs font-black text-[#84A63C] uppercase tracking-widest flex items-center gap-2 mb-2">
                      <Calendar size={12} /> Stay Details
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="bg-[#F9FAFA] rounded-2xl p-3 border border-[#DDE5D0]/50">
                        <span className="text-[10px] font-bold text-[#5C7A1F] block mb-0.5">Room</span>
                        <span className="text-xs font-bold text-[#1C2B12]">
                          {selectedGuest.roomNumbers && selectedGuest.roomNumbers.length > 0 ? selectedGuest.roomNumbers.join(', ') : (selectedGuest.Room?.roomNumber ? `R-${cleanRoomNumber(selectedGuest.Room.roomNumber)}` : 'N/A')}
                        </span>
                      </div>
                      <div className="bg-[#F9FAFA] rounded-2xl p-3 border border-[#DDE5D0]/50">
                        <span className="text-[10px] font-bold text-[#5C7A1F] block mb-0.5">Room Type</span>
                        <span className="text-xs font-bold text-[#1C2B12]">
                          {selectedGuest.roomTypes ? [...new Set(selectedGuest.roomTypes)].join(', ') : (selectedGuest.Room?.type || 'N/A')}
                        </span>
                      </div>
                      <div className="bg-[#F9FAFA] rounded-2xl p-3 border border-[#DDE5D0]/50">
                        <span className="text-[10px] font-bold text-[#5C7A1F] block mb-0.5">Booking Type</span>
                        <span className="text-xs font-bold text-[#1C2B12]">{selectedGuest.bookingType || 'N/A'}</span>
                      </div>
                      <div className="bg-[#F9FAFA] rounded-2xl p-3 border border-[#DDE5D0]/50">
                        <span className="text-[10px] font-bold text-[#5C7A1F] block mb-0.5">No. of Guests</span>
                        <span className="text-xs font-bold text-[#1C2B12]">
                          {(() => {
                            let children = 0;
                            if (selectedGuest.isChild) children += 1;
                            if (Array.isArray(extraGuestsList)) {
                              extraGuestsList.forEach(g => {
                                if (g.isChild) children += 1;
                              });
                            }
                            const total = selectedGuest.numberOfGuests || 1;
                            const adults = Math.max(1, total - children);
                            return (
                              <>
                                {adults} {adults === 1 ? 'Adult' : 'Adults'} • {children} {children === 1 ? 'Child' : 'Children'}
                              </>
                            );
                          })()}
                        </span>
                      </div>
                      <div className="bg-[#F9FAFA] rounded-2xl p-3 border border-[#DDE5D0]/50">
                        <span className="text-[10px] font-bold text-[#5C7A1F] block mb-0.5">Check-In</span>
                        <span className="text-xs font-bold text-[#1C2B12]">{new Date(selectedGuest.checkInDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                        {selectedGuest.checkInTime && <span className="text-[10px] font-bold text-[#7A8A6A] block mt-0.5">{formatTime12hr(selectedGuest.checkInTime)}</span>}
                      </div>
                      <div className="bg-[#F9FAFA] rounded-2xl p-3 border border-[#DDE5D0]/50">
                        <span className="text-[10px] font-bold text-[#5C7A1F] block mb-0.5">Check-Out</span>
                        <span className="text-xs font-bold text-[#1C2B12]">{new Date(selectedGuest.checkOutDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                        {selectedGuest.checkOutTime && <span className="text-[10px] font-bold text-[#7A8A6A] block mt-0.5">{formatTime12hr(selectedGuest.checkOutTime)}</span>}
                      </div>
                    </div>

                    {/* Room Shift Audit & Separated Price Breakdown */}
                    {(() => {
                      const shiftData = getRoomShiftBreakdown(selectedGuest);
                      if (!shiftData || !shiftData.shiftItems || shiftData.shiftItems.length <= 1) return null;

                      return (
                        <div className="bg-[#FFFDF9] rounded-2xl p-3.5 border border-amber-200 shadow-2xs space-y-2.5 text-left">
                          <div className="flex items-center justify-between border-b border-amber-200/60 pb-2">
                            <div className="flex items-center gap-2">
                              <div className="p-1.5 bg-amber-100 text-amber-800 rounded-lg">
                                <History size={14} />
                              </div>
                              <div>
                                <h4 className="text-xs font-black text-[#1A2E05]">Room Shift Schedule & Tariff Breakdown</h4>
                                <p className="text-[10px] font-bold text-[#7A8A6A]">Time schedule and separated room pricing</p>
                              </div>
                            </div>
                            <span className="px-2.5 py-0.5 bg-amber-100 text-amber-900 text-[10px] font-black rounded-full border border-amber-300 uppercase tracking-wider">
                              Shifted Stay
                            </span>
                          </div>

                          <div className="rounded-xl border border-amber-200/80 bg-white">
                            <table className="w-full text-left border-collapse text-[11px]">
                              <thead>
                                <tr className="bg-amber-50/90 border-b border-amber-200 text-[9px] font-black text-amber-900 uppercase tracking-wider">
                                  <th className="py-1.5 px-2">Room</th>
                                  <th className="py-1.5 px-2">Time Schedule</th>
                                  <th className="py-1.5 px-2 text-center">Duration</th>
                                  <th className="py-1.5 px-2 text-right">Rate</th>
                                  <th className="py-1.5 px-2 text-right">Subtotal</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-amber-100">
                                {shiftData.shiftItems.map((item, sIdx) => (
                                  <tr key={sIdx} className={item.isCurrent ? 'bg-emerald-50/40 font-bold' : 'hover:bg-amber-50/30'}>
                                    <td className="py-1.5 px-2 whitespace-nowrap">
                                      <div className="flex flex-col">
                                        <span className="font-black text-[#1A2E05] flex items-center gap-1">
                                          Room {cleanRoomNumber(item.roomNumber)}
                                          {item.isCurrent && (
                                            <span className="text-[8px] bg-emerald-100 text-emerald-800 px-1 py-0.2 rounded font-black border border-emerald-300">
                                              Current
                                            </span>
                                          )}
                                        </span>
                                        <span className="text-[9px] text-[#7A8A6A] font-medium">{item.roomType || 'Deluxe Room'}</span>
                                      </div>
                                    </td>
                                    <td className="py-1.5 px-2 whitespace-nowrap">
                                      <div className="flex items-center gap-1.5 leading-tight font-bold text-[9px]">
                                        <div className="flex flex-col">
                                          <div className="flex items-center gap-0.5 text-[#1A2E05]">
                                            <Clock size={9} className="text-amber-600 shrink-0" />
                                            <span className="font-black">{item.startParts?.dateStr || item.startSchedule}</span>
                                          </div>
                                          {item.startParts?.timeStr && (
                                            <span className="text-[8px] font-semibold text-[#7A8A6A] pl-3">@ {item.startParts.timeStr}</span>
                                          )}
                                        </div>

                                        <span className="text-amber-600 font-black text-[10px] px-0.5 shrink-0 self-center">→</span>

                                        <div className="flex flex-col">
                                          <span className="font-black text-[#1A2E05]">{item.endParts?.dateStr || item.endSchedule}</span>
                                          {item.endParts?.timeStr && (
                                            <span className="text-[8px] font-semibold text-[#7A8A6A]">@ {item.endParts.timeStr}</span>
                                          )}
                                        </div>
                                      </div>
                                    </td>
                                    <td className="py-1.5 px-2 text-center whitespace-nowrap font-bold text-[#1A2E05]">
                                      {item.days === 0 ? (
                                        <span className="text-[9px] bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded-full font-black">Same-Day Shift</span>
                                      ) : (
                                        `${item.days} ${item.days === 1 ? 'Night' : 'Nights'}`
                                      )}
                                    </td>
                                    <td className="py-1.5 px-2 text-right whitespace-nowrap font-bold text-[#4A5E38]">
                                      {item.days === 0 ? (
                                        <span className="text-[9px] text-amber-700 italic">₹0.00 (No Charge)</span>
                                      ) : (
                                        `₹${(Math.round(item.rate * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                      )}
                                    </td>
                                    <td className="py-1.5 px-2 text-right whitespace-nowrap font-black text-[#1A2E05]">
                                      ₹{(Math.round(item.total * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="bg-[#1C2B12] text-white text-[11px] font-black">
                                  <td colSpan="4" className="py-1.5 px-2 text-right">
                                    Total Base Room Charges:
                                  </td>
                                  <td className="py-1.5 px-2 text-right text-emerald-400">
                                    ₹{(Math.round(shiftData.shiftItems.reduce((sum, it) => sum + it.total, 0) * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}

              {/* Financial Summary Tab */}
              {activeTab === 'financial' && (() => {
                const rawTotal = parseFloat(selectedGuest.totalAmount || 0);
                const discount = parseFloat(selectedGuest.discount || 0);
                const gstRate = parseFloat(selectedGuest.gstRate !== undefined && selectedGuest.gstRate !== null ? selectedGuest.gstRate : 0);
                const gstOption = selectedGuest.gstOption || 'exclusive';
                const amountPaid = parseFloat(selectedGuest.amountPaid || 0);

                let roomNetTotal = Math.max(0, rawTotal - discount);
                if (gstOption === 'inclusive' && amountPaid > roomNetTotal && Math.abs(amountPaid - Math.round(roomNetTotal * (1 + gstRate / 100))) < 1.5) {
                  roomNetTotal = amountPaid;
                }

                let subTotal = roomNetTotal;
                let gstAmount = 0;
                let grandTotal = 0;

                if (gstOption === 'exclusive' && gstRate > 0) {
                  subTotal = roomNetTotal;
                  gstAmount = Number((subTotal * (gstRate / 100)).toFixed(2));
                  grandTotal = Number((subTotal + gstAmount).toFixed(2));
                } else if (gstOption === 'inclusive' && gstRate > 0) {
                  grandTotal = roomNetTotal;
                  subTotal = Number((grandTotal / (1 + gstRate / 100)).toFixed(2));
                  gstAmount = Number((grandTotal - subTotal).toFixed(2));
                } else {
                  grandTotal = roomNetTotal;
                  subTotal = roomNetTotal;
                  gstAmount = 0;
                }

                const balance = Math.max(0, Number((grandTotal - amountPaid).toFixed(2)));

                // Parse payment history
                let history = [];
                try {
                  if (selectedGuest.paymentHistory) {
                    history = JSON.parse(selectedGuest.paymentHistory);
                  }
                } catch (e) {
                  console.error("Failed parsing paymentHistory", e);
                }

                let cashTotal = 0;
                let onlineTotal = 0;
                let otherTotal = 0;

                if (history.length > 0) {
                  history.forEach(item => {
                    const amt = Number(item.amount) || 0;
                    const mode = (item.paymentMode || '').toLowerCase();
                    if (mode === 'cash') {
                      cashTotal += amt;
                    } else if (mode === 'online') {
                      onlineTotal += amt;
                    } else {
                      otherTotal += amt;
                    }
                  });
                } else {
                  const amt = parseFloat(selectedGuest.amountPaid || 0);
                  const mode = (selectedGuest.paymentMode || '').toLowerCase();
                  if (mode === 'cash') {
                    cashTotal = amt;
                  } else if (mode === 'online') {
                    onlineTotal = amt;
                  } else {
                    otherTotal = amt;
                  }
                }

                return (
                  <div className="animate-fade-in space-y-4">
                    <h3 className="text-xs font-black text-[#84A63C] uppercase tracking-widest flex items-center gap-2 mb-2">
                      <Download size={12} /> Financial Summary
                    </h3>
                    <div className="bg-[#1C2B12] rounded-2xl p-4 text-white space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-white/70">Total Amount (Base Room Charge)</span>
                        <span className="font-bold">₹{subTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      {discount > 0 && (
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold text-white/70">Discount</span>
                          <span className="font-bold text-orange-300">- ₹{discount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                      )}
                      {gstRate > 0 && (
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold text-white/70">GST ({gstRate}%)</span>
                          <span className="font-bold">₹{gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center text-xs pt-1 border-t border-white/5">
                        <span className="font-bold text-white/80">Grand Total</span>
                        <span className="font-bold">₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-white/70">Amount Paid</span>
                        <span className="font-bold text-[#84A63C]">₹{amountPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>

                      {/* Cash and Online breakdown */}
                      {(cashTotal > 0 || onlineTotal > 0 || otherTotal > 0) && (
                        <div className="pl-4 py-1.5 space-y-1 border-l-2 border-[#84A63C]/30 text-xs text-white/60">
                          {cashTotal > 0 && (
                            <div className="flex justify-between items-center">
                              <span>• Cash Payment:</span>
                              <span className="font-semibold text-[#84A63C]/90">₹{cashTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                            </div>
                          )}
                          {onlineTotal > 0 && (
                            <div className="flex justify-between items-center">
                              <span>• Online Payment:</span>
                              <span className="font-semibold text-blue-300">₹{onlineTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                            </div>
                          )}
                          {otherTotal > 0 && (
                            <div className="flex justify-between items-center">
                              <span>• Other Payment:</span>
                              <span className="font-semibold text-amber-300">₹{otherTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="border-t border-white/10 pt-2 flex justify-between items-center">
                        <span className="text-xs font-bold text-white/90">Balance Due</span>
                        <span className={`text-sm font-black ${balance > 0 ? 'text-red-400' : 'text-[#84A63C]'}`}>
                          ₹{balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="bg-[#F9FAFA] rounded-2xl p-3 border border-[#DDE5D0]/50 text-center">
                        <span className="text-[10px] font-bold text-[#5C7A1F] block mb-0.5">Payment Mode</span>
                        <span className="text-xs font-bold text-[#1C2B12]">{selectedGuest.paymentMode || 'N/A'}</span>
                      </div>
                      <div className="bg-[#F9FAFA] rounded-2xl p-3 border border-[#DDE5D0]/50 text-center">
                        <span className="text-[10px] font-bold text-[#5C7A1F] block mb-0.5">Payment Status</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full inline-block mt-0.5 ${selectedGuest.paymentStatus === 'Paid' ? 'bg-green-50 text-green-700' :
                          selectedGuest.paymentStatus === 'Partial' ? 'bg-orange-50 text-orange-600' :
                            'bg-red-50 text-red-600'
                          }`}>{selectedGuest.paymentStatus || 'N/A'}</span>
                      </div>
                      {activeHotel?.enableRegistrationNumber === true && (
                        <div className="bg-[#F9FAFA] rounded-2xl p-3 border border-[#DDE5D0]/50 text-center">
                          <span className="text-[10px] font-bold text-[#5C7A1F] block mb-0.5">Reg. No.</span>
                          <span className="text-xs font-bold text-[#1C2B12]">
                            {selectedGuest.status === 'Cancelled' ? '-' : (selectedGuest.registrationNumber || getAutoRegNo(selectedGuest, history))}
                          </span>
                        </div>
                      )}
                      <div className="bg-[#F9FAFA] rounded-2xl p-3 border border-[#DDE5D0]/50 text-center">
                        <span className="text-[10px] font-bold text-[#5C7A1F] block mb-0.5">Invoice No.</span>
                        <span className="text-xs font-bold text-[#1C2B12]">
                          {selectedGuest.status === 'Cancelled' ? '-' : formatInvoiceNumber(selectedGuest.invoiceNumber, activeHotel)}
                        </span>
                      </div>
                    </div>

                    {/* Transaction & Payment History Table */}
                    <div className="bg-[#F9FAFA] rounded-2xl p-3.5 border border-[#DDE5D0] space-y-2.5 text-left">
                      <div className="flex items-center justify-between border-b border-[#EAF0DE] pb-2">
                        <h4 className="text-[11px] font-black text-[#1A2E05] uppercase tracking-wider flex items-center gap-1.5">
                          <History size={13} className="text-[#84A63C]" />
                          Transaction & Payment History
                        </h4>
                        <span className="text-[10px] font-bold text-[#4A5E38] bg-[#EEF4E0] px-2 py-0.5 rounded-md border border-[#DDE5D0]">
                          {history.length > 0 ? `${history.length} Record${history.length > 1 ? 's' : ''}` : '1 Record'}
                        </span>
                      </div>

                      <div className="overflow-x-auto max-h-48 overflow-y-auto custom-scrollbar rounded-xl border border-[#DDE5D0]/80 bg-white">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-[#F0F3E8] border-b border-[#DDE5D0] text-[9px] font-black text-[#4A5E38] uppercase tracking-wider sticky top-0 z-10">
                              <th className="py-2 px-3">Date & Time</th>
                              <th className="py-2 px-3">Payment Method</th>
                              <th className="py-2 px-3">Description</th>
                              <th className="py-2 px-3 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#F0F3E8]">
                            {history.length > 0 ? (
                              history.map((tx, idx) => {
                                const isRefund = tx.type === 'Refund' || (Number(tx.amount) || 0) < 0;
                                const txAmount = Math.abs(Number(tx.amount) || 0);
                                const modeStr = tx.paymentMode || tx.mode || selectedGuest.paymentMode || 'Cash';
                                const noteStr = tx.note || tx.description || (idx === 0 ? 'Initial Check-in Payment' : 'Payment Transaction');

                                const dateStr = formatTransactionDateTime(
                                  tx.date || tx.createdAt || tx.timestamp || selectedGuest.checkInDate,
                                  tx.time || (tx.date || tx.createdAt ? null : selectedGuest.checkInTime)
                                );

                                return (
                                  <tr key={idx} className="hover:bg-[#F5F7F0]/60 transition-colors">
                                    <td className="py-2 px-3 font-bold text-[#1A2E05] whitespace-nowrap">
                                      <div className="flex items-center gap-1">
                                        <Clock size={11} className="text-[#84A63C] shrink-0" />
                                        <span>{dateStr}</span>
                                      </div>
                                    </td>
                                    <td className="py-2 px-3 whitespace-nowrap">
                                      <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${isRefund ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        }`}>
                                        {modeStr}
                                      </span>
                                    </td>
                                    <td className="py-2 px-3 font-bold text-[#4A5E38]">{noteStr}</td>
                                    <td className="py-2 px-3 text-right font-black whitespace-nowrap">
                                      <span className={isRefund ? 'text-rose-600' : 'text-emerald-700'}>
                                        {isRefund ? '-' : '+'}₹{txAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })
                            ) : (
                              <tr className="hover:bg-[#F5F7F0]/60 transition-colors">
                                <td className="py-2 px-3 font-bold text-[#1A2E05] whitespace-nowrap">
                                  <div className="flex items-center gap-1">
                                    <Clock size={11} className="text-[#84A63C] shrink-0" />
                                    <span>
                                      {formatTransactionDateTime(selectedGuest.checkInDate, selectedGuest.checkInTime)}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-2 px-3 whitespace-nowrap">
                                  <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    {selectedGuest.paymentMode || 'Cash'}
                                  </span>
                                </td>
                                <td className="py-2 px-3 font-bold text-[#4A5E38]">Check-in Payment</td>
                                <td className="py-2 px-3 text-right font-black text-emerald-700 whitespace-nowrap">
                                  +₹{(parseFloat(selectedGuest.amountPaid) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {(selectedGuest.guestGst || selectedGuest.companyName || selectedGuest.companyAddress) && (
                      <div className="bg-[#F0F3E8] rounded-2xl p-4 border border-[#DDE5D0]/50 space-y-2 text-left">
                        {selectedGuest.guestGst && (
                          <div>
                            <span className="text-[10px] font-bold text-[#5C7A1F] block mb-0.5">Customer GST Number</span>
                            <span className="text-xs font-black text-[#1C2B12]">{selectedGuest.guestGst}</span>
                          </div>
                        )}
                        {selectedGuest.companyName && (
                          <div>
                            <span className="text-[10px] font-bold text-[#5C7A1F] block mb-0.5">Company Name</span>
                            <span className="text-xs font-black text-[#1C2B12]">{selectedGuest.companyName}</span>
                          </div>
                        )}
                        {selectedGuest.companyAddress && (
                          <div>
                            <span className="text-[10px] font-bold text-[#5C7A1F] block mb-0.5">Company Address</span>
                            <span className="text-xs font-black text-[#1C2B12]">{selectedGuest.companyAddress}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="py-2.5 px-4 bg-[#F9FAFA] border-t border-[#DDE5D0] flex flex-wrap gap-2 shrink-0 justify-between items-center">
              <button
                onClick={() => setShowModal(false)}
                className="py-2 px-3 bg-white border border-[#DDE5D0] text-[#7A8A6A] rounded-xl font-black text-[11px] flex items-center justify-center gap-1.5 shadow-sm hover:bg-red-50 hover:border-red-200 hover:text-red-600 active:scale-[0.98] transition-all"
              >
                <X size={14} strokeWidth={2.5} />
                Close
              </button>
              <div className="flex flex-wrap items-center gap-2 flex-1 justify-end">
                <button
                  onClick={() => handlePreviewRegForm(selectedGuest)}
                  className="py-2 px-3 bg-white border border-[#DDE5D0] text-[#1C2B12] rounded-xl font-black text-[11px] flex items-center justify-center gap-1.5 shadow-sm hover:bg-[#F0F3E8] active:scale-[0.98] transition-all"
                  title="Preview Registration Form PDF"
                >
                  <Eye size={14} strokeWidth={2.5} className="text-teal-600" />
                  Preview Info
                </button>
                <button
                  onClick={() => handleDownloadRegForm(selectedGuest)}
                  className="py-2 px-3 bg-teal-700 text-white rounded-xl font-black text-[11px] flex items-center justify-center gap-1.5 shadow-md shadow-teal-700/20 hover:bg-teal-800 active:scale-[0.98] transition-all"
                  title="Download Complete Guest Registration Info PDF"
                >
                  <Download size={14} strokeWidth={2.5} />
                  Download Info PDF
                </button>
                <button
                  onClick={() => handlePreviewInvoice(selectedGuest)}
                  className="py-2 px-3 bg-white border border-[#DDE5D0] text-[#1C2B12] rounded-xl font-black text-[11px] flex items-center justify-center gap-1.5 shadow-sm hover:bg-[#F0F3E8] active:scale-[0.98] transition-all"
                >
                  <Eye size={14} strokeWidth={2.5} />
                  Preview Invoice
                </button>
                <button
                  onClick={() => handleDownloadInvoice(selectedGuest)}
                  className="py-2 px-3 bg-[#84A63C] text-white rounded-xl font-black text-[11px] flex items-center justify-center gap-1.5 shadow-lg shadow-[#84A63C]/20 hover:brightness-110 active:scale-[0.98] transition-all"
                >
                  <Download size={14} strokeWidth={3} />
                  Download Invoice
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Image Preview Lightbox Modal */}
      {previewImage && createPortal(
        <div
          className="fixed inset-0 z-[250] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-white rounded-2xl overflow-hidden shadow-2xl p-2 animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
              <button
                onClick={() => downloadDocumentFile(previewImage, 'document_preview')}
                className="bg-black/60 hover:bg-black/80 text-white px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 shadow-md active:scale-95"
                title="Download Document Image"
              >
                <Download size={14} /> Download
              </button>
              <button
                onClick={() => setPreviewImage(null)}
                className="bg-black/60 hover:bg-black/80 text-white p-1.5 rounded-full transition-colors"
                title="Close Preview"
              >
                <X size={18} />
              </button>
            </div>
            <img
              src={previewImage}
              alt="Document Preview"
              className="max-w-full max-h-[85vh] object-contain rounded-lg mx-auto"
            />
          </div>
        </div>,
        document.body
      )}

      {/* Repeat Check-In Selector Modal */}
      {showRepeatModal && repeatModalData && createPortal(
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-[#1C2B12]/50 backdrop-blur-sm animate-fade-in" onClick={() => setShowRepeatModal(false)}>
          <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-[#DDE5D0]" onClick={(e) => e.stopPropagation()}>
            <div className="bg-[#1C2B12] text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-600/30 rounded-xl flex items-center justify-center text-emerald-400">
                  <UserCheck size={20} />
                </div>
                <div>
                  <h3 className="font-black text-base">Repeat Check-In</h3>
                  <p className="text-xs text-emerald-300 font-bold">Select returning guests & room for today</p>
                </div>
              </div>
              <button onClick={() => setShowRepeatModal(false)} className="w-8 h-8 flex items-center justify-center bg-white/10 rounded-lg hover:bg-white/20 text-white"><X size={16} /></button>
            </div>

            <div className="p-6 space-y-5">
              {/* Step 1: Select Guests */}
              <div>
                <label className="text-xs font-black text-[#4A5E38] uppercase tracking-wider block mb-2">
                  1. Select Guests Returning Today ({Object.values(selectedGuestsMap).filter(Boolean).length} / {repeatModalData.guests.length} Selected)
                </label>
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1 custom-scrollbar">
                  {repeatModalData.guests.map((g) => {
                    const isChecked = !!selectedGuestsMap[g.id];
                    return (
                      <div
                        key={g.id}
                        onClick={() => setSelectedGuestsMap(prev => ({ ...prev, [g.id]: !prev[g.id] }))}
                        className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all ${isChecked
                          ? 'bg-emerald-50/90 border-emerald-400 text-emerald-950 shadow-xs'
                          : 'bg-[#F9FAFA] border-[#DDE5D0] text-[#7A8A6A] hover:bg-[#F0F3E8]'
                          }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded-md flex items-center justify-center transition-all ${isChecked ? 'bg-emerald-600 text-white' : 'border border-gray-300 bg-white'}`}>
                            {isChecked && <CheckCircle2 size={14} />}
                          </div>
                          <div>
                            <p className="text-xs font-black capitalize flex items-center gap-1.5">
                              <span>{g.name}</span>
                              {g.isPrimary && <span className="px-1.5 py-0.5 text-[9px] bg-emerald-200 text-emerald-900 font-bold rounded-md">Primary Guest</span>}
                              {g.isChild && <span className="px-1.5 py-0.5 text-[9px] bg-amber-200 text-amber-900 font-bold rounded-md">Child</span>}
                            </p>
                            <p className="text-[10px] opacity-80 font-bold mt-0.5">
                              {g.phone ? `Phone: ${g.phone}` : ''} {g.idProof ? `| ID: ${g.idProof}` : ''} {g.age ? `| ${g.age} yrs` : ''} {g.gender ? `| ${g.gender}` : ''}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Step 2: Select Room */}
              <div>
                <label className="text-xs font-black text-[#4A5E38] uppercase tracking-wider block mb-2 flex items-center justify-between">
                  <span>2. Assign Available Room</span>
                  <span className="text-[10px] text-emerald-700 font-bold">({availableRooms.length} Available)</span>
                </label>
                {availableRooms.length > 0 ? (
                  <select
                    value={selectedRoomId}
                    onChange={(e) => setSelectedRoomId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#FBFDF8] border border-[#DDE5D0] focus:border-[#84A63C] focus:outline-none rounded-xl text-xs font-bold text-[#1A2E05]"
                  >
                    {availableRooms.map(r => (
                      <option key={r.id} value={r.id}>
                        Room {cleanRoomNumber(r.roomNumber)} - {r.type} (₹{r.pricePerNight}/night)
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs font-bold text-amber-800 flex items-center gap-2">
                    <AlertTriangle size={15} className="shrink-0" />
                    <span>No rooms currently marked 'Available'. You can still proceed and choose a room in the check-in form.</span>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 bg-[#F9FAFA] border-t border-[#DDE5D0] flex gap-3">
              <button
                onClick={() => setShowRepeatModal(false)}
                className="flex-1 py-2.5 text-xs font-bold text-[#7A8A6A] hover:bg-[#F0F3E8] rounded-xl border border-[#DDE5D0] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleProceedToRepeatCheckIn}
                className="flex-1 py-2.5 text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                <UserCheck size={16} /> Continue to Check-In
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* AddGuestModal for Repeat Check-In */}
      {isAddGuestOpen && (
        <AddGuestModal
          isOpen={isAddGuestOpen}
          onClose={() => { setIsAddGuestOpen(false); setPrefilledRepeatData(null); }}
          onConfirm={handleConfirmRepeatCheckIn}
          initialData={prefilledRepeatData}
          preSelectedRoomId={prefilledRepeatData?.selectedRoomId}
        />
      )}

      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }
        .animate-slide-up { animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #DDE5D0;
          border-radius: 9999px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #84A63C;
        }
        .custom-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: #DDE5D0 transparent;
        }
      `}} />
    </div>
  );
};

export default GuestHistory;
