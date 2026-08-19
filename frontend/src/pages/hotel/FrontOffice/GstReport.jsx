import React, { useState, useEffect, useRef } from 'react';
import {
  DollarSign, TrendingUp, Calendar, Search, X, Loader2, BarChart3, Eye, ChevronDown, AlertTriangle, Download, ArrowUpDown, ArrowUp, ArrowDown, CheckCircle, Clock
} from 'lucide-react';
import api from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { generateOverallGstPdf, generateRoomHistoryPdf, generateDetailedAllRoomsGstPdf } from '../../../utils/gstPdfGenerator';
import { cleanRoomNumber } from '../../../utils/roomHelper';
import { generateTaxInvoice } from '../../../utils/taxInvoiceGenerator';
import { getAutoRegNo } from '../../../utils/registrationNumberGenerator';

// Parses a "YYYY-MM-DD" string as a LOCAL date instead of UTC midnight.
// `new Date("2026-07-02")` is parsed as UTC and can shift a day backwards
// in timezones behind UTC. This keeps date-only comparisons stable.
const parseLocalDate = (dateStr) => {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const getLocalDateOfBooking = (b) => {
  if (!b) return null;
  if (b.checkOutDate) {
    const [y, m, d] = b.checkOutDate.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  if (b.createdAt) {
    const dateObj = new Date(b.createdAt);
    return new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
  }
  return null;
};

const BILLING_FETCH_LIMIT = 10000;

const calculateBookingFinancials = (b) => {
  if (!b) return { subTotal: 0, roomSubTotal: 0, extraSubTotal: 0, roomGst: 0, extraGst: 0, gstAmount: 0, grandTotal: 0, gstRate: 0, extraChargesTotal: 0, cgst: 0, sgst: 0 };

  const groupItems = (b.groupBookings && b.groupBookings.length > 0) ? b.groupBookings : [b];
  const gstOption = b.gstOption || 'exclusive';
  const fallbackRate = (b.gstRate !== undefined && b.gstRate !== null) ? Number(b.gstRate) : 12;

  let totalRoomSubTotal = 0;
  let totalRoomGstAmount = 0;
  let totalRoomGrandTotal = 0;
  let rawBaseTotal = 0;
  let discountTotal = 0;

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
      rGst = Math.round(rSub * (effectiveRate / 100) * 100) / 100;
      rGrand = Math.round((rSub + rGst) * 100) / 100;
    } else if (gstOption === 'inclusive') {
      let roomGrand = Math.max(0, rBase - rDiscount) + rawEarlyAmt;
      const paidAmt = Number(gb.amountPaid || b.amountPaid || 0);
      if (paidAmt > roomGrand && Math.abs(paidAmt - Math.round(roomGrand * (1 + effectiveRate / 100))) < 1.5) {
        roomGrand = paidAmt;
      }
      rGrand = roomGrand;
      rSub = Math.round((rGrand / (1 + effectiveRate / 100)) * 100) / 100;
      rGst = Math.round((rGrand - rSub) * 100) / 100;
    } else {
      rSub = Math.max(0, rBase - rDiscount) + rawEarlyAmt;
      rGst = 0;
      rGrand = rSub;
    }

    rawBaseTotal += rBase;
    discountTotal += rDiscount;
    totalRoomSubTotal += rSub;
    totalRoomGstAmount += rGst;
    totalRoomGrandTotal += rGrand;
  });

  // Extra Service GST calculation
  let extraServiceGst = Number(b.extraServiceGst || 0);
  let extraServiceSubTotal = Number(b.extraServiceSubTotal || 0);
  let extraChargesTotal = Number(b.extraCharges || 0);

  if (b.extraChargesList && b.extraChargesList.length > 0) {
    extraServiceGst = b.extraChargesList.reduce((sum, ec) => sum + Number(ec.gstAmount || 0), 0);
    extraServiceSubTotal = b.extraChargesList.reduce((sum, ec) => sum + Number(ec.subtotal || 0), 0);
    extraChargesTotal = b.extraChargesList.reduce((sum, ec) => sum + Number(ec.grandTotal || 0), 0);
  } else if (extraChargesTotal > 0 && extraServiceGst === 0 && extraServiceSubTotal === 0) {
    extraServiceSubTotal = extraChargesTotal;
  }

  const combinedSubTotal = totalRoomSubTotal + extraServiceSubTotal;
  const combinedGstAmount = totalRoomGstAmount + extraServiceGst;
  const finalGrandTotal = totalRoomGrandTotal + extraChargesTotal;
  const cgst = combinedGstAmount / 2;
  const sgst = combinedGstAmount / 2;

  return {
    rawBase: rawBaseTotal,
    discount: discountTotal,
    subTotal: combinedSubTotal,
    roomSubTotal: totalRoomSubTotal,
    extraSubTotal: extraServiceSubTotal,
    gstAmount: combinedGstAmount,
    roomGst: totalRoomGstAmount,
    extraGst: extraServiceGst,
    cgst,
    sgst,
    gstRate: gstOption === 'none' ? 0 : fallbackRate,
    gstOption,
    extraChargesTotal,
    grandTotal: finalGrandTotal
  };
};

const StatCard = ({ label, value, subtext, roomGst, extraGst, icon: Icon, color }) => (
  <div className="bg-white p-2.5 sm:p-4 rounded-xl border border-[#DDE5D0] shadow-2xs flex flex-col justify-between group hover:shadow-sm transition-all duration-300">
    <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-1.5">
      <div className={`p-1 sm:p-1.5 bg-[#F0F3E8] rounded-lg ${color} group-hover:scale-105 transition-transform shrink-0`}>
        <Icon size={14} className="sm:w-4 sm:h-4" strokeWidth={2.5} />
      </div>
      <p className="text-[10px] font-black text-[#1A2E05] uppercase tracking-wider truncate">{label}</p>
    </div>

    <div>
      <p className="text-base sm:text-xl font-black text-[#1A2E05] tracking-tight break-words">{value}</p>

      {roomGst !== undefined && extraGst !== undefined ? (
        <div className="mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-[#F0F3E8] flex flex-col gap-0.5 text-[9.5px] font-bold">
          <div className="flex justify-between items-center text-[#2E4316] gap-1">
            <span className="truncate font-semibold">Room GST:</span>
            <span className="font-black text-[#1A2E05] shrink-0">{roomGst}</span>
          </div>
          <div className="flex justify-between items-center text-[#2E4316] gap-1">
            <span className="truncate font-semibold">Extra GST:</span>
            <span className={`font-black shrink-0 ${Number(String(extraGst).replace(/[^0-9.]/g, '')) > 0 ? 'text-amber-700 font-black' : 'text-[#2E4316]'}`}>
              {extraGst}
            </span>
          </div>
        </div>
      ) : subtext ? (
        <p className="text-[9.5px] font-extrabold text-[#2E4316] uppercase tracking-wider mt-1 truncate" title={subtext}>
          {subtext}
        </p>
      ) : null}
    </div>
  </div>
);

const GstReport = () => {
  const { activeHotel } = useAuth();
  const hotelName = activeHotel?.name || "MALA HOTEL";
  const hasRoomType = activeHotel?.hasRoomType !== false;
  const [loading, setLoading] = useState(true);
  const [allBookings, setAllBookings] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYearEnding, setSelectedYearEnding] = useState('all');
  const [dataTruncated, setDataTruncated] = useState(false);

  const [viewMode, setViewMode] = useState('detailed'); // 'detailed' (Invoice-wise) or 'summary' (Room-wise)
  const [activeTab, setActiveTab] = useState('monthly'); // 'daily', 'weekly', 'monthly', 'quarterly', 'yearly'
  const [selectedWeekStart, setSelectedWeekStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().split('T')[0];
  });

  const today = new Date();
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedQuarter, setSelectedQuarter] = useState(Math.floor(today.getMonth() / 3));
  const [selectedDate, setSelectedDate] = useState(today.toISOString().split('T')[0]);

  const [selectedRoomDetails, setSelectedRoomDetails] = useState(null);
  const [modalMonth, setModalMonth] = useState(today.getMonth());
  const [modalYear, setModalYear] = useState(today.getFullYear());
  const [filterByCustomRange, setFilterByCustomRange] = useState(false);
  const [showDownloadDropdown, setShowDownloadDropdown] = useState(false);
  const downloadDropdownRef = useRef(null);

  const [rangePreset, setRangePreset] = useState('15days');
  const [sortField, setSortField] = useState(null); // null by default, sorts only when header is clicked
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc' or 'desc'
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 15);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);

  // Close the download dropdown when clicking anywhere outside of it.
  useEffect(() => {
    if (!showDownloadDropdown) return;
    const handleClickOutside = (e) => {
      if (downloadDropdownRef.current && !downloadDropdownRef.current.contains(e.target)) {
        setShowDownloadDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDownloadDropdown]);

  const handleDateChange = (dateVal) => {
    setSelectedDate(dateVal);
    if (dateVal) {
      const d = parseLocalDate(dateVal);
      setSelectedMonth(d.getMonth());
      setSelectedYear(d.getFullYear());
      setSelectedQuarter(Math.floor(d.getMonth() / 3));
    }
  };

  const handleMonthChange = (monthVal) => {
    setSelectedMonth(monthVal);
    setSelectedQuarter(Math.floor(monthVal / 3));
    if (selectedDate) {
      const d = parseLocalDate(selectedDate);
      const daysInNewMonth = new Date(selectedYear, monthVal + 1, 0).getDate();
      const newDay = Math.min(d.getDate(), daysInNewMonth);
      const newDateStr = `${selectedYear}-${String(monthVal + 1).padStart(2, '0')}-${String(newDay).padStart(2, '0')}`;
      setSelectedDate(newDateStr);
    }
  };

  const handleYearChange = (yearVal) => {
    setSelectedYear(yearVal);
    if (selectedDate) {
      const d = parseLocalDate(selectedDate);
      const daysInNewMonth = new Date(yearVal, selectedMonth + 1, 0).getDate();
      const newDay = Math.min(d.getDate(), daysInNewMonth);
      const newDateStr = `${yearVal}-${String(selectedMonth + 1).padStart(2, '0')}-${String(newDay).padStart(2, '0')}`;
      setSelectedDate(newDateStr);
    }
  };

  // Manually picking a quarter jumps the month/date to that quarter's first
  // month, keeping every "current point in time" filter consistent with
  // what the KPI cards and table columns are labelled with.
  const handleQuarterChange = (quarterVal) => {
    setSelectedQuarter(quarterVal);
    const firstMonthOfQuarter = quarterVal * 3;
    setSelectedMonth(firstMonthOfQuarter);
    const daysInNewMonth = new Date(selectedYear, firstMonthOfQuarter + 1, 0).getDate();
    const currentDay = selectedDate ? parseLocalDate(selectedDate).getDate() : 1;
    const newDay = Math.min(currentDay, daysInNewMonth);
    setSelectedDate(`${selectedYear}-${String(firstMonthOfQuarter + 1).padStart(2, '0')}-${String(newDay).padStart(2, '0')}`);
  };

  const handleOpenModal = (room) => {
    setSelectedRoomDetails(room);
    setModalMonth(selectedMonth);
    setModalYear(selectedYear);
    setFilterByCustomRange(false); // reset so a previous room's toggle doesn't leak in
  };

  const handlePresetChange = (preset) => {
    setRangePreset(preset);
    const now = new Date();
    const endStr = now.toISOString().split('T')[0];

    if (preset === '15days') {
      const start = new Date();
      start.setDate(now.getDate() - 15);
      setStartDate(start.toISOString().split('T')[0]);
      setEndDate(endStr);
    } else if (preset === '30days') {
      const start = new Date();
      start.setDate(now.getDate() - 30);
      setStartDate(start.toISOString().split('T')[0]);
      setEndDate(endStr);
    } else if (preset === '90days') {
      const start = new Date();
      start.setDate(now.getDate() - 90);
      setStartDate(start.toISOString().split('T')[0]);
      setEndDate(endStr);
    } else if (preset === 'thisMonth') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(start.toISOString().split('T')[0]);
      setEndDate(endStr);
    } else if (preset === 'lastMonth') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      setStartDate(start.toISOString().split('T')[0]);
      setEndDate(end.toISOString().split('T')[0]);
    }
  };

  const handleStartDateChange = (val) => {
    setStartDate(val);
    setRangePreset('custom');
  };

  const handleEndDateChange = (val) => {
    setEndDate(val);
    setRangePreset('custom');
  };

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const years = Array.from({ length: 5 }, (_, i) => today.getFullYear() - i);

  useEffect(() => {
    fetchData();
  }, [selectedYearEnding]);

  const fetchData = async () => {
    try {
      setLoading(true);
      // Fetch rooms list
      const roomsResponse = await api.get('/rooms');
      if (roomsResponse.data?.data) {
        setRooms(roomsResponse.data.data);
      }

      // Fetch all completed & active bookings (using high limit to bypass pagination)
      const billingResponse = await api.get('/analytics/billing', {
        params: {
          limit: BILLING_FETCH_LIMIT,
          yearEnding: selectedYearEnding !== 'all' ? selectedYearEnding : undefined
        }
      });
      if (billingResponse.data?.data?.recentBills) {
        const bills = billingResponse.data.data.recentBills;
        setAllBookings(bills);
        // If we got back exactly the limit, there may be more rows the
        // server didn't send us — flag it instead of silently under-reporting GST.
        setDataTruncated(bills.length >= BILLING_FETCH_LIMIT);
      }
    } catch (error) {
      console.error('Error fetching GST data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Aggregation logic
  const selectedDateObj = parseLocalDate(selectedDate);
  const selectedDateStr = selectedDateObj.toDateString();

  const weekStartDObj = parseLocalDate(selectedWeekStart);
  const weekEndDObj = new Date(weekStartDObj);
  weekEndDObj.setDate(weekEndDObj.getDate() + 6);
  const selectedWeekEnd = weekEndDObj.toISOString().split('T')[0];

  let totalLifetimeGst = 0;
  let totalSelectedYearGst = 0;
  let totalSelectedMonthGst = 0;
  let totalSelectedQuarterGst = 0;
  let totalSelectedDateGst = 0;
  let totalSelectedWeekGst = 0;
  let totalCustomRangeGst = 0;

  const roomGst = {};

  // Pre-initialize rooms
  rooms.forEach(r => {
    roomGst[r.roomNumber] = {
      roomNumber: r.roomNumber,
      roomType: r.type,
      selectedDateGst: 0,
      selectedWeekGst: 0,
      selectedMonth: 0,
      selectedQuarterGst: 0,
      selectedYearGst: 0,
      customRangeGst: 0,
      lifetime: 0,
      periodBaseAmount: 0,
      periodGstAmount: 0,
      periodTotalAmount: 0,
      monthlyBreakdown: {}
    };
  });

  const startDOnly = parseLocalDate(startDate);
  const endDOnly = parseLocalDate(endDate);

  const uniqueAllBookings = [];
  const seenAllGroupBookingIds = new Set();

  allBookings.forEach(b => {
    if (b.groupBookingId) {
      if (!seenAllGroupBookingIds.has(b.groupBookingId)) {
        seenAllGroupBookingIds.add(b.groupBookingId);
        const groupItems = allBookings.filter(h => h.groupBookingId === b.groupBookingId);
        uniqueAllBookings.push({
          ...b,
          isGroup: true,
          groupBookings: groupItems
        });
      }
    } else {
      uniqueAllBookings.push({
        ...b,
        isGroup: false,
        groupBookings: [b]
      });
    }
  });

  uniqueAllBookings.forEach(b => {
    const fin = calculateBookingFinancials(b);
    const gstCollected = fin.gstAmount;

    const dateObj = getLocalDateOfBooking(b);
    if (!dateObj) return;
    const bookingYear = dateObj.getFullYear();
    const bookingMonth = dateObj.getMonth();
    const bookingDay = dateObj.toDateString();
    const bookingQuarter = Math.floor(bookingMonth / 3);

    const isSelectedYear = bookingYear === Number(selectedYear);
    const isSelectedMonth = bookingYear === Number(selectedYear) && bookingMonth === Number(selectedMonth);
    const isSelectedQuarter = bookingYear === Number(selectedYear) && bookingQuarter === Number(selectedQuarter);
    const isSelectedDate = bookingDay === selectedDateStr;

    // Date-only comparison for custom range and week (local-date safe)
    const bookingDateOnly = dateObj;
    const isSelectedWeek = bookingDateOnly >= weekStartDObj && bookingDateOnly <= weekEndDObj;
    const isCustomRange = bookingDateOnly >= startDOnly && bookingDateOnly <= endDOnly;

    // Check if this booking falls into the currently active tab's selected period
    let isSelectedPeriod = false;
    if (activeTab === 'daily') {
      isSelectedPeriod = isSelectedDate;
    } else if (activeTab === 'weekly') {
      isSelectedPeriod = isSelectedWeek;
    } else if (activeTab === 'monthly') {
      isSelectedPeriod = isSelectedMonth;
    } else if (activeTab === 'quarterly') {
      isSelectedPeriod = isSelectedQuarter;
    } else if (activeTab === 'yearly') {
      isSelectedPeriod = isSelectedYear;
    } else if (activeTab === 'custom') {
      isSelectedPeriod = isCustomRange;
    }

    // Update Overall totals (deduplicated per booking transaction)
    totalLifetimeGst += gstCollected;
    if (isSelectedYear) totalSelectedYearGst += gstCollected;
    if (isSelectedMonth) totalSelectedMonthGst += gstCollected;
    if (isSelectedQuarter) totalSelectedQuarterGst += gstCollected;
    if (isSelectedDate) totalSelectedDateGst += gstCollected;
    if (isSelectedWeek) totalSelectedWeekGst += gstCollected;
    if (isCustomRange) totalCustomRangeGst += gstCollected;

    // Attribute each room's individual breakdown to roomGst
    const groupItems = b.groupBookings || [b];
    groupItems.forEach(gb => {
      const gbFin = calculateBookingFinancials(gb);
      const rNum = cleanRoomNumber(gb.Room?.roomNumber || gb.previousRoomNumber || 'N/A');

      if (!roomGst[rNum]) {
        roomGst[rNum] = {
          roomNumber: rNum,
          roomType: gb.Room?.type || 'Unknown',
          selectedDateGst: 0,
          selectedWeekGst: 0,
          selectedMonth: 0,
          selectedQuarterGst: 0,
          selectedYearGst: 0,
          customRangeGst: 0,
          lifetime: 0,
          periodBaseAmount: 0,
          periodGstAmount: 0,
          periodTotalAmount: 0,
          monthlyBreakdown: {}
        };
      }

      if (isSelectedDate) roomGst[rNum].selectedDateGst += gbFin.gstAmount;
      if (isSelectedWeek) roomGst[rNum].selectedWeekGst += gbFin.gstAmount;
      if (isSelectedMonth) roomGst[rNum].selectedMonth += gbFin.gstAmount;
      if (isSelectedQuarter) roomGst[rNum].selectedQuarterGst += gbFin.gstAmount;
      if (isSelectedYear) roomGst[rNum].selectedYearGst += gbFin.gstAmount;
      if (isCustomRange) roomGst[rNum].customRangeGst += gbFin.gstAmount;
      roomGst[rNum].lifetime += gbFin.gstAmount;

      if (isSelectedPeriod) {
        roomGst[rNum].periodBaseAmount += gbFin.subTotal;
        roomGst[rNum].periodGstAmount += gbFin.gstAmount;
        roomGst[rNum].periodTotalAmount += gbFin.grandTotal;
      }

      const key = `${bookingYear}-${String(bookingMonth + 1).padStart(2, '0')}`;
      if (!roomGst[rNum].monthlyBreakdown[key]) {
        roomGst[rNum].monthlyBreakdown[key] = 0;
      }
      roomGst[rNum].monthlyBreakdown[key] += gbFin.gstAmount;
    });
  });

  const roomList = Object.values(roomGst).filter(room => {
    if (!searchQuery) return true;
    return String(room.roomNumber).toLowerCase().includes(searchQuery.toLowerCase());
  }).sort((a, b) => String(a.roomNumber).localeCompare(String(b.roomNumber), undefined, { numeric: true }));

  const filteredBookingsList = allBookings.filter(b => {
    const dateObj = getLocalDateOfBooking(b);
    if (!dateObj) return false;
    const bookingYear = dateObj.getFullYear();
    const bookingMonth = dateObj.getMonth();
    const bookingDay = dateObj.toDateString();
    const bookingQuarter = Math.floor(bookingMonth / 3);

    const bookingDateOnly = dateObj;

    const rNum = b.Room?.roomNumber || b.previousRoomNumber || 'N/A';
    const invNum = b.invoiceNumber || '';
    if (searchQuery) {
      const matchSearch = String(rNum).toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(invNum).toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchSearch) return false;
    }

    if (activeTab === 'daily') {
      return bookingDay === selectedDateStr;
    } else if (activeTab === 'weekly') {
      return bookingDateOnly >= weekStartDObj && bookingDateOnly <= weekEndDObj;
    } else if (activeTab === 'monthly') {
      return bookingYear === Number(selectedYear) && bookingMonth === Number(selectedMonth);
    } else if (activeTab === 'quarterly') {
      return bookingYear === Number(selectedYear) && bookingQuarter === Number(selectedQuarter);
    } else if (activeTab === 'yearly') {
      return bookingYear === Number(selectedYear);
    } else if (activeTab === 'custom') {
      return bookingDateOnly >= startDOnly && bookingDateOnly <= endDOnly;
    }
    return true;
  }).sort((a, b) => {
    const dateA = getLocalDateOfBooking(a) || new Date(0);
    const dateB = getLocalDateOfBooking(b) || new Date(0);
    return dateB - dateA;
  });

  const consolidatedBookingsList = [];
  const seenGroupBookingIds = new Set();

  filteredBookingsList.forEach((item) => {
    if (item.groupBookingId) {
      if (!seenGroupBookingIds.has(item.groupBookingId)) {
        seenGroupBookingIds.add(item.groupBookingId);

        const groupItems = filteredBookingsList.filter(h => h.groupBookingId === item.groupBookingId);

        const roomNumbers = groupItems
          .map(h => h.previousRoomNumber || h.Room?.roomNumber)
          .map(cleanRoomNumber)
          .filter(Boolean);
        const roomTypes = groupItems
          .map(h => h.Room?.type)
          .filter(Boolean);

        const groupItem = {
          ...item,
          isGroup: true,
          roomNumbers: roomNumbers,
          roomTypes: roomTypes,
          groupBookings: groupItems,
          amountPaid: groupItems.reduce((sum, h) => sum + parseFloat(h.amountPaid || 0), 0),
          totalAmount: groupItems.reduce((sum, h) => sum + parseFloat(h.totalAmount || 0), 0),
          discount: groupItems.reduce((sum, h) => sum + parseFloat(h.discount || 0), 0),
        };
        consolidatedBookingsList.push(groupItem);
      }
    } else {
      consolidatedBookingsList.push({
        ...item,
        isGroup: false,
        roomNumbers: [cleanRoomNumber(item.previousRoomNumber || item.Room?.roomNumber)].filter(Boolean),
        roomTypes: [item.Room?.type].filter(Boolean),
        groupBookings: [item]
      });
    }
  });

  if (sortField === 'date') {
    consolidatedBookingsList.sort((a, b) => {
      const dateA = getLocalDateOfBooking(a) || new Date(0);
      const dateB = getLocalDateOfBooking(b) || new Date(0);
      return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    });
  } else if (sortField === 'registrationNumber') {
    consolidatedBookingsList.sort((a, b) => {
      const regA = a.registrationNumber || getAutoRegNo(a, consolidatedBookingsList);
      const regB = b.registrationNumber || getAutoRegNo(b, consolidatedBookingsList);
      const numA = parseInt(String(regA).replace(/\D/g, ''), 10);
      const numB = parseInt(String(regB).replace(/\D/g, ''), 10);
      let cmp = 0;
      if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
        cmp = numA - numB;
      } else {
        cmp = String(regA).localeCompare(String(regB), undefined, { numeric: true, sensitivity: 'base' });
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  } else if (sortField === 'billingNo') {
    consolidatedBookingsList.sort((a, b) => {
      const getNum = (item) => {
        if (item.invoiceNumber) {
          const match = String(item.invoiceNumber).match(/(\d+)/);
          if (match) return parseInt(match[1], 10);
        }
        if (item.id) {
          const num = parseInt(String(item.id).replace(/\D/g, ''), 10);
          if (!isNaN(num)) return num;
        }
        return 0;
      };
      const numA = getNum(a);
      const numB = getNum(b);
      return sortOrder === 'asc' ? numA - numB : numB - numA;
    });
  }

  const getInvoiceDisplayPrefix = () => {
    const nameUpper = hotelName.toUpperCase();
    if (nameUpper.includes('MALA')) return 'MALA-';
    if (nameUpper.includes('HEERA')) return 'HEERA-';
    if (activeHotel?.invoicePrefix) return activeHotel.invoicePrefix;
    return 'KOL-';
  };

  const getBookingGstDetails = (b) => {
    const fin = calculateBookingFinancials(b);
    const localDate = getLocalDateOfBooking(b);

    const currentPrefix = activeHotel?.invoicePrefix || 'INV-';
    let billingNoPrefix = currentPrefix;
    let billingNoNumber = '';
    if (b.invoiceNumber) {
      const match = String(b.invoiceNumber).match(/^(.*?)(\d+)$/);
      if (match) {
        billingNoPrefix = currentPrefix; // Always use current hotel prefix
        billingNoNumber = match[2];
      } else {
        billingNoPrefix = currentPrefix;
        billingNoNumber = '';
      }
    } else {
      billingNoNumber = '000';
    }

    let catalogRate = Number(b.Room?.pricePerNight || b.pricePerNight || 0);
    if (catalogRate === 0 && b.groupBookings?.length > 0) {
      catalogRate = b.groupBookings.reduce((sum, g) => sum + Number(g.Room?.pricePerNight || g.pricePerNight || 0), 0);
    }

    let stayDays = 1;
    if (b.checkInDate && b.checkOutDate) {
      const d1Str = String(b.checkInDate).split('T')[0];
      const d2Str = String(b.checkOutDate).split('T')[0];
      if (d1Str === d2Str) {
        stayDays = 1;
      } else {
        const d1 = new Date(d1Str);
        const d2 = new Date(d2Str);
        const nDiff = Math.max(1, Math.ceil(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24)));
        if (!isNaN(nDiff)) {
          stayDays = nDiff;
        }
      }
    }
    if (catalogRate > 0 && fin.subTotal > (stayDays * catalogRate) - 0.5) {
      const calcDays = Math.round(fin.subTotal / catalogRate);
      if (calcDays > stayDays) {
        stayDays = calcDays;
      }
    }
    if (catalogRate === 0 && stayDays > 0 && fin.subTotal > 0) {
      catalogRate = Math.round((fin.subTotal / stayDays) * 100) / 100;
    }

    return {
      billingNoPrefix,
      billingNoNumber,
      roomNumber: b.roomNumbers ? b.roomNumbers.join(', ') : (b.Room?.roomNumber || b.previousRoomNumber || 'N/A'),
      roomType: b.roomTypes ? [...new Set(b.roomTypes)].join(', ') : (b.Room?.type || 'Unknown'),
      catalogRate,
      stayDays,
      amount: fin.subTotal,
      roomSubTotal: fin.roomSubTotal,
      extraSubTotal: fin.extraSubTotal,
      gst: fin.gstAmount,
      roomGst: fin.roomGst,
      extraGst: fin.extraGst,
      gstRate: fin.gstRate,
      total: fin.grandTotal,
      date: localDate ? localDate.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }) : 'N/A'
    };
  };

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

  const formatCurrency = (val) => {
    return `₹${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatCurrency3 = (val) => {
    return `₹${Number(val).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
  };

  const downloadTabCSV = () => {
    let csvContent = "\uFEFF";

    let periodStr = '';
    if (activeTab === 'daily') {
      periodStr = `Daily_${selectedDate}`;
    } else if (activeTab === 'weekly') {
      periodStr = `Weekly_${selectedWeekStart}_to_${selectedWeekEnd}`;
    } else if (activeTab === 'monthly') {
      periodStr = `Monthly_${months[selectedMonth]}_${selectedYear}`;
    } else if (activeTab === 'quarterly') {
      periodStr = `Quarterly_Q${selectedQuarter + 1}_${selectedYear}`;
    } else if (activeTab === 'yearly') {
      periodStr = `Yearly_${selectedYear}`;
    } else if (activeTab === 'custom') {
      periodStr = `Custom_${startDate}_to_${endDate}`;
    }

    let filename = '';

    if (viewMode === 'detailed') {
      csvContent += `Date,Billing No.,Guest Name,Room Number,Room Rate,Days Stayed,Base Amount,Room GST,Extra Service GST,CGST,SGST,Total GST,Total Amount\n`;

      let totalRoomBaseSum = 0;
      let totalRoomGstSum = 0;
      let totalExtraBaseSum = 0;
      let totalExtraGstSum = 0;
      let totalDaysSum = 0;
      let totalGrandSum = 0;

      consolidatedBookingsList.forEach(booking => {
        const details = getBookingGstDetails(booking);
        const escapedName = `"${(booking.guestName || '').replace(/"/g, '""')}"`;
        const billNo = `${details.billingNoPrefix}${details.billingNoNumber}`;
        const rawRoomStr = details.roomNumber ? String(details.roomNumber) : 'N/A';
        const formattedRoomStr = rawRoomStr.toLowerCase().includes('room') ? rawRoomStr : `Room ${rawRoomStr}`;
        const escapedRoom = `"${formattedRoomStr.replace(/"/g, '""')}"`;

        const rBase = Number(details.roomSubTotal || (details.amount - (details.extraSubTotal || 0)) || 0);
        const rGst = Number(details.roomGst || (details.gst - (details.extraGst || 0)) || 0);
        const eBase = Number(details.extraSubTotal || 0);
        const eGst = Number(details.extraGst || 0);
        const sDays = Number(details.stayDays || 1);
        const gTotal = Number(details.total || 0);
        const totGst = Number(details.gst || 0);
        const cgst = totGst / 2;
        const sgst = totGst / 2;

        totalRoomBaseSum += rBase;
        totalRoomGstSum += rGst;
        totalExtraBaseSum += eBase;
        totalExtraGstSum += eGst;
        totalDaysSum += sDays;
        totalGrandSum += gTotal;

        csvContent += `${details.date},${billNo},${escapedName},${escapedRoom},${Number(details.catalogRate || 0).toFixed(2)},${sDays},${Number(details.amount || 0).toFixed(2)},${Number(details.roomGst || 0).toFixed(2)},${Number(details.extraGst || 0).toFixed(2)},${cgst.toFixed(2)},${sgst.toFixed(2)},${totGst.toFixed(2)},${gTotal.toFixed(2)}\n`;
      });

      // Appended Summary Table at the bottom (Shifted to span up to the last column M)
      csvContent += `\n`;
      csvContent += `,,,,,,,Description,Base Amount,CGST,SGST,Total GST,Total Amount\n`;

      const roomCgst = totalRoomGstSum / 2;
      const roomSgst = totalRoomGstSum / 2;
      const roomTotal = totalRoomBaseSum + totalRoomGstSum;
      csvContent += `,,,,,,,Rate,${totalRoomBaseSum.toFixed(2)},${roomCgst.toFixed(2)},${roomSgst.toFixed(2)},${totalRoomGstSum.toFixed(2)},${roomTotal.toFixed(2)}\n`;

      const extraCgst = totalExtraGstSum / 2;
      const extraSgst = totalExtraGstSum / 2;
      const extraTotal = totalExtraBaseSum + totalExtraGstSum;

      if (totalExtraBaseSum > 0 || totalExtraGstSum > 0) {
        csvContent += `,,,,,,,Extra Services,${totalExtraBaseSum.toFixed(2)},${extraCgst.toFixed(2)},${extraSgst.toFixed(2)},${totalExtraGstSum.toFixed(2)},${extraTotal.toFixed(2)}\n`;
      } else {
        csvContent += `,,,,,,,Extra Bed,0.00,0.00,0.00,0.00,0.00\n`;
        csvContent += `,,,,,,,Plan,0.00,0.00,0.00,0.00,0.00\n`;
        csvContent += `,,,,,,,Retention,0.00,0.00,0.00,0.00,0.00\n`;
      }

      const overallBase = totalRoomBaseSum + totalExtraBaseSum;
      const overallGst = totalRoomGstSum + totalExtraGstSum;
      const overallCgst = overallGst / 2;
      const overallSgst = overallGst / 2;
      csvContent += `,,,,,,,Total,${overallBase.toFixed(2)},${overallCgst.toFixed(2)},${overallSgst.toFixed(2)},${overallGst.toFixed(2)},${totalGrandSum.toFixed(2)}\n`;
      csvContent += `,,,,,,,Total Days Stayed,${totalDaysSum}\n`;

      filename = `GST_Report_Detailed_${periodStr}.csv`;
    } else {
      csvContent += `Room Number,Room Type,Base Amount,GST Collected,Total Amount\n`;
      roomList.forEach(room => {
        const rawRoomStr = room.roomNumber ? String(room.roomNumber) : 'N/A';
        const formattedRoomStr = rawRoomStr.toLowerCase().includes('room') ? rawRoomStr : `Room ${rawRoomStr}`;
        const escapedRoom = `"${formattedRoomStr.replace(/"/g, '""')}"`;
        const escapedRoomType = `"${(room.roomType || '').replace(/"/g, '""')}"`;
        csvContent += `${escapedRoom},${escapedRoomType},${Number(room.periodBaseAmount || 0).toFixed(2)},${Number(room.periodGstAmount || 0).toFixed(2)},${Number(room.periodTotalAmount || 0).toFixed(2)}\n`;
      });
      filename = `GST_Report_Summary_${periodStr}.csv`;
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadOverallPDF = () => {
    const filters = {
      activeTab,
      year: selectedYear,
      quarter: selectedQuarter,
      monthName: months[selectedMonth],
      dateVal: selectedDate,
      weekStart: selectedWeekStart,
      weekEnd: selectedWeekEnd,
      startDate,
      endDate
    };
    const totals = {
      year: totalSelectedYearGst,
      quarter: totalSelectedQuarterGst,
      month: totalSelectedMonthGst,
      week: totalSelectedWeekGst,
      daily: totalSelectedDateGst
    };
    generateOverallGstPdf(roomList, totals, filters);
  };

  const downloadRoomHistoryPDF = (roomDetails, bookings) => {
    const filters = {
      modalYear,
      modalMonthName: modalMonth === 'all' ? 'All Months' : months[modalMonth],
      startDate,
      endDate
    };
    generateRoomHistoryPdf(roomDetails, bookings, filters);
  };

  const downloadDetailedAllRoomsPDF = () => {
    const filters = {
      activeTab,
      year: selectedYear,
      quarter: selectedQuarter,
      monthName: months[selectedMonth],
      dateVal: selectedDate,
      weekStart: selectedWeekStart,
      weekEnd: selectedWeekEnd,
      startDate,
      endDate
    };
    const totals = {
      year: totalSelectedYearGst,
      quarter: totalSelectedQuarterGst,
      month: totalSelectedMonthGst,
      week: totalSelectedWeekGst,
      daily: totalSelectedDateGst
    };
    generateDetailedAllRoomsGstPdf(roomList, allBookings, totals, filters);
  };

  const yearEndingOptions = (() => {
    if (!activeHotel?.yearEndingDate) return [];
    const currentYear = new Date().getFullYear();
    const options = [];
    for (let y = currentYear + 1; y >= currentYear - 2; y--) {
      const [mStr, dStr] = activeHotel.yearEndingDate.split('-');
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const mIdx = parseInt(mStr, 10) - 1;
      const day = parseInt(dStr, 10);
      let suffix = 'th';
      if (day === 1 || day === 21 || day === 31) suffix = 'st';
      else if (day === 2 || day === 22) suffix = 'nd';
      else if (day === 3 || day === 23) suffix = 'rd';

      options.push({
        value: String(y),
        label: `Ending ${day}${suffix} ${months[mIdx] || ''} ${y}`
      });
    }
    return options;
  })();

  return (
    <div className="space-y-4 pb-6 animate-fade-in">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 sm:p-4 rounded-xl border border-[#DDE5D0] shadow-sm">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-[#F0F3E8] to-white rounded-xl flex items-center justify-center text-[#84A63C] shadow-inner">
            <BarChart3 size={20} className="sm:w-6 sm:h-6" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-lg sm:text-xl font-black text-[#1A2E05] tracking-tight">GST Reports</h1>
              {activeHotel?.resetInvoiceYearly && (
                <span className="bg-[#84A63C]/10 text-[#84A63C] text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-[#84A63C]/20 shadow-sm flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#84A63C]"></span>
                  Year Ending Reset: {(() => {
                    if (!activeHotel.yearEndingDate) return '';
                    const [mStr, dStr] = activeHotel.yearEndingDate.split('-');
                    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                    const mIdx = parseInt(mStr, 10) - 1;
                    const day = parseInt(dStr, 10);
                    let suffix = 'th';
                    if (day === 1 || day === 21 || day === 31) suffix = 'st';
                    else if (day === 2 || day === 22) suffix = 'nd';
                    else if (day === 3 || day === 23) suffix = 'rd';
                    return `${day}${suffix} ${months[mIdx] || ''}`;
                  })()}
                </span>
              )}
            </div>
            <p className="text-[9px] sm:text-xs font-bold text-[#4A5E38] mt-0.5">Room-wise daily, monthly & overall tax breakdown</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {activeHotel?.resetInvoiceYearly && (
            <div className="flex items-center gap-1.5 mr-2">
              <span className="text-[10px] font-black text-[#4A5E38] whitespace-nowrap uppercase tracking-wider">Cycle:</span>
              <select
                value={selectedYearEnding}
                onChange={(e) => setSelectedYearEnding(e.target.value)}
                className="bg-[#F0F3E8] border border-[#DDE5D0] focus:border-[#84A63C] focus:outline-none rounded-xl px-3 py-2 text-xs font-bold cursor-pointer text-[#1A2E05]"
              >
                <option value="all">All Cycles</option>
                {yearEndingOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}
          <button
            onClick={downloadTabCSV}
            className="px-3 py-1.5 bg-[#84A63C] hover:bg-[#1C2B12] text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 active:scale-95 shrink-0"
          >
            Download CSV
          </button>
          <div className="relative" ref={downloadDropdownRef}>
            <button
              onClick={() => setShowDownloadDropdown(!showDownloadDropdown)}
              className="px-3 py-1.5 bg-[#4A5E38] hover:bg-[#1C2B12] text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 active:scale-95 shrink-0"
            >
              Download PDF <ChevronDown size={12} className="shrink-0" />
            </button>
            {showDownloadDropdown && (
              <div className="absolute right-0 mt-2 w-56 bg-white border border-[#DDE5D0] rounded-xl shadow-lg z-[60] py-1 animate-fade-in">
                <button
                  onClick={() => {
                    downloadOverallPDF();
                    setShowDownloadDropdown(false);
                  }}
                  className="w-full text-left px-4 py-2.5 text-xs font-bold text-[#1A2E05] hover:bg-[#F0F3E8] hover:text-[#84A63C] transition-colors cursor-pointer"
                >
                  Summary Report (PDF)
                </button>
                <button
                  onClick={() => {
                    downloadDetailedAllRoomsPDF();
                    setShowDownloadDropdown(false);
                  }}
                  className="w-full text-left px-4 py-2.5 text-xs font-bold text-[#1A2E05] hover:bg-[#F0F3E8] hover:text-[#84A63C] transition-colors cursor-pointer"
                >
                  Detailed Ledger Report (PDF)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Data truncation warning */}
      {dataTruncated && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2.5 rounded-xl text-xs font-bold">
          <AlertTriangle size={14} className="shrink-0" />
          Showing the first {BILLING_FETCH_LIMIT.toLocaleString()} bookings only — totals below may be incomplete. Ask backend to raise the /analytics/billing limit or add pagination.
        </div>
      )}

      {/* KPI Cards Grid */}
      {(() => {
        let periodTotalGst = 0;
        let periodRoomGst = 0;
        let periodExtraGst = 0;

        let periodCollectedGst = 0;
        let periodCollectedRoomGst = 0;
        let periodCollectedExtraGst = 0;

        let periodPendingGst = 0;
        let periodPendingRoomGst = 0;
        let periodPendingExtraGst = 0;

        consolidatedBookingsList.forEach(b => {
          const fin = calculateBookingFinancials(b);
          const gst = fin.gstAmount || 0;
          const roomGstVal = fin.roomGst || 0;
          const extraGstVal = fin.extraGst || 0;

          periodTotalGst += gst;
          periodRoomGst += roomGstVal;
          periodExtraGst += extraGstVal;

          if (b.status === 'Completed') {
            periodCollectedGst += gst;
            periodCollectedRoomGst += roomGstVal;
            periodCollectedExtraGst += extraGstVal;
          } else {
            periodPendingGst += gst;
            periodPendingRoomGst += roomGstVal;
            periodPendingExtraGst += extraGstVal;
          }
        });

        const getPeriodSubtext = () => {
          if (activeTab === 'daily') {
            return selectedDateObj ? selectedDateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
          } else if (activeTab === 'weekly') {
            return `${weekStartDObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} - ${weekEndDObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`;
          } else if (activeTab === 'monthly') {
            return `${months[selectedMonth]} ${selectedYear}`;
          } else if (activeTab === 'quarterly') {
            return `Q${selectedQuarter + 1} ${selectedYear}`;
          } else if (activeTab === 'yearly') {
            return `Year ${selectedYear}`;
          } else if (activeTab === 'custom') {
            return `${startDOnly.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} - ${endDOnly.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`;
          }
          return 'Selected Period';
        };

        return (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 w-full">
            <StatCard
              label="Total GST"
              value={formatCurrency3(periodTotalGst)}
              roomGst={formatCurrency3(periodRoomGst)}
              extraGst={formatCurrency3(periodExtraGst)}
              icon={DollarSign}
              color="text-indigo-600"
            />
            <StatCard
              label="Room Stay GST"
              value={formatCurrency3(periodRoomGst)}
              subtext="Room Stay Taxes"
              icon={TrendingUp}
              color="text-blue-600"
            />
            <StatCard
              label="Collected GST"
              value={formatCurrency3(periodCollectedGst)}
              roomGst={formatCurrency3(periodCollectedRoomGst)}
              extraGst={formatCurrency3(periodCollectedExtraGst)}
              icon={CheckCircle}
              color="text-emerald-600"
            />
            <StatCard
              label="Pending GST"
              value={formatCurrency3(periodPendingGst)}
              roomGst={formatCurrency3(periodPendingRoomGst)}
              extraGst={formatCurrency3(periodPendingExtraGst)}
              icon={Clock}
              color="text-rose-600"
            />
          </div>
        );
      })()}

      {/* Premium Tab & View Mode Selectors */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="flex bg-[#F0F3E8] p-1 rounded-xl border border-[#DDE5D0] overflow-x-auto no-scrollbar max-w-2xl flex-1">
          {[
            { id: 'daily', label: 'Daily' },
            { id: 'weekly', label: 'Weekly' },
            { id: 'monthly', label: 'Monthly' },
            { id: 'quarterly', label: 'Quarterly' },
            { id: 'yearly', label: 'Yearly' },
            { id: 'custom', label: 'Custom Range' }
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex-1 text-center py-1.5 px-3 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${activeTab === t.id
                ? 'bg-white text-[#1C2B12] shadow-xs'
                : 'text-[#4A5E38] hover:text-[#1C2B12]'
                }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex bg-[#F0F3E8] p-1 rounded-xl border border-[#DDE5D0] shrink-0">
          <button
            onClick={() => setViewMode('detailed')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'detailed'
              ? 'bg-white text-[#1C2B12] shadow-xs'
              : 'text-[#4A5E38] hover:text-[#1C2B12]'
              }`}
          >
            Invoice-wise
          </button>
          <button
            onClick={() => setViewMode('summary')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'summary'
              ? 'bg-white text-[#1C2B12] shadow-xs'
              : 'text-[#4A5E38] hover:text-[#1C2B12]'
              }`}
          >
            Room-wise
          </button>
        </div>
      </div>

      {/* Filters Card */}
      <div className="bg-white p-3 rounded-xl border border-[#DDE5D0] shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-2.5 items-center">
          {/* Search Input */}
          <div className="relative col-span-1 sm:col-span-2 md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A8A6A]" size={13} />
            <input
              type="text"
              placeholder="Search by Room or Billing No..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-[#F5F7F0] border border-[#DDE5D0] rounded-lg text-xs focus:outline-none focus:border-[#84A63C] transition-all font-semibold text-[#1A2E05]"
            />
          </div>

          {/* Conditional Filters based on Active Tab */}
          {activeTab === 'daily' && (
            <div className="col-span-1 sm:col-span-2 md:col-span-4 flex items-center gap-3">
              <span className="text-xs font-bold text-[#4A5E38] shrink-0">Select Date:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className="px-3 py-2.5 bg-[#F9FAFA] border border-[#DDE5D0] rounded-xl text-xs focus:outline-none focus:border-[#84A63C] transition-all font-bold text-[#1A2E05] w-full max-w-[200px]"
              />
            </div>
          )}

          {activeTab === 'weekly' && (
            <div className="col-span-1 sm:col-span-2 md:col-span-4 flex items-center gap-3 flex-wrap">
              <span className="text-xs font-bold text-[#4A5E38] shrink-0">Week Starting:</span>
              <input
                type="date"
                value={selectedWeekStart}
                onChange={(e) => setSelectedWeekStart(e.target.value)}
                className="px-3 py-2.5 bg-[#F9FAFA] border border-[#DDE5D0] rounded-xl text-xs focus:outline-none focus:border-[#84A63C] transition-all font-bold text-[#1A2E05] w-full max-w-[200px]"
              />
              <span className="text-xs font-bold text-[#7A8A6A]">
                to {parseLocalDate(selectedWeekStart) ? selectedWeekEnd : ''}
              </span>
            </div>
          )}

          {activeTab === 'monthly' && (
            <>
              <div>
                <select
                  value={selectedMonth}
                  onChange={(e) => handleMonthChange(Number(e.target.value))}
                  className="w-full px-2 py-2.5 bg-[#F9FAFA] border border-[#DDE5D0] rounded-xl text-xs focus:outline-none focus:border-[#84A63C] transition-all font-bold text-[#1A2E05]"
                >
                  {months.map((m, i) => (
                    <option key={i} value={i}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <select
                  value={selectedYear}
                  onChange={(e) => handleYearChange(Number(e.target.value))}
                  className="w-full px-2 py-2.5 bg-[#F9FAFA] border border-[#DDE5D0] rounded-xl text-xs focus:outline-none focus:border-[#84A63C] transition-all font-bold text-[#1A2E05]"
                >
                  {years.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {activeTab === 'quarterly' && (
            <>
              <div>
                <select
                  value={selectedQuarter}
                  onChange={(e) => handleQuarterChange(Number(e.target.value))}
                  className="w-full px-2 py-2.5 bg-[#F9FAFA] border border-[#DDE5D0] rounded-xl text-xs focus:outline-none focus:border-[#84A63C] transition-all font-bold text-[#1A2E05]"
                >
                  <option value={0}>Q1 (Jan - Mar)</option>
                  <option value={1}>Q2 (Apr - Jun)</option>
                  <option value={2}>Q3 (Jul - Sep)</option>
                  <option value={3}>Q4 (Oct - Dec)</option>
                </select>
              </div>
              <div>
                <select
                  value={selectedYear}
                  onChange={(e) => handleYearChange(Number(e.target.value))}
                  className="w-full px-2 py-2.5 bg-[#F9FAFA] border border-[#DDE5D0] rounded-xl text-xs focus:outline-none focus:border-[#84A63C] transition-all font-bold text-[#1A2E05]"
                >
                  {years.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {activeTab === 'yearly' && (
            <div>
              <select
                value={selectedYear}
                onChange={(e) => handleYearChange(Number(e.target.value))}
                className="w-full px-2 py-2.5 bg-[#F9FAFA] border border-[#DDE5D0] rounded-xl text-xs focus:outline-none focus:border-[#84A63C] transition-all font-bold text-[#1A2E05]"
              >
                {years.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          )}

          {activeTab === 'custom' && (
            <div className="col-span-1 sm:col-span-2 md:col-span-4 flex items-center gap-2 flex-wrap">
              <select
                value={rangePreset}
                onChange={(e) => handlePresetChange(e.target.value)}
                className="px-2 py-2.5 bg-[#F9FAFA] border border-[#DDE5D0] rounded-xl text-xs focus:outline-none focus:border-[#84A63C] transition-all font-bold text-[#1A2E05] max-w-[150px] w-full"
              >
                <option value="15days">Last 15 Days</option>
                <option value="30days">Last 30 Days (1 Month)</option>
                <option value="90days">Last 90 Days (3 Months)</option>
                <option value="thisMonth">This Month</option>
                <option value="lastMonth">Last Month</option>
                <option value="custom">Custom Range</option>
              </select>

              <input
                type="date"
                value={startDate}
                max={endDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
                className="px-2 py-2.5 bg-[#F9FAFA] border border-[#DDE5D0] rounded-xl text-xs focus:outline-none focus:border-[#84A63C] transition-all font-bold text-[#1A2E05]"
              />
              <span className="text-xs font-bold text-[#4A5E38]">to</span>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => handleEndDateChange(e.target.value)}
                className="px-2 py-2.5 bg-[#F9FAFA] border border-[#DDE5D0] rounded-xl text-xs focus:outline-none focus:border-[#84A63C] transition-all font-bold text-[#1A2E05]"
              />
            </div>
          )}
        </div>
      </div>

      {/* Room Table Card */}
      <div className="bg-white rounded-xl border border-[#DDE5D0] shadow-2xs overflow-hidden">
        {loading ? (
          <div className="py-12 text-center"><Loader2 size={28} className="animate-spin text-[#84A63C] mx-auto" /></div>
        ) : viewMode === 'detailed' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[700px] text-xs">
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
                    className="px-4 py-2.5 text-[11px] font-black text-[#1A2E05] uppercase tracking-wider cursor-pointer select-none hover:text-[#84A63C] transition-colors group/sort"
                    title={`Click to sort by Billing Number (${sortOrder === 'asc' ? 'Ascending' : 'Descending'})`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Billing No.</span>
                      {sortField === 'billingNo' ? (
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
                      title={`Click to sort by Registration Number (${sortOrder === 'asc' ? 'Ascending' : 'Descending'})`}
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
                  <th className="px-4 py-2.5 text-[11px] font-black text-[#1A2E05] uppercase tracking-wider">Guest Name</th>
                  <th className="px-4 py-2.5 text-[11px] font-black text-[#1A2E05] uppercase tracking-wider whitespace-nowrap">Room Number</th>
                  <th className="px-4 py-2.5 text-[11px] font-black text-[#1A2E05] uppercase tracking-wider">Days Stayed</th>
                  <th className="px-4 py-2.5 text-[11px] font-black text-[#1A2E05] uppercase tracking-wider">Base Amount</th>
                  <th className="px-4 py-2.5 text-[11px] font-black text-[#84A63C] uppercase tracking-wider">GST Amount</th>
                  <th className="px-4 py-2.5 text-[11px] font-black text-[#1A2E05] uppercase tracking-wider">Total Amount</th>
                  <th
                    onClick={() => {
                      if (sortField === 'date') {
                        setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortField('date');
                        setSortOrder('asc');
                      }
                    }}
                    className="px-4 py-2.5 text-[11px] font-black text-[#1A2E05] uppercase tracking-wider cursor-pointer select-none hover:text-[#84A63C] transition-colors group/sort"
                    title={`Click to sort by Date (${sortOrder === 'asc' ? 'Ascending' : 'Descending'})`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Date</span>
                      {sortField === 'date' ? (
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
                  <th className="px-4 py-2.5 text-[11px] font-black text-[#1A2E05] uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F3E8]">
                {consolidatedBookingsList.length > 0 ? (
                  consolidatedBookingsList.map((booking, idx) => {
                    const details = getBookingGstDetails(booking);
                    return (
                      <tr key={idx} className="hover:bg-[#F5F7F0]/50 transition-colors group">
                        <td className="px-4 py-2">
                          <div className="flex flex-col items-start gap-0.5">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#F5F7F0] border border-[#DDE5D0] shadow-2xs">
                              <span className="text-[#7A8A6A] font-semibold">{details.billingNoPrefix}</span>
                              <span className="text-[#1A2E05] ml-0.5 font-bold">{details.billingNoNumber}</span>
                            </span>
                            {booking.status !== 'Completed' && (
                              <span className="px-1.5 py-0.5 text-[8.5px] font-black uppercase tracking-wider text-rose-700 bg-rose-100 border border-rose-200 rounded shadow-2xs animate-pulse">
                                Pending
                              </span>
                            )}
                          </div>
                        </td>
                        {activeHotel?.enableRegistrationNumber === true && (
                          <td className="px-4 py-2 whitespace-nowrap">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#EEF4E3] border border-[#D3E2BD] font-mono text-[#1A2E05] whitespace-nowrap">
                              {booking.registrationNumber || getAutoRegNo(booking, consolidatedBookingsList)}
                            </span>
                          </td>
                        )}
                        <td className="px-4 py-2">
                          <span className="font-bold text-xs text-[#1A2E05]">{booking.guestName || 'N/A'}</span>
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          <span className="font-bold text-xs text-[#1A2E05]">Room {details.roomNumber}</span>
                        </td>
                        <td className="px-4 py-2">
                          <span className="text-xs font-bold text-[#1A2E05]">{details.stayDays} {details.stayDays === 1 ? 'Day' : 'Days'}</span>
                        </td>
                        <td className="px-4 py-2">
                          <span className="text-xs font-bold text-[#1A2E05]">{formatCurrency(details.amount)}</span>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-black text-[#84A63C]">
                              {formatCurrency3(details.gst)} <span className="text-[10px] font-bold text-[#7A8A6A]">({details.gstRate}%)</span>
                            </span>
                            {details.extraGst > 0 && (
                              <div className="text-[9.5px] font-semibold text-[#7A8A6A] flex items-center gap-1">
                                <span>Room: {formatCurrency3(details.roomGst)}</span>
                                <span>•</span>
                                <span className="text-amber-700 font-bold">
                                  Extra: {formatCurrency3(details.extraGst)}
                                </span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <span className="text-xs font-bold text-[#1A2E05]">{formatCurrency(details.total)}</span>
                        </td>
                        <td className="px-4 py-2">
                          <span className="text-xs font-semibold text-[#4A5E38]">{details.date}</span>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex gap-1.5 justify-end">
                            <button
                              onClick={() => handlePreviewInvoice(booking)}
                              className="p-1.5 text-[#7A8A6A] bg-white border border-[#DDE5D0] rounded-lg hover:bg-[#F0F3E8] hover:text-[#1C2B12] transition-all shadow-2xs active:scale-95"
                              title="Preview Invoice"
                            >
                              <Eye size={13} />
                            </button>
                            <button
                              onClick={() => handleDownloadInvoice(booking)}
                              className="p-1.5 text-[#7A8A6A] bg-[#84A63C]/10 border border-[#84A63C]/30 text-[#5C7A1F] rounded-lg hover:bg-[#84A63C] hover:text-white transition-all shadow-2xs active:scale-95"
                              title="Download Invoice"
                            >
                              <Download size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={hasRoomType ? (activeHotel?.enableRegistrationNumber === true ? 12 : 11) : (activeHotel?.enableRegistrationNumber === true ? 11 : 10)} className="py-12 text-center text-[#4A5E38] font-bold uppercase tracking-widest text-[10px]">
                      No billing transactions found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[700px]">
              <thead>
                <tr className="bg-[#F5F7F0] border-b border-[#DDE5D0]">
                  <th className="px-4 py-2.5 text-[11px] font-black text-[#1A2E05] uppercase tracking-wider whitespace-nowrap">Room Number</th>
                  <th className="px-4 py-2.5 text-[11px] font-black text-[#1A2E05] uppercase tracking-wider">Base Amount</th>
                  <th className="px-4 py-2.5 text-[11px] font-black text-[#84A63C] uppercase tracking-wider">GST Collected</th>
                  <th className="px-4 py-2.5 text-[11px] font-black text-[#1A2E05] uppercase tracking-wider">Total Amount</th>
                  <th className="px-4 py-2.5 text-[11px] font-black text-[#1A2E05] uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F3E8]">
                {roomList.length > 0 ? (
                  roomList.map((room, idx) => (
                    <tr key={idx} className="hover:bg-[#F5F7F0]/50 transition-colors group">
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span className="font-bold text-xs text-[#1A2E05]">Room {room.roomNumber}</span>
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-xs font-bold text-[#1A2E05]">{formatCurrency(room.periodBaseAmount)}</span>
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-xs font-bold text-[#1A2E05]">
                          {formatCurrency3(room.periodGstAmount)}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-xs font-bold text-[#1A2E05]">{formatCurrency(room.periodTotalAmount)}</span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => handleOpenModal(room)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#F0F3E8] hover:bg-[#84A63C] hover:text-white text-[#4A5E38] rounded-lg text-xs font-bold transition-all active:scale-95 cursor-pointer"
                        >
                          <Eye size={12} /> View Details
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={hasRoomType ? 6 : 5} className="py-12 text-center text-[#4A5E38] font-bold uppercase tracking-widest text-[10px]">
                      No room summary data found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detailed History Popup Modal */}
      {selectedRoomDetails && (() => {
        const roomBookings = allBookings
          .filter(b => {
            const rNum = b.Room?.roomNumber || b.previousRoomNumber;
            return String(rNum) === String(selectedRoomDetails.roomNumber);
          })
          .map(b => {
            const baseAmount = Number(b.totalAmount || 0);
            const discount = Number(b.discount || 0);
            const amountBeforeGst = baseAmount - discount;
            const gstRate = Number(b.gstRate !== undefined && b.gstRate !== null ? b.gstRate : 12);
            const gstAmount = amountBeforeGst * (gstRate / 100);
            const totalAmount = amountBeforeGst + gstAmount;
            const localDate = getLocalDateOfBooking(b);

            let billingNoPrefix = '';
            let billingNoNumber = '';
            const currentPrefix2 = activeHotel?.invoicePrefix || 'INV-';
            billingNoPrefix = currentPrefix2;
            if (b.invoiceNumber) {
              const match = String(b.invoiceNumber).match(/^(.*?)(\d+)$/);
              if (match) {
                billingNoPrefix = currentPrefix2; // Always use current hotel prefix
                billingNoNumber = match[2];
              } else {
                billingNoPrefix = currentPrefix2;
                billingNoNumber = '';
              }
            } else {
              billingNoNumber = '000';
            }

            return {
              id: b.id,
              guestName: b.guestName,
              invoiceNumber: b.invoiceNumber || 'Auto-generated',
              billingNoPrefix,
              billingNoNumber,
              roomNumber: b.Room?.roomNumber || b.previousRoomNumber || 'N/A',
              roomType: b.Room?.type || 'Unknown',
              amount: amountBeforeGst,
              gstRate,
              gstAmount,
              total: totalAmount,
              dateStr: localDate ? localDate.toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
              }) : 'N/A',
              dateObj: localDate || new Date(0)
            };
          })
          .sort((a, b) => b.dateObj - a.dateObj);

        // Filter based on modal month/year selection
        const filteredModalBookings = roomBookings.filter(b => {
          const bookingYear = b.dateObj.getFullYear();
          const bookingMonth = b.dateObj.getMonth();

          const yearMatch = modalYear === 'all' || bookingYear === Number(modalYear);
          const monthMatch = modalMonth === 'all' || bookingMonth === Number(modalMonth);

          return yearMatch && monthMatch;
        });

        return (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white w-full max-w-5xl rounded-[2rem] shadow-2xl overflow-hidden flex flex-col h-[85vh] max-h-[90vh] animate-slide-up">
              {/* Modal Header */}
              <div className="p-5 border-b border-[#DDE5D0] flex justify-between items-center bg-[#F9FAFA] shrink-0">
                <div>
                  <h3 className="font-black text-lg sm:text-xl text-[#1A2E05] uppercase tracking-wider">
                    Room {selectedRoomDetails.roomNumber} GST Details
                  </h3>
                  {hasRoomType && (
                    <p className="text-xs text-[#4A5E38] font-bold mt-0.5">{selectedRoomDetails.roomType}</p>
                  )}
                </div>
                <button
                  onClick={() => setSelectedRoomDetails(null)}
                  className="p-2 bg-[#F0F3E8] hover:bg-[#DDE5D0] rounded-xl text-[#4A5E38] transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto no-scrollbar space-y-5 flex-1 flex flex-col min-h-0">
                <div className="grid grid-cols-3 gap-4 pb-4 border-b border-[#F0F3E8] shrink-0">
                  <div>
                    <p className="text-xs font-black text-[#4A5E38] uppercase tracking-wider">Lifetime GST</p>
                    <p className="text-sm sm:text-lg font-black text-[#1A2E05]">{formatCurrency(selectedRoomDetails.lifetime)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-black text-[#4A5E38] uppercase tracking-wider">Selected Month</p>
                    <p className="text-sm sm:text-lg font-black text-green-600">{formatCurrency(selectedRoomDetails.selectedMonth)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-black text-[#4A5E38] uppercase tracking-wider">Daily GST</p>
                    <p className="text-sm sm:text-lg font-black text-orange-600">{formatCurrency(selectedRoomDetails.selectedDateGst)}</p>
                  </div>
                </div>

                <div className="flex-1 flex flex-col min-h-0">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 shrink-0">
                    <h4 className="text-xs sm:text-sm font-black text-[#4A5E38] uppercase tracking-widest">Date-wise GST Ledger</h4>

                    {/* Modal Controls: Month/Year Pickers and Download PDF */}
                    <div className="flex gap-2 items-center flex-wrap sm:flex-nowrap">
                      <button
                        onClick={() => downloadRoomHistoryPDF(selectedRoomDetails, filteredModalBookings)}
                        className="px-3 py-1.5 bg-[#84A63C] hover:bg-[#1C2B12] text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1 active:scale-95 shrink-0"
                      >
                        Download PDF
                      </button>

                      <select
                        value={modalYear}
                        onChange={(e) => setModalYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                        className="px-3 py-1.5 bg-[#F9FAFA] border border-[#DDE5D0] rounded-xl text-xs font-bold text-[#1A2E05] focus:outline-none"
                      >
                        <option value="all">All Years</option>
                        {years.map(y => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>

                      <select
                        value={modalMonth}
                        onChange={(e) => setModalMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                        className="px-3 py-1.5 bg-[#F9FAFA] border border-[#DDE5D0] rounded-xl text-xs font-bold text-[#1A2E05] focus:outline-none"
                      >
                        <option value="all">All Months</option>
                        {months.map((m, i) => (
                          <option key={i} value={i}>{m}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="overflow-x-auto overflow-y-auto max-h-[450px] border border-[#DDE5D0] rounded-2xl flex-1 min-h-0">
                    <table className="w-full text-left min-w-[750px]">
                      <thead>
                        <tr className="bg-[#F9FAFA] border-b border-[#DDE5D0] sticky top-0 z-10">
                          <th className="px-4 py-3.5 text-xs font-black text-[#4A5E38] uppercase tracking-wider">Date</th>
                          {activeHotel?.enableRegistrationNumber === true && (
                            <th className="px-4 py-3.5 text-xs font-black text-[#4A5E38] uppercase tracking-wider">Reg. No.</th>
                          )}
                          <th className="px-4 py-3.5 text-xs font-black text-[#4A5E38] uppercase tracking-wider">Billing No.</th>
                          <th className="px-4 py-3.5 text-xs font-black text-[#4A5E38] uppercase tracking-wider">Guest Name</th>
                          <th className="px-4 py-3.5 text-xs font-black text-[#4A5E38] uppercase tracking-wider">Room Number</th>
                          <th className="px-4 py-3.5 text-xs font-black text-[#4A5E38] uppercase tracking-wider">Amount</th>
                          <th className="px-4 py-3.5 text-xs font-black text-[#4A5E38] uppercase tracking-wider">GST</th>
                          <th className="px-4 py-3.5 text-xs font-black text-[#4A5E38] uppercase tracking-wider">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F0F3E8]">
                        {filteredModalBookings.length > 0 ? (
                          filteredModalBookings.map((b, i) => (
                            <tr key={i} className="hover:bg-[#F5F7F0]/50 transition-colors">
                              <td className="px-4 py-3 text-xs font-bold text-[#1A2E05]">{b.dateStr}</td>
                              {activeHotel?.enableRegistrationNumber === true && (
                                <td className="px-4 py-3 text-xs">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-[#EEF4E3] border border-[#D3E2BD] text-[#1A2E05]">
                                    {b.registrationNumber || getAutoRegNo(b, allBookings)}
                                  </span>
                                </td>
                              )}
                              <td className="px-4 py-3 text-xs">
                                <div className="flex flex-col items-start gap-0.5">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-[#F5F7F0] border border-[#DDE5D0]">
                                    <span className="text-[#7A8A6A] font-semibold">{b.billingNoPrefix}</span>
                                    <span className="text-[#1A2E05] ml-0.5 font-bold">{b.billingNoNumber}</span>
                                  </span>
                                  {b.status !== 'Completed' && (
                                    <span className="px-1.5 py-0.2 text-[8px] font-black uppercase tracking-wider text-rose-700 bg-rose-100 border border-rose-200 rounded">
                                      Pending
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-xs font-semibold text-[#4A5E38]">{b.guestName}</td>
                              <td className="px-4 py-3 text-xs font-bold text-[#1A2E05]">Room {b.roomNumber}</td>
                              <td className="px-4 py-3 text-xs font-bold text-[#1A2E05]">{formatCurrency(b.amount)}</td>
                              <td className="px-4 py-3 text-xs font-bold text-[#1A2E05]">
                                {formatCurrency3(b.gstAmount)} <span className="text-[10px] font-semibold text-[#7A8A6A]">({b.gstRate}%)</span>
                              </td>
                              <td className="px-4 py-3 text-xs font-bold text-[#1A2E05]">{formatCurrency(b.total)}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={hasRoomType ? 8 : 7} className="py-12 text-center text-xs text-[#4A5E38] font-bold uppercase tracking-wider">
                              No transactional data available for the selected month.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default GstReport;