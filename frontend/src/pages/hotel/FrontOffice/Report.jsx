import React, { useState, useEffect } from 'react';
import {
  Calendar, Download, FileText, Filter, Users, Hotel, LogIn, LogOut, CheckCircle2,
  Search, ArrowUpDown, ArrowUp, ArrowDown, RefreshCw, Layers
} from 'lucide-react';
import api from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { generateGeneralReportPdf } from '../../../utils/generalReportPdfGenerator';
import { getAutoRegNo } from '../../../utils/registrationNumberGenerator';

const parseLocalDate = (dateStr) => {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const formatDateDMY = (dateStr) => {
  if (!dateStr || dateStr === 'N/A') return 'N/A';
  const plain = String(dateStr).split('T')[0];
  const parts = plain.split('-');
  if (parts.length === 3) {
    if (parts[0].length === 4) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return `${parts[0]}-${parts[1]}-${parts[2]}`;
  }
  return dateStr;
};

const BILLING_FETCH_LIMIT = 10000;

const getBookingStayDays = (b) => {
  if (!b) return 1;
  if (b.stayDays && Number(b.stayDays) > 0) return Number(b.stayDays);
  if (b.checkInDate && b.checkOutDate) {
    const d1Str = String(b.checkInDate).split('T')[0];
    const d2Str = String(b.checkOutDate).split('T')[0];
    if (d1Str === d2Str) return 1;
    const d1 = new Date(d1Str);
    const d2 = new Date(d2Str);
    const nDiff = Math.max(1, Math.ceil(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24)));
    if (!isNaN(nDiff)) return nDiff;
  }
  return 1;
};

const calculateBookingFinancials = (b) => {
  if (!b) return { subTotal: 0, roomSubTotal: 0, extraSubTotal: 0, roomGst: 0, extraGst: 0, gstAmount: 0, grandTotal: 0, gstRate: 0, extraChargesTotal: 0, cgst: 0, sgst: 0 };

  const groupItems = (b.groupBookings && b.groupBookings.length > 0) ? b.groupBookings : [b];
  const gstOption = b.gstOption || 'exclusive';
  const fallbackRate = (b.gstRate !== undefined && b.gstRate !== null) ? Number(b.gstRate) : 12;

  let totalRoomSubTotal = 0;
  let totalRoomGstAmount = 0;
  let totalRoomGrandTotal = 0;

  groupItems.forEach((gb, index) => {
    const rawEarlyAmt = (index === 0 && gb.chargePreviousDay && gb.earlyCheckInType === 'custom_fee') ? Number(gb.earlyCheckInCharge || 0) : 0;
    const rBase = Number(gb.totalAmount || 0);
    const rDiscount = Number(gb.discount || 0);
    const rGstRate = (gb.gstRate !== undefined && gb.gstRate !== null) ? Number(gb.gstRate) : fallbackRate;
    const effectiveRate = gstOption === 'none' ? 0 : rGstRate;

    let rSub = 0;
    let rGst = 0;
    let rGrand = 0;

    if (gstOption === 'exclusive') {
      rSub = Math.max(0, rBase - rDiscount) + rawEarlyAmt;
      rGst = effectiveRate > 0 ? Math.round((rSub * (effectiveRate / 100)) * 100) / 100 : 0;
      rGrand = rSub + rGst;
    } else if (gstOption === 'inclusive') {
      let roomGrand = Math.max(0, rBase - rDiscount) + rawEarlyAmt;
      const paidAmt = Number(gb.amountPaid || b.amountPaid || 0);
      if (paidAmt > roomGrand && Math.abs(paidAmt - Math.round(roomGrand * (1 + effectiveRate / 100))) < 1.5) {
        roomGrand = paidAmt;
      }
      rGrand = roomGrand;
      rSub = effectiveRate > 0 ? Math.round((rGrand / (1 + effectiveRate / 100)) * 100) / 100 : rGrand;
      rGst = Math.round((rGrand - rSub) * 100) / 100;
    } else {
      rSub = Math.max(0, rBase - rDiscount) + rawEarlyAmt;
      rGst = 0;
      rGrand = rSub;
    }

    totalRoomSubTotal += rSub;
    totalRoomGstAmount += rGst;
    totalRoomGrandTotal += rGrand;
  });

  // Calculate Extra Charges / Food Orders / Extras
  let extraSubTotal = 0;
  let extraGstAmount = 0;

  const extraChargesList = b.extraChargesList || [];
  if (Array.isArray(extraChargesList) && extraChargesList.length > 0) {
    extraChargesList.forEach(item => {
      const qtyNum = Number(item.qty || item.quantity || 1);
      const priceNum = Number(item.price || item.amount || 0);
      const itemSubtotal = qtyNum * priceNum;
      const isInclusive = item.gstOption === 'inclusive' || (item.gstOption === undefined && gstOption === 'inclusive');
      const isExclusive = item.gstOption === 'exclusive' || (item.gstOption === undefined && gstOption === 'exclusive');
      const rateNum = Number(item.gstRate !== undefined && item.gstRate !== null ? item.gstRate : fallbackRate);

      let itemBase = itemSubtotal;
      let itemGst = 0;

      if (item.grandTotal !== undefined && item.grandTotal !== null && Number(item.grandTotal) > 0) {
        const grandTot = Number(item.grandTotal);
        if (isInclusive && rateNum > 0) {
          itemBase = Math.round((grandTot / (1 + rateNum / 100)) * 100) / 100;
          itemGst = Math.round((grandTot - itemBase) * 100) / 100;
        } else if (isExclusive && rateNum > 0) {
          itemBase = itemSubtotal;
          itemGst = Math.round((grandTot - itemBase) * 100) / 100;
        } else {
          itemBase = grandTot;
          itemGst = 0;
        }
      } else {
        if (isInclusive && rateNum > 0) {
          itemBase = Math.round((itemSubtotal / (1 + rateNum / 100)) * 100) / 100;
          itemGst = Math.round((itemSubtotal - itemBase) * 100) / 100;
        } else if (isExclusive && rateNum > 0) {
          itemBase = itemSubtotal;
          itemGst = Math.round((itemSubtotal * (rateNum / 100)) * 100) / 100;
        }
      }

      extraSubTotal += itemBase;
      extraGstAmount += itemGst;
    });
  } else {
    // If extraCharges field exists directly on booking object
    const rawExtra = Number(b.extraCharges || b.extraServices || b.extraChargesTotal || 0);
    if (rawExtra > 0) {
      if (gstOption === 'exclusive') {
        extraSubTotal = rawExtra;
        extraGstAmount = fallbackRate > 0 ? Math.round((rawExtra * (fallbackRate / 100)) * 100) / 100 : 0;
      } else if (gstOption === 'inclusive' || gstOption !== 'none') {
        extraSubTotal = fallbackRate > 0 ? Math.round((rawExtra / (1 + fallbackRate / 100)) * 100) / 100 : rawExtra;
        extraGstAmount = Math.round((rawExtra - extraSubTotal) * 100) / 100;
      } else {
        extraSubTotal = rawExtra;
        extraGstAmount = 0;
      }
    }
  }

  const subTotal = totalRoomSubTotal + extraSubTotal;
  const gstAmount = Math.round((totalRoomGstAmount + extraGstAmount) * 100) / 100;
  const grandTotal = totalRoomGrandTotal + (extraSubTotal + extraGstAmount);
  const cgst = Math.round((gstAmount / 2) * 1000) / 1000;
  const sgst = Math.round((gstAmount / 2) * 1000) / 1000;

  return {
    subTotal,
    roomSubTotal: totalRoomSubTotal,
    extraSubTotal,
    roomGst: totalRoomGstAmount,
    extraGst: extraGstAmount,
    gstAmount,
    cgst,
    sgst,
    grandTotal,
    gstRate: fallbackRate
  };
};

const getBookingStayDaysInPeriod = (b, tab, periodInfo) => {
  const totalDays = getBookingStayDays(b);
  if (tab === 'alltime') return totalDays;

  const cInStr = b.checkInDate ? String(b.checkInDate).split('T')[0] : (b.createdAt ? String(b.createdAt).split('T')[0] : '');
  const cOutStr = b.checkOutDate ? String(b.checkOutDate).split('T')[0] : cInStr;

  if (!cInStr) return totalDays;
  if (cInStr === cOutStr) return 1;

  let pStartStr = '';
  let pEndStr = '';

  if (tab === 'daily') {
    pStartStr = periodInfo.selectedDate;
    pEndStr = periodInfo.selectedDate;
  } else if (tab === 'weekly') {
    pStartStr = periodInfo.selectedWeekStart;
    pEndStr = periodInfo.selectedWeekEnd;
  } else if (tab === 'monthly') {
    const y = Number(periodInfo.selectedYear);
    const m = Number(periodInfo.selectedMonth);
    pStartStr = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const daysInM = new Date(y, m + 1, 0).getDate();
    pEndStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(daysInM).padStart(2, '0')}`;
  } else if (tab === 'yearly') {
    const y = Number(periodInfo.selectedYear);
    pStartStr = `${y}-01-01`;
    pEndStr = `${y}-12-31`;
  } else if (tab === 'custom') {
    pStartStr = periodInfo.startDate;
    pEndStr = periodInfo.endDate;
  }

  if (!pStartStr || !pEndStr) return totalDays;

  const pStartDate = parseLocalDate(pStartStr);
  const pEndDate = parseLocalDate(pEndStr);
  if (!pStartDate || !pEndDate) return totalDays;

  // Stays end at checkout, so the night of pEndStr ends on pEndDate + 1 day
  const pCutoffDate = new Date(pEndDate.getTime() + 86400000);

  const cInDate = parseLocalDate(cInStr);
  const cOutDate = parseLocalDate(cOutStr);
  if (!cInDate || !cOutDate) return totalDays;

  const overlapStart = new Date(Math.max(cInDate.getTime(), pStartDate.getTime()));
  const overlapEnd = new Date(Math.min(cOutDate.getTime(), pCutoffDate.getTime()));

  if (overlapEnd > overlapStart) {
    const diffDays = Math.round((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(1, Math.min(totalDays, diffDays));
  }

  return 1;
};

const getBookingPeriodFinancials = (b, tab, periodInfo) => {
  const fin = calculateBookingFinancials(b);
  const totalDays = getBookingStayDays(b);
  const periodDays = getBookingStayDaysInPeriod(b, tab, periodInfo);

  const isAllTime = tab === 'alltime';
  const ratio = (isAllTime || totalDays <= 0) ? 1 : Math.min(1, periodDays / totalDays);

  const rBaseAmt = isAllTime ? fin.roomSubTotal : (totalDays > 0 ? Math.round((fin.roomSubTotal * ratio) * 100) / 100 : fin.roomSubTotal);
  const rRoomGst = isAllTime ? fin.roomGst : (totalDays > 0 ? Math.round((fin.roomGst * ratio) * 100) / 100 : fin.roomGst);

  let extraSubTotal = 0;
  let extraGst = 0;

  if (isAllTime) {
    extraSubTotal = fin.extraSubTotal;
    extraGst = fin.extraGst;
  } else if (b.extraChargesList && Array.isArray(b.extraChargesList) && b.extraChargesList.length > 0) {
    const periodExtras = b.extraChargesList.filter(ec => {
      const ecDate = ec.createdAt || ec.date;
      if (!ecDate) return true;
      const cleanDate = String(ecDate).split('T')[0];
      if (tab === 'daily') return cleanDate === periodInfo.selectedDate;
      if (tab === 'weekly') return cleanDate >= periodInfo.selectedWeekStart && cleanDate <= periodInfo.selectedWeekEnd;
      if (tab === 'monthly') {
        const tD = parseLocalDate(cleanDate);
        return tD && tD.getMonth() === Number(periodInfo.selectedMonth) && tD.getFullYear() === Number(periodInfo.selectedYear);
      }
      if (tab === 'yearly') {
        const tD = parseLocalDate(cleanDate);
        return tD && tD.getFullYear() === Number(periodInfo.selectedYear);
      }
      if (tab === 'custom') return cleanDate >= periodInfo.startDate && cleanDate <= periodInfo.endDate;
      return true;
    });

    if (periodExtras.length > 0) {
      let pSub = 0;
      let pGst = 0;
      periodExtras.forEach(item => {
        const qtyNum = Number(item.qty || item.quantity || 1);
        const priceNum = Number(item.price || item.amount || 0);
        const itemSubtotal = qtyNum * priceNum;
        const isInclusive = item.gstOption === 'inclusive' || (item.gstOption === undefined && (b.gstOption === 'inclusive' || true));
        const isExclusive = item.gstOption === 'exclusive' || (item.gstOption === undefined && b.gstOption === 'exclusive');
        const rateNum = Number(item.gstRate !== undefined && item.gstRate !== null ? item.gstRate : 0);

        let itemBase = itemSubtotal;
        let itemGst = 0;

        if (item.grandTotal !== undefined && item.grandTotal !== null && Number(item.grandTotal) > 0) {
          const grandTot = Number(item.grandTotal);
          if (isInclusive && rateNum > 0) {
            itemBase = Math.round((grandTot / (1 + rateNum / 100)) * 100) / 100;
            itemGst = Math.round((grandTot - itemBase) * 100) / 100;
          } else if (isExclusive && rateNum > 0) {
            itemBase = itemSubtotal;
            itemGst = Math.round((grandTot - itemBase) * 100) / 100;
          } else {
            itemBase = grandTot;
            itemGst = 0;
          }
        } else {
          if (isInclusive && rateNum > 0) {
            itemBase = Math.round((itemSubtotal / (1 + rateNum / 100)) * 100) / 100;
            itemGst = Math.round((itemSubtotal - itemBase) * 100) / 100;
          } else if (isExclusive && rateNum > 0) {
            itemBase = itemSubtotal;
            itemGst = Math.round((itemSubtotal * (rateNum / 100)) * 100) / 100;
          }
        }

        pSub += itemBase;
        pGst += itemGst;
      });

      extraSubTotal = Math.round(pSub * 100) / 100;
      extraGst = Math.round(pGst * 100) / 100;
    }
  } else {
    extraSubTotal = fin.extraSubTotal;
    extraGst = fin.extraGst;
  }

  const rTotGstAmt = Math.round((rRoomGst + extraGst) * 100) / 100;
  const rCgstAmt = Math.round((rTotGstAmt / 2) * 1000) / 1000;
  const rSgstAmt = Math.round((rTotGstAmt / 2) * 1000) / 1000;
  const rGrandAmt = Math.round((rBaseAmt + extraSubTotal + rTotGstAmt) * 100) / 100;

  return {
    stayDays: periodDays,
    totalDays,
    baseAmount: rBaseAmt,
    extraSubTotal,
    cgst: rCgstAmt,
    sgst: rSgstAmt,
    totalGst: rTotGstAmt,
    grandTotal: rGrandAmt,
    roomGst: rRoomGst
  };
};

const Report = () => {
  const { activeHotel } = useAuth();
  const today = new Date();

  const [loading, setLoading] = useState(true);
  const [allBookings, setAllBookings] = useState([]);
  const [activeBookings, setActiveBookings] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Filters: 'daily', 'weekly', 'monthly', 'yearly', 'alltime', 'custom'
  const [activeTab, setActiveTab] = useState('daily');
  const [selectedDate, setSelectedDate] = useState(today.toISOString().split('T')[0]);
  const [selectedWeekStart, setSelectedWeekStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().split('T')[0];
  });
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 15);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);

  const [sortField, setSortField] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');

  const getSelectedWeekEnd = () => {
    if (!selectedWeekStart) return '';
    const wStart = parseLocalDate(selectedWeekStart);
    if (!wStart) return '';
    const wEnd = new Date(wStart);
    wEnd.setDate(wEnd.getDate() + 6);
    return wEnd.toISOString().split('T')[0];
  };

  const selectedWeekEnd = getSelectedWeekEnd();

  const periodInfo = {
    selectedDate,
    selectedWeekStart,
    selectedWeekEnd,
    selectedMonth,
    selectedYear,
    startDate,
    endDate
  };

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const years = Array.from({ length: 5 }, (_, i) => today.getFullYear() - i);

  useEffect(() => {
    fetchReportData();
  }, []);

  const fetchReportData = async () => {
    try {
      setLoading(true);
      const [billingRes, activeRes, roomsRes, extraChargesRes] = await Promise.all([
        api.get('/analytics/billing', { params: { limit: BILLING_FETCH_LIMIT } }).catch(e => { console.error(e); return null; }),
        api.get('/bookings/active').catch(e => { console.error(e); return null; }),
        api.get('/rooms').catch(e => { console.error(e); return null; }),
        api.get('/extra-charges').catch(e => { console.error(e); return null; })
      ]);

      const allExtraCharges = extraChargesRes?.data?.data || [];
      const extraMapByBookingId = {};
      const extraMapByRoom = {};
      const extraMapByGuestName = {};

      allExtraCharges.forEach(ec => {
        if (ec.bookingId) {
          if (!extraMapByBookingId[ec.bookingId]) extraMapByBookingId[ec.bookingId] = [];
          extraMapByBookingId[ec.bookingId].push(ec);
        }
        if (ec.roomNumber) {
          const cleanR = String(ec.roomNumber).replace(/room\s*/i, '').trim();
          if (!extraMapByRoom[cleanR]) extraMapByRoom[cleanR] = [];
          extraMapByRoom[cleanR].push(ec);
        }
        if (ec.guestName) {
          const cleanG = String(ec.guestName).toLowerCase().trim();
          if (!extraMapByGuestName[cleanG]) extraMapByGuestName[cleanG] = [];
          extraMapByGuestName[cleanG].push(ec);
        }
      });

      if (billingRes?.data?.data?.recentBills) {
        const rawBills = billingRes.data.data.recentBills;
        const processedGroupIds = new Set();
        const processedBillIds = new Set();
        const uniqueBills = [];

        rawBills.forEach(b => {
          const bId = b.bookingId || b.id;
          const rNum = b.Room?.roomNumber || (b.roomNumbers ? b.roomNumbers[0] : null);
          const cleanR = rNum ? String(rNum).replace(/room\s*/i, '').trim() : null;
          const cleanG = b.guestName ? String(b.guestName).toLowerCase().trim() : null;

          let liveExtras = [];
          if (b.extraChargesList && Array.isArray(b.extraChargesList) && b.extraChargesList.length > 0) {
            liveExtras = b.extraChargesList;
          } else if (bId && extraMapByBookingId[bId] && extraMapByBookingId[bId].length > 0) {
            liveExtras = extraMapByBookingId[bId];
          } else if (b.bookingId && extraMapByBookingId[b.bookingId] && extraMapByBookingId[b.bookingId].length > 0) {
            liveExtras = extraMapByBookingId[b.bookingId];
          } else if (cleanG && extraMapByGuestName[cleanG] && extraMapByGuestName[cleanG].length > 0) {
            liveExtras = extraMapByGuestName[cleanG];
          }
          const bWithExtras = { ...b, extraChargesList: liveExtras };

          if (b.groupBookingId) {
            if (!processedGroupIds.has(b.groupBookingId)) {
              processedGroupIds.add(b.groupBookingId);
              const groupItems = rawBills.filter(h => h.groupBookingId === b.groupBookingId);
              const roomNums = groupItems.map(g => g.roomNumbers ? g.roomNumbers.join(', ') : (g.Room?.roomNumber || String(g.roomId || ''))).filter(Boolean);
              const uniqueRoomsStr = [...new Set(roomNums)].join(', ');

              uniqueBills.push({
                ...bWithExtras,
                isGroup: true,
                groupBookings: groupItems.map(g => ({
                  ...g,
                  extraChargesList: extraMapByBookingId[g.bookingId || g.id] || (g.extraChargesList && g.extraChargesList.length > 0 ? g.extraChargesList : [])
                })),
                roomNumbersDisplay: uniqueRoomsStr || (b.roomNumbers ? b.roomNumbers.join(', ') : (b.Room?.roomNumber || 'N/A'))
              });
            }
          } else {
            const bKey = b.id || b.invoiceNumber;
            if (bKey && !processedBillIds.has(bKey)) {
              processedBillIds.add(bKey);
              uniqueBills.push({
                ...bWithExtras,
                isGroup: false,
                groupBookings: [bWithExtras],
                roomNumbersDisplay: b.roomNumbers ? b.roomNumbers.join(', ') : (b.Room?.roomNumber || 'N/A')
              });
            } else if (!bKey) {
              uniqueBills.push({
                ...bWithExtras,
                isGroup: false,
                groupBookings: [bWithExtras],
                roomNumbersDisplay: b.roomNumbers ? b.roomNumbers.join(', ') : (b.Room?.roomNumber || 'N/A')
              });
            }
          }
        });

        setAllBookings(uniqueBills);
      }

      if (activeRes?.data?.data) {
        const actData = activeRes.data.data;
        const actList = Array.isArray(actData) ? actData : (actData.activeBookings || []);
        setActiveBookings(actList);
      }

      if (roomsRes?.data?.data) {
        setRooms(roomsRes.data.data);
      }
    } catch (err) {
      console.error('Error fetching report data:', err);
    } finally {
      setLoading(false);
    }
  };

  const isInSelectedPeriod = (dateStr) => {
    if (!dateStr) return false;
    const cleanDate = String(dateStr).split('T')[0];
    if (activeTab === 'daily') return cleanDate === selectedDate;
    if (activeTab === 'weekly') {
      const wStart = new Date(selectedWeekStart);
      const wEnd = new Date(wStart);
      wEnd.setDate(wEnd.getDate() + 6);
      const tD = new Date(cleanDate);
      return tD >= wStart && tD <= wEnd;
    }
    if (activeTab === 'monthly') {
      const tD = new Date(cleanDate);
      return tD.getMonth() === Number(selectedMonth) && tD.getFullYear() === Number(selectedYear);
    }
    if (activeTab === 'yearly') {
      const tD = new Date(cleanDate);
      return tD.getFullYear() === Number(selectedYear);
    }
    if (activeTab === 'custom') return cleanDate >= startDate && cleanDate <= endDate;
    return true; // 'alltime'
  };

  // Filter Bookings by Selected Tab Period (Stay nights [checkInDate, checkOutDate))
  const filteredBookings = allBookings.filter(b => {
    const cIn = b.checkInDate ? String(b.checkInDate).split('T')[0] : (b.createdAt ? String(b.createdAt).split('T')[0] : '');
    const cOut = b.checkOutDate ? String(b.checkOutDate).split('T')[0] : cIn;

    if (!cIn) return false;

    const hasExtraInPeriod = b.extraChargesList && Array.isArray(b.extraChargesList) && b.extraChargesList.some(ec => {
      const ecDate = ec.createdAt || ec.date;
      return ecDate && isInSelectedPeriod(ecDate);
    });

    if (activeTab === 'daily') {
      if (cIn === cOut) {
        return selectedDate === cIn || hasExtraInPeriod;
      }
      const isStayNight = selectedDate >= cIn && selectedDate < cOut;
      return isStayNight || hasExtraInPeriod;
    }

    if (activeTab === 'weekly') {
      const wStart = selectedWeekStart;
      const wEnd = selectedWeekEnd;
      const overlap = cIn <= wEnd && cOut > wStart;
      return overlap || hasExtraInPeriod;
    }

    if (activeTab === 'monthly') {
      const monthStart = `${selectedYear}-${String(Number(selectedMonth) + 1).padStart(2, '0')}-01`;
      const daysInM = new Date(selectedYear, Number(selectedMonth) + 1, 0).getDate();
      const monthEnd = `${selectedYear}-${String(Number(selectedMonth) + 1).padStart(2, '0')}-${String(daysInM).padStart(2, '0')}`;
      const overlap = cIn <= monthEnd && cOut > monthStart;
      return overlap || hasExtraInPeriod;
    }

    if (activeTab === 'yearly') {
      const yearStart = `${selectedYear}-01-01`;
      const yearEnd = `${selectedYear}-12-31`;
      const overlap = cIn <= yearEnd && cOut > yearStart;
      return overlap || hasExtraInPeriod;
    }

    if (activeTab === 'custom') {
      const overlap = cIn <= endDate && cOut > startDate;
      return overlap || hasExtraInPeriod;
    }

    return true; // 'alltime'
  });

  // Search & Filter detailed transaction rows
  const searchedBookings = filteredBookings.filter(b => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const guest = (b.guestName || '').toLowerCase();
    const bill = (b.invoiceNumber || b.id || '').toLowerCase();
    const room = b.roomNumbers ? b.roomNumbers.join(', ').toLowerCase() : String(b.Room?.roomNumber || '').toLowerCase();
    return guest.includes(q) || bill.includes(q) || room.includes(q);
  });

  // Calculate Operational Summary KPIs for Selected Period (filtered by search if active)
  const computeOperationalKpis = () => {
    const q = searchQuery.trim().toLowerCase();

    const matchingActive = activeBookings.filter(b => {
      if (b.status === 'Completed' || b.status === 'Cancelled') return false;
      if (!q) return true;
      const guest = (b.guestName || '').toLowerCase();
      const room = b.roomNumbers ? b.roomNumbers.join(', ').toLowerCase() : String(b.Room?.roomNumber || '').toLowerCase();
      return guest.includes(q) || room.includes(q);
    });

    const occupiedFromRooms = q 
      ? rooms.filter(r => (r.status === 'occupied' || r.isOccupied) && (String(r.roomNumber || '').toLowerCase().includes(q) || (r.guestName || '').toLowerCase().includes(q))).length
      : rooms.filter(r => r.status === 'occupied' || r.isOccupied).length;

    const occupiedFromActiveBookings = matchingActive.reduce((sum, b) => sum + (b.roomNumbers ? b.roomNumbers.length : 1), 0);
    const inHouseRoomsCount = q ? occupiedFromActiveBookings : (rooms.length > 0 ? occupiedFromRooms : occupiedFromActiveBookings);

    // In-house pax count
    const inHousePaxCount = matchingActive.reduce((sum, b) => sum + Number(b.adults || 1) + Number(b.children || 0), 0);

    // Combine all unique bookings to compute check-ins and check-outs for period
    const combinedBookings = [...activeBookings, ...allBookings];
    const uniqueBookingsMap = new Map();
    combinedBookings.forEach(b => {
      const bKey = b.id || b.invoiceNumber || `${b.guestName}_${b.checkInDate}`;
      if (bKey) uniqueBookingsMap.set(bKey, b);
    });
    const uniqueBookings = Array.from(uniqueBookingsMap.values()).filter(b => {
      if (!q) return true;
      const guest = (b.guestName || '').toLowerCase();
      const bill = (b.invoiceNumber || b.id || '').toLowerCase();
      const room = b.roomNumbers ? b.roomNumbers.join(', ').toLowerCase() : String(b.Room?.roomNumber || '').toLowerCase();
      return guest.includes(q) || bill.includes(q) || room.includes(q);
    });

    // Check-ins during selected period
    const checkInCount = uniqueBookings.filter(b => {
      if (b.status === 'Cancelled') return false;
      const cIn = b.checkInDate || b.checkinDate;
      return isInSelectedPeriod(cIn);
    }).length;

    // Check-outs completed during selected period (Guest checkout done!)
    const checkOutCount = uniqueBookings.filter(b => {
      const isCompleted = b.status === 'Completed' || b.status === 'CheckedOut' || b.status === 'Checked-Out';
      if (!isCompleted) return false;
      const cOut = b.checkOutDate || b.checkoutDate || b.updatedAt;
      return isInSelectedPeriod(cOut);
    }).length;

    return {
      inHouseRooms: inHouseRoomsCount,
      inHousePax: inHousePaxCount,
      checkIn: checkInCount,
      checkOut: checkOutCount
    };
  };

  const operationalKpis = computeOperationalKpis();

  // Compute Financial Summary Breakdown
  const computeFinancialSummary = () => {
    let rateRoomBase = 0;
    let rateRoomGst = 0;

    let extraBedBase = 0;
    let extraBedGst = 0;

    let planBase = 0;
    let planGst = 0;

    let retentionBase = 0;
    let retentionGst = 0;

    let totalDaysStayedSum = 0;

    searchedBookings.forEach(b => {
      const pFin = getBookingPeriodFinancials(b, activeTab, periodInfo);
      totalDaysStayedSum += pFin.stayDays;

      // Room Charges Rate
      rateRoomBase += pFin.baseAmount;
      rateRoomGst += pFin.roomGst;

      // Extra Bed / Extras
      extraBedBase += pFin.extraSubTotal;
      extraBedGst += (pFin.totalGst - pFin.roomGst);
    });

    const rateCgst = rateRoomGst / 2;
    const rateSgst = rateRoomGst / 2;

    const extraBedCgst = extraBedGst / 2;
    const extraBedSgst = extraBedGst / 2;

    const planCgst = planGst / 2;
    const planSgst = planGst / 2;

    const retentionCgst = retentionGst / 2;
    const retentionSgst = retentionGst / 2;

    const dayTotalBase = rateRoomBase + extraBedBase + planBase + retentionBase;
    const dayTotalGst = rateRoomGst + extraBedGst + planGst + retentionGst;
    const dayTotalCgst = dayTotalGst / 2;
    const dayTotalSgst = dayTotalGst / 2;
    const dayTotalAmount = dayTotalBase + dayTotalGst;

    return {
      financialRows: [
        { description: 'Rate', baseAmount: rateRoomBase, cgst: rateCgst, sgst: rateSgst, totalGst: rateRoomGst, totalAmount: rateRoomBase + rateRoomGst },
        { description: 'Extra Bed / Extras', baseAmount: extraBedBase, cgst: extraBedCgst, sgst: extraBedSgst, totalGst: extraBedGst, totalAmount: extraBedBase + extraBedGst },
        { description: 'Plan', baseAmount: planBase, cgst: planCgst, sgst: planSgst, totalGst: planGst, totalAmount: planBase + planGst },
        { description: 'Retention', baseAmount: retentionBase, cgst: retentionCgst, sgst: retentionSgst, totalGst: retentionGst, totalAmount: retentionBase + retentionGst }
      ],
      dayTotal: { baseAmount: dayTotalBase, cgst: dayTotalCgst, sgst: dayTotalSgst, totalGst: dayTotalGst, totalAmount: dayTotalAmount },
      totalRateAmount: dayTotalAmount,
      totalDaysStayed: totalDaysStayedSum
    };
  };

  const financialData = computeFinancialSummary();

  const sortedBookings = [...searchedBookings].sort((a, b) => {
    if (sortField === 'registrationNumber') {
      const regA = a.registrationNumber || getAutoRegNo(a, filteredBookings);
      const regB = b.registrationNumber || getAutoRegNo(b, filteredBookings);
      const numA = parseInt(String(regA).replace(/\D/g, ''), 10);
      const numB = parseInt(String(regB).replace(/\D/g, ''), 10);
      let cmp = 0;
      if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
        cmp = numA - numB;
      } else {
        cmp = String(regA).localeCompare(String(regB), undefined, { numeric: true, sensitivity: 'base' });
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    }
    if (sortField === 'date') {
      const dA = new Date(a.checkOutDate || a.createdAt || 0);
      const dB = new Date(b.checkOutDate || b.createdAt || 0);
      return sortOrder === 'asc' ? dA - dB : dB - dA;
    }
    if (sortField === 'billingNo') {
      const billA = String(a.invoiceNumber || a.id || '');
      const billB = String(b.invoiceNumber || b.id || '');
      return sortOrder === 'asc'
        ? billA.localeCompare(billB, undefined, { numeric: true, sensitivity: 'base' })
        : billB.localeCompare(billA, undefined, { numeric: true, sensitivity: 'base' });
    }
    return 0;
  });

  const getPeriodTitleStr = () => {
    if (activeTab === 'daily') return `Daily Report (${formatDateDMY(selectedDate)})`;
    if (activeTab === 'weekly') return `Weekly Report (${formatDateDMY(selectedWeekStart)} to ${formatDateDMY(selectedWeekEnd)})`;
    if (activeTab === 'monthly') return `Monthly Report (${months[selectedMonth]} ${selectedYear})`;
    if (activeTab === 'yearly') return `Yearly Report (${selectedYear})`;
    if (activeTab === 'custom') return `Custom Range Report (${formatDateDMY(startDate)} to ${formatDateDMY(endDate)})`;
    return 'All-Time Report';
  };

  const handleDownloadPDF = () => {
    const isDaily = activeTab === 'daily';
    const txList = sortedBookings.map(b => {
      const pFin = getBookingPeriodFinancials(b, activeTab, periodInfo);
      const dateVal = isDaily ? selectedDate : (b.checkInDate || b.createdAt || 'N/A');

      return {
        date: formatDateDMY(dateVal),
        billNo: b.invoiceNumber || String(b.id || ''),
        guestName: b.guestName || 'Guest',
        company: b.companyName || b.company || b.Guest?.companyName || b.Guest?.company || 'N/A',
        roomNumber: b.roomNumbersDisplay || (b.roomNumbers ? b.roomNumbers.join(', ') : (b.Room?.roomNumber || 'N/A')),
        catalogRate: b.pricePerNight || b.roomRate || (b.totalAmount && pFin.totalDays ? (b.totalAmount / pFin.totalDays) : (b.Room?.pricePerNight || 0)),
        stayDays: pFin.stayDays,
        baseAmount: pFin.baseAmount,
        extraService: pFin.extraSubTotal,
        cgst: pFin.cgst,
        sgst: pFin.sgst,
        totalGst: pFin.totalGst,
        totalAmount: pFin.grandTotal
      };
    });

    generateGeneralReportPdf({
      periodTitle: getPeriodTitleStr(),
      periodSubtitle: activeHotel?.name || 'Hotel Report',
      summaryKpi: operationalKpis,
      financialRows: financialData.financialRows,
      financialTotals: financialData.dayTotal,
      totalRateAmount: financialData.totalRateAmount,
      transactionsList: txList,
      tableTotals: tableTotals,
      isDaily: isDaily
    });
  };

  const handleDownloadCSV = () => {
    let csv = `Date,Billing No,Guest Name,Company,Room Number,Room Rate,Days,Charges,Extra Service / Food,CGST,SGST,TOTAL GST,TOTAL AMOUNT\n`;

    const isDaily = activeTab === 'daily';

    sortedBookings.forEach(b => {
      const pFin = getBookingPeriodFinancials(b, activeTab, periodInfo);
      const rawDate = isDaily ? selectedDate : (b.checkInDate || b.createdAt || 'N/A');
      const dateStr = formatDateDMY(rawDate);
      const escapedName = `"${(b.guestName || '').replace(/"/g, '""')}"`;
      const companyVal = b.companyName || b.company || b.Guest?.companyName || b.Guest?.company || 'N/A';
      const escapedCompany = `"${companyVal.replace(/"/g, '""')}"`;
      const billNo = b.invoiceNumber || String(b.id || '');
      const rawRoomStr = b.roomNumbersDisplay || (b.roomNumbers ? b.roomNumbers.join(', ') : String(b.Room?.roomNumber || 'N/A'));
      const formattedRoomStr = rawRoomStr.toLowerCase().includes('room') ? rawRoomStr : `Room ${rawRoomStr}`;
      const escapedRoom = `"${formattedRoomStr.replace(/"/g, '""')}"`;
      const catRate = b.pricePerNight || b.roomRate || (b.totalAmount && pFin.totalDays ? (b.totalAmount / pFin.totalDays) : (b.Room?.pricePerNight || 0));

      csv += `${dateStr},${billNo},${escapedName},${escapedCompany},${escapedRoom},${Number(catRate).toFixed(2)},${pFin.stayDays},${pFin.baseAmount.toFixed(2)},${pFin.extraSubTotal.toFixed(2)},${pFin.cgst.toFixed(3)},${pFin.sgst.toFixed(3)},${pFin.totalGst.toFixed(3)},${pFin.grandTotal.toFixed(2)}\n`;
    });

    if (sortedBookings.length > 0) {
      csv += `Total (${sortedBookings.length} Records),,,,,,${tableTotals.baseAmount.toFixed(2)},${tableTotals.extraServices.toFixed(2)},${tableTotals.cgst.toFixed(3)},${tableTotals.sgst.toFixed(3)},${tableTotals.totalGst.toFixed(3)},${tableTotals.totalAmount.toFixed(2)}\n`;
    }

    // Appended Operational Summary Section at bottom
    csv += `\n`;
    csv += `,,,,,,,Operational Summary,Count\n`;
    csv += `,,,,,,,In-house Room,${operationalKpis.inHouseRooms}\n`;
    csv += `,,,,,,,In-house Pax,${operationalKpis.inHousePax}\n`;
    csv += `,,,,,,,Check-In,${operationalKpis.checkIn}\n`;
    csv += `,,,,,,,Check-Out,${operationalKpis.checkOut}\n`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Front_Office_Report_${activeTab}_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const formatCurrency = (val) => {
    return `₹${Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatCurrency3 = (val) => {
    if (val === undefined || val === null || isNaN(val)) return '₹0.000';
    const num = Number(val);
    return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  };

  const tableTotals = sortedBookings.reduce((acc, b) => {
    const pFin = getBookingPeriodFinancials(b, activeTab, periodInfo);

    acc.extraServices += pFin.extraSubTotal;
    acc.baseAmount += pFin.baseAmount;
    acc.cgst += pFin.cgst;
    acc.sgst += pFin.sgst;
    acc.totalGst += pFin.totalGst;
    acc.totalAmount += pFin.grandTotal;
    return acc;
  }, { extraServices: 0, baseAmount: 0, cgst: 0, sgst: 0, totalGst: 0, totalAmount: 0 });

  return (
    <div className="space-y-3.5 text-[#1A2E05] pb-8">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-xl border border-[#DDE5D0] shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 bg-[#84A63C]/10 rounded-lg flex items-center justify-center text-[#84A63C]">
            <FileText size={20} />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-black text-[#1A2E05] tracking-tight">Front Office Reports</h1>
            <p className="text-[11px] font-semibold text-[#4A5E38] mt-0.5">Operational summaries, financial breakdowns, and exportable reports</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadCSV}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#DDE5D0] text-[#1A2E05] hover:bg-[#F5F7F0] font-bold text-xs rounded-lg shadow-2xs transition-all active:scale-95 cursor-pointer"
          >
            <Download size={13} className="text-[#84A63C]" /> Download CSV
          </button>
          <button
            onClick={handleDownloadPDF}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#84A63C] hover:bg-[#729230] text-white font-bold text-xs rounded-lg shadow-xs transition-all active:scale-95 cursor-pointer"
          >
            <Download size={13} /> Download PDF Report
          </button>
        </div>
      </div>

      {/* Filter Tabs & Period Selector */}
      <div className="bg-white rounded-xl p-2.5 sm:p-3 border border-[#DDE5D0] shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Tabs */}
          <div className="flex items-center gap-1 bg-[#F5F7F0] p-1 rounded-lg border border-[#DDE5D0] overflow-x-auto max-w-full">
            {[
              { id: 'daily', label: 'Daily' },
              { id: 'weekly', label: 'Weekly' },
              { id: 'monthly', label: 'Monthly' },
              { id: 'yearly', label: 'Yearly' },
              { id: 'alltime', label: 'All Time' },
              { id: 'custom', label: 'Custom Range' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-[#84A63C] text-white shadow-xs'
                    : 'text-[#4A5E38] hover:text-[#1A2E05] hover:bg-[#E2E8F0]/40'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Period Controls */}
          <div className="flex items-center gap-2">
            {activeTab === 'daily' && (
              <div className="flex items-center gap-1.5">
                <Calendar size={14} className="text-[#84A63C]" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-[#F5F7F0] border border-[#DDE5D0] text-[#1A2E05] text-xs font-bold rounded-lg px-2.5 py-1 focus:outline-none focus:border-[#84A63C]"
                />
              </div>
            )}

            {activeTab === 'weekly' && (
              <div className="flex items-center gap-1.5">
                <Calendar size={14} className="text-[#84A63C]" />
                <span className="text-xs font-bold text-[#4A5E38]">Week Range:</span>
                <input
                  type="date"
                  value={selectedWeekStart}
                  onChange={(e) => setSelectedWeekStart(e.target.value)}
                  className="bg-[#F5F7F0] border border-[#DDE5D0] text-[#1A2E05] text-xs font-bold rounded-lg px-2.5 py-1 focus:outline-none focus:border-[#84A63C]"
                />
                <span className="text-xs font-bold text-[#4A5E38]">to</span>
                <input
                  type="date"
                  value={selectedWeekEnd}
                  readOnly
                  className="bg-[#F5F7F0] border border-[#DDE5D0] text-[#1A2E05] text-xs font-bold rounded-lg px-2.5 py-1 focus:outline-none opacity-85"
                />
              </div>
            )}

            {activeTab === 'monthly' && (
              <div className="flex items-center gap-1.5">
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="bg-[#F5F7F0] border border-[#DDE5D0] text-[#1A2E05] text-xs font-bold rounded-lg px-2.5 py-1 focus:outline-none focus:border-[#84A63C]"
                >
                  {months.map((m, idx) => (
                    <option key={idx} value={idx}>{m}</option>
                  ))}
                </select>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="bg-[#F5F7F0] border border-[#DDE5D0] text-[#1A2E05] text-xs font-bold rounded-lg px-2.5 py-1 focus:outline-none focus:border-[#84A63C]"
                >
                  {years.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            )}

            {activeTab === 'yearly' && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-[#4A5E38]">Year:</span>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="bg-[#F5F7F0] border border-[#DDE5D0] text-[#1A2E05] text-xs font-bold rounded-lg px-2.5 py-1 focus:outline-none focus:border-[#84A63C]"
                >
                  {years.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            )}

            {activeTab === 'custom' && (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-[#F5F7F0] border border-[#DDE5D0] text-[#1A2E05] text-xs font-bold rounded-lg px-2.5 py-1"
                />
                <span className="text-xs font-bold text-[#4A5E38]">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-[#F5F7F0] border border-[#DDE5D0] text-[#1A2E05] text-xs font-bold rounded-lg px-2.5 py-1"
                />
              </div>
            )}

            <button
              onClick={fetchReportData}
              className="p-1.5 text-[#7A8A6A] hover:bg-[#F5F7F0] rounded-lg transition-all"
              title="Refresh Data"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
      </div>



      {/* Detailed Transactions List Table */}
      <div className="bg-white rounded-xl border border-[#DDE5D0] shadow-2xs overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#DDE5D0] bg-[#F9FAFA] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-black text-[#1A2E05] uppercase tracking-wider">Transactions Details</h2>
            <p className="text-[11px] text-[#7A8A6A] font-medium mt-0.5">Showing {sortedBookings.length} booking billing records</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A8A6A]" />
              <input
                type="text"
                placeholder="Search guest, bill, room..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1 bg-[#F5F7F0] border border-[#DDE5D0] rounded-lg text-xs font-semibold focus:outline-none focus:border-[#84A63C] w-44 sm:w-56"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[850px]">
            <thead>
              <tr className="bg-[#F5F7F0] border-b border-[#DDE5D0]">
                <th
                  onClick={() => {
                    if (sortField === 'billingNo') {
                      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSortField('billingNo');
                      setSortOrder('asc');
                    }
                  }}
                  className="px-4 py-2.5 text-[10px] font-black text-[#4A5E38] uppercase tracking-wider cursor-pointer hover:text-[#1A2E05] transition-colors select-none whitespace-nowrap"
                  title="Click to sort by Billing Number"
                >
                  <div className="flex items-center gap-1 whitespace-nowrap">
                    <span>Billing No.</span>
                    {sortField === 'billingNo' ? (
                      sortOrder === 'asc' ? (
                        <ArrowUp size={12} className="text-[#84A63C] stroke-[2.5]" />
                      ) : (
                        <ArrowDown size={12} className="text-[#84A63C] stroke-[2.5]" />
                      )
                    ) : (
                      <ArrowUpDown size={12} className="text-[#7A8A6A] opacity-60 hover:opacity-100" />
                    )}
                  </div>
                </th>
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
                    className="px-4 py-2.5 text-[10px] font-black text-[#4A5E38] uppercase tracking-wider cursor-pointer hover:text-[#1A2E05] transition-colors select-none whitespace-nowrap"
                    title="Click to sort by Reg. No."
                  >
                    <div className="flex items-center gap-1 whitespace-nowrap">
                      <span className="whitespace-nowrap">Reg. No.</span>
                      {sortField === 'registrationNumber' ? (
                        sortOrder === 'asc' ? (
                          <ArrowUp size={12} className="text-[#84A63C] stroke-[2.5]" />
                        ) : (
                          <ArrowDown size={12} className="text-[#84A63C] stroke-[2.5]" />
                        )
                      ) : (
                        <ArrowUpDown size={12} className="text-[#7A8A6A] opacity-60 hover:opacity-100" />
                      )}
                    </div>
                  </th>
                )}
                <th className="px-4 py-2.5 text-[10px] font-black text-[#4A5E38] uppercase tracking-wider min-w-[130px] max-w-[180px]">Guest Name</th>
                <th className="px-4 py-2.5 text-[10px] font-black text-[#4A5E38] uppercase tracking-wider min-w-[120px] max-w-[170px]">Company</th>
                <th className="px-4 py-2.5 text-[10px] font-black text-[#4A5E38] uppercase tracking-wider whitespace-nowrap">Room Number</th>
                <th className="px-4 py-2.5 text-[10px] font-black text-[#4A5E38] uppercase tracking-wider text-right whitespace-nowrap">Room Rate</th>
                <th className="px-4 py-2.5 text-[10px] font-black text-[#4A5E38] uppercase tracking-wider text-center whitespace-nowrap">Days</th>
                <th className="px-4 py-2.5 text-[10px] font-black text-[#4A5E38] uppercase tracking-wider text-right whitespace-nowrap">Charges</th>
                <th className="px-4 py-2.5 text-[10px] font-black text-[#5C7A1F] uppercase tracking-wider text-right max-w-[95px] whitespace-normal leading-tight">Extra Service / Food</th>
                <th className="px-4 py-2.5 text-[10px] font-black text-[#4A5E38] uppercase tracking-wider text-right whitespace-nowrap">CGST</th>
                <th className="px-4 py-2.5 text-[10px] font-black text-[#4A5E38] uppercase tracking-wider text-right whitespace-nowrap">SGST</th>
                <th className="px-4 py-2.5 text-[10px] font-black text-[#84A63C] uppercase tracking-wider text-right whitespace-nowrap">Total GST</th>
                <th className="px-4 py-2.5 text-[10px] font-black text-[#1A2E05] uppercase tracking-wider text-right whitespace-nowrap">Total Amount</th>
                <th
                  onClick={() => {
                    if (sortField === 'date') {
                      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSortField('date');
                      setSortOrder('asc');
                    }
                  }}
                  className="px-4 py-2.5 text-[10px] font-black text-[#4A5E38] uppercase tracking-wider cursor-pointer hover:text-[#1A2E05] transition-colors select-none whitespace-nowrap"
                  title="Click to sort by Date"
                >
                  <div className="flex items-center gap-1 justify-end whitespace-nowrap">
                    <span>Date</span>
                    {sortField === 'date' ? (
                      sortOrder === 'asc' ? (
                        <ArrowUp size={12} className="text-[#84A63C] stroke-[2.5]" />
                      ) : (
                        <ArrowDown size={12} className="text-[#84A63C] stroke-[2.5]" />
                      )
                    ) : (
                      <ArrowUpDown size={12} className="text-[#7A8A6A] opacity-60 hover:opacity-100" />
                    )}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F3E8] text-xs">
              {loading ? (
                <tr>
                  <td colSpan={activeHotel?.enableRegistrationNumber === true ? 14 : 13} className="py-8 text-center text-[#4A5E38] font-bold">
                    Loading report data...
                  </td>
                </tr>
              ) : sortedBookings.length > 0 ? (
                sortedBookings.map((b, idx) => {
                  const pFin = getBookingPeriodFinancials(b, activeTab, periodInfo);
                  const isDaily = activeTab === 'daily';
                  const rawDateVal = isDaily ? selectedDate : (b.checkInDate || b.createdAt || 'N/A');
                  const dateStr = formatDateDMY(rawDateVal);
                  const rawRoomStr = b.roomNumbersDisplay || (b.roomNumbers ? b.roomNumbers.join(', ') : (b.Room?.roomNumber || 'N/A'));
                  const roomStr = rawRoomStr.toLowerCase().includes('room') ? rawRoomStr : `Room ${rawRoomStr}`;
                  const catRate = b.pricePerNight || b.roomRate || (b.totalAmount && pFin.totalDays ? (b.totalAmount / pFin.totalDays) : (b.Room?.pricePerNight || 0));
                  const companyStr = b.companyName || b.company || b.Guest?.companyName || b.Guest?.company || 'N/A';

                  return (
                    <tr key={idx} className="hover:bg-[#F5F7F0]/40 transition-colors">
                      <td className="px-4 py-2 font-bold text-[#1A2E05] whitespace-nowrap">{b.invoiceNumber || b.id || 'N/A'}</td>
                      {activeHotel?.enableRegistrationNumber === true && (
                        <td className="px-4 py-2 font-bold text-[#1A2E05] whitespace-nowrap">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#EEF4E3] border border-[#D3E2BD] text-[#1A2E05] whitespace-nowrap">
                            {b.registrationNumber || getAutoRegNo(b, filteredBookings)}
                          </span>
                        </td>
                      )}
                      <td className="px-4 py-2 font-bold text-[#1A2E05] min-w-[130px] max-w-[180px] whitespace-normal break-words leading-tight">{b.guestName || 'Guest'}</td>
                      <td className="px-4 py-2 font-semibold text-[#4A5E38] max-w-[170px] min-w-[120px] whitespace-normal break-words leading-tight">{companyStr}</td>
                      <td className="px-4 py-2 font-bold text-[#1A2E05] whitespace-nowrap">{roomStr}</td>
                      <td className="px-4 py-2 text-right font-medium whitespace-nowrap">{catRate ? formatCurrency(catRate) : 'N/A'}</td>
                      <td className="px-4 py-2 text-center font-bold whitespace-nowrap">{pFin.stayDays}</td>
                      <td className="px-4 py-2 text-right font-medium whitespace-nowrap">{formatCurrency(pFin.baseAmount)}</td>
                      <td className="px-4 py-2 text-right font-semibold text-[#5C7A1F] whitespace-nowrap">{formatCurrency(pFin.extraSubTotal)}</td>
                      <td className="px-4 py-2 text-right font-medium whitespace-nowrap">{formatCurrency3(pFin.cgst)}</td>
                      <td className="px-4 py-2 text-right font-medium whitespace-nowrap">{formatCurrency3(pFin.sgst)}</td>
                      <td className="px-4 py-2 text-right font-bold text-[#84A63C] whitespace-nowrap">{formatCurrency3(pFin.totalGst)}</td>
                      <td className="px-4 py-2 text-right font-black text-[#1A2E05] whitespace-nowrap">{formatCurrency(pFin.grandTotal)}</td>
                      <td className="px-4 py-2 text-right font-semibold text-[#7A8A6A] whitespace-nowrap">{dateStr}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={13} className="py-8 text-center text-[#4A5E38] font-bold">
                    No transactions found for the selected period.
                  </td>
                </tr>
              )}
            </tbody>
            {sortedBookings.length > 0 && !loading && (
              <tfoot className="bg-[#F4F6F0] font-black text-[#1A2E05] border-t-2 border-[#DDE5D0] text-xs">
                <tr>
                  <td colSpan={6} className="px-4 py-2.5 uppercase tracking-wider text-[11px] font-black text-[#1A2E05]">
                    Total ({sortedBookings.length} {sortedBookings.length === 1 ? 'Record' : 'Records'})
                  </td>
                  <td className="px-4 py-2.5 text-right font-black text-[#1A2E05]">
                    {formatCurrency(tableTotals.baseAmount)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-black text-[#5C7A1F]">
                    {formatCurrency(tableTotals.extraServices)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-black text-[#1A2E05]">
                    {formatCurrency3(tableTotals.cgst)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-black text-[#1A2E05]">
                    {formatCurrency3(tableTotals.sgst)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-black text-[#84A63C]">
                    {formatCurrency3(tableTotals.totalGst)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-black text-[#5C7A1F] text-sm">
                    {formatCurrency(tableTotals.totalAmount)}
                  </td>
                  <td className="px-4 py-2.5"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Bottom Footer Section: Operational Summary (Left) & Financial Summary (Right) */}
      <div className="flex flex-col lg:flex-row justify-between items-start gap-4 pt-1">
        {/* Bottom-Left Operational Summary Card */}
        <div className="w-full lg:w-[300px] bg-white p-3.5 rounded-xl border border-[#DDE5D0] shadow-2xs text-xs space-y-2.5">
          <div className="border-b border-[#DDE5D0] pb-2 flex items-center justify-between">
            <h3 className="font-black text-[#1A2E05] uppercase tracking-wider text-[11px]">Summary</h3>
            <span className="text-[10px] font-extrabold text-[#7A8A6A] uppercase tracking-wider">Operational</span>
          </div>

          <div className="divide-y divide-[#F0F3E8] text-[11px]">
            <div className="py-1.5 flex items-center justify-between">
              <span className="font-bold text-[#4A5E38]">In-house Room</span>
              <span className="font-black text-[#1A2E05] text-sm">{operationalKpis.inHouseRooms}</span>
            </div>
            <div className="py-1.5 flex items-center justify-between">
              <span className="font-bold text-blue-700/80">In-house Pax</span>
              <span className="font-black text-blue-900 text-sm">{operationalKpis.inHousePax}</span>
            </div>
            <div className="py-1.5 flex items-center justify-between">
              <span className="font-bold text-indigo-700/80">Check-In</span>
              <span className="font-black text-indigo-900 text-sm">{operationalKpis.checkIn}</span>
            </div>
            <div className="py-1.5 flex items-center justify-between">
              <span className="font-bold text-emerald-700/80">Check-Out</span>
              <span className="font-black text-emerald-900 text-sm">{operationalKpis.checkOut}</span>
            </div>
          </div>
        </div>

        {/* Bottom-Right Compact Financial Summary Section Card */}
        <div className="w-full lg:w-[420px] bg-white p-3.5 rounded-xl border border-[#DDE5D0] shadow-2xs text-xs space-y-2.5">
          <div className="flex items-center justify-between border-b border-[#DDE5D0] pb-2">
            <h3 className="font-black text-[#1A2E05] uppercase tracking-wider text-[11px]">Financial Summary</h3>
            <span className="text-[10px] font-extrabold text-[#5C7A1F] bg-[#84A63C]/10 px-2 py-0.5 rounded-md border border-[#84A63C]/20">
              Total Rate: {formatCurrency(financialData.totalRateAmount)}
            </span>
          </div>

          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[#DDE5D0] text-[10px] font-black text-[#4A5E38] uppercase tracking-wider">
                <th className="py-1">Description</th>
                <th className="py-1 text-right">Amount</th>
                <th className="py-1 text-right">CGST</th>
                <th className="py-1 text-right">SGST</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F3E8] text-[11px]">
              {financialData.financialRows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-[#F5F7F0]/40">
                  <td className="py-1 font-bold text-[#1A2E05]">{row.description}</td>
                  <td className="py-1 text-right font-semibold text-[#1A2E05]">{formatCurrency(row.baseAmount)}</td>
                  <td className="py-1 text-right font-medium text-[#4A5E38]">{formatCurrency3(row.cgst)}</td>
                  <td className="py-1 text-right font-medium text-[#4A5E38]">{formatCurrency3(row.sgst)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-[#DDE5D0] font-black text-[#1A2E05] bg-[#F4F6F0]">
                <td className="py-1.5 uppercase tracking-wider text-[10px]">Day Total</td>
                <td className="py-1.5 text-right">{formatCurrency(financialData.dayTotal.baseAmount)}</td>
                <td className="py-1.5 text-right">{formatCurrency3(financialData.dayTotal.cgst)}</td>
                <td className="py-1.5 text-right">{formatCurrency3(financialData.dayTotal.sgst)}</td>
              </tr>
            </tbody>
          </table>

          <div className="border-t border-[#DDE5D0] pt-2 flex items-center justify-between font-black text-xs text-[#1A2E05]">
            <span className="uppercase tracking-wider">Total Rate</span>
            <span className="text-[#5C7A1F] text-sm font-black">{formatCurrency(financialData.totalRateAmount)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Report;
