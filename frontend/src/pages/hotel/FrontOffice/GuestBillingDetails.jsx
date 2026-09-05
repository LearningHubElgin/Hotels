import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft, User, Phone, Mail, MapPin, Calendar, Clock, DollarSign,
  FileText, Download, Eye, Edit, Wallet, CheckCircle, AlertTriangle,
  RotateCcw, Shield, Layers, Home, ChevronRight, Loader2, Image as ImageIcon,
  Building, UserCheck, CreditCard, Hash, Receipt, ExternalLink, Printer
} from 'lucide-react';
import api, { getUploadUrl } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { cleanRoomNumber } from '../../../utils/roomHelper';
import { generateTaxInvoice } from '../../../utils/taxInvoiceGenerator';
import { logoBase64 } from '../../../assets/logoBase64';
import QuickPayModal from '../../../components/QuickPayModal';
import RefundModal from '../../../components/RefundModal';
import { decodeUrlId } from '../../../utils/urlSecurity';

// Helper formatters
const formatDateDMY = (dateStr) => {
  if (!dateStr) return 'N/A';
  const plain = String(dateStr).split('T')[0];
  const parts = plain.split('-');
  if (parts.length === 3) {
    if (parts[0].length === 4) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return `${parts[0]}-${parts[1]}-${parts[2]}`;
  }
  return dateStr;
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

const convert12hrTo24hr = (time12) => {
  if (!time12) return '12:00';
  const str = String(time12).trim();
  const match = str.match(/(\d+):(\d+)(?::\d+)?\s*(AM|PM)?/i);
  if (!match) {
    if (str.includes(':')) return str.substring(0, 5);
    return '12:00';
  }
  let hours = parseInt(match[1], 10);
  const minutes = match[2].padStart(2, '0');
  const ampm = match[3] ? match[3].toUpperCase() : null;
  if (ampm === "PM" && hours < 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;
  return `${hours.toString().padStart(2, '0')}:${minutes}`;
};

const calculateBookingStayDays = (b, inDate, outDate, inTime, outTime) => {
  let days = 1;
  const startStr = inDate ? String(inDate).split('T')[0] : (b?.checkInDate ? String(b.checkInDate).split('T')[0] : '');
  const endStr = outDate ? String(outDate).split('T')[0] : (b?.checkOutDate ? String(b.checkOutDate).split('T')[0] : '');

  let calDays = 1;
  if (startStr && endStr) {
    const d1 = new Date(startStr);
    const d2 = new Date(endStr);
    const diff = Math.ceil(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24));
    if (!isNaN(diff) && diff >= 0) calDays = diff;
  } else if (b?.stayDays && Number(b.stayDays) > 0) {
    calDays = Number(b.stayDays);
  }

  days = Math.max(1, calDays);

  const chkOutTime = outTime || b?.checkOutTime;
  if (startStr && endStr && chkOutTime) {
    try {
      const tOut = convert12hrTo24hr(chkOutTime);
      if (tOut > "12:00") {
        if (startStr < endStr) {
          days = calDays + 1;
        } else {
          days = 1;
        }
      } else {
        days = Math.max(1, calDays);
      }
    } catch (e) {}
  }

  return days || 1;
};

const formatMoney = (val) => {
  const num = Number(val || 0);
  return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatMoney3 = (val) => {
  const num = Number(val || 0);
  return num.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
};

const GuestBillingDetails = () => {
  const { id } = useParams();
  const realBookingId = useMemo(() => decodeUrlId(id), [id]);
  const navigate = useNavigate();
  const location = useLocation();
  const { activeHotel } = useAuth();

  const [booking, setBooking] = useState(location.state?.bill || null);
  const [loading, setLoading] = useState(!location.state?.bill);
  const [error, setError] = useState(null);

  // Modals & previews
  const [isPayOpen, setIsPayOpen] = useState(false);
  const [isRefundOpen, setIsRefundOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);

  const fetchBooking = async () => {
    if (!realBookingId) return;
    try {
      if (!booking) setLoading(true);
      const res = await api.get(`/bookings/${realBookingId}`);
      if (res.data?.data) {
        setBooking(res.data.data);
        setError(null);
      }
    } catch (err) {
      console.error('Error fetching booking details:', err);
      if (!booking) {
        setError(err.response?.data?.message || 'Failed to load guest details.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (realBookingId) {
      fetchBooking();
    }
  }, [realBookingId]);

  // Helper to get itemized room stay segments (including room shifts)
  const roomSegments = useMemo(() => {
    if (!booking) return [];
    const groupItems = booking.groupBookings && booking.groupBookings.length > 0 ? booking.groupBookings : [booking];
    const gstOption = booking.gstOption || 'none';
    const fallbackGstRate = Number(booking.gstRate !== undefined && booking.gstRate !== null ? booking.gstRate : 5);

    const getBaseRate = (rateVal, totalAmt, stayNights, gbGstRate) => {
      let rate = Number(rateVal || 0);
      if (!rate && totalAmt && stayNights > 0) {
        rate = Number(totalAmt) / stayNights;
      }
      const rateGst = Number(gbGstRate !== undefined && gbGstRate !== null ? gbGstRate : fallbackGstRate);
      if (gstOption === 'inclusive' && rateGst > 0 && rate > 0) {
        rate = Math.round((rate / (1 + rateGst / 100)) * 100) / 100;
      }
      return rate;
    };

    const calculateFinancialsForSegment = (nights, baseRate, gbGstRate, knownTotal) => {
      const rateGst = Number(gbGstRate !== undefined && gbGstRate !== null ? gbGstRate : fallbackGstRate);
      const effectiveRate = gstOption === 'none' ? 0 : rateGst;

      let segBase = 0;
      let segGst = 0;
      let segTotal = 0;

      if (knownTotal !== undefined && knownTotal !== null && !isNaN(Number(knownTotal)) && Number(knownTotal) > 0) {
        segTotal = Math.round(Number(knownTotal) * 100) / 100;
        if (gstOption === 'inclusive') {
          segBase = effectiveRate > 0 ? Math.round((segTotal / (1 + effectiveRate / 100)) * 100) / 100 : segTotal;
          segGst = Math.round((segTotal - segBase) * 100) / 100;
        } else if (gstOption === 'exclusive') {
          segBase = segTotal;
          segGst = effectiveRate > 0 ? Math.round((segBase * (effectiveRate / 100)) * 100) / 100 : 0;
          segTotal = Math.round((segBase + segGst) * 100) / 100;
        } else {
          segBase = segTotal;
          segGst = 0;
        }
      } else if (gstOption === 'inclusive') {
        const grossRate = effectiveRate > 0 ? (baseRate * (1 + effectiveRate / 100)) : baseRate;
        segTotal = Math.round(nights * grossRate * 100) / 100;
        segBase = effectiveRate > 0 ? Math.round((segTotal / (1 + effectiveRate / 100)) * 100) / 100 : segTotal;
        segGst = Math.round((segTotal - segBase) * 100) / 100;
      } else if (gstOption === 'exclusive') {
        segBase = Math.round(nights * baseRate * 100) / 100;
        segGst = effectiveRate > 0 ? Math.round((segBase * (effectiveRate / 100)) * 100) / 100 : 0;
        segTotal = Math.round((segBase + segGst) * 100) / 100;
      } else {
        segBase = Math.round(nights * baseRate * 100) / 100;
        segGst = 0;
        segTotal = segBase;
      }

      return {
        segBase,
        segGst,
        segTotal,
        gstRate: effectiveRate
      };
    };

    const segments = [];
    groupItems.forEach((gb) => {
      const inStr = gb.checkInDate ? String(gb.checkInDate).split('T')[0] : (booking.checkInDate ? String(booking.checkInDate).split('T')[0] : '');
      const outStr = gb.checkOutDate ? String(gb.checkOutDate).split('T')[0] : (booking.checkOutDate ? String(booking.checkOutDate).split('T')[0] : '');
      
      const totalStayDays = calculateBookingStayDays(gb, inStr, outStr, gb.checkInTime || booking.checkInTime, gb.checkOutTime || booking.checkOutTime);

      const cRm = cleanRoomNumber(gb.Room?.roomNumber || gb.roomNumber || gb.roomId || '101');
      const roomType = gb.Room?.type || gb.roomType || 'Deluxe';
      const gbGstRate = gb.gstRate !== undefined && gb.gstRate !== null ? gb.gstRate : fallbackGstRate;
      let rawCurRate = Number(gb.pricePerNight || gb.roomRate || booking.pricePerNight || booking.roomRate || 0);
      if (!rawCurRate) {
        if (gb.totalAmount && totalStayDays > 0 && !(gb.previousRoomNumber && cleanRoomNumber(gb.previousRoomNumber) !== 'N/A')) {
          rawCurRate = Number(gb.totalAmount) / totalStayDays;
        } else {
          rawCurRate = Number(gb.Room?.pricePerNight || booking.Room?.pricePerNight || 0);
        }
      }
      const curBaseRate = getBaseRate(rawCurRate, gb.totalAmount, totalStayDays, gbGstRate);

      if (gb.previousRoomNumber && cleanRoomNumber(gb.previousRoomNumber) !== 'N/A') {
        const prevRoomsList = String(gb.previousRoomNumber).split(/→|->|,|>/).map(s => cleanRoomNumber(s.trim())).filter(s => s && s !== 'N/A');
        const prevRatesList = String(gb.previousRoomRate || '').split(/→|->|,|>/).map(s => Number(s.trim())).filter(n => !isNaN(n));
        const rawShiftDates = gb.shiftDate || booking.shiftDate || (gb.updatedAt ? String(gb.updatedAt).split('T')[0] : '');
        const shiftDatesList = String(rawShiftDates || '').split(/→|->|,|>/).map(s => s.trim().split('T')[0]).filter(Boolean);
        const shiftTimeStr = gb.shiftTime || booking.shiftTime ? formatTime12hr(gb.shiftTime || booking.shiftTime) : '';

        const sameDayOptRaw = gb.sameDayChargeOption || booking.sameDayChargeOption || 'no_charge';
        const sameDayOptList = String(sameDayOptRaw).split(/→|->|,|>/).map(s => s.trim());

        const lastShiftDate = shiftDatesList[shiftDatesList.length - 1] || shiftDatesList[0] || inStr;
        let curDays = 0;
        if (outStr && lastShiftDate && outStr > lastShiftDate) {
          curDays = Math.ceil(Math.abs(new Date(outStr) - new Date(lastShiftDate)) / (1000 * 60 * 60 * 24));
        } else {
          let prevDaysSum = 0;
          prevRoomsList.forEach((pRm, pIdx) => {
            const isFirst = (pIdx === 0);
            const stepStartD = isFirst ? inStr : (shiftDatesList[pIdx - 1] || shiftDatesList[0] || inStr);
            const stepEndD = shiftDatesList[pIdx] || (isFirst ? (shiftDatesList[0] || inStr) : (shiftDatesList[pIdx - 1] || inStr));
            if (stepEndD && stepStartD && stepEndD > stepStartD) {
              prevDaysSum += Math.max(0, Math.ceil(Math.abs(new Date(stepEndD) - new Date(stepStartD)) / (1000 * 60 * 60 * 24)));
            }
          });
          curDays = Math.max(0, totalStayDays - prevDaysSum);
        }

        let prevTotalCharges = 0;
        prevRoomsList.forEach((pRm, pIdx) => {
          const isFirst = (pIdx === 0);
          const stepStartD = isFirst ? inStr : (shiftDatesList[pIdx - 1] || shiftDatesList[0] || inStr);
          const stepEndD = shiftDatesList[pIdx] || (isFirst ? (shiftDatesList[0] || inStr) : (shiftDatesList[pIdx - 1] || inStr));
          const stepSameDayOpt = sameDayOptList[pIdx] || sameDayOptList[0] || 'no_charge';

          let stepDays = 0;
          if (stepEndD && stepStartD && stepEndD > stepStartD) {
            stepDays = Math.max(0, Math.ceil(Math.abs(new Date(stepEndD) - new Date(stepStartD)) / (1000 * 60 * 60 * 24)));
          }

          const rawPRate = prevRatesList[pIdx] !== undefined ? prevRatesList[pIdx] : (prevRatesList[0] !== undefined ? prevRatesList[0] : (rawCurRate || 0));
          const pRate = getBaseRate(rawPRate, 0, 1, gbGstRate);

          if (stepDays > 0) {
            const prevTotal = stepDays * rawPRate;
            prevTotalCharges += prevTotal;
            const prevFin = calculateFinancialsForSegment(stepDays, pRate, gbGstRate, prevTotal);
            segments.push({
              roomNumber: `${pRm} (Prev)`,
              roomType: gb.previousRoomType || roomType,
              startDate: stepStartD,
              endDate: stepEndD,
              nights: stepDays,
              rate: pRate,
              isShift: true,
              isPrev: true,
              shiftDate: stepEndD,
              shiftTime: shiftTimeStr,
              targetRoom: cRm,
              ...prevFin
            });
          } else {
            const zeroFin = calculateFinancialsForSegment(0, 0, gbGstRate, 0);
            segments.push({
              roomNumber: `${pRm} (Prev)`,
              roomType: gb.previousRoomType || roomType,
              startDate: stepStartD,
              endDate: stepEndD,
              nights: 0,
              rate: 0,
              isShift: true,
              isPrev: true,
              isSameDayShift: true,
              shiftDate: stepEndD,
              shiftTime: shiftTimeStr,
              targetRoom: cRm,
              ...zeroFin
            });
          }

          if (stepSameDayOpt === 'charge_previous') {
            prevTotalCharges += rawPRate;
            const shiftFin = calculateFinancialsForSegment(1, pRate, gbGstRate, rawPRate);
            segments.push({
              roomNumber: cleanRoomNumber(pRm),
              roomType: gb.previousRoomType || roomType,
              startDate: stepEndD,
              endDate: stepEndD,
              nights: 1,
              rate: pRate,
              isShift: true,
              isPrev: true,
              isShiftDayCharge: true,
              shiftDate: stepEndD,
              shiftTime: shiftTimeStr,
              targetRoom: cRm,
              ...shiftFin
            });
          }
        });

        const bTotalAmount = Number(gb.totalAmount || 0);
        let curTotalAmount = curDays * rawCurRate;
        if (prevTotalCharges === 0 && bTotalAmount > 0) {
          curTotalAmount = bTotalAmount;
        } else if (bTotalAmount > 0 && bTotalAmount >= prevTotalCharges) {
          curTotalAmount = bTotalAmount - prevTotalCharges;
        }

        const curBaseRate = getBaseRate(rawCurRate, curTotalAmount, curDays, gbGstRate);
        const curFin = calculateFinancialsForSegment(curDays, curBaseRate, gbGstRate, curTotalAmount);

        // After shift segment
        segments.push({
          roomNumber: cRm,
          roomType: roomType,
          startDate: lastShiftDate,
          endDate: outStr,
          nights: curDays,
          rate: curBaseRate,
          isShift: true,
          isPrev: false,
          shiftDate: lastShiftDate,
          shiftTime: shiftTimeStr,
          originRoom: prevRoomsList[prevRoomsList.length - 1] || prevRoomsList[0],
          ...curFin
        });
      } else {
        const curFin = calculateFinancialsForSegment(totalStayDays, curBaseRate, gbGstRate, gb.totalAmount);
        segments.push({
          roomNumber: cRm,
          roomType: roomType,
          startDate: inStr,
          endDate: outStr,
          nights: totalStayDays,
          rate: curBaseRate,
          isShift: false,
          ...curFin
        });
      }
    });

    return segments;
  }, [booking]);

  // Financial calculations
  const financialData = useMemo(() => {
    if (!booking) return null;

    const isGroup = Boolean(booking.groupBookings && booking.groupBookings.length > 0);

    const totalRoomBase = roomSegments.reduce((sum, s) => sum + Number(s.segBase || 0), 0);
    const totalRoomGst = roomSegments.reduce((sum, s) => sum + Number(s.segGst || 0), 0);
    const totalRoomAmount = roomSegments.reduce((sum, s) => sum + Number(s.segTotal || 0), 0);

    let discount = Number(booking.discount || 0);
    if (isGroup) {
      discount = booking.groupBookings.reduce((sum, b) => sum + Number(b.discount || 0), 0);
    }

    let paymentHistory = [];
    try {
      if (isGroup) {
        const allHist = [];
        const seenTx = new Set();
        booking.groupBookings.forEach(gb => {
          if (gb.paymentHistory) {
            try {
              const parsed = typeof gb.paymentHistory === 'string' ? JSON.parse(gb.paymentHistory) : gb.paymentHistory;
              if (Array.isArray(parsed)) {
                parsed.forEach(tx => {
                  const key = `${tx.date}_${tx.time}_${tx.amount}_${tx.paymentMode}`;
                  if (!seenTx.has(key)) {
                    seenTx.add(key);
                    allHist.push(tx);
                  }
                });
              }
            } catch (e) {}
          }
        });
        paymentHistory = allHist;
      }
      if (paymentHistory.length === 0 && booking.paymentHistory) {
        paymentHistory = typeof booking.paymentHistory === 'string' ? JSON.parse(booking.paymentHistory) : booking.paymentHistory;
      }
    } catch (e) {
      paymentHistory = [];
    }

    let amountPaid = 0;
    if (Array.isArray(paymentHistory) && paymentHistory.length > 0) {
      amountPaid = paymentHistory.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    } else if (isGroup) {
      amountPaid = booking.groupBookings.reduce((sum, b) => sum + Number(b.amountPaid || 0), 0);
    } else {
      amountPaid = Number(booking.amountPaid || 0);
    }

    const gstRate = Number(booking.gstRate !== undefined && booking.gstRate !== null ? booking.gstRate : (activeHotel?.defaultGstRate !== undefined ? Number(activeHotel.defaultGstRate) : 12));
    const gstOption = booking.gstOption || 'none';

    let extraChargesTotal = 0;
    let extraGstAmount = 0;
    if (booking.extraChargesList && Array.isArray(booking.extraChargesList)) {
      extraChargesTotal = booking.extraChargesList.reduce((sum, ec) => sum + Number(ec.grandTotal || ec.amount || 0), 0);
      extraGstAmount = booking.extraChargesList.reduce((s, ec) => s + Number(ec.gstAmount || 0), 0);
    } else if (booking.extraCharges) {
      extraChargesTotal = Number(booking.extraCharges);
    }

    const extraBaseAmount = Math.max(0, extraChargesTotal - extraGstAmount);
    const subTotal = Math.max(0, totalRoomBase + extraBaseAmount - discount);
    const roomGstAmount = totalRoomGst;
    const totalGstAmount = roomGstAmount + extraGstAmount;
    const grandTotal = Math.max(0, totalRoomAmount + extraChargesTotal - discount);
    const pendingDue = grandTotal - amountPaid;

    return {
      baseAmount: totalRoomBase,
      discount,
      amountPaid,
      subTotal,
      roomGstAmount,
      extraGstAmount,
      totalGstAmount,
      grandTotal,
      pendingDue,
      gstOption,
      gstRate,
      extraChargesTotal,
      paymentHistory
    };
  }, [booking, roomSegments, activeHotel]);

  // Extract room shifts metadata
  const shiftInfoList = useMemo(() => {
    if (!booking) return [];
    const groupItems = booking.groupBookings && booking.groupBookings.length > 0 ? booking.groupBookings : [booking];
    const list = [];
    groupItems.forEach(gb => {
      if (gb.previousRoomNumber && cleanRoomNumber(gb.previousRoomNumber) !== 'N/A') {
        const prevRoomsList = String(gb.previousRoomNumber).split(/→|->|,|>/).map(s => cleanRoomNumber(s.trim())).filter(s => s && s !== 'N/A');
        const shiftDateStr = gb.shiftDate || booking.shiftDate || (gb.updatedAt ? String(gb.updatedAt).split('T')[0] : '');
        const shiftTimeStr = gb.shiftTime || booking.shiftTime ? formatTime12hr(gb.shiftTime || booking.shiftTime) : '';
        const cRm = cleanRoomNumber(gb.Room?.roomNumber || gb.roomNumber || gb.roomId || '101');
        const pRm = prevRoomsList.join(' → ');

        list.push({
          prevRoom: pRm,
          curRoom: cRm,
          shiftDateFormatted: formatDateDMY(shiftDateStr),
          shiftTimeFormatted: shiftTimeStr
        });
      }
    });
    return list;
  }, [booking]);

  // Room Numbers string (with shift transitions)
  const groupItemsList = booking.groupBookings && booking.groupBookings.length > 0 ? booking.groupBookings : [booking];
  const roomNumbersStr = groupItemsList.map(gb => {
    const pRm = cleanRoomNumber(gb.previousRoomNumber);
    const cRm = cleanRoomNumber(gb.Room?.roomNumber || gb.roomNumber || gb.roomId || '101');
    if (pRm && pRm !== 'N/A' && pRm !== cRm) {
      return `${pRm} → ${cRm}`;
    }
    return cRm;
  }).join(', ');

  const roomTypesStr = booking.groupBookings && booking.groupBookings.length > 0
    ? [...new Set(booking.groupBookings.map(b => b.Room?.type).filter(Boolean))].join(', ')
    : (booking.Room?.type || 'Standard');

  const checkInDateFormatted = formatDateDMY(booking.checkInDate || booking.createdAt);
  const checkOutDateFormatted = formatDateDMY(booking.checkOutDate);
  const checkInTimeFormatted = booking.checkInTime ? formatTime12hr(booking.checkInTime) : '12:00 PM';
  const checkOutTimeFormatted = booking.checkOutTime ? formatTime12hr(booking.checkOutTime) : '11:00 AM';

  const stayDays = calculateBookingStayDays(booking, booking?.checkInDate, booking?.checkOutDate, booking?.checkInTime, booking?.checkOutTime);

  // PDF download
  const handleDownloadInvoice = async () => {
    if (!booking) return;
    try {
      const doc = await generateTaxInvoice(booking, activeHotel, logoBase64);
      doc.save(`Invoice_${booking.invoiceNumber || booking.guestName}.pdf`);
    } catch (e) {
      console.error('Invoice PDF Generation Failed', e);
      alert('Failed to generate PDF. Please try again.');
    }
  };

  if (loading && !booking) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Loader2 className="w-10 h-10 text-[#84A63C] animate-spin" />
        <p className="text-sm font-bold text-[#4A5E38]">Loading guest billing details...</p>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="p-8 text-center bg-white rounded-2xl border border-rose-200 shadow-sm max-w-lg mx-auto my-12 space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
          <AlertTriangle size={24} />
        </div>
        <h2 className="text-lg font-black text-rose-900">Guest Details Not Found</h2>
        <p className="text-xs text-rose-700 font-semibold">{error || 'Could not locate record.'}</p>
        <button
          onClick={() => navigate('/dashboard/front-office/billing')}
          className="px-4 py-2 bg-[#84A63C] text-white font-bold rounded-xl text-xs hover:bg-[#6e8d2e] transition-all"
        >
          Back to Billing
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-8 animate-fade-in text-[#1A2E05]">
      {/* Top Breadcrumb & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white p-2.5 sm:p-3 rounded-xl border border-[#DDE5D0] shadow-xs">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-lg bg-[#F5F7F0] hover:bg-[#E5EAD9] text-[#1A2E05] border border-[#DDE5D0] transition-all active:scale-95 shadow-2xs cursor-pointer"
            title="Back to Previous Page"
          >
            <ArrowLeft size={16} strokeWidth={2.5} />
          </button>
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-[#2E4316]">
              <span>Front Office</span>
              <ChevronRight size={10} className="text-[#84A63C]" strokeWidth={3} />
              <span>Billing</span>
              <ChevronRight size={10} className="text-[#84A63C]" strokeWidth={3} />
              <span className="text-[#84A63C] font-black">Guest Details</span>
            </div>
            <h1 className="text-sm sm:text-base font-black text-[#1A2E05] tracking-tight flex items-center gap-2 mt-0.5">
              <span>{booking.guestName}</span>
              <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-black border ${
                booking.status === 'Active'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : booking.status === 'Completed'
                  ? 'bg-blue-50 text-blue-800 border-blue-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}>
                {booking.status || 'Active'}
              </span>
            </h1>
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-2 self-end sm:self-center">
          {financialData && (financialData.amountPaid > financialData.grandTotal + 0.1) && (
            <button
              onClick={() => setIsRefundOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-black text-[11px] shadow-xs transition-all active:scale-95 cursor-pointer"
            >
              <RotateCcw size={12} />
              <span>Process Refund</span>
            </button>
          )}
          <button
            onClick={() => setIsPayOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-black text-[11px] shadow-xs transition-all active:scale-95 cursor-pointer"
          >
            <Wallet size={12} />
            <span>Collect Payment</span>
          </button>
          <button
            onClick={handleDownloadInvoice}
            className="flex items-center gap-1 px-2.5 py-1 bg-[#84A63C] hover:bg-[#6e8d2e] text-white rounded-lg font-black text-[11px] shadow-xs transition-all active:scale-95 cursor-pointer"
          >
            <Download size={12} />
            <span>Download Invoice PDF</span>
          </button>
        </div>
      </div>

      {/* Guest Summary & Identifiers Header Card */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
        {/* Registration & Invoice Badges */}
        <div className="bg-white p-3 rounded-xl border border-[#DDE5D0] shadow-xs flex flex-col justify-between">
          <div className="flex items-center gap-1.5 text-[#1A2E05] text-[10.5px] font-black uppercase tracking-wider">
            <Hash size={13} className="text-[#84A63C]" strokeWidth={2.5} />
            <span>Registry Codes</span>
          </div>
          <div className="space-y-1 mt-2">
            {activeHotel?.enableRegistrationNumber === true && (
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-[#2E4316]">Reg. No:</span>
                <span className="px-1.5 py-0.5 bg-[#EEF4E3] border border-[#D3E2BD] rounded text-[11px] font-mono font-black text-[#1A2E05]">
                  {booking.registrationNumber || 'N/A'}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-[#2E4316]">Invoice No:</span>
              <span className="px-1.5 py-0.5 bg-[#F5F7F0] border border-[#DDE5D0] rounded text-[11px] font-mono font-black text-[#1A2E05]">
                {booking.invoiceNumber || 'Pending'}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-[#2E4316]">Booking Type:</span>
              <span className="font-black text-[#1A2E05]">{booking.bookingType || 'Walk-In'}</span>
            </div>
          </div>
        </div>

        {/* Room & Stay Summary */}
        <div className="bg-white p-3 rounded-xl border border-[#DDE5D0] shadow-xs flex flex-col justify-between">
          <div className="flex items-center gap-1.5 text-[#1A2E05] text-[10.5px] font-black uppercase tracking-wider">
            <Home size={13} className="text-[#84A63C]" strokeWidth={2.5} />
            <span>Room & Stay</span>
          </div>
          <div className="space-y-1 mt-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#2E4316]">Room No:</span>
              <span className="font-black text-xs sm:text-sm text-[#1A2E05]">
                {groupItemsList.map((gb, gIdx) => {
                  const pRm = cleanRoomNumber(gb.previousRoomNumber);
                  const cRm = cleanRoomNumber(gb.Room?.roomNumber || gb.roomNumber || gb.roomId || '101');
                  const isShifted = Boolean(pRm && pRm !== 'N/A' && pRm !== cRm);
                  return (
                    <span key={gIdx}>
                      {isShifted ? (
                        <span className="inline-flex items-center gap-0.5">
                          <span className="text-orange-600 font-bold">{pRm}</span>
                          <span className="text-orange-500 font-black text-[10px]">→</span>
                          <span className="text-[#1A2E05] font-black">{cRm}</span>
                        </span>
                      ) : (
                        <span>{cRm}</span>
                      )}
                      {gIdx < groupItemsList.length - 1 ? ', ' : ''}
                    </span>
                  );
                })}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#2E4316]">Room Type:</span>
              <span className="font-bold text-[#1A2E05]">{roomTypesStr}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#2E4316]">Stay Duration:</span>
              <span className="font-black text-[#84A63C]">{stayDays} {stayDays === 1 ? 'Night' : 'Nights'}</span>
            </div>
            {shiftInfoList.length > 0 && (
              <div className="pt-1 border-t border-[#DDE5D0]/60 flex items-center justify-between text-orange-700">
                <span className="font-bold text-[10px]">Shift Date & Time:</span>
                <span className="font-black text-[10.5px]">
                  {shiftInfoList[0].shiftDateFormatted}{shiftInfoList[0].shiftTimeFormatted ? ` (${shiftInfoList[0].shiftTimeFormatted})` : ''}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Stay Dates */}
        <div className="bg-white p-3 rounded-xl border border-[#DDE5D0] shadow-xs flex flex-col justify-between">
          <div className="flex items-center gap-1.5 text-[#1A2E05] text-[10.5px] font-black uppercase tracking-wider">
            <Calendar size={13} className="text-[#84A63C]" strokeWidth={2.5} />
            <span>Stay Schedule</span>
          </div>
          <div className="space-y-1 mt-2 text-xs">
            <div>
              <span className="text-[9.5px] font-bold text-[#2E4316] block">Check-In:</span>
              <span className="font-black text-[#1A2E05]">{checkInDateFormatted}</span>
              <span className="text-[9.5px] font-black text-[#1A2E05] ml-1 bg-[#F5F7F0] px-1 py-0.2 rounded border border-[#DDE5D0]">
                {checkInTimeFormatted}
              </span>
            </div>
            <div className="pt-1 border-t border-[#DDE5D0]/50">
              <span className="text-[9.5px] font-bold text-[#2E4316] block">Check-Out:</span>
              <span className="font-black text-[#1A2E05]">{checkOutDateFormatted}</span>
              <span className="text-[9.5px] font-black text-[#1A2E05] ml-1 bg-[#F5F7F0] px-1 py-0.2 rounded border border-[#DDE5D0]">
                {checkOutTimeFormatted}
              </span>
            </div>
            {shiftInfoList.length > 0 && (
              <div className="pt-1 border-t border-[#DDE5D0]/50 text-orange-800">
                <span className="text-[9.5px] font-bold text-orange-700 block">Room Shift:</span>
                {shiftInfoList.map((si, sIdx) => (
                  <div key={sIdx} className="font-bold text-[10.5px] flex items-center gap-1 flex-wrap mt-0.5">
                    <span className="text-orange-950 font-black">{si.shiftDateFormatted}</span>
                    {si.shiftTimeFormatted && (
                      <span className="text-[9px] font-black bg-orange-100 text-orange-900 px-1 py-0.2 rounded border border-orange-200">
                        {si.shiftTimeFormatted}
                      </span>
                    )}
                    <span className="text-[10px] text-orange-700">({si.prevRoom} → {si.curRoom})</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Financial Status Banner */}
        <div className="bg-gradient-to-br from-[#F5F7F0] to-white p-3 rounded-xl border border-[#DDE5D0] shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-black text-[#1A2E05] uppercase tracking-wider">Grand Total</span>
            <span className="text-sm sm:text-base font-black text-[#1A2E05]">₹{formatMoney(financialData?.grandTotal)}</span>
          </div>
          <div className="space-y-1 mt-2 pt-2 border-t border-[#DDE5D0] text-xs">
            <div className="flex items-center justify-between font-bold text-green-800">
              <span>Paid Amount:</span>
              <span>₹{formatMoney(financialData?.amountPaid)}</span>
            </div>
            <div className="flex items-center justify-between font-black">
              <span className="text-[#2E4316]">Balance:</span>
              {financialData && Math.abs(Number(financialData.pendingDue || 0)) < 0.05 ? (
                <span className="text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 text-[9.5px]">
                  No Pending
                </span>
              ) : financialData && Number(financialData.pendingDue) < -0.05 ? (
                <span className="text-blue-800 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 text-[9.5px]">
                  Refund: ₹{formatMoney(Math.abs(financialData.pendingDue))}
                </span>
              ) : (
                <span className="text-rose-800 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 text-[9.5px]">
                  Due: ₹{formatMoney(financialData?.pendingDue)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid: Guest Details + Billing Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Left Column: Guest Profile & Documents */}
        <div className="space-y-3 lg:col-span-1">
          {/* Guest Personal Info */}
          <div className="bg-white p-3 rounded-xl border border-[#DDE5D0] shadow-xs space-y-2.5">
            <h3 className="text-[11px] font-black text-[#1A2E05] uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-[#DDE5D0]">
              <User size={14} className="text-[#84A63C]" strokeWidth={2.5} />
              <span>Guest Information</span>
            </h3>

            <div className="space-y-1.5 text-xs">
              <div>
                <span className="font-bold text-[#2E4316] block text-[9.5px]">Full Name:</span>
                <span className="font-black text-[#1A2E05] text-xs sm:text-sm">{booking.guestName}</span>
              </div>
              {booking.fatherName && (
                <div>
                  <span className="font-bold text-[#2E4316] block text-[9.5px]">Father's / Spouse Name:</span>
                  <span className="font-bold text-[#1A2E05]">{booking.fatherName}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <Phone size={12} className="text-[#84A63C]" />
                <span className="font-bold text-[#1A2E05]">{booking.phone || 'N/A'}</span>
              </div>
              {booking.email && (
                <div className="flex items-center gap-1.5">
                  <Mail size={12} className="text-[#84A63C]" />
                  <span className="font-bold text-[#1A2E05] truncate">{booking.email}</span>
                </div>
              )}
              {booking.address && (
                <div className="flex items-start gap-1.5 pt-0.5">
                  <MapPin size={12} className="text-[#84A63C] shrink-0 mt-0.5" />
                  <span className="font-semibold text-[#1A2E05] leading-relaxed">{booking.address}</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-[#DDE5D0]/60">
                <div>
                  <span className="font-bold text-[#2E4316] block text-[9.5px]">Nationality:</span>
                  <span className="font-bold text-[#1A2E05]">{booking.nationality || 'Indian'}</span>
                </div>
                <div>
                  <span className="font-bold text-[#2E4316] block text-[9.5px]">Gender / Age:</span>
                  <span className="font-bold text-[#1A2E05]">
                    {booking.gender || 'N/A'} {booking.age ? `(${booking.age} yrs)` : ''}
                  </span>
                </div>
              </div>
              {booking.companyName && (
                <div className="pt-1.5 border-t border-[#DDE5D0]/60">
                  <span className="font-bold text-[#2E4316] block text-[9.5px]">Company Name & GSTIN:</span>
                  <span className="font-bold text-[#1A2E05] block">{booking.companyName}</span>
                  {booking.guestGst && <span className="font-mono font-bold text-[10.5px] text-[#84A63C]">{booking.guestGst}</span>}
                </div>
              )}
            </div>
          </div>

          {/* ID Proofs & Uploaded Documents */}
          <div className="bg-white p-3 rounded-xl border border-[#DDE5D0] shadow-xs space-y-2.5">
            <h3 className="text-[11px] font-black text-[#1A2E05] uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-[#DDE5D0]">
              <Shield size={14} className="text-[#84A63C]" strokeWidth={2.5} />
              <span>Identification & Documents</span>
            </h3>

            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#2E4316]">ID Type:</span>
                <span className="font-bold text-[#1A2E05]">{booking.idType || 'Aadhaar / ID Card'}</span>
              </div>
              {booking.idProof && (
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#2E4316]">ID Number:</span>
                  <span className="font-mono font-bold text-[#1A2E05]">{booking.idProof}</span>
                </div>
              )}

              {/* Document Thumbnails */}
              <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-[#DDE5D0]/60">
                {booking.aadhaarFront && (
                  <button
                    type="button"
                    onClick={() => setPreviewDoc({ url: getUploadUrl(booking.aadhaarFront), title: 'ID Front' })}
                    className="p-1.5 rounded-lg border border-[#DDE5D0] bg-[#F9FAFA] hover:bg-[#EEF4E3] text-left transition-all group cursor-pointer"
                  >
                    <span className="text-[9.5px] font-bold text-[#2E4316] block">ID Front</span>
                    <span className="text-[10.5px] font-black text-[#84A63C] group-hover:underline flex items-center gap-1 mt-0.5">
                      <Eye size={11} /> View File
                    </span>
                  </button>
                )}
                {booking.aadhaarBack && (
                  <button
                    type="button"
                    onClick={() => setPreviewDoc({ url: getUploadUrl(booking.aadhaarBack), title: 'ID Back' })}
                    className="p-1.5 rounded-lg border border-[#DDE5D0] bg-[#F9FAFA] hover:bg-[#EEF4E3] text-left transition-all group cursor-pointer"
                  >
                    <span className="text-[9.5px] font-bold text-[#2E4316] block">ID Back</span>
                    <span className="text-[10.5px] font-black text-[#84A63C] group-hover:underline flex items-center gap-1 mt-0.5">
                      <Eye size={11} /> View File
                    </span>
                  </button>
                )}
                {booking.guestPhoto && (
                  <button
                    type="button"
                    onClick={() => setPreviewDoc({ url: getUploadUrl(booking.guestPhoto), title: 'Guest Photo' })}
                    className="p-1.5 rounded-lg border border-[#DDE5D0] bg-[#F9FAFA] hover:bg-[#EEF4E3] text-left transition-all group cursor-pointer"
                  >
                    <span className="text-[9.5px] font-bold text-[#2E4316] block">Guest Photo</span>
                    <span className="text-[10.5px] font-black text-[#84A63C] group-hover:underline flex items-center gap-1 mt-0.5">
                      <Eye size={11} /> View Photo
                    </span>
                  </button>
                )}
                {booking.signature && (
                  <button
                    type="button"
                    onClick={() => setPreviewDoc({ url: getUploadUrl(booking.signature), title: 'Signature' })}
                    className="p-1.5 rounded-lg border border-[#DDE5D0] bg-[#F9FAFA] hover:bg-[#EEF4E3] text-left transition-all group cursor-pointer"
                  >
                    <span className="text-[9.5px] font-bold text-[#2E4316] block">Signature</span>
                    <span className="text-[10.5px] font-black text-[#84A63C] group-hover:underline flex items-center gap-1 mt-0.5">
                      <Eye size={11} /> View Signature
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Detailed Financial Ledger & Payment Transactions */}
        <div className="space-y-3 lg:col-span-2">
          {/* Detailed Financial Breakdown Table */}
          <div className="bg-white rounded-xl border border-[#DDE5D0] shadow-xs overflow-hidden">
            <div className="p-3 bg-[#F5F7F0] border-b border-[#DDE5D0] flex items-center justify-between">
              <h3 className="text-[11px] font-black text-[#1A2E05] uppercase tracking-wider flex items-center gap-1.5">
                <Receipt size={14} className="text-[#84A63C]" strokeWidth={2.5} />
                <span>Financial Summary & Itemized Ledger</span>
              </h3>
              <span className="text-[10.5px] font-bold text-[#2E4316]">
                GST Mode: <strong className="text-[#1A2E05] uppercase">{financialData?.gstOption}</strong>
              </span>
            </div>

            <div className="p-3 space-y-3">
              {/* Financial Breakdown Grid */}
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#DDE5D0] text-[#1A2E05] font-black text-[10px] uppercase">
                    <th className="py-1.5">Description</th>
                    <th className="py-1.5 text-right">Taxable Base</th>
                    <th className="py-1.5 text-right">GST Rate</th>
                    <th className="py-1.5 text-right">GST Amount</th>
                    <th className="py-1.5 text-right">Total Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F3E8] font-bold">
                  {/* Itemized Room Stay Charges */}
                  {roomSegments.map((seg, sIdx) => {
                    const segStart = formatDateDMY(seg.startDate);
                    const segEnd = formatDateDMY(seg.endDate);
                    return (
                      <tr key={`seg_${sIdx}`} className="hover:bg-[#F9FAF6] transition-colors">
                        <td className="py-2.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-black text-[#1A2E05]">
                              Room {seg.roomNumber} ({seg.roomType || 'Deluxe'})
                            </span>
                            {seg.isShift && (
                              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${
                                seg.isPrev 
                                  ? 'bg-amber-50 text-amber-900 border-amber-300' 
                                  : 'bg-emerald-50 text-emerald-900 border-emerald-300'
                              }`}>
                                {seg.isPrev ? 'Before Shift' : 'After Shift'}
                              </span>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-1.5 flex-wrap text-[10.5px] text-[#2E4316] font-bold mt-1">
                            <span className="bg-[#EEF4E3] px-1.5 py-0.5 rounded border border-[#D3E2BD] font-mono">
                              {segStart} → {segEnd}
                            </span>
                            <span>•</span>
                            <span className="text-[#1A2E05] font-black">
                              {seg.nights} {seg.nights === 1 ? 'Night' : 'Nights'} @ ₹{formatMoney(seg.rate)}/night
                            </span>
                          </div>

                          {seg.isShift && !seg.isPrev && seg.shiftDate && (
                            <div className="mt-1">
                              <span className="inline-flex items-center gap-1 text-[9.5px] font-bold text-orange-900 bg-orange-50 px-2 py-0.5 rounded-md border border-orange-200">
                                <span>Shifted on <strong>{formatDateDMY(seg.shiftDate)}</strong></span>
                                {seg.shiftTime && <span>at <strong>{seg.shiftTime}</strong></span>}
                                <span>(Room {seg.originRoom} → Room {seg.roomNumber})</span>
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 text-right font-mono font-bold text-[#1A2E05]">
                          ₹{formatMoney(seg.segBase)}
                        </td>
                        <td className="py-2.5 text-right font-bold text-[#1A2E05]">
                          {seg.gstRate}%
                        </td>
                        <td className="py-2.5 text-right font-mono font-bold text-blue-700">
                          ₹{formatMoney3(seg.segGst)}
                          {seg.segGst > 0 && (
                            <span className="block text-[10px] text-[#2E4316] font-semibold mt-0.5 whitespace-nowrap">
                              (SGST ₹{formatMoney3(seg.segGst / 2)} + CGST ₹{formatMoney3(seg.segGst / 2)})
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 text-right font-mono font-black text-[#1A2E05]">
                          ₹{formatMoney(seg.segTotal)}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Extra Services / Charges if any */}
                  {booking.extraChargesList && booking.extraChargesList.length > 0 && booking.extraChargesList.map((ec, idx) => (
                    <tr key={idx}>
                      <td className="py-2">
                        <p className="font-black text-[#1A2E05]">{ec.serviceName || ec.name || 'Extra Service'}</p>
                        <p className="text-[9.5px] text-[#2E4316] font-bold">{ec.description || 'Extra amenities/services'}</p>
                      </td>
                      <td className="py-2 text-right font-mono text-[#1A2E05]">₹{formatMoney(ec.subtotal || ec.baseAmount || ec.amount)}</td>
                      <td className="py-2 text-right text-[#1A2E05]">{ec.gstRate || 0}%</td>
                      <td className="py-2 text-right font-mono text-blue-700">
                        ₹{formatMoney3(ec.gstAmount || 0)}
                        {Number(ec.gstAmount || 0) > 0 && (
                          <span className="block text-[10.5px] text-[#2E4316] font-bold mt-0.5 whitespace-nowrap">
                            (SGST ₹{formatMoney3((ec.gstAmount || 0) / 2)} + CGST ₹{formatMoney3((ec.gstAmount || 0) / 2)})
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right font-mono font-black text-[#1A2E05]">₹{formatMoney(ec.grandTotal || ec.amount)}</td>
                    </tr>
                  ))}

                  {/* Discount row if applicable */}
                  {financialData?.discount > 0 && (
                    <tr className="text-orange-700">
                      <td className="py-2">
                        <span className="font-black">Applied Discount</span>
                        {booking.discountReason && <span className="block text-[9.5px] text-orange-600 font-bold">Reason: {booking.discountReason}</span>}
                      </td>
                      <td className="py-2 text-right font-mono">-₹{formatMoney(financialData?.discount)}</td>
                      <td className="py-2 text-right">-</td>
                      <td className="py-2 text-right">-</td>
                      <td className="py-2 text-right font-mono font-black">-₹{formatMoney(financialData?.discount)}</td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Total Calculation Summary Bar */}
              <div className="bg-[#F5F7F0] p-2.5 rounded-xl border border-[#DDE5D0] flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-3 text-[10.5px] font-bold text-[#2E4316]">
                  <span>Total Taxable: <strong className="text-[#1A2E05]">₹{formatMoney(financialData?.subTotal)}</strong></span>
                  <span>•</span>
                  <span>Total GST: <strong className="text-[#1A2E05]">₹{formatMoney3(financialData?.totalGstAmount)}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-black text-[#2E4316] uppercase">Grand Total:</span>
                  <span className="text-base font-black text-[#1A2E05]">₹{formatMoney(financialData?.grandTotal)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Payment Transactions & Receipts Ledger */}
          <div className="bg-white rounded-xl border border-[#DDE5D0] shadow-xs overflow-hidden">
            <div className="p-3 bg-[#F5F7F0] border-b border-[#DDE5D0] flex items-center justify-between">
              <h3 className="text-[11px] font-black text-[#1A2E05] uppercase tracking-wider flex items-center gap-1.5">
                <CreditCard size={14} className="text-[#84A63C]" strokeWidth={2.5} />
                <span>Payment Transactions & Receipts</span>
              </h3>
              <span className="text-[10.5px] font-black text-green-800 bg-green-50 px-2 py-0.5 rounded border border-green-200">
                Total Paid: ₹{formatMoney(financialData?.amountPaid)}
              </span>
            </div>

            <div className="p-3">
              {financialData?.paymentHistory && financialData.paymentHistory.length > 0 ? (
                <div className="space-y-1.5">
                  {financialData.paymentHistory.map((tx, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-[#F9FAFA] border border-[#DDE5D0]/70 text-xs">
                      <div className="flex items-center gap-2.5">
                        <div className={`p-1 rounded-md ${tx.amount < 0 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>
                          {tx.amount < 0 ? <RotateCcw size={13} /> : <CheckCircle size={13} />}
                        </div>
                        <div>
                          <span className="font-black text-[#1A2E05] block text-xs">
                            {tx.type || (tx.amount < 0 ? 'Refund' : 'Payment')} ({tx.paymentMode || 'Cash'})
                          </span>
                          <span className="text-[9.5px] font-bold text-[#2E4316]">
                            {tx.date} • {tx.time} {tx.notes ? `• ${tx.notes}` : ''}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`font-mono font-black text-xs sm:text-sm ${tx.amount < 0 ? 'text-rose-700' : 'text-emerald-800'}`}>
                          {tx.amount < 0 ? `-₹${formatMoney(Math.abs(tx.amount))}` : `+₹${formatMoney(tx.amount)}`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-4 text-center text-xs font-bold text-[#2E4316]">
                  Initial advance payment recorded with booking. Click "Collect Payment" to add new transaction.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Document Image Lightbox / Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl border border-white/20">
            <div className="flex items-center justify-between p-3.5 bg-[#F5F7F0] border-b border-[#DDE5D0]">
              <span className="font-black text-xs text-[#1A2E05]">{previewDoc.title}</span>
              <button
                onClick={() => setPreviewDoc(null)}
                className="p-1 rounded-lg hover:bg-[#DDE5D0] text-[#1A2E05] transition-all cursor-pointer"
              >
                <ArrowLeft size={16} />
              </button>
            </div>
            <div className="p-4 flex items-center justify-center bg-[#1C2B12]/5 max-h-[70vh] overflow-auto">
              <img
                src={previewDoc.url}
                alt={previewDoc.title}
                className="max-h-[60vh] object-contain rounded-lg shadow-sm"
              />
            </div>
            <div className="p-3 bg-white border-t border-[#DDE5D0] flex justify-end">
              <button
                onClick={() => setPreviewDoc(null)}
                className="px-4 py-1.5 bg-[#1A2E05] text-white rounded-lg text-xs font-bold cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collect Payment Modal */}
      {isPayOpen && (
        <QuickPayModal
          isOpen={isPayOpen}
          onClose={() => setIsPayOpen(false)}
          bill={booking}
          onSave={fetchBooking}
        />
      )}

      {/* Refund Modal */}
      {isRefundOpen && (
        <RefundModal
          isOpen={isRefundOpen}
          onClose={() => setIsRefundOpen(false)}
          bill={booking}
          onSave={fetchBooking}
        />
      )}
    </div>
  );
};

export default GuestBillingDetails;
