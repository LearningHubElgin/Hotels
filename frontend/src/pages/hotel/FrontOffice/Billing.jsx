import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  DollarSign, TrendingUp, Receipt, Search, Filter, Download,
  CreditCard, Globe, ArrowUpRight, X, ChevronRight, ChevronLeft, Loader2, Edit, Trash2, Eye, Calendar, Clock, Wallet, CheckCircle, AlertTriangle, RotateCcw,
  ArrowUp, ArrowDown, ArrowUpDown
} from 'lucide-react';
import api from '../../../services/api';
import { useLocation, useNavigate } from 'react-router-dom';
import jsPDF from 'jspdf';
import { generateTaxInvoice } from '../../../utils/taxInvoiceGenerator';
import { generatePaymentReceipt } from '../../../utils/paymentReceiptGenerator';
import { cleanRoomNumber } from '../../../utils/roomHelper';
import { logoBase64 } from '../../../assets/logoBase64';
import { useAuth } from '../../../context/AuthContext';
import GstCalculator from '../../../components/GstCalculator';
import QuickPayModal from '../../../components/QuickPayModal';



import { getAutoRegNo, getNextAutoRegNo, isRegNoUnique } from '../../../utils/registrationNumberGenerator';

const computeBillBaseAmount = (bill) => {
  const getShiftedBaseForSingle = (b) => {
    let baseVal = Number(b.totalAmount || bill.totalAmount || 0);
    const amtPaid = Number(b.amountPaid || bill.amountPaid || 0);
    const gstOpt = b.gstOption || bill.gstOption || 'none';
    const gstRt = Number(b.gstRate !== undefined && b.gstRate !== null ? b.gstRate : (bill.gstRate !== undefined ? bill.gstRate : 12));

    if (gstOpt === 'inclusive' && amtPaid > baseVal && Math.abs(amtPaid - Math.round(baseVal * (1 + gstRt / 100))) < 1.5) {
      baseVal = amtPaid;
    }

    // For shifted bookings, always recalculate from room rates and days
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

        let prevDays = 0;
        if (shiftDateStr > checkInStr) {
          prevDays = Math.min(totalStayDays - 1, Math.ceil(Math.abs(new Date(shiftDateStr) - cIn) / (1000 * 60 * 60 * 24)));
        }
        const curDays = Math.max(1, totalStayDays - prevDays);

        const prevRateVal = b.previousRoomRate !== undefined && b.previousRoomRate !== null ? b.previousRoomRate : bill.previousRoomRate;
        const prevRatesList = String(prevRateVal || '').split(/→|->|,|>/).map(s => Number(s.trim())).filter(n => !isNaN(n));
        const defaultPrevRate = prevRatesList.length > 0
          ? prevRatesList[0]
          : (b.Room?.pricePerNight ? Number(b.Room.pricePerNight) : (bill.Room?.pricePerNight ? Number(bill.Room.pricePerNight) : 0));
        const curRate = b.Room?.pricePerNight ? Number(b.Room.pricePerNight) : (bill.Room?.pricePerNight ? Number(bill.Room.pricePerNight) : defaultPrevRate);

        const prevRooms = String(prevRoomNum).split(/→|->|,|>/).map(s => cleanRoomNumber(s.trim())).filter(Boolean);
        let prevTotalSum = 0;
        if (prevRooms.length > 0) {
          prevRooms.forEach((rm, idx) => {
            const days = idx === 0 ? prevDays : 0;
            const pRate = prevRatesList[idx] !== undefined ? prevRatesList[idx] : defaultPrevRate;
            prevTotalSum += days * pRate;
          });
        }

        if (b.totalAmount && Number(b.totalAmount) > 0) {
          return Number(b.totalAmount);
        }
        const recalculated = prevTotalSum + (curDays * curRate);
        if (recalculated > 0) return recalculated;
      }
    }

    // No shift or recalculation not possible — use DB value
    return baseVal;
  };

  if (bill.groupBookings && bill.groupBookings.length > 0) {
    return bill.groupBookings.reduce((sum, b) => sum + getShiftedBaseForSingle(b), 0);
  }

  return getShiftedBaseForSingle(bill);
};

const calculateBillGSTAndTotals = (bill, activeHotel) => {
  if (!bill) return { baseAmount: 0, discount: 0, amountPaid: 0, subTotal: 0, roomGstAmount: 0, extraGstAmount: 0, totalGstAmount: 0, grandTotal: 0, pending: 0, extraChargesTotal: 0, gstOption: 'none', gstRate: 0 };
  let isGroup = bill.groupBookings && bill.groupBookings.length > 1;
  let baseAmount = computeBillBaseAmount(bill);
  let discount = Number(bill.discount || 0);
  let amountPaid = Number(bill.amountPaid || 0);
  const gstRate = Number(bill.gstRate !== undefined && bill.gstRate !== null ? bill.gstRate : (activeHotel?.defaultGstRate !== undefined ? Number(activeHotel.defaultGstRate) : 12));
  const gstOption = bill.gstOption || 'none';

  if (isGroup) {
    baseAmount = computeBillBaseAmount(bill);
    discount = bill.groupBookings.reduce((sum, b) => sum + Number(b.discount || 0), 0);
    amountPaid = bill.groupBookings.reduce((sum, b) => sum + Number(b.amountPaid || 0), 0);
  }

  const extraChargesTotal = Number(bill.extraCharges || 0);
  let netRoomTotal = Math.max(0, baseAmount - discount);

  let subTotal = netRoomTotal;
  let roomGstAmount = 0;
  let grandTotal = 0;

  if (gstOption === 'exclusive') {
    subTotal = netRoomTotal;
    roomGstAmount = gstRate > 0 ? Math.round((subTotal * (gstRate / 100)) * 100) / 100 : 0;
    grandTotal = subTotal + roomGstAmount + extraChargesTotal;
    baseAmount = subTotal + discount;
  } else if (gstOption === 'inclusive') {
    grandTotal = netRoomTotal + extraChargesTotal;
    subTotal = gstRate > 0 ? Math.round((netRoomTotal / (1 + gstRate / 100)) * 100) / 100 : netRoomTotal;
    roomGstAmount = Math.round((netRoomTotal - subTotal) * 100) / 100;
    baseAmount = subTotal + discount;
  } else {
    roomGstAmount = 0;
    grandTotal = netRoomTotal + extraChargesTotal;
    subTotal = netRoomTotal;
  }

  let extraGstAmount = 0;
  let extraSubTotal = extraChargesTotal;
  if (bill.extraChargesList && Array.isArray(bill.extraChargesList) && bill.extraChargesList.length > 0) {
    extraGstAmount = bill.extraChargesList.reduce((s, ec) => s + Number(ec.gstAmount || 0), 0);
    const extraSubSum = bill.extraChargesList.reduce((s, ec) => s + Number(ec.subtotal || ec.baseAmount || 0), 0);
    if (extraSubSum > 0) {
      extraSubTotal = extraSubSum;
    } else {
      extraSubTotal = Math.max(0, extraChargesTotal - extraGstAmount);
    }
  } else if (extraChargesTotal > 0 && gstOption !== 'none') {
    extraSubTotal = gstRate > 0 ? (extraChargesTotal / (1 + gstRate / 100)) : extraChargesTotal;
    extraGstAmount = extraChargesTotal - extraSubTotal;
  } else {
    extraSubTotal = extraChargesTotal;
  }

  const pending = grandTotal - amountPaid;

  return {
    baseAmount,
    discount,
    amountPaid,
    subTotal,
    roomGstAmount,
    extraGstAmount,
    extraSubTotal,
    totalGstAmount: roomGstAmount + extraGstAmount,
    grandTotal,
    pending,
    extraChargesTotal,
    gstOption,
    gstRate
  };
};

const StatCard = ({ label, value, subtext, icon: Icon, color, bgColor = 'bg-[#F0F3E8]', trend }) => (
  <div className="bg-white p-3 sm:p-3.5 rounded-2xl border border-[#DDE5D0] shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between h-full group min-w-0">
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <div className={`p-1.5 rounded-xl shrink-0 ${bgColor} ${color} group-hover:scale-105 transition-transform`}>
            <Icon size={15} strokeWidth={2.5} />
          </div>
          <span className="text-[9.5px] sm:text-[10.5px] font-black text-[#4A5E38] uppercase tracking-wider leading-snug break-words" title={label}>
            {label}
          </span>
        </div>
        {trend && (
          <span className="text-[9px] font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-200 shrink-0">
            {trend}
          </span>
        )}
      </div>

      <div className="pt-0.5">
        <span className="text-base sm:text-lg font-black text-[#1A2E05] tracking-tight block truncate">
          {value}
        </span>
      </div>
    </div>

    <div className="mt-1.5 pt-1.5 border-t border-[#DDE5D0]/60 min-h-[32px] flex flex-col justify-center">
      {typeof subtext === 'string' ? (
        <span className="text-[9px] font-bold text-[#7A8A6A] uppercase tracking-wider block truncate">
          {subtext}
        </span>
      ) : (
        subtext
      )}
    </div>
  </div>
);

const EditBillModal = ({ isOpen, onClose, bill, onSave }) => {
  const { activeHotel } = useAuth();
  const isCompleted = bill?.status === 'Completed';
  const isFieldsEditable = !isCompleted || activeHotel?.allowBillingEdit === true;
  const [formData, setFormData] = useState({
    guestName: '', phone: '', email: '', roomId: '',
    checkInDate: '', checkOutDate: '', totalAmount: 0, amountPaid: 0,
    paymentStatus: 'Pending', guestGst: '',
    companyName: '', companyAddress: '',
    hsnCode: activeHotel?.defaultHsnCode || '996311',
    gstRate: activeHotel?.defaultGstRate !== undefined ? Number(activeHotel.defaultGstRate) : 12,
    discount: 0, paymentMode: 'Cash', paymentBank: '', invoiceNumber: '', registrationNumber: '',
    checkInTime: '', checkOutTime: '', groupRoomShifts: [],
    earlyCheckInCharge: 0, chargePreviousDay: false
  });
  const [allRooms, setAllRooms] = useState([]);
  const [isTotalPaidEditable, setIsTotalPaidEditable] = useState(false);
  const [gstOption, setGstOption] = useState('exclusive');
  const [isCustomGst, setIsCustomGst] = useState(false);
  const [paymentHistoryList, setPaymentHistoryList] = useState([]);
  const [editingTxIndex, setEditingTxIndex] = useState(null);
  const [editTxData, setEditTxData] = useState({ amount: '', date: '', time: '', paymentMode: 'Cash', paymentBank: '' });
  const [tempRoomCharges, setTempRoomCharges] = useState('');
  const [extraChargesSum, setExtraChargesSum] = useState(0);
  const [customRoomRates, setCustomRoomRates] = useState({});
  const [lockWarningModal, setLockWarningModal] = useState({ show: false, message: '' });

  const getDays = (checkIn, checkOut) => {
    if (!checkIn || !checkOut) return 1;
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const diffDays = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24));
    return diffDays || 1;
  };

  const calculateMinPastAccruedCharges = () => {
    const isGroup = bill?.groupBookings && bill.groupBookings.length > 1;
    const bookings = isGroup ? bill.groupBookings : [bill];
    if (!bookings || !bookings.length) return 0;

    const todayStr = new Date().toISOString().split('T')[0];
    let totalPastMin = 0;

    bookings.forEach((b, idx) => {
      const startStr = b.checkInDate ? b.checkInDate.split('T')[0] : '';
      const endStr = b.checkOutDate ? b.checkOutDate.split('T')[0] : '';
      if (!startStr || startStr >= todayStr) return;

      let totalDays = 1;
      if (startStr && endStr) {
        totalDays = Math.ceil(Math.abs(new Date(endStr) - new Date(startStr)) / (1000 * 60 * 60 * 24)) || 1;
      }

      const elapsedDays = Math.max(0, Math.ceil(Math.abs(new Date(todayStr) - new Date(startStr)) / (1000 * 60 * 60 * 24)));
      const pastDays = Math.min(totalDays, elapsedDays);

      if (pastDays > 0) {
        const savedEarlyCharge = Number(formData.earlyCheckInCharge || 0);
        const primaryId = bill?.roomId ? Number(bill.roomId) : null;
        const isPrimary = Number(b.id) === Number(bill.id) || Number(b.roomId) === primaryId || idx === 0;
        const earlyDeduction = isPrimary ? savedEarlyCharge : 0;
        const bBase = Number(b.totalAmount || 0) - earlyDeduction;

        const ratePerNight = totalDays > 0 ? (bBase / totalDays) : bBase;

        totalPastMin += (ratePerNight * pastDays);
      }
    });

    return Math.round(totalPastMin * 100) / 100;
  };

  const handleRoomChargesChange = (val) => {
    setCustomRoomRates({});
    setTempRoomCharges(val);
    if (val === '' || val === null || val === undefined) {
      setFormData(prev => ({ ...prev, totalAmount: '' }));
      return;
    }
    const numVal = Number(val);
    if (isNaN(numVal)) return;

    const rate = Number(formData.gstRate !== undefined ? formData.gstRate : (activeHotel?.defaultGstRate !== undefined ? Number(activeHotel.defaultGstRate) : 12));
    const gstIncluded = gstOption === 'inclusive';
    if (gstIncluded) {
      const base = numVal / (1 + rate / 100);
      setFormData(prev => ({ ...prev, totalAmount: base }));
    } else {
      setFormData(prev => ({ ...prev, totalAmount: numVal }));
    }
  };

  useEffect(() => {
    if (isOpen) {
      setIsTotalPaidEditable(false);
      setCustomRoomRates({});
      const defRate = activeHotel?.defaultGstRate !== undefined ? Number(activeHotel.defaultGstRate) : 12;
      setGstOption(activeHotel?.defaultGstOption || 'none');
      setIsCustomGst(![5, 12, 18, 28].includes(defRate));
      api.get('/rooms').then(res => {
        if (res.data?.data) setAllRooms(res.data.data);
      }).catch(() => { });
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && bill) {
      setCustomRoomRates({});
      let isGroup = bill.groupBookings && bill.groupBookings.length > 1;
      let totalAmount = computeBillBaseAmount(bill);
      let amountPaid = bill.amountPaid;
      let discount = bill.discount || 0;

      if (isGroup) {
        amountPaid = bill.groupBookings.reduce((sum, b) => sum + Number(b.amountPaid || 0), 0);
        discount = bill.groupBookings.reduce((sum, b) => sum + Number(b.discount || 0), 0);
      }

      const savedEarlyCharge = Number(bill.earlyCheckInCharge || (isGroup && bill.groupBookings?.[0]?.earlyCheckInCharge ? bill.groupBookings[0].earlyCheckInCharge : 0) || 0);
      const chargePrevDay = !!(bill.chargePreviousDay || (isGroup && bill.groupBookings?.[0]?.chargePreviousDay) || savedEarlyCharge > 0);

      const defaultOption = bill.gstOption || ((bill.gstRate && Number(bill.gstRate) > 0) ? 'exclusive' : (activeHotel?.defaultGstOption || 'none'));
      setGstOption(defaultOption);
      const activeRate = bill.gstRate !== undefined && bill.gstRate !== null
        ? Number(bill.gstRate)
        : (activeHotel?.defaultGstRate !== undefined ? Number(activeHotel.defaultGstRate) : 12);
      setIsCustomGst(![5, 12, 18, 28].includes(activeRate));

      let groupMaxCheckout = bill.checkOutDate;
      if (isGroup && bill.groupBookings?.length > 0) {
        const activeGbs = bill.groupBookings.filter(b => b.status !== 'Completed');
        if (activeGbs.length > 0) {
          groupMaxCheckout = activeGbs.reduce((max, b) => {
            const bOut = b.checkOutDate ? b.checkOutDate.split('T')[0] : '';
            return bOut > max ? bOut : max;
          }, activeGbs[0].checkOutDate ? activeGbs[0].checkOutDate.split('T')[0] : bill.checkOutDate);
        }
      }

      setFormData({
        guestName: bill.guestName,
        phone: bill.phone,
        email: bill.email || '',
        roomId: bill.roomId,
        bookingDate: bill.bookingDate ? bill.bookingDate.split('T')[0] : (bill.createdAt ? bill.createdAt.split('T')[0] : ''),
        bookingTime: bill.bookingTime || (bill.bookingDate?.includes('T') ? bill.bookingDate.split('T')[1] : (bill.createdAt ? new Date(bill.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '12:00')),
        checkInDate: bill.checkInDate,
        checkOutDate: groupMaxCheckout,
        totalAmount: Math.round(Number(totalAmount || 0) * 100) / 100,
        amountPaid: 0,
        paymentStatus: bill.paymentStatus,
        guestGst: bill.guestGst || '',
        companyName: bill.companyName || '',
        companyAddress: bill.companyAddress || '',
        hsnCode: bill.hsnCode || activeHotel?.defaultHsnCode || '996311',
        gstRate: bill.gstRate !== undefined && bill.gstRate !== null ? bill.gstRate : (activeHotel?.defaultGstRate !== undefined ? Number(activeHotel.defaultGstRate) : 12),
        discount: discount,
        paymentMode: bill.paymentMode || 'Cash',
        paymentBank: bill.paymentBank || '',
        invoiceNumber: bill.invoiceNumber
          ? (activeHotel?.invoicePrefix ? bill.invoiceNumber.replace(activeHotel.invoicePrefix, '') : bill.invoiceNumber).trim()
          : '',
        registrationNumber: bill.registrationNumber || '',
        checkInTime: bill.checkInTime || '',
        checkOutTime: bill.checkOutTime || '',
        earlyCheckInCharge: savedEarlyCharge,
        chargePreviousDay: chargePrevDay,
        groupRoomShifts: isGroup ? bill.groupBookings.map(b => {
          const days = getDays(bill.checkInDate, bill.checkOutDate);
          const derivedPrice = Number(b.totalAmount) / days;
          return {
            bookingId: b.id,
            roomId: b.roomId,
            originalRoomId: b.roomId,
            previousRoomNumber: cleanRoomNumber(b.previousRoomNumber),
            roomNumber: cleanRoomNumber(b.Room?.roomNumber),
            fallbackPrice: derivedPrice
          };
        }) : []
      });

      const initGstOpt = bill.gstOption || 'none';
      const initGstRt = Number(bill.gstRate !== undefined ? bill.gstRate : (activeHotel?.defaultGstRate || 12));
      let initBaseAmount = totalAmount ? Number(totalAmount) : 0;
      if (initGstOpt === 'exclusive' && initGstRt > 0 && initBaseAmount > 0) {
        initBaseAmount = initBaseAmount / (1 + initGstRt / 100);
      }
      let initDisplay = initBaseAmount ? String(Math.round(initBaseAmount * 100) / 100) : '';
      setTempRoomCharges(initDisplay);

      let parsed = [];
      try {
        if (bill.paymentHistory) {
          parsed = JSON.parse(bill.paymentHistory);
        }
      } catch (err) {
        console.error("Error parsing payment history", err);
      }
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
          paymentMode: bill.paymentMode || 'Cash'
        }];
      }
      setPaymentHistoryList(parsed);
      setEditingTxIndex(null);

      const fetchExtraCharges = async () => {
        try {
          let bookingIds = [bill.id];
          if (isGroup && bill.groupBookings) {
            bookingIds = bill.groupBookings.map(b => b.id);
          }
          let sumTotal = 0;
          for (const bId of bookingIds) {
            const res = await api.get(`/extra-charges/booking/${bId}`);
            if (res.data?.success) {
              const chargesList = res.data.data || [];
              sumTotal += chargesList.reduce((sum, charge) => sum + Number(charge.grandTotal || 0), 0);
            }
          }
          setExtraChargesSum(sumTotal);
        } catch (err) {
          console.error("Error fetching extra charges for bill:", err);
        }
      };
      fetchExtraCharges();
    }
  }, [isOpen, bill]);

  const handleGroupRoomShift = (bookingId, newRoomId) => {
    setFormData(prev => {
      const newShifts = prev.groupRoomShifts.map(shift =>
        shift.bookingId === bookingId ? { ...shift, roomId: newRoomId } : shift
      );

      const days = getDays(prev.checkInDate, prev.checkOutDate);
      const newTotalAmount = newShifts.reduce((sum, shift) => {
        let price = 0;
        if (String(shift.roomId) === String(shift.originalRoomId)) {
          // Room hasn't changed, use its original derived price
          price = shift.fallbackPrice;
        } else {
          // Room changed, get new price from allRooms
          const room = allRooms.find(r => String(r.id) === String(shift.roomId));
          price = Number(room?.pricePerNight) || shift.fallbackPrice;
        }
        return sum + ((Number(price) || 0) * days);
      }, 0);

      const isInc = gstOption === 'inclusive';
      const rate = Number(formData.gstRate !== undefined ? formData.gstRate : (activeHotel?.defaultGstRate !== undefined ? Number(activeHotel.defaultGstRate) : 12));
      const calcTotal = newTotalAmount > 0 ? newTotalAmount : prev.totalAmount;
      const displayVal = isInc
        ? String(Math.round(Number(calcTotal) * (1 + rate / 100) * 100) / 100)
        : String(Math.round(Number(calcTotal) * 100) / 100);
      setTempRoomCharges(displayVal);

      return {
        ...prev,
        groupRoomShifts: newShifts,
        totalAmount: newTotalAmount > 0 ? newTotalAmount : prev.totalAmount
      };
    });
  };

  const handleSingleRoomShift = (newRoomId) => {
    setFormData(prev => {
      const days = getDays(prev.checkInDate, prev.checkOutDate);
      const room = allRooms.find(r => String(r.id) === String(newRoomId));
      const newTotalAmount = (Number(room?.pricePerNight) || 0) * days;

      const isInc = gstOption === 'inclusive';
      const rate = Number(formData.gstRate !== undefined ? formData.gstRate : (activeHotel?.defaultGstRate !== undefined ? Number(activeHotel.defaultGstRate) : 12));
      const calcTotal = newTotalAmount > 0 ? newTotalAmount : prev.totalAmount;
      const displayVal = String(Math.round(Number(calcTotal) * 100) / 100);
      setTempRoomCharges(displayVal);

      return {
        ...prev,
        roomId: newRoomId,
        totalAmount: newTotalAmount > 0 ? newTotalAmount : prev.totalAmount
      };
    });
  };

  const handleGstOptionChange = (newOption) => {
    if (newOption === gstOption) return;
    setGstOption(newOption);

    const scaleRate = activeHotel?.defaultGstRate !== undefined ? Number(activeHotel.defaultGstRate) : 12;
    const effectiveRate = newOption === 'none' ? 0 : (formData.gstRate === 0 ? scaleRate : formData.gstRate);
    setFormData(prev => ({ ...prev, gstRate: effectiveRate }));
  };

  const handleGstRateChange = (newRate) => {
    const parsedRate = Number(newRate || 0);
    setFormData(prev => {
      let updatedTotal = prev.totalAmount;
      if (gstOption === 'inclusive') {
        const inclusiveAmount = tempRoomCharges ? Number(tempRoomCharges) : (prev.totalAmount ? Number(prev.totalAmount) * (1 + Number(prev.gstRate || 0) / 100) : 0);
        const raw = inclusiveAmount ? (inclusiveAmount / (1 + parsedRate / 100)) : 0;
        updatedTotal = raw ? (Math.round(raw * 100) / 100) : '';
      }
      return {
        ...prev,
        gstRate: newRate,
        totalAmount: updatedTotal
      };
    });
  };

  const bankOptions = activeHotel && activeHotel.onlinePaymentBanks
    ? activeHotel.onlinePaymentBanks.split(',').map(b => b.trim()).filter(Boolean)
    : [];

  if (!isOpen) return null;

  const enteredRoomCharges = Number(tempRoomCharges || formData.totalAmount || 0) || 0;

  const discount = Number(formData.discount || 0);
  const gstRate = Number(formData.gstRate !== undefined ? formData.gstRate : (activeHotel?.defaultGstRate !== undefined ? Number(activeHotel.defaultGstRate) : 12));
  const amountPaidInput = Number(formData.amountPaid || 0);

  let subTotal = 0;
  let gstAmount = 0;
  let grandTotal = 0;

  if (gstOption === 'inclusive') {
    const netInclusive = Math.max(0, enteredRoomCharges - discount);
    subTotal = Math.round((netInclusive / (1 + gstRate / 100)) * 100) / 100;
    gstAmount = Math.round((netInclusive - subTotal) * 100) / 100;
    grandTotal = Math.round((netInclusive + extraChargesSum) * 100) / 100;
  } else if (gstOption === 'exclusive') {
    subTotal = Math.max(0, enteredRoomCharges - discount);
    gstAmount = Math.round((subTotal * (gstRate / 100)) * 100) / 100;
    grandTotal = Math.round((subTotal + gstAmount + extraChargesSum) * 100) / 100;
  } else {
    // none
    subTotal = Math.max(0, enteredRoomCharges - discount);
    gstAmount = 0;
    grandTotal = Math.round((subTotal + extraChargesSum) * 100) / 100;
  }

  let isGroup = bill?.groupBookings && bill.groupBookings.length > 1;
  const previousPaid = paymentHistoryList.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const previousPending = grandTotal - previousPaid;

  const finalPaid = previousPaid + amountPaidInput;

  const livePendingDue = grandTotal - finalPaid;

  const gstIncluded = gstOption === 'inclusive';
  const displayRoomCharges = tempRoomCharges;



  const cleanRate = (rawRate) => {
    return Math.round(rawRate * 100) / 100;
  };

  const getCustomRate = (ratesObj, b, idx) => {
    const keysToTry = [
      b?.id !== undefined && b?.id !== null ? String(b.id) : null,
      b?.roomId !== undefined && b?.roomId !== null ? String(b.roomId) : null,
      String(idx)
    ].filter(Boolean);

    for (const k of keysToTry) {
      if (ratesObj[k] !== undefined && ratesObj[k] !== '') {
        return ratesObj[k];
      }
    }
    return null;
  };

  const handleRoomRateChange = (targetRoomId, newRate) => {
    setCustomRoomRates(prev => {
      const updatedCustom = { ...prev, [String(targetRoomId)]: newRate };

      const bookings = isGroup ? bill.groupBookings : [bill];
      const savedEarlyCharge = Number(formData.earlyCheckInCharge || 0);
      const rateFactor = gstOption === 'inclusive' ? (1 + Number(formData.gstRate || 0) / 100) : 1;
      const earlyBaseDeduction = savedEarlyCharge / rateFactor;
      const primaryId = bill?.roomId ? Number(bill.roomId) : null;

      let totalSum = 0;
      bookings.forEach((b, idx) => {
        const startStr = b.checkInDate ? b.checkInDate.split('T')[0] : '';
        const endStr = b.checkOutDate ? b.checkOutDate.split('T')[0] : '';
        let diffDays = 1;
        if (startStr && endStr) {
          const start = new Date(startStr);
          const end = new Date(endStr);
          diffDays = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)) || 1;
        }

        const prevRoomNum = b.previousRoomNumber || bill?.previousRoomNumber;
        if (prevRoomNum) {
          let shiftDateStr = b.shiftDate || bill?.shiftDate || (b.updatedAt ? b.updatedAt.split('T')[0] : (bill?.updatedAt ? bill.updatedAt.split('T')[0] : ''));
          const todayYMDStr = new Date().toISOString().split('T')[0];

          if (!shiftDateStr || shiftDateStr < startStr || shiftDateStr > endStr) {
            if (todayYMDStr > startStr && todayYMDStr <= endStr) {
              shiftDateStr = todayYMDStr;
            } else {
              const midDays = Math.max(1, Math.floor(diffDays / 2));
              const midDate = new Date(new Date(startStr).getTime() + midDays * 86400000);
              shiftDateStr = midDate.toISOString().split('T')[0];
            }
          }

          let prevDays = 0;
          if (shiftDateStr > startStr) {
            prevDays = Math.min(diffDays - 1, Math.ceil(Math.abs(new Date(shiftDateStr) - new Date(startStr)) / (1000 * 60 * 60 * 24)));
          }
          const curDays = Math.max(1, diffDays - prevDays);

          const prevRoomObj = allRooms.find(r => r.roomNumber === prevRoomNum || r.id === b.previousRoomId);
          const curRoomObj = b.Room || allRooms.find(r => r.id === b.roomId);

          const prevCustom = getCustomRate(updatedCustom, { id: `prev_${b.id || idx}` }, idx);
          const curCustom = getCustomRate(updatedCustom, b, idx);

          let defaultTotal = Number(b.totalAmount || bill.totalAmount || 0);
          if (b.gstOption === 'inclusive' && Number(b.amountPaid || 0) > defaultTotal) {
            defaultTotal = Number(b.amountPaid);
          }

          const prevRateVal = b.previousRoomRate !== undefined && b.previousRoomRate !== null ? b.previousRoomRate : bill?.previousRoomRate;
          const prevRatesList = String(prevRateVal || '').split(/→|->|,|>/).map(s => Number(s.trim())).filter(n => !isNaN(n));
          let basePrevRate = prevRatesList.length > 0
            ? prevRatesList[0]
            : (prevRoomObj?.pricePerNight ? Number(prevRoomObj.pricePerNight) : 0);
          let baseCurRate = curRoomObj?.pricePerNight ? Number(curRoomObj.pricePerNight) : basePrevRate;

          const prevRooms = String(prevRoomNum).split(/\s*(?:→|->|─>|&rarr;|[,\->→])\s*/).map(s => cleanRoomNumber(s.trim())).filter(Boolean);
          if (prevRooms.length > 0) {
            prevRooms.forEach((pRm, pIdx) => {
              const daysForThisRoom = pIdx === 0 ? prevDays : 0;
              const pKey = `prev_${b.id || idx}_${pIdx}`;
              const fallbackP = prevRatesList[pIdx] !== undefined ? prevRatesList[pIdx] : (prevRatesList[0] !== undefined ? prevRatesList[0] : basePrevRate);
              const pRate = updatedCustom[pKey] !== undefined && updatedCustom[pKey] !== ''
                ? Number(updatedCustom[pKey])
                : (prevCustom !== null ? Number(prevCustom) || 0 : fallbackP);
              totalSum += (Number(pRate) || 0) * daysForThisRoom;
            });
          }
          const finalCurRate = curCustom !== null ? (Number(curCustom) || 0) : baseCurRate;
          totalSum += (Number(finalCurRate) || 0) * curDays;
        } else {
          const customVal = getCustomRate(updatedCustom, b, idx);
          let currentRate = 0;
          if (customVal !== null) {
            currentRate = customVal;
          } else {
            const isPrimary = Number(b.id) === Number(bill.id) || Number(b.roomId) === primaryId || idx === 0;
            const earlyDeduction = isPrimary ? earlyBaseDeduction : 0;
            const bBase = Number(b.totalAmount || 0) - earlyDeduction;
            const rawRate = diffDays > 0 ? (bBase / diffDays) : bBase;
            currentRate = cleanRate(rawRate);
          }
          let bRoomDays = diffDays;
          if (b.status === 'Completed' && b.checkInDate && b.checkOutDate) {
            const bStart = new Date(b.checkInDate.split('T')[0]);
            const bEnd = new Date(b.checkOutDate.split('T')[0]);
            const daysDiff = Math.max(1, Math.ceil(Math.abs(bEnd - bStart) / (1000 * 60 * 60 * 24)));
            if (!isNaN(daysDiff)) {
              bRoomDays = daysDiff;
            }
          }
          totalSum += currentRate * bRoomDays;
        }
      });

      const displayVal = String(Math.round(totalSum * 100) / 100);
      setTempRoomCharges(displayVal);
      setFormData(f => ({ ...f, totalAmount: totalSum }));

      return updatedCustom;
    });
  };

  const handleDateChange = (field, value) => {
    setFormData(prev => {
      const updatedForm = { ...prev, [field]: value };
      const startStr = updatedForm.checkInDate ? updatedForm.checkInDate.split('T')[0] : '';
      const endStr = updatedForm.checkOutDate ? updatedForm.checkOutDate.split('T')[0] : '';
      let diffDays = 1;
      if (startStr && endStr) {
        const start = new Date(startStr);
        const end = new Date(endStr);
        diffDays = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)) || 1;
      }

      const bookings = isGroup ? bill.groupBookings : [bill];
      const savedEarlyCharge = Number(prev.earlyCheckInCharge || 0);
      const primaryId = bill?.roomId ? Number(bill.roomId) : null;

      let totalSum = 0;
      bookings.forEach((b, idx) => {
        const customVal = getCustomRate(customRoomRates, b, idx);
        let rate = 0;
        if (customVal !== null) {
          rate = customVal;
        } else {
          const isPrimary = Number(b.id) === Number(bill.id) || Number(b.roomId) === primaryId || idx === 0;
          const earlyDeduction = isPrimary ? savedEarlyCharge : 0;
          let bBase = Number(b.totalAmount || 0) - earlyDeduction;
          const savedGstOpt = formData.gstOption || bill?.gstOption || 'none';
          const savedGstRt = Number(formData.gstRate !== undefined ? formData.gstRate : (bill?.gstRate || 0));
          if (savedGstOpt === 'exclusive' && savedGstRt > 0) {
            bBase = bBase / (1 + savedGstRt / 100);
          }

          const origStart = b.checkInDate ? b.checkInDate.split('T')[0] : '';
          const origEnd = b.checkOutDate ? b.checkOutDate.split('T')[0] : '';
          let origDays = 1;
          if (origStart && origEnd) {
            origDays = Math.ceil(Math.abs(new Date(origEnd) - new Date(origStart)) / (1000 * 60 * 60 * 24)) || 1;
          }

          const rawFaceRate = origDays > 0 ? (bBase / origDays) : bBase;
          rate = cleanRate(rawFaceRate);
        }

        let bRoomDays = diffDays;
        if (b.status === 'Completed' && b.checkInDate && b.checkOutDate) {
          const bStart = new Date(b.checkInDate.split('T')[0]);
          const bEnd = new Date(b.checkOutDate.split('T')[0]);
          const daysDiff = Math.max(1, Math.ceil(Math.abs(bEnd - bStart) / (1000 * 60 * 60 * 24)));
          if (!isNaN(daysDiff)) {
            bRoomDays = daysDiff;
          }
        }
        totalSum += rate * bRoomDays;
      });

      const displayVal = String(Math.round(totalSum * 100) / 100);
      setTempRoomCharges(displayVal);
      return { ...updatedForm, totalAmount: totalSum };
    });
  };

  const roomCalculationDetails = (() => {
    if (!bill) return [];
    const details = [];
    const bookings = isGroup ? bill.groupBookings : [bill];
    const startStr = formData.checkInDate ? formData.checkInDate.split('T')[0] : (bill.checkInDate ? bill.checkInDate.split('T')[0] : '');
    const endStr = formData.checkOutDate ? formData.checkOutDate.split('T')[0] : (bill.checkOutDate ? bill.checkOutDate.split('T')[0] : '');
    let diffDays = 1;
    if (startStr && endStr) {
      const start = new Date(startStr);
      const end = new Date(endStr);
      diffDays = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)) || 1;
    }

    const primaryId = bill?.roomId ? Number(bill.roomId) : null;
    const savedEarlyCharge = Number(formData.earlyCheckInCharge || 0);
    const earlyBaseDeduction = savedEarlyCharge;

    bookings.forEach((b, idx) => {
      const prevRoomNum = b.previousRoomNumber || bill?.previousRoomNumber;
      if (prevRoomNum) {
        let shiftDateStr = b.shiftDate || bill?.shiftDate || (b.updatedAt ? b.updatedAt.split('T')[0] : (bill?.updatedAt ? bill.updatedAt.split('T')[0] : ''));
        const todayYMDStr = new Date().toISOString().split('T')[0];

        if (!shiftDateStr || shiftDateStr < startStr || shiftDateStr > endStr) {
          if (todayYMDStr > startStr && todayYMDStr <= endStr) {
            shiftDateStr = todayYMDStr;
          } else {
            const midDays = Math.max(1, Math.floor(diffDays / 2));
            const midDate = new Date(new Date(startStr).getTime() + midDays * 86400000);
            shiftDateStr = midDate.toISOString().split('T')[0];
          }
        }

        let prevDays = 0;
        if (shiftDateStr > startStr) {
          prevDays = Math.min(diffDays - 1, Math.ceil(Math.abs(new Date(shiftDateStr) - new Date(startStr)) / (1000 * 60 * 60 * 24)));
        }
        const curDays = Math.max(1, diffDays - prevDays);

        const prevRoomObj = allRooms.find(r => r.roomNumber === prevRoomNum || r.id === b.previousRoomId);
        const curRoomObj = b.Room || allRooms.find(r => r.id === b.roomId);

        const prevCustom = getCustomRate(customRoomRates, { id: `prev_${b.id || idx}` }, idx) !== null
          ? getCustomRate(customRoomRates, { id: `prev_${b.id || idx}` }, idx)
          : getCustomRate(customRoomRates, { id: `prev_${b.id || idx}_0` }, idx);
        const curCustom = getCustomRate(customRoomRates, b, idx);

        let defaultTotal = Number(b.totalAmount || bill.totalAmount || 0);
        if (b.gstOption === 'inclusive' && Number(b.amountPaid || 0) > defaultTotal) {
          defaultTotal = Number(b.amountPaid);
        }
        const savedGstOptShift = formData.gstOption || bill?.gstOption || 'none';
        const savedGstRtShift = Number(formData.gstRate !== undefined ? formData.gstRate : (bill?.gstRate || 0));
        if (savedGstOptShift === 'exclusive' && savedGstRtShift > 0) {
          defaultTotal = defaultTotal / (1 + savedGstRtShift / 100);
        }

        const prevRateVal = b.previousRoomRate !== undefined && b.previousRoomRate !== null ? b.previousRoomRate : bill?.previousRoomRate;
        const prevRatesList = String(prevRateVal || '').split(/→|->|,|>/).map(s => Number(s.trim())).filter(n => !isNaN(n));
        let basePrevRate = prevRatesList.length > 0
          ? prevRatesList[0]
          : (prevRoomObj?.pricePerNight ? Number(prevRoomObj.pricePerNight) : 0);
        const prevRoomRateVal = (prevRatesList[0] !== undefined ? prevRatesList[0] : basePrevRate);
        const tempPrevTotal = prevDays > 0 ? (prevRoomRateVal * prevDays) : prevRoomRateVal;
        const derivedCurRate = curDays > 0 && (defaultTotal - tempPrevTotal) > 0
          ? Math.round(((defaultTotal - tempPrevTotal) / curDays) * 100) / 100
          : 0;

        let baseCurRate = derivedCurRate > 0
          ? derivedCurRate
          : (curRoomObj?.pricePerNight ? Number(curRoomObj.pricePerNight) : basePrevRate);

        const finalPrevRate = prevCustom !== null ? prevCustom : basePrevRate;
        const finalCurRate = curCustom !== null ? curCustom : baseCurRate;

        const prevType = b.previousRoomType || prevRoomObj?.type || curRoomObj?.type || 'Deluxe';

        const prevRooms = String(prevRoomNum).split(/→|->|,|>/).map(s => cleanRoomNumber(s.trim())).filter(Boolean);
        if (prevRooms.length > 0) {
          prevRooms.forEach((pRm, pIdx) => {
            const daysForThisRoom = pIdx === 0 ? prevDays : 0;
            const pKey = `prev_${b.id || idx}_${pIdx}`;
            const fallbackP = prevRatesList[pIdx] !== undefined ? prevRatesList[pIdx] : (prevRatesList[0] !== undefined ? prevRatesList[0] : finalPrevRate);
            const rawVal = customRoomRates[pKey] !== undefined
              ? customRoomRates[pKey]
              : (customRoomRates[`prev_${b.id || idx}`] !== undefined ? customRoomRates[`prev_${b.id || idx}`] : fallbackP);
            const pRate = rawVal;
            const pNum = Number(rawVal) || 0;
            const pTotal = daysForThisRoom > 0 ? (Math.round(pNum * daysForThisRoom * 100) / 100) : pNum;
            const pRoomObj = allRooms.find(r => r.roomNumber === pRm);
            details.push({
              roomId: pKey,
              roomNumber: `${pRm} (Prev)`,
              type: pRoomObj?.type || prevType,
              rate: pRate,
              days: daysForThisRoom,
              total: pTotal,
              isShiftedPrevious: true,
              isSameDayShift: daysForThisRoom === 0
            });
          });
        }

        const curKey = b.id || b.roomId || idx;
        const curRawVal = customRoomRates[curKey] !== undefined
          ? customRoomRates[curKey]
          : finalCurRate;
        const curRate = curRawVal;
        const curNum = Number(curRawVal) || 0;
        const curTotal = Math.round(curNum * curDays * 100) / 100;

        details.push({
          roomId: curKey,
          roomNumber: cleanRoomNumber(curRoomObj?.roomNumber || b.roomNumber),
          type: curRoomObj?.type || b.type || 'Deluxe',
          rate: curRate,
          days: curDays,
          total: curTotal
        });
      } else {
        const customVal = getCustomRate(customRoomRates, b, idx);
        let roundedRate = 0;
        if (customVal !== null) {
          roundedRate = customVal;
        } else {
          const isPrimary = Number(b.id) === Number(bill.id) || Number(b.roomId) === primaryId || idx === 0;
          const earlyDeduction = isPrimary ? earlyBaseDeduction : 0;
          let bBase = Number(b.totalAmount || 0) - earlyDeduction;

          const savedGstOptDetails = formData.gstOption || bill?.gstOption || 'none';
          const savedGstRtDetails = Number(formData.gstRate !== undefined ? formData.gstRate : (bill?.gstRate || 0));
          if (savedGstOptDetails === 'exclusive' && savedGstRtDetails > 0) {
            bBase = bBase / (1 + savedGstRtDetails / 100);
          }

          const origStart = b.checkInDate ? b.checkInDate.split('T')[0] : '';
          const origEnd = b.checkOutDate ? b.checkOutDate.split('T')[0] : '';
          let origDays = 1;
          if (origStart && origEnd) {
            origDays = Math.ceil(Math.abs(new Date(origEnd) - new Date(origStart)) / (1000 * 60 * 60 * 24)) || 1;
          }

          const rawRate = origDays > 0 ? (bBase / origDays) : bBase;
          roundedRate = cleanRate(rawRate);
        }

        let roomDays = diffDays;
        if (b.checkInDate && b.checkOutDate) {
          const bStart = new Date(b.checkInDate.split('T')[0]);
          const bEnd = new Date(b.checkOutDate.split('T')[0]);
          const daysDiff = Math.max(1, Math.ceil(Math.abs(bEnd - bStart) / (1000 * 60 * 60 * 24)));
          if (!isNaN(daysDiff)) {
            roomDays = daysDiff;
          }
        }

        details.push({
          roomId: b.id || b.roomId || idx,
          roomNumber: cleanRoomNumber(b.Room?.roomNumber || b.roomNumber),
          type: b.Room?.type || b.roomType || '',
          rate: roundedRate,
          days: roomDays,
          total: Math.round((Number(roundedRate) || 0) * roomDays * 100) / 100
        });
      }
    });
    return details;
  })();

  let parsedHistory = paymentHistoryList;

  const startEditTx = (index, item) => {
    setEditingTxIndex(index);
    setEditTxData({
      amount: item.amount,
      date: item.date,
      time: item.time || '',
      paymentMode: item.paymentMode || 'Cash',
      paymentBank: item.paymentBank || ''
    });
  };

  const saveTxEdit = (index) => {
    setPaymentHistoryList(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        amount: Number(editTxData.amount || 0),
        date: editTxData.date,
        time: editTxData.time,
        paymentMode: editTxData.paymentMode,
        paymentBank: editTxData.paymentMode === 'Online' ? editTxData.paymentBank : null
      };
      return updated;
    });
    setEditingTxIndex(null);
  };

  const deleteTx = (index) => {
    if (window.confirm("Are you sure you want to delete this transaction record?")) {
      setPaymentHistoryList(prev => prev.filter((_, i) => i !== index));
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <style>{`
        input[type="date"]::-webkit-calendar-picker-indicator,
        input[type="time"]::-webkit-calendar-picker-indicator {
          background: transparent;
          bottom: 0;
          color: transparent;
          cursor: pointer;
          height: auto;
          left: 0;
          position: absolute;
          right: 0;
          top: 0;
          width: auto;
        }
      `}</style>
      <div className="bg-white w-full sm:max-w-5xl lg:max-w-[1150px] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-slide-up">
        {/* Header */}
        <div className="py-3.5 px-6 border-b border-[#DDE5D0] flex items-center justify-between shrink-0">
          <div className="flex flex-col">
            <h2 className="text-base sm:text-lg font-bold text-[#1A2E05]">Edit Guest Billing</h2>
            <span className={`text-[11px] font-bold uppercase tracking-wider mt-0.5 ${isFieldsEditable ? 'text-[#84A63C]' : 'text-orange-600'}`}>
              {isFieldsEditable ? 'All Guest & Billing fields are Editable' : 'Only Corporate / GST Details are Editable'}
            </span>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[#F0F3E8] rounded-lg text-[#7A8A6A] hover:text-[#1A2E05] transition-colors"><X size={18} /></button>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 sm:p-5 overflow-y-auto no-scrollbar flex-1 bg-[#F5F7F0]/30">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">

            {/* Left Column: Billing Details */}
            <div className="space-y-4">

              {/* Card 1: Guest & Stay Details */}
              <div className="bg-[#F5F7F0]/70 border border-[#DDE5D0] rounded-xl p-3.5 sm:p-4 space-y-3 shadow-sm">
                <div className="flex items-center gap-2 border-b border-[#DDE5D0]/40 pb-1.5">
                  <span className="text-[10px] font-black text-[#84A63C] uppercase tracking-wider">1. Guest & Stay Details</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-0.5 sm:col-span-2">
                    <label className="text-[10px] font-black text-[#4A5E38] uppercase tracking-wider block mb-0.5">Guest Name</label>
                    <input
                      value={formData.guestName}
                      disabled={!isFieldsEditable}
                      onChange={(e) => setFormData(prev => ({ ...prev, guestName: e.target.value }))}
                      className={`w-full px-2.5 py-1.5 border rounded-lg text-xs font-bold focus:outline-none ${!isFieldsEditable
                        ? 'bg-[#F5F7F0]/40 text-[#7A8A6A] border-[#DDE5D0] cursor-not-allowed'
                        : 'bg-[#FBFDF8] border-[#DDE5D0] text-[#1A2E05] focus:border-[#84A63C]'
                        }`}
                    />
                  </div>
                  <div className="space-y-0.5">
                    <label className="text-[10px] font-black text-[#4A5E38] uppercase tracking-wider block mb-0.5">Booking Date</label>
                    <div className="relative">
                      <input
                        type="date"
                        value={formData.bookingDate || ''}
                        disabled={!isFieldsEditable}
                        onChange={(e) => setFormData(prev => ({ ...prev, bookingDate: e.target.value }))}
                        className={`w-full pl-2.5 pr-7 py-1.5 border rounded-lg text-xs font-bold focus:outline-none ${!isFieldsEditable
                          ? 'bg-[#F5F7F0]/40 text-[#7A8A6A] border-[#DDE5D0] cursor-not-allowed'
                          : 'bg-[#FBFDF8] border-[#DDE5D0] text-[#1A2E05] focus:border-[#84A63C]'
                          }`}
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[#7A8A6A]">
                        <Calendar size={13} />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <label className="text-[10px] font-black text-[#4A5E38] uppercase tracking-wider block mb-0.5">Booking Time</label>
                    <div className="relative">
                      <input
                        type="time"
                        value={formData.bookingTime || ''}
                        disabled={!isFieldsEditable}
                        onChange={(e) => setFormData(prev => ({ ...prev, bookingTime: e.target.value }))}
                        className={`w-full pl-2.5 pr-7 py-1.5 border rounded-lg text-xs font-bold focus:outline-none ${!isFieldsEditable
                          ? 'bg-[#F5F7F0]/40 text-[#7A8A6A] border-[#DDE5D0] cursor-not-allowed'
                          : 'bg-[#FBFDF8] border-[#DDE5D0] text-[#1A2E05] focus:border-[#84A63C]'
                          }`}
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[#7A8A6A]">
                        <Clock size={13} />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <label className="text-[10px] font-black text-[#4A5E38] uppercase tracking-wider block mb-0.5">Check-in Date</label>
                    <div className="relative">
                      <input
                        type="date"
                        value={formData.checkInDate}
                        disabled={!isFieldsEditable}
                        onChange={(e) => handleDateChange('checkInDate', e.target.value)}
                        className={`w-full pl-2.5 pr-7 py-1.5 border rounded-lg text-xs font-bold focus:outline-none ${!isFieldsEditable
                          ? 'bg-[#F5F7F0]/40 text-[#7A8A6A] border-[#DDE5D0] cursor-not-allowed'
                          : 'bg-[#FBFDF8] border-[#DDE5D0] text-[#1A2E05] focus:border-[#84A63C]'
                          }`}
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[#7A8A6A]">
                        <Calendar size={13} />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <label className="text-[10px] font-black text-[#4A5E38] uppercase tracking-wider block mb-0.5">Arrive Time</label>
                    <div className="relative">
                      <input
                        type="time"
                        value={formData.checkInTime}
                        disabled={!isFieldsEditable}
                        onChange={(e) => setFormData(prev => ({ ...prev, checkInTime: e.target.value }))}
                        className={`w-full pl-2.5 pr-7 py-1.5 border rounded-lg text-xs font-bold focus:outline-none ${!isFieldsEditable
                          ? 'bg-[#F5F7F0]/40 text-[#7A8A6A] border-[#DDE5D0] cursor-not-allowed'
                          : 'bg-[#FBFDF8] border-[#DDE5D0] text-[#1A2E05] focus:border-[#84A63C]'
                          }`}
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[#7A8A6A]">
                        <Clock size={13} />
                      </div>
                    </div>
                    <span className="text-[9px] text-[#7A8A6A] font-bold block mt-0.5">Default from booking time if empty</span>
                  </div>
                  <div className="space-y-0.5">
                    <label className="text-[10px] font-black text-[#4A5E38] uppercase tracking-wider block mb-0.5">Check-out Date</label>
                    <div className="relative">
                      <input
                        type="date"
                        value={formData.checkOutDate}
                        disabled={!isFieldsEditable}
                        onChange={(e) => handleDateChange('checkOutDate', e.target.value)}
                        className={`w-full pl-2.5 pr-7 py-1.5 border rounded-lg text-xs font-bold focus:outline-none ${!isFieldsEditable
                          ? 'bg-[#F5F7F0]/40 text-[#7A8A6A] border-[#DDE5D0] cursor-not-allowed'
                          : 'bg-[#FBFDF8] border-[#DDE5D0] text-[#1A2E05] focus:border-[#84A63C]'
                          }`}
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[#7A8A6A]">
                        <Calendar size={13} />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <label className="text-[10px] font-black text-[#4A5E38] uppercase tracking-wider block mb-0.5">Depart Time</label>
                    <div className="relative">
                      <input
                        type="time"
                        value={formData.checkOutTime}
                        disabled={!isFieldsEditable}
                        onChange={(e) => setFormData(prev => ({ ...prev, checkOutTime: e.target.value }))}
                        className={`w-full pl-2.5 pr-7 py-1.5 border rounded-lg text-xs font-bold focus:outline-none ${!isFieldsEditable
                          ? 'bg-[#F5F7F0]/40 text-[#7A8A6A] border-[#DDE5D0] cursor-not-allowed'
                          : 'bg-[#FBFDF8] border-[#DDE5D0] text-[#1A2E05] focus:border-[#84A63C]'
                          }`}
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[#7A8A6A]">
                        <Clock size={13} />
                      </div>
                    </div>
                    <span className="text-[9px] text-[#7A8A6A] font-bold block mt-0.5">Default from checkout time if empty</span>
                  </div>
                </div>
              </div>

              {/* Card 2: Room Assignment */}
              <div className="bg-[#F5F7F0]/70 border border-[#DDE5D0] rounded-xl p-3.5 sm:p-4 space-y-3 shadow-sm">
                <div className="flex items-center gap-2 border-b border-[#DDE5D0]/40 pb-1.5">
                  <span className="text-[10px] font-black text-[#84A63C] uppercase tracking-wider">2. Room Assignment</span>
                </div>
                <div className="space-y-0.5">
                  <label className="text-[10px] font-black text-[#4A5E38] uppercase tracking-wider block mb-0.5">
                    {isGroup ? 'Shift Rooms (Group)' : 'Shift Room'}
                    {bill?.previousRoomNumber && !isGroup && <span className="text-orange-500 text-[10px] font-bold"> (Prev: Room {cleanRoomNumber(bill.previousRoomNumber)})</span>}
                  </label>
                  {isGroup ? (
                    <div className="space-y-2">
                      {formData.groupRoomShifts?.map(shift => (
                        <div key={shift.bookingId} className="flex items-center gap-2.5">
                          <span className="text-[11px] font-black text-[#7A8A6A] w-24 shrink-0 whitespace-nowrap">
                            Room {cleanRoomNumber(shift.roomNumber)} {shift.previousRoomNumber ? `(Prev: ${cleanRoomNumber(shift.previousRoomNumber)})` : ''}
                          </span>
                          <select
                            value={shift.roomId}
                            disabled={!isFieldsEditable}
                            onChange={(e) => handleGroupRoomShift(shift.bookingId, e.target.value)}
                            className={`w-full px-3 py-2 border rounded-lg text-xs sm:text-sm font-bold focus:outline-none ${!isFieldsEditable
                              ? 'bg-[#F5F7F0]/40 text-[#7A8A6A] border-[#DDE5D0] cursor-not-allowed'
                              : 'bg-[#FBFDF8] border-[#DDE5D0] text-[#1A2E05] focus:border-[#84A63C]'
                              }`}
                          >
                            {allRooms.map(r => (
                              <option key={r.id} value={r.id}>Room {r.roomNumber} - {r.type} ({r.status === 'available' ? '✅ Available' : r.id === shift.originalRoomId ? '🔵 Current' : '🔴 Occupied'})</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <select
                      value={formData.roomId}
                      disabled={!isFieldsEditable}
                      onChange={(e) => handleSingleRoomShift(e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg text-xs sm:text-sm font-bold focus:outline-none ${!isFieldsEditable
                        ? 'bg-[#F5F7F0]/40 text-[#7A8A6A] border-[#DDE5D0] cursor-not-allowed'
                        : 'bg-[#FBFDF8] border-[#DDE5D0] text-[#1A2E05] focus:border-[#84A63C]'
                        }`}
                    >
                      {allRooms.map(r => (
                        <option key={r.id} value={r.id}>Room {r.roomNumber} - {r.type} ({r.status === 'available' ? '✅ Available' : r.id === bill?.roomId ? '🔵 Current' : '🔴 Occupied'})</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Card 3: Billing & Payments */}
              <div className="bg-[#F5F7F0]/70 border border-[#DDE5D0] rounded-xl p-4 sm:p-5 space-y-3.5 shadow-sm">
                <div className="flex items-center gap-2 border-b border-[#DDE5D0]/40 pb-1.5">
                  <span className="text-[11px] font-black text-[#84A63C] uppercase tracking-wider">3. Billing & Payments</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-[11px] font-black text-[#4A5E38] uppercase tracking-wider block mb-0.5">
                      Room Charges (Rs) {gstIncluded ? '(GST Inclusive)' : '(GST Exclusive)'}
                    </label>
                    <input
                      type="number"
                      step="any"
                      disabled={!isFieldsEditable}
                      value={tempRoomCharges}
                      onChange={(e) => handleRoomChargesChange(e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg text-xs sm:text-sm font-bold focus:outline-none ${!isFieldsEditable
                        ? 'bg-[#F5F7F0]/40 text-[#7A8A6A] border-[#DDE5D0] cursor-not-allowed'
                        : 'bg-[#FBFDF8] border-[#DDE5D0] text-[#1A2E05] focus:border-[#84A63C]'
                        }`}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-[11px] font-bold block text-[#5C7A1F] leading-relaxed bg-[#E8F0D5] p-3 rounded-lg border border-[#DDE5D0]">
                      <div className="flex flex-col sm:flex-row sm:justify-between gap-1.5 sm:gap-4">
                        <span>Total Amount: <strong className="text-emerald-700 text-xs sm:text-sm">₹{grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                        <span>
                          {Number(formData.amountPaid || 0) !== 0 ? (
                            <>Total Paid: <strong className="text-xs sm:text-sm">₹{(previousPaid + Number(formData.amountPaid || 0)).toLocaleString()}</strong></>
                          ) : (
                            <>Total Paid: <strong className="text-xs sm:text-sm">₹{previousPaid.toLocaleString()}</strong></>
                          )}
                        </span>
                        <span>Pending Due: <strong className="text-red-700 text-xs sm:text-sm">₹{livePendingDue <= 0.1 ? '0.00' : livePendingDue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                      </div>
                    </span>
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-[11px] font-black text-[#4A5E38] uppercase tracking-wider block mb-0.5">Discount Amount (Rs)</label>
                    <input
                      type="number"
                      step="any"
                      disabled={!isFieldsEditable}
                      value={formData.discount}
                      onChange={(e) => setFormData(prev => ({ ...prev, discount: e.target.value }))}
                      className={`w-full px-3 py-2 border rounded-lg text-xs sm:text-sm font-bold focus:outline-none ${!isFieldsEditable
                        ? 'bg-[#F5F7F0]/40 text-[#7A8A6A] border-[#DDE5D0] cursor-not-allowed'
                        : 'bg-[#FBFDF8] border-[#DDE5D0] text-[#1A2E05] focus:border-[#84A63C]'
                        }`}
                    />
                  </div>
                  {/* Removed payment collection fields from edit billing modal */}
                </div>
              </div>

            </div>

            {/* Right Column: GST Calculator & Live Summary */}
            <div className="space-y-4 lg:sticky lg:top-0">
              <GstCalculator
                gstOption={gstOption}
                gstRate={gstRate}
                isCustomGst={isCustomGst}
                handleGstOptionChange={handleGstOptionChange}
                handleGstRateChange={handleGstRateChange}
                setIsCustomGst={setIsCustomGst}
                subTotal={subTotal}
                gstAmount={gstAmount}
                grandTotal={grandTotal}
                guestGst={formData.guestGst}
                companyName={formData.companyName}
                companyAddress={formData.companyAddress}
                onFieldChange={(e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))}
                className="bg-[#F5F7F0]/70 border border-[#DDE5D0] rounded-xl p-4 sm:p-5 space-y-3.5 shadow-sm animate-fade-in"
                disabled={!isFieldsEditable}
                corporateFieldsDisabled={false}
                extraCharges={extraChargesSum}
                roomCalculationDetails={roomCalculationDetails}
                onRoomRateChange={isFieldsEditable ? handleRoomRateChange : undefined}
                chargePreviousDay={Boolean(formData.chargePreviousDay && Number(formData.earlyCheckInCharge || 0) > 0)}
                earlyCheckInCharge={formData.earlyCheckInCharge || 0}
                onEarlyCheckInChargeChange={isFieldsEditable ? (val) => setFormData(prev => ({ ...prev, earlyCheckInCharge: val })) : undefined}
                discount={Number(formData.discount || 0)}
              />

              {/* Card 4: Tax & Invoice Details */}
              <div className="bg-[#F5F7F0]/70 border border-[#DDE5D0] rounded-xl p-4 sm:p-5 space-y-3.5 shadow-sm">
                <div className="flex items-center gap-2 border-b border-[#DDE5D0]/40 pb-1.5">
                  <span className="text-[11px] font-black text-[#84A63C] uppercase tracking-wider">4. Tax & Invoice Details</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {activeHotel?.enableRegistrationNumber === true && (
                    <div className="space-y-1">
                      <label className="text-[11px] font-black text-[#4A5E38] uppercase tracking-wider block mb-0.5">Registration Number</label>
                      <input
                        placeholder="REG-001"
                        value={formData.registrationNumber}
                        disabled={!isFieldsEditable}
                        onChange={(e) => setFormData(prev => ({ ...prev, registrationNumber: e.target.value }))}
                        className={`w-full px-3 py-2 border rounded-lg text-xs sm:text-sm font-bold focus:outline-none ${!isFieldsEditable
                          ? 'bg-[#F5F7F0]/40 text-[#7A8A6A] border-[#DDE5D0] cursor-not-allowed'
                          : 'bg-[#FBFDF8] border-[#DDE5D0] text-[#1A2E05] focus:border-[#84A63C]'
                          }`}
                      />
                    </div>
                  )}
                  <div className="space-y-1">
                    <label className="text-[11px] font-black text-[#4A5E38] uppercase tracking-wider block mb-0.5">Invoice Number</label>
                    <div className={`flex items-center w-full px-3 py-2 border rounded-lg text-xs sm:text-sm font-bold ${!isFieldsEditable
                      ? 'bg-[#F5F7F0]/40 text-[#7A8A6A] border-[#DDE5D0] cursor-not-allowed'
                      : 'bg-[#FBFDF8] border-[#DDE5D0] text-[#1A2E05]'
                      }`}>
                      <span className="text-[#7A8A6A] pr-1.5 select-none font-bold whitespace-nowrap text-xs">{activeHotel?.invoicePrefix || ''}</span>
                      <input
                        placeholder="000"
                        value={formData.invoiceNumber}
                        disabled={!isFieldsEditable}
                        onChange={(e) => setFormData(prev => ({ ...prev, invoiceNumber: e.target.value }))}
                        className={`w-full focus:outline-none font-bold bg-transparent text-xs sm:text-sm ${!isFieldsEditable ? 'text-[#7A8A6A] cursor-not-allowed' : 'text-[#1A2E05]'
                          }`}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-black text-[#4A5E38] uppercase tracking-wider block mb-0.5">HSN/SAC Code</label>
                    <input
                      value={formData.hsnCode}
                      disabled={!isFieldsEditable}
                      onChange={(e) => setFormData(prev => ({ ...prev, hsnCode: e.target.value }))}
                      className={`w-full px-3 py-2 border rounded-lg text-xs sm:text-sm font-bold focus:outline-none ${!isFieldsEditable
                        ? 'bg-[#F5F7F0]/40 text-[#7A8A6A] border-[#DDE5D0] cursor-not-allowed'
                        : 'bg-[#FBFDF8] border-[#DDE5D0] text-[#1A2E05] focus:border-[#84A63C]'
                        }`}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sticky Footer */}
        <div className="px-6 py-4 bg-white border-t border-[#DDE5D0] flex gap-4 shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-bold text-[#7A8A6A] hover:bg-[#F0F3E8] hover:text-[#1A2E05] transition-all rounded-lg border border-[#DDE5D0]">Cancel</button>
          <button
            onClick={() => {
              if (activeHotel?.lockPastStayCharges) {
                const minPast = calculateMinPastAccruedCharges();
                const currentProposedRoomCharges = Number(tempRoomCharges || 0);
                if (minPast > 0 && currentProposedRoomCharges < minPast) {
                  setLockWarningModal({
                    show: true,
                    message: `Action Restricted: Lock Past Stay Charges is enabled for this hotel. You cannot reduce or modify charges accrued for past completed stay days (minimum ₹${minPast.toFixed(2)}).`
                  });
                  return;
                }
              }

              let existingHistory = [...paymentHistoryList];
              const addedAmt = Number(formData.amountPaid || 0);
              let updatedHistory = [...existingHistory];
              if (addedAmt !== 0) {
                const today = new Date();
                const currentDate = today.toLocaleDateString('en-GB').replace(/\//g, '-');
                const currentTime = today.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

                updatedHistory.push({
                  amount: addedAmt,
                  date: currentDate,
                  time: currentTime,
                  paymentMode: formData.paymentMode,
                  paymentBank: formData.paymentMode === 'Online' ? formData.paymentBank : null
                });
              }

              const savedTotalAmount = Math.max(0, Number(enteredRoomCharges || 0));

              const calculatedPaymentStatus = livePendingDue <= 0.1
                ? 'Paid'
                : (finalPaid > 0 ? 'Partial' : 'Pending');

              const finalDiscount = formData.discount === '' || formData.discount === null ? 0 : Number(formData.discount);
              const cleanTotalAmount = savedTotalAmount === '' || savedTotalAmount === null ? 0 : Number(savedTotalAmount);

              const finalPrefix = activeHotel?.invoicePrefix || '';
              let cleanInvInput = (formData.invoiceNumber || '').trim();
              if (finalPrefix && cleanInvInput.startsWith(finalPrefix)) {
                cleanInvInput = cleanInvInput.substring(finalPrefix.length);
              }
              const prefixTrimmed = finalPrefix.trim();
              if (prefixTrimmed && cleanInvInput.startsWith(prefixTrimmed)) {
                cleanInvInput = cleanInvInput.substring(prefixTrimmed.length);
              }
              const cleanRegNo = (formData.registrationNumber || '').trim();
              const finalRegistrationNumber = cleanRegNo !== '' ? cleanRegNo : getAutoRegNo(bill);
              const finalInvoiceNumber = cleanInvInput !== '' ? `${finalPrefix}${cleanInvInput}` : null;

              const bookings = isGroup ? bill.groupBookings : [bill];
              const savedEarlyCharge = Number(formData.earlyCheckInCharge || 0);
              const rateFactor = gstOption === 'inclusive' ? (1 + Number(formData.gstRate || 0) / 100) : 1;
              const earlyBaseDeduction = savedEarlyCharge / rateFactor;
              const primaryId = bill?.roomId ? Number(bill.roomId) : null;

              const individualRoomTotals = bookings.map((b, idx) => {
                const startStr = b.checkInDate ? b.checkInDate.split('T')[0] : '';
                const endStr = b.checkOutDate ? b.checkOutDate.split('T')[0] : '';
                let diffDays = 1;
                if (startStr && endStr) {
                  const start = new Date(startStr);
                  const end = new Date(endStr);
                  diffDays = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)) || 1;
                }
                const customVal = getCustomRate(customRoomRates, b, idx);
                let rate = 0;
                if (customVal !== null) {
                  rate = Number(customVal) || 0;
                } else {
                  const isPrimary = Number(b.id) === Number(bill.id) || Number(b.roomId) === primaryId || idx === 0;
                  const earlyDeduction = isPrimary ? earlyBaseDeduction : 0;
                  const bBase = Number(b.totalAmount || 0) - earlyDeduction;
                  const rawRate = diffDays > 0 ? (bBase / diffDays) * rateFactor : bBase * rateFactor;
                  rate = cleanRate(rawRate);
                }
                const roomIncOrExcTotal = rate * diffDays;
                const roomBaseTotal = gstOption === 'inclusive' ? roomIncOrExcTotal / rateFactor : roomIncOrExcTotal;
                const isPrimary = Number(b.id) === Number(bill.id) || Number(b.roomId) === primaryId || idx === 0;
                const finalRoomBase = isPrimary ? roomBaseTotal + earlyBaseDeduction : roomBaseTotal;

                return {
                  bookingId: b.id,
                  baseTotal: finalRoomBase
                };
              });

              onSave(bill.id, {
                ...formData,
                individualRoomTotals: individualRoomTotals,
                gstOption: gstOption,
                invoiceNumber: finalInvoiceNumber,
                registrationNumber: finalRegistrationNumber,
                discount: finalDiscount,
                totalAmount: cleanTotalAmount,
                amountPaid: finalPaid,
                paymentStatus: calculatedPaymentStatus,
                paymentBank: formData.paymentMode === 'Online' ? formData.paymentBank : null,
                paymentHistory: JSON.stringify(updatedHistory),
                previousRoomRate: (() => {
                  if (roomCalculationDetails && roomCalculationDetails.length > 0) {
                    const prevItems = roomCalculationDetails.filter(item => item.isShiftedPrevious);
                    if (prevItems.length > 0) {
                      return prevItems.map(item => (item.rate !== undefined && item.rate !== null && item.rate !== '') ? item.rate : 0).join(' → ');
                    }
                  }
                  return bill?.previousRoomRate;
                })(),
                earlyCheckInCharge: Number(formData.earlyCheckInCharge || 0),
                chargePreviousDay: formData.chargePreviousDay || Number(formData.earlyCheckInCharge || 0) > 0
              });
            }}
            className="flex-[2] py-2.5 bg-[#84A63C] text-white rounded-lg text-sm font-bold hover:opacity-90 shadow-md flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
          >
            Update & Save
          </button>
        </div>
      </div>

      {lockWarningModal.show && (
        <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4">
          <div className="bg-white border border-[#DDE5D0] rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h3 className="font-extrabold text-[#1A2E05] text-base">Past Stay Amount Locked</h3>
              <p className="text-xs text-[#7A8A6A] font-semibold mt-1">
                {lockWarningModal.message || "You cannot change past stay amounts."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setLockWarningModal({ show: false, message: '' })}
              className="w-full py-2.5 bg-[#84A63C] hover:bg-[#729231] text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-[#84A63C]/20"
            >
              Understood
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
};

const pdfPreviewCache = new Map();

const ViewBillModal = ({ isOpen, onClose, bill, onDownload }) => {
  const [pdfUrl, setPdfUrl] = useState(null);
  const { activeHotel } = useAuth();

  useEffect(() => {
    let isMounted = true;
    if (isOpen && bill) {
      document.body.style.overflow = 'hidden';
      const renderPreview = async () => {
        try {
          const pdfBlob = await generateTaxInvoice(bill, 'blob');
          const url = URL.createObjectURL(pdfBlob);
          if (isMounted) setPdfUrl(url);
        } catch (err) {
          console.error("Error generating preview PDF:", err);
        }
      };
      renderPreview();
    } else {
      document.body.style.overflow = 'unset';
      setPdfUrl(null);
    }
    return () => {
      isMounted = false;
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, bill]);

  if (!isOpen || !bill) return null;

  const prefix = activeHotel?.invoicePrefix || '';
  const formattedInvoiceNo = bill.invoiceNumber
    ? (prefix ? bill.invoiceNumber.replace(prefix, '') : bill.invoiceNumber)
    : (bill.id ? String(bill.id).substring(0, 6).toUpperCase() : '000000');

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center p-4 bg-black/85 backdrop-blur-sm overflow-hidden animate-fade-in">

      {/* Floating Close Button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-[10000] p-3 bg-white/10 hover:bg-white/20 text-white hover:text-red-500 rounded-full transition-all duration-300 active:scale-95 shadow-xl border border-white/10"
        title="Close Preview"
      >
        <X size={24} />
      </button>

      {/* Document View Workspace */}
      <div className="w-full h-full max-w-5xl bg-white shadow-2xl rounded-2xl overflow-hidden border border-white/10">
        {pdfUrl ? (
          <iframe
            src={pdfUrl}
            className="w-full h-full"
            title="Invoice PDF"
          />
        ) : (
          <div className="flex flex-col items-center gap-3 text-white justify-center h-full">
            <Loader2 className="animate-spin text-[#84A63C]" size={40} />
            <p className="text-sm font-bold">Generating PDF Preview...</p>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

// QuickPayModal is imported from components/QuickPayModal.jsx

const RefundModal = ({ isOpen, onClose, bill, onSave }) => {
  const { activeHotel } = useAuth();
  const [refundMode, setRefundMode] = useState('Cash');
  const [refundBank, setRefundBank] = useState('');

  const banksList = activeHotel && activeHotel.onlinePaymentBanks
    ? activeHotel.onlinePaymentBanks.split(',').map(b => b.trim()).filter(Boolean)
    : [];

  useEffect(() => {
    if (isOpen && bill) {
      document.body.style.overflow = 'hidden';
      setRefundMode('Cash');
      setRefundBank(banksList[0] || '');
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, bill]);

  if (!isOpen || !bill) return null;

  const calc = calculateBillGSTAndTotals(bill, activeHotel);
  const grandTotal = calc.grandTotal;

  let parsedHistory = [];
  try {
    if (bill.paymentHistory) {
      parsedHistory = JSON.parse(bill.paymentHistory);
    }
  } catch (err) {
    console.error(err);
  }

  const totalPaid = calc.amountPaid || parsedHistory.reduce((sum, h) => sum + Number(h.amount || 0), 0);
  const overpaidAmount = Math.max(0, totalPaid - grandTotal);

  const handleRefund = async () => {
    if (overpaidAmount <= 0.1) {
      alert("No overpayment to refund");
      return;
    }

    const today = new Date();
    const currentDate = today.toLocaleDateString('en-GB').replace(/\//g, '-');
    const currentTime = today.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

    const refundTx = {
      amount: -Number(overpaidAmount.toFixed(2)),
      date: currentDate,
      time: currentTime,
      paymentMode: refundMode,
      paymentBank: refundMode === 'Online' ? refundBank : null
    };

    const updatedHistory = [...parsedHistory, refundTx];
    const newTotalPaid = updatedHistory.reduce((sum, h) => sum + Number(h.amount || 0), 0);
    const pendingDue = grandTotal - newTotalPaid;
    const paymentStatus = pendingDue <= 0.1 ? 'Paid' : (newTotalPaid === 0 ? 'Pending' : 'Partial');

    try {
      await api.put(`/bookings/${bill.id}`, {
        paymentHistory: JSON.stringify(updatedHistory),
        amountPaid: newTotalPaid,
        paymentStatus
      });
      onSave();
      onClose();
    } catch (err) {
      console.error("Error processing refund", err);
      alert("Failed to process refund");
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto animate-fade-in">
      <div className="w-full max-w-md bg-white shadow-2xl rounded-3xl overflow-hidden border border-[#DDE5D0] p-6 animate-slide-up space-y-5">
        <div>
          <span className="text-[10px] font-black text-[#84A63C] bg-[#84A63C]/10 border border-[#84A63C]/20 px-2.5 py-1 rounded-full uppercase tracking-wider">Refund Overpayment</span>
          <h2 className="text-base font-black text-[#1A2E05] mt-2 leading-tight">Process Refund for {bill.guestName}</h2>
          <p className="text-xs font-bold text-[#7A8A6A] mt-1">
            Overpayment of <strong className="text-[#84A63C] font-black">₹{overpaidAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> will be recorded as a refund transaction.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-black text-[#4A5E38] uppercase tracking-wider block mb-2">Select Refund Payment Mode</label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { mode: 'Cash', label: 'Cash', icon: Wallet },
                { mode: 'Online', label: 'Online / Bank', icon: CreditCard }
              ].map(({ mode, label, icon: Icon }) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setRefundMode(mode)}
                  className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-black transition-all duration-200 border shadow-sm active:scale-[0.98] ${
                    refundMode === mode
                      ? 'bg-[#1A2E05] border-[#1A2E05] text-white shadow-md shadow-[#1A2E05]/15 ring-2 ring-[#1A2E05]/20'
                      : 'bg-[#F5F7F0] border-[#DDE5D0] text-[#4A5E38] hover:bg-[#EBF0E1] hover:text-[#1A2E05]'
                  }`}
                >
                  <Icon size={16} className={refundMode === mode ? 'text-[#84A63C]' : 'text-[#7A8A6A]'} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {refundMode === 'Online' && banksList.length > 0 && (
            <div>
              <label className="text-[10px] font-black text-[#4A5E38] uppercase tracking-wider block mb-1.5">Select Bank / Wallet</label>
              <select
                value={refundBank}
                onChange={(e) => setRefundBank(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[#F5F7F0] border border-[#DDE5D0] rounded-xl text-xs font-bold text-[#1A2E05] focus:outline-none focus:bg-white focus:border-[#84A63C] transition-all"
              >
                {banksList.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-[#DDE5D0] text-[#7A8A6A] hover:bg-[#F0F3E8] hover:text-[#1A2E05] rounded-xl text-xs font-black transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleRefund}
            className="flex-1 py-2.5 bg-[#84A63C] text-white font-black text-xs rounded-xl shadow-md shadow-[#84A63C]/25 hover:bg-[#739331] active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
          >
            <RotateCcw size={14} /> Refund ₹{overpaidAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

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

const Billing = () => {
  const { activeHotel } = useAuth();
  const topScrollRef = useRef(null);
  const tableContainerRef = useRef(null);
  const [scrollWidth, setScrollWidth] = useState(0);

  // Sync scroll positions
  const handleTopScroll = () => {
    if (topScrollRef.current && tableContainerRef.current) {
      tableContainerRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    }
  };

  const handleTableScroll = () => {
    if (topScrollRef.current && tableContainerRef.current) {
      topScrollRef.current.scrollLeft = tableContainerRef.current.scrollLeft;
    }
  };

  // Mouse Drag-to-Scroll handlers
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragScrollLeft, setDragScrollLeft] = useState(0);
  const isDraggingRef = useRef(false);
  const dragDistanceRef = useRef(0);

  const handleTableMouseDown = (e) => {
    if (!tableContainerRef.current) return;
    if (['INPUT', 'BUTTON', 'SELECT', 'A', 'TEXTAREA'].includes(e.target.tagName) || e.target.closest('button') || e.target.closest('input')) {
      return;
    }
    isDraggingRef.current = true;
    dragDistanceRef.current = 0;
    setIsDragging(true);
    setDragStartX(e.pageX - tableContainerRef.current.offsetLeft);
    setDragScrollLeft(tableContainerRef.current.scrollLeft);
  };

  const handleTableMouseLeave = () => {
    setIsDragging(false);
    isDraggingRef.current = false;
    setTimeout(() => {
      dragDistanceRef.current = 0;
    }, 100);
  };

  const handleTableMouseUp = () => {
    setIsDragging(false);
    isDraggingRef.current = false;
    setTimeout(() => {
      dragDistanceRef.current = 0;
    }, 100);
  };

  const handleTableMouseMove = (e) => {
    if (!isDraggingRef.current || !tableContainerRef.current) return;
    const x = e.pageX - tableContainerRef.current.offsetLeft;
    const dist = Math.abs(x - dragStartX);
    dragDistanceRef.current = dist;
    if (dist > 5) {
      e.preventDefault();
      const walk = (x - dragStartX) * 1.5;
      tableContainerRef.current.scrollLeft = dragScrollLeft - walk;
      if (topScrollRef.current) {
        topScrollRef.current.scrollLeft = tableContainerRef.current.scrollLeft;
      }
    }
  };

  const location = useLocation();
  const navigate = useNavigate();
  const initialSearch = (() => {
    const params = new URLSearchParams(location.search);
    return params.get('search') || params.get('room') || '';
  })();

  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [selectedYearEnding, setSelectedYearEnding] = useState('all');
  const [gstFilter, setGstFilter] = useState('all'); // 'all' | 'checkout' | 'not_checkout'
  const [paymentFilter, setPaymentFilter] = useState('all'); // 'all' | 'paid' | 'pending'
  const [sortField, setSortField] = useState(null); // 'invoiceNumber'
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc' | 'desc'

  const [selectedBill, setSelectedBill] = useState(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isPayOpen, setIsPayOpen] = useState(false);
  const [isRefundOpen, setIsRefundOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [billingData, setBillingData] = useState([]);
  const [stats, setStats] = useState({ totalRevenue: 0, monthlyRevenue: 0, otaRevenue: 0, pendingDues: 0, totalGst: 0, extraMonthlyGst: 0 });

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  // Date range filter states
  const pad2 = (n) => String(n).padStart(2, '0');
  const toYMD = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

  const [periodPreset, setPeriodPreset] = useState('all'); // 'daily' | 'weekly' | 'monthly' | 'yearly' | 'all' | 'custom'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(toYMD(new Date()).substring(0, 7));
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedWeekAnchor, setSelectedWeekAnchor] = useState(toYMD(new Date()));

  const applyWeekAnchor = (anchorYMD) => {
    if (!anchorYMD) return;
    setSelectedWeekAnchor(anchorYMD);
    const [y, m, d] = anchorYMD.split('-').map(Number);
    const anchorDate = new Date(y, m - 1, d);
    const day = anchorDate.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    const monday = new Date(anchorDate);
    monday.setDate(anchorDate.getDate() - diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    setStartDate(toYMD(monday));
    setEndDate(toYMD(sunday));
  };

  const shiftWeek = (deltaWeeks) => {
    const [y, m, d] = (selectedWeekAnchor || toYMD(new Date())).split('-').map(Number);
    const anchorDate = new Date(y, m - 1, d);
    anchorDate.setDate(anchorDate.getDate() + (deltaWeeks * 7));
    applyWeekAnchor(toYMD(anchorDate));
  };

  const applyMonthString = (ymString) => {
    if (!ymString) return;
    setSelectedMonth(ymString);
    const [y, m] = ymString.split('-').map(Number);
    const firstDay = new Date(y, m - 1, 1);
    const lastDay = new Date(y, m, 0);
    setStartDate(toYMD(firstDay));
    setEndDate(toYMD(lastDay));
  };

  const applyYearString = (yearNum) => {
    if (!yearNum) return;
    setSelectedYear(String(yearNum));
    const y = Number(yearNum);
    const firstDay = new Date(y, 0, 1);
    const lastDay = new Date(y, 11, 31);
    setStartDate(toYMD(firstDay));
    setEndDate(toYMD(lastDay));
  };

  const applyPreset = (preset) => {
    setPeriodPreset(preset);
    const now = new Date();

    if (preset === 'daily') {
      const ymd = toYMD(now);
      setStartDate(ymd);
      setEndDate(ymd);
    } else if (preset === 'weekly') {
      applyWeekAnchor(selectedWeekAnchor || toYMD(now));
    } else if (preset === 'monthly') {
      applyMonthString(selectedMonth || toYMD(now).substring(0, 7));
    } else if (preset === 'yearly') {
      applyYearString(selectedYear || now.getFullYear().toString());
    } else if (preset === 'all') {
      setStartDate('');
      setEndDate('');
    }
  };

  useEffect(() => {
    if (isEditOpen || isViewOpen || isPayOpen || isRefundOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isEditOpen, isViewOpen, isPayOpen, isRefundOpen]);

  // Reset page when search query, year ending, date range, payment or GST filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedYearEnding, startDate, endDate, paymentFilter, gstFilter]);

  // Fetch when page, search query, year ending, date range, payment or GST filter changes
  useEffect(() => {
    fetchBillingData();
  }, [currentPage, searchQuery, selectedYearEnding, startDate, endDate, paymentFilter, gstFilter]);

  // Measure table width for top scrollbar synchronization
  useEffect(() => {
    const updateScrollWidth = () => {
      if (tableContainerRef.current) {
        setScrollWidth(tableContainerRef.current.scrollWidth);
      }
    };

    const timer = setTimeout(updateScrollWidth, 100);
    window.addEventListener('resize', updateScrollWidth);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateScrollWidth);
    };
  }, [billingData, loading]);

  const fetchBillingData = async () => {
    try {
      pdfPreviewCache.clear();
      setLoading(true);
      const response = await api.get('/analytics/billing', {
        params: {
          page: currentPage,
          limit: 10,
          search: searchQuery,
          yearEnding: selectedYearEnding !== 'all' ? selectedYearEnding : undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          paymentStatus: paymentFilter !== 'all' ? paymentFilter : undefined,
          gstFilter: gstFilter !== 'all' ? gstFilter : undefined
        }
      });
      setStats(response.data.data.stats);
      setBillingData(response.data.data.recentBills);
      setTotalPages(response.data.data.totalPages || 1);
      setTotalRecords(response.data.data.totalRecords || response.data.data.recentBills.length);
    } catch (error) {
      console.error('Error fetching billing data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (id, data) => {
    try {
      if (data.groupRoomShifts) {
        for (const shift of data.groupRoomShifts) {
          if (shift.roomId !== shift.originalRoomId) {
            await api.put(`/bookings/${shift.bookingId}`, { roomId: shift.roomId });
          }
        }
        delete data.groupRoomShifts;
      }

      if (data.individualRoomTotals && data.individualRoomTotals.length > 0) {
        const roomDiscount = data.discount ? (data.discount / data.individualRoomTotals.length) : 0;
        for (const item of data.individualRoomTotals) {
          await api.put(`/bookings/${item.bookingId}`, {
            totalAmount: item.baseTotal,
            gstOption: data.gstOption,
            gstRate: data.gstRate,
            guestGst: data.guestGst,
            companyName: data.companyName,
            companyAddress: data.companyAddress,
            registrationNumber: data.registrationNumber,
            discount: roomDiscount
          });
        }
        // Delete individualRoomTotals, but preserve data.totalAmount for the primary booking update
        delete data.individualRoomTotals;
      }

      await api.put(`/bookings/${id}`, data);
      setIsEditOpen(false);
      fetchBillingData();
    } catch (error) {
      console.error("Failed to update bill:", error);
      alert(error.response?.data?.message || "Failed to update bill");
    }
  };

  const numberToWords = (num) => {
    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    if ((num = num.toString()).length > 9) return 'overflow';
    let n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!n) return '';
    let str = '';
    str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Crore ' : '';
    str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
    str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
    str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'Hundred ' : '';
    str += (n[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) + 'Only' : '';
    return str;
  };

  const handleDownloadInvoice = async (bill) => {
    await generateTaxInvoice(bill);
  };

  const uniqueBills = [];
  const seenGroups = new Set();

  billingData.forEach(bill => {
    if (bill.groupBookingId) {
      if (!seenGroups.has(bill.groupBookingId)) {
        seenGroups.add(bill.groupBookingId);
        // Find the primary (oldest) booking in the group Bookings list
        if (bill.groupBookings && bill.groupBookings.length > 0) {
          const sortedGb = [...bill.groupBookings].sort((x, y) => x.id - y.id);
          const primaryGb = sortedGb[0];
          const primaryBill = billingData.find(b => b.id === primaryGb.id) || bill;
          uniqueBills.push(primaryBill);
        } else {
          uniqueBills.push(bill);
        }
      }
    } else {
      uniqueBills.push(bill);
    }
  });

  const calculateBillGSTAndTotals = (bill) => {
    let isGroup = bill.groupBookings && bill.groupBookings.length > 1;
    let baseAmount = computeBillBaseAmount(bill);
    let discount = Number(bill.discount || 0);
    let amountPaid = Number(bill.amountPaid || 0);
    const gstRate = Number(bill.gstRate !== undefined && bill.gstRate !== null ? bill.gstRate : (activeHotel?.defaultGstRate !== undefined ? Number(activeHotel.defaultGstRate) : 12));
    const gstOption = bill.gstOption || 'none';

    if (isGroup) {
      baseAmount = computeBillBaseAmount(bill);
      discount = bill.groupBookings.reduce((sum, b) => sum + Number(b.discount || 0), 0);
      amountPaid = bill.groupBookings.reduce((sum, b) => sum + Number(b.amountPaid || 0), 0);
    }

    const extraChargesTotal = Number(bill.extraCharges || 0);
    let netRoomTotal = Math.max(0, baseAmount - discount);

    let subTotal = netRoomTotal;
    let roomGstAmount = 0;
    let grandTotal = 0;

    if (gstOption === 'exclusive') {
      subTotal = netRoomTotal;
      roomGstAmount = gstRate > 0 ? Math.round((subTotal * (gstRate / 100)) * 100) / 100 : 0;
      grandTotal = subTotal + roomGstAmount + extraChargesTotal;
      baseAmount = subTotal + discount;
    } else if (gstOption === 'inclusive') {
      grandTotal = netRoomTotal + extraChargesTotal;
      subTotal = gstRate > 0 ? Math.round((netRoomTotal / (1 + gstRate / 100)) * 100) / 100 : netRoomTotal;
      roomGstAmount = Math.round((netRoomTotal - subTotal) * 100) / 100;
      baseAmount = subTotal + discount;
    } else {
      roomGstAmount = 0;
      grandTotal = netRoomTotal + extraChargesTotal;
      subTotal = netRoomTotal;
    }

    let extraGstAmount = 0;
    let extraSubTotal = extraChargesTotal;
    if (bill.extraChargesList && Array.isArray(bill.extraChargesList) && bill.extraChargesList.length > 0) {
      extraGstAmount = bill.extraChargesList.reduce((s, ec) => s + Number(ec.gstAmount || 0), 0);
      const extraSubSum = bill.extraChargesList.reduce((s, ec) => s + Number(ec.subtotal || ec.baseAmount || 0), 0);
      if (extraSubSum > 0) {
        extraSubTotal = extraSubSum;
      } else {
        extraSubTotal = Math.max(0, extraChargesTotal - extraGstAmount);
      }
    } else if (extraChargesTotal > 0 && gstOption !== 'none') {
      extraSubTotal = gstRate > 0 ? (extraChargesTotal / (1 + gstRate / 100)) : extraChargesTotal;
      extraGstAmount = extraChargesTotal - extraSubTotal;
    } else {
      extraSubTotal = extraChargesTotal;
    }

    const pending = grandTotal - amountPaid;

    return {
      baseAmount,
      discount,
      amountPaid,
      subTotal,
      roomGstAmount,
      extraGstAmount,
      extraSubTotal,
      totalGstAmount: roomGstAmount + extraGstAmount,
      grandTotal,
      pending,
      extraChargesTotal,
      gstOption,
      gstRate
    };
  };

  const gstStats = (() => {
    let checkoutRoomGst = 0;
    let notCheckoutRoomGst = 0;
    let checkoutExtraGst = 0;
    let notCheckoutExtraGst = 0;
    let totalPendingAmount = 0;

    uniqueBills.forEach(bill => {
      if (bill.status === 'Cancelled') return;
      const calc = calculateBillGSTAndTotals(bill, activeHotel);
      if (calc.pending > 0) {
        totalPendingAmount += calc.pending;
      }

      const isCheckedOut = bill.status === 'Completed';

      if (isCheckedOut) {
        checkoutRoomGst += calc.roomGstAmount;
        checkoutExtraGst += calc.extraGstAmount;
      } else {
        notCheckoutRoomGst += calc.roomGstAmount;
        notCheckoutExtraGst += calc.extraGstAmount;
      }
    });

    return {
      checkoutRoomGst,
      notCheckoutRoomGst,
      checkoutExtraGst,
      notCheckoutExtraGst,
      totalPendingAmount,
      totalRoomGst: checkoutRoomGst + notCheckoutRoomGst,
      totalExtraGst: checkoutExtraGst + notCheckoutExtraGst,
      totalCheckoutGst: checkoutRoomGst + checkoutExtraGst,
      totalNotCheckoutGst: notCheckoutRoomGst + notCheckoutExtraGst,
      totalGst: checkoutRoomGst + notCheckoutRoomGst + checkoutExtraGst + notCheckoutExtraGst
    };
  })();

  const filteredBills = uniqueBills.filter(bill => {
    const isCheckedOut = bill.status === 'Completed';

    if (gstFilter === 'checkout' && !isCheckedOut) {
      return false;
    }
    if (gstFilter === 'not_checkout' && isCheckedOut) {
      return false;
    }

    if (paymentFilter !== 'all') {
      let baseAmount = computeBillBaseAmount(bill);
      let discount = Number(bill.discount || 0);
      if (bill.groupBookings && bill.groupBookings.length > 1) {
        baseAmount = computeBillBaseAmount(bill);
        discount = bill.groupBookings.reduce((sum, gb) => sum + Number(gb.discount || 0), 0);
      }
      const gstRate = Number(bill.gstRate !== undefined && bill.gstRate !== null ? bill.gstRate : (activeHotel?.defaultGstRate !== undefined ? Number(activeHotel.defaultGstRate) : 12));
      const gstOption = bill.gstOption || 'none';
      const subTotal = baseAmount - discount;
      const roomGstAmount = gstOption === 'none' ? 0 : Math.round((subTotal * (gstRate / 100)) * 100) / 100;
      let extraChargesTotal = 0;
      if (bill.extraChargesList && Array.isArray(bill.extraChargesList)) {
        extraChargesTotal = bill.extraChargesList.reduce((s, ec) => s + Number(ec.totalAmount || 0), 0);
      } else {
        extraChargesTotal = Number(bill.extraCharges || 0);
      }
      let grandTotal = subTotal + roomGstAmount + extraChargesTotal;
      if (gstOption === 'inclusive') {
        grandTotal = subTotal + extraChargesTotal;
      }
      const amountPaid = Number(bill.amountPaid || 0);
      const pendingDue = grandTotal - amountPaid;
      const isPaid = pendingDue <= 0.1;

      if (paymentFilter === 'paid' && !isPaid) {
        return false;
      }
      if (paymentFilter === 'pending' && isPaid) {
        return false;
      }
    }

    return true;
  });

  const sortedBills = useMemo(() => {
    if (!sortField) return filteredBills;

    return [...filteredBills].sort((a, b) => {
      if (sortField === 'registrationNumber') {
        const regA = a.registrationNumber || getAutoRegNo(a, filteredBills);
        const regB = b.registrationNumber || getAutoRegNo(b, filteredBills);

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
  }, [filteredBills, sortField, sortOrder]);

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

  const formatValue = (val) => {
    return `₹${Number(val || 0).toLocaleString('en-IN')}`;
  };

  return (
    <div className="space-y-4 pb-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            {/* <h1 className="text-2xl font-bold text-[#1A2E05] tracking-tight">Billing and Payment</h1> */}
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
        </div>
      </div>

      {/* Date Range Filter Bar */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-[#DDE5D0] shadow-sm space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
          <div className="flex items-center gap-1.5">
            <Calendar size={15} className="text-[#84A63C]" />
            <span className="text-xs font-black text-[#1A2E05] uppercase tracking-wider">Date Range Filter</span>
          </div>
          <span className="text-xs font-bold text-[#7A8A6A]">
            Showing: <span className="text-[#1A2E05]">
              {periodPreset === 'all' ? 'All Time' : (startDate && endDate ? (startDate === endDate ? startDate : `${startDate} – ${endDate}`) : 'Selected Range')}
            </span>
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {[
            { key: 'daily', label: 'Daily' },
            { key: 'weekly', label: 'Weekly' },
            { key: 'monthly', label: 'Monthly' },
            { key: 'yearly', label: 'Yearly' },
            { key: 'all', label: 'All Time' },
            { key: 'custom', label: 'Custom Range' },
          ].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => applyPreset(key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${periodPreset === key
                  ? 'bg-[#84A63C] text-white shadow-sm'
                  : 'bg-[#F5F7F0] text-[#4A5E38] border border-[#DDE5D0] hover:bg-[#EAF0DE]'
                }`}
            >
              {label}
            </button>
          ))}
        </div>

        {periodPreset === 'daily' && (
          <div className="flex flex-wrap items-center gap-2 pt-1 animate-fade-in">
            <span className="text-xs font-bold text-[#7A8A6A]">Select Date:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                const val = e.target.value;
                setStartDate(val);
                setEndDate(val);
              }}
              className="px-3 py-1.5 bg-[#F5F7F0] border border-[#DDE5D0] rounded-xl text-xs font-bold focus:outline-none focus:border-[#84A63C] text-[#1A2E05] cursor-pointer"
            />
          </div>
        )}

        {periodPreset === 'weekly' && (
          <div className="flex flex-wrap items-center gap-2 pt-1 animate-fade-in">
            <span className="text-xs font-bold text-[#7A8A6A]">Select Week:</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => shiftWeek(-1)}
                className="px-2.5 py-1.5 bg-[#F5F7F0] hover:bg-[#EAF0DE] border border-[#DDE5D0] rounded-xl text-xs font-black text-[#4A5E38] transition-all"
                title="Previous Week"
              >
                ◀ Prev
              </button>
              <input
                type="date"
                value={selectedWeekAnchor}
                onChange={(e) => applyWeekAnchor(e.target.value)}
                className="px-3 py-1.5 bg-[#F5F7F0] border border-[#DDE5D0] rounded-xl text-xs font-bold focus:outline-none focus:border-[#84A63C] text-[#1A2E05] cursor-pointer"
              />
              <button
                type="button"
                onClick={() => shiftWeek(1)}
                className="px-2.5 py-1.5 bg-[#F5F7F0] hover:bg-[#EAF0DE] border border-[#DDE5D0] rounded-xl text-xs font-black text-[#4A5E38] transition-all"
                title="Next Week"
              >
                Next ▶
              </button>
            </div>
          </div>
        )}

        {periodPreset === 'monthly' && (
          <div className="flex flex-wrap items-center gap-2 pt-1 animate-fade-in">
            <span className="text-xs font-bold text-[#7A8A6A]">Select Month:</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => applyMonthString(e.target.value)}
              className="px-3 py-1.5 bg-[#F5F7F0] border border-[#DDE5D0] rounded-xl text-xs font-bold focus:outline-none focus:border-[#84A63C] text-[#1A2E05] cursor-pointer"
            />
          </div>
        )}

        {periodPreset === 'yearly' && (
          <div className="flex flex-wrap items-center gap-2 pt-1 animate-fade-in">
            <span className="text-xs font-bold text-[#7A8A6A]">Select Year:</span>
            <select
              value={selectedYear}
              onChange={(e) => applyYearString(e.target.value)}
              className="px-3 py-1.5 bg-[#F5F7F0] border border-[#DDE5D0] rounded-xl text-xs font-bold focus:outline-none focus:border-[#84A63C] text-[#1A2E05] cursor-pointer"
            >
              {[2028, 2027, 2026, 2025, 2024, 2023, 2022, 2021, 2020].map(yr => (
                <option key={yr} value={String(yr)}>{yr}</option>
              ))}
            </select>
          </div>
        )}

        {periodPreset === 'custom' && (
          <div className="flex flex-wrap items-center gap-2 pt-1 animate-fade-in">
            <span className="text-xs font-bold text-[#7A8A6A]">From</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-1.5 bg-[#F5F7F0] border border-[#DDE5D0] rounded-xl text-xs font-bold focus:outline-none focus:border-[#84A63C] text-[#1A2E05]"
            />
            <span className="text-xs font-bold text-[#7A8A6A]">To</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-1.5 bg-[#F5F7F0] border border-[#DDE5D0] rounded-xl text-xs font-bold focus:outline-none focus:border-[#84A63C] text-[#1A2E05]"
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 items-stretch">
        <StatCard
          label="Total Revenue"
          value={formatValue(stats.totalRevenue)}
          subtext="Lifetime Revenue"
          icon={Receipt}
          color="text-[#1A2E05]"
          bgColor="bg-[#F0F3E8]"
          trend={stats.revenueTrend > 0 ? `+${stats.revenueTrend}%` : null}
        />
        <StatCard
          label="Total Pending Amount"
          value={formatValue(stats && stats.pendingDues !== undefined ? stats.pendingDues : gstStats.totalPendingAmount)}
          subtext="Outstanding Dues"
          icon={Wallet}
          color="text-rose-600"
          bgColor="bg-rose-50"
        />
        <StatCard
          label="Total GST"
          value={formatValue(stats.totalGst !== undefined ? stats.totalGst : gstStats.totalGst)}
          subtext={
            <div className="flex flex-col gap-0.5 text-[9px] font-bold text-[#7A8A6A]">
              <div className="flex justify-between items-center gap-2">
                <span>Room:</span>
                <span className="font-black text-[#1A2E05]">₹{(stats.totalRoomGst !== undefined ? stats.totalRoomGst : gstStats.totalRoomGst).toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>
              </div>
              <div className="flex justify-between items-center gap-2">
                <span>Extra:</span>
                <span className="font-black text-[#1A2E05]">₹{(stats.totalExtraGst !== undefined ? stats.totalExtraGst : gstStats.totalExtraGst).toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>
              </div>
            </div>
          }
          icon={DollarSign}
          color="text-orange-600"
          bgColor="bg-orange-50"
        />
        <StatCard
          label="Checked-Out GST"
          value={formatValue(stats.totalCheckoutGst !== undefined ? stats.totalCheckoutGst : gstStats.totalCheckoutGst)}
          subtext={
            <div className="flex flex-col gap-0.5 text-[9px] font-bold text-emerald-800">
              <div className="flex justify-between items-center gap-2">
                <span>Room:</span>
                <span className="font-black text-emerald-700">₹{(stats.checkoutRoomGst !== undefined ? stats.checkoutRoomGst : gstStats.checkoutRoomGst).toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>
              </div>
              <div className="flex justify-between items-center gap-2">
                <span>Extra:</span>
                <span className="font-black text-emerald-700">₹{(stats.checkoutExtraGst !== undefined ? stats.checkoutExtraGst : gstStats.checkoutExtraGst).toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>
              </div>
            </div>
          }
          icon={CheckCircle}
          color="text-emerald-600"
          bgColor="bg-emerald-50"
        />
        <StatCard
          label="Not Checked-Out GST"
          value={formatValue(stats.totalNotCheckoutGst !== undefined ? stats.totalNotCheckoutGst : gstStats.totalNotCheckoutGst)}
          subtext={
            <div className="flex flex-col gap-0.5 text-[9px] font-bold text-amber-800">
              <div className="flex justify-between items-center gap-2">
                <span>Room:</span>
                <span className="font-black text-amber-700">₹{(stats.notCheckoutRoomGst !== undefined ? stats.notCheckoutRoomGst : gstStats.notCheckoutRoomGst).toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>
              </div>
              <div className="flex justify-between items-center gap-2">
                <span>Extra:</span>
                <span className="font-black text-amber-700">₹{(stats.notCheckoutExtraGst !== undefined ? stats.notCheckoutExtraGst : gstStats.notCheckoutExtraGst).toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>
              </div>
            </div>
          }
          icon={Clock}
          color="text-amber-600"
          bgColor="bg-amber-50"
        />
        <StatCard
          label="Monthly Rev"
          value={formatValue(stats.monthlyRevenue)}
          subtext="This Month"
          icon={TrendingUp}
          color="text-blue-600"
          bgColor="bg-blue-50"
          trend={stats.revenueTrend > 0 ? `+${stats.revenueTrend}%` : null}
        />
      </div>

      <div className="space-y-4">
        {/* Table View (Horizontally Scrollable on Mobile & Desktop) */}
        <div className="bg-white rounded-2xl border border-[#DDE5D0] shadow-sm overflow-hidden">
          <div className="p-5 border-b border-[#DDE5D0] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              <div className="relative group w-full sm:w-80">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#7A8A6A]" />
                <input type="text" placeholder="Search Room or Guest..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-12 pr-4 py-2.5 bg-[#F0F3E8] border border-[#DDE5D0] rounded-xl text-xs sm:text-sm font-bold focus:outline-none focus:bg-white transition-all" />
              </div>

              {/* GST Box Tabs */}
              <div className="flex items-center gap-1 bg-[#F0F3E8] p-1 rounded-xl border border-[#DDE5D0]">
                <button
                  type="button"
                  onClick={() => setGstFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${gstFilter === 'all' ? 'bg-white text-[#1A2E05] shadow-xs' : 'text-[#7A8A6A] hover:text-[#1A2E05]'}`}
                >
                  All Bills
                </button>
                <button
                  type="button"
                  onClick={() => setGstFilter('checkout')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${gstFilter === 'checkout' ? 'bg-emerald-600 text-white shadow-xs' : 'text-emerald-700 hover:bg-emerald-50'}`}
                >
                  <CheckCircle size={13} /> Checked-Out GST
                </button>
                <button
                  type="button"
                  onClick={() => setGstFilter('not_checkout')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${gstFilter === 'not_checkout' ? 'bg-amber-600 text-white shadow-xs' : 'text-amber-700 hover:bg-amber-50'}`}
                >
                  <Clock size={13} /> Not Checked-Out GST
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Payment Filter Box Tabs (Right Side) */}
              <div className="flex items-center gap-1 bg-[#F0F3E8] p-1 rounded-xl border border-[#DDE5D0]">
                <button
                  type="button"
                  onClick={() => setPaymentFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${paymentFilter === 'all' ? 'bg-white text-[#1A2E05] shadow-xs' : 'text-[#7A8A6A] hover:text-[#1A2E05]'}`}
                >
                  All Status
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentFilter('paid')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${paymentFilter === 'paid' ? 'bg-emerald-600 text-white shadow-xs' : 'text-emerald-700 hover:bg-emerald-50'}`}
                >
                  <Wallet size={13} /> Paid
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentFilter('pending')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${paymentFilter === 'pending' ? 'bg-rose-600 text-white shadow-xs' : 'text-rose-700 hover:bg-rose-50'}`}
                >
                  <Clock size={13} /> Pending
                </button>
              </div>

              {activeHotel?.resetInvoiceYearly && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-[#4A5E38] whitespace-nowrap uppercase tracking-wider">Billing Cycle:</span>
                  <select
                    value={selectedYearEnding}
                    onChange={(e) => setSelectedYearEnding(e.target.value)}
                    className="bg-[#F0F3E8] border border-[#DDE5D0] focus:border-[#84A63C] focus:outline-none rounded-xl px-3 py-2 text-xs font-bold cursor-pointer text-[#1A2E05]"
                  >
                    <option value="all">All Cycles (Lifetime)</option>
                    {yearEndingOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
          {/* Top Scrollbar for Better UX/Accessibility */}
          <div
            ref={topScrollRef}
            onScroll={handleTopScroll}
            className="overflow-x-auto custom-top-scrollbar border-b border-[#DDE5D0]/50 bg-[#F9FAFA]"
            style={{ width: '100%' }}
          >
            <div style={{ width: `${scrollWidth}px`, height: '6px' }}></div>
          </div>

          <div
            ref={tableContainerRef}
            onScroll={handleTableScroll}
            onMouseDown={handleTableMouseDown}
            onMouseLeave={handleTableMouseLeave}
            onMouseUp={handleTableMouseUp}
            onMouseMove={handleTableMouseMove}
            className={`overflow-x-auto custom-top-scrollbar select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          >
            <table className="w-full text-left min-w-[1050px]">
              <thead>
                <tr className="bg-[#F0F3E8]/50 border-b border-[#DDE5D0]">
                  <th className="px-2 py-2 text-[10px] font-black text-[#4A5E38]">Room</th>
                  <th className="px-2 py-2 text-[10px] font-black text-[#4A5E38]">Guest Name</th>
                  <th className="px-2 py-2 text-[10px] font-black text-[#4A5E38]">Check-In</th>
                  <th className="px-2 py-2 text-[10px] font-black text-[#4A5E38]">Check-Out</th>
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
                      className="px-2 py-2 text-[10px] font-black text-[#4A5E38] uppercase tracking-wider cursor-pointer select-none hover:text-[#1A2E05] transition-colors group/sort whitespace-nowrap"
                      title={`Click to sort by Registration Number (${sortOrder === 'asc' ? 'Ascending' : 'Descending'})`}
                    >
                      <div className="flex items-center gap-1 whitespace-nowrap">
                        <span className="whitespace-nowrap">Reg. No.</span>
                        {sortField === 'registrationNumber' ? (
                          sortOrder === 'asc' ? (
                            <ArrowUp size={13} className="text-[#84A63C] shrink-0 stroke-[2.5]" />
                          ) : (
                            <ArrowDown size={13} className="text-[#84A63C] shrink-0 stroke-[2.5]" />
                          )
                        ) : (
                          <ArrowUpDown size={13} className="text-[#7A8A6A] shrink-0 opacity-60 group-hover/sort:opacity-100 transition-opacity" />
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
                    className="px-2 py-2 text-[10px] font-black text-[#4A5E38] uppercase tracking-wider cursor-pointer select-none hover:text-[#1A2E05] transition-colors group/sort whitespace-nowrap"
                    title={`Click to sort by Invoice Number (${sortOrder === 'asc' ? 'Ascending' : 'Descending'})`}
                  >
                    <div className="flex items-center gap-1 whitespace-nowrap">
                      <span className="whitespace-nowrap">Invoice No.</span>
                      {sortField === 'invoiceNumber' ? (
                        sortOrder === 'asc' ? (
                          <ArrowUp size={13} className="text-[#84A63C] shrink-0 stroke-[2.5]" />
                        ) : (
                          <ArrowDown size={13} className="text-[#84A63C] shrink-0 stroke-[2.5]" />
                        )
                      ) : (
                        <ArrowUpDown size={13} className="text-[#7A8A6A] shrink-0 opacity-60 group-hover/sort:opacity-100 transition-opacity" />
                      )}
                    </div>
                  </th>
                  <th className="px-2 py-2 text-[10px] font-black text-[#4A5E38]">Charges</th>
                  <th className="px-2 py-2 text-[10px] font-black text-[#4A5E38]">Discount</th>
                  <th className="px-2 py-2 text-[10px] font-black text-[#4A5E38]">GST</th>
                  <th className="px-2 py-2 text-[10px] font-black text-[#4A5E38]">Total</th>
                  <th className="px-2 py-2 text-[10px] font-black text-[#4A5E38]">Paid / Pending</th>
                  <th className="px-2 py-2 text-[10px] font-black text-[#4A5E38] text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F3E8]">
                {loading ? (
                  <tr><td colSpan="11" className="py-6 text-center"><Loader2 size={24} className="animate-spin text-[#84A63C] mx-auto" /></td></tr>
                ) : sortedBills.length > 0 ? (
                  sortedBills.map((bill, idx) => {
                    let baseAmount = computeBillBaseAmount(bill);
                    let discount = Number(bill.discount || 0);
                    let amountPaid = Number(bill.amountPaid || 0);
                    const gstRate = Number(bill.gstRate !== undefined && bill.gstRate !== null ? bill.gstRate : (activeHotel?.defaultGstRate !== undefined ? Number(activeHotel.defaultGstRate) : 12));
                    const gstOption = bill.gstOption || 'none';

                    const isRowEditable = bill.status !== 'Completed' || activeHotel?.allowBillingEdit === true;

                    let roomDisplayStr = bill.previousRoomNumber ? `R-${cleanRoomNumber(bill.previousRoomNumber)} → ${cleanRoomNumber(bill.Room?.roomNumber)}` : `R-${cleanRoomNumber(bill.Room?.roomNumber)}`;
                    let isGroup = bill.groupBookings && bill.groupBookings.length > 1;

                    let roomDisplayElements = bill.previousRoomNumber ? (
                      <span className="font-bold text-xs text-[#1A2E05]">
                        <span className="text-orange-600 font-bold">R-{cleanRoomNumber(bill.previousRoomNumber)} → </span>
                        <span>{cleanRoomNumber(bill.Room?.roomNumber)}</span>
                      </span>
                    ) : (
                      <span className="font-bold text-xs text-[#1A2E05]">R-{cleanRoomNumber(bill.Room?.roomNumber)}</span>
                    );

                    if (isGroup) {
                      baseAmount = computeBillBaseAmount(bill);
                      discount = bill.groupBookings.reduce((sum, b) => sum + Number(b.discount || 0), 0);
                      amountPaid = bill.groupBookings.reduce((sum, b) => sum + Number(b.amountPaid || 0), 0);

                      roomDisplayStr = bill.groupBookings.map(b =>
                        b.previousRoomNumber ? `R-${cleanRoomNumber(b.previousRoomNumber)} → ${cleanRoomNumber(b.Room?.roomNumber || b.roomId)}` : `R-${cleanRoomNumber(b.Room?.roomNumber || b.roomId)}`
                      ).join(', ');

                      roomDisplayElements = (
                        <div className="flex flex-wrap gap-1">
                          {bill.groupBookings.map((b, i) => (
                            <span key={b.id} className="font-bold text-xs text-[#1A2E05]">
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

                    const calc = calculateBillGSTAndTotals(bill, activeHotel);
                    baseAmount = calc.baseAmount;
                    discount = calc.discount;
                    amountPaid = calc.amountPaid;
                    const extraChargesTotal = calc.extraChargesTotal;
                    const extraSubTotal = calc.extraSubTotal || Math.max(0, extraChargesTotal - calc.extraGstAmount);
                    let subTotal = calc.subTotal;
                    let roomGst = calc.roomGstAmount;
                    let extraGst = calc.extraGstAmount;
                    let totalGst = calc.totalGstAmount;
                    let grandTotal = calc.grandTotal;

                    const roomCgst = roomGst / 2;
                    const roomSgst = roomGst / 2;

                    const pendingDue = calc.pending;

                    let pendingDueStr = '';
                    let pendingClass = '';
                    if (Math.abs(pendingDue) < 0.1) {
                      pendingDueStr = 'No Pending';
                      pendingClass =
                        'text-green-600 bg-green-50 px-1.5 py-0.5 rounded border border-green-200 inline-block font-black text-[9px]';

                    } else if (pendingDue < 0) {
                      pendingDueStr = `Pay Customer ₹${Math.abs(pendingDue).toLocaleString('en-IN', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}`;

                      pendingClass =
                        'text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 inline-block font-bold text-[10px]';

                    } else {
                      pendingDueStr = `Pending ₹${pendingDue.toLocaleString('en-IN', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}`;

                      pendingClass =
                        'text-red-600 font-bold text-xs';
                    }

                    return (
                      <tr
                        key={idx}
                        onClick={(e) => {
                          if (dragDistanceRef.current > 5) {
                            return;
                          }
                          if (['INPUT', 'BUTTON', 'A', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) || e.target.closest('button') || e.target.closest('input')) {
                            return;
                          }
                          navigate(`/dashboard/front-office/guest-billing/${bill.id}`, { state: { bill } });
                        }}
                        className="hover:bg-[#F0F3E8]/60 transition-colors group cursor-pointer"
                        title="Click to view full guest billing & stay details"
                      >
                        <td className="px-2 py-2">
                          <div className="max-w-[120px] truncate" title={roomDisplayStr}>
                            {roomDisplayElements}
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <p className="text-xs font-bold text-[#1A2E05]">{bill.guestName}</p>
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          <div className="flex flex-col gap-0.5 items-start">
                            <span className="text-xs font-black text-[#1A2E05] tracking-tight">{formatDateDMY(bill.checkInDate || bill.createdAt)}</span>
                            <span className="text-[9.5px] font-extrabold text-[#2C4012] bg-[#EEF4E3] px-1 py-0.5 rounded border border-[#D3E2BD]">
                              {bill.checkInTime ? formatTime12hr(bill.checkInTime).toUpperCase() : new Date(bill.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase()}
                            </span>
                          </div>
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          <div className="flex flex-col gap-0.5 items-start">
                            <span className="text-xs font-black text-[#1A2E05] tracking-tight">{formatDateDMY(bill.checkOutDate)}</span>
                            <div className="flex items-center gap-1">
                              <span className="text-[9.5px] font-extrabold text-[#2C4012] bg-[#EEF4E3] px-1 py-0.5 rounded border border-[#D3E2BD]">
                                {bill.checkOutTime ? formatTime12hr(bill.checkOutTime).toUpperCase() : '11:00 AM'}
                              </span>
                              <span className={`px-1 py-0.5 rounded text-[8.5px] font-extrabold ${bill.status === 'Completed' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-rose-100 text-rose-800 border border-rose-200'}`}>
                                {bill.status === 'Completed' ? 'Done' : 'Not Done'}
                              </span>
                            </div>
                          </div>
                        </td>

                        {activeHotel?.enableRegistrationNumber === true && (
                          <td className="px-2 py-2 whitespace-nowrap">
                            <div className={`inline-flex items-center px-1.5 py-0.5 border rounded-md text-[11px] font-bold transition-all whitespace-nowrap ${!isRowEditable
                                ? 'bg-[#F5F7F0]/40 text-[#7A8A6A]/60 border-[#DDE5D0]/60 cursor-not-allowed'
                                : 'bg-[#F0F3E8] border-[#DDE5D0] text-[#1A2E05] focus-within:bg-white focus-within:border-[#84A63C] group'
                              }`}>
                              <input
                                key={`${bill.id}_reg_${bill.registrationNumber || ''}`}
                                type="text"
                                placeholder="REG-001"
                                disabled={!isRowEditable}
                                defaultValue={bill.registrationNumber || getAutoRegNo(bill, billingData)}
                                onBlur={async (e) => {
                                  const val = e.target.value.trim();
                                  const currentReg = bill.registrationNumber || getAutoRegNo(bill, billingData);
                                  if (val && val !== currentReg) {
                                    const isDuplicate = billingData.some(b => {
                                      if (Number(b.id) === Number(bill.id)) return false;
                                      const bReg = (b.registrationNumber || getAutoRegNo(b, billingData)).trim().toLowerCase();
                                      return bReg === val.toLowerCase();
                                    });
                                    if (isDuplicate) {
                                      alert(`Registration Number '${val}' is already assigned to another booking. Duplicate Registration Numbers are not allowed!`);
                                      e.target.value = currentReg;
                                      return;
                                    }
                                    try {
                                      await api.put(`/bookings/${bill.id}`, { registrationNumber: val });
                                      fetchBillingData();
                                    } catch (error) {
                                      console.error("Failed to auto-save Registration Number", error);
                                      alert(error.response?.data?.message || `Registration number '${val}' is already assigned to another booking.`);
                                      fetchBillingData();
                                    }
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.target.blur();
                                  }
                                }}
                                className={`w-16 bg-transparent focus:outline-none font-bold whitespace-nowrap ${!isRowEditable ? 'cursor-not-allowed text-[#7A8A6A]/60' : 'text-[#1A2E05]'}`}
                              />
                            </div>
                          </td>
                        )}
                        <td className="px-2 py-2 whitespace-nowrap">
                          <div className={`inline-flex items-center px-1.5 py-0.5 border rounded-md text-[11px] font-bold transition-all whitespace-nowrap ${!isRowEditable
                              ? 'bg-[#F5F7F0]/40 text-[#7A8A6A]/60 border-[#DDE5D0]/60 cursor-not-allowed'
                              : 'bg-[#F0F3E8] border-[#DDE5D0] text-[#1A2E05] focus-within:bg-white focus-within:border-[#84A63C] group'
                            }`}>
                            <span className="text-[#7A8A6A] select-none pr-0.5 font-bold whitespace-nowrap">{activeHotel?.invoicePrefix || ''}</span>
                            <input
                              key={`${bill.id}_${bill.invoiceNumber || ''}`}
                              type="text"
                              placeholder="000"
                              disabled={!isRowEditable}
                              defaultValue={bill.invoiceNumber ? (activeHotel?.invoicePrefix ? bill.invoiceNumber.replace(activeHotel.invoicePrefix, '') : bill.invoiceNumber) : ''}
                              onBlur={async (e) => {
                                const activePrefix = activeHotel?.invoicePrefix || '';
                                let cleanVal = e.target.value.trim();
                                if (activePrefix && cleanVal.startsWith(activePrefix)) {
                                  cleanVal = cleanVal.substring(activePrefix.length);
                                }
                                const prefixTrimmed = activePrefix.trim();
                                if (prefixTrimmed && cleanVal.startsWith(prefixTrimmed)) {
                                  cleanVal = cleanVal.substring(prefixTrimmed.length);
                                }
                                cleanVal = cleanVal.trim();
                                const savedValue = cleanVal !== '' ? `${activePrefix}${cleanVal}` : null;
                                if (savedValue !== bill.invoiceNumber) {
                                  try {
                                    await api.put(`/bookings/${bill.id}`, { invoiceNumber: savedValue });
                                    fetchBillingData();
                                  } catch (error) {
                                    console.error("Failed to auto-save Invoice Number", error);
                                    alert(error.response?.data?.message || `Invoice number '${savedValue}' is already assigned to another booking.`);
                                    fetchBillingData();
                                  }
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.target.blur();
                                }
                              }}
                              className={`w-10 max-w-[50px] bg-transparent focus:outline-none font-bold whitespace-nowrap ${!isRowEditable ? 'cursor-not-allowed text-[#7A8A6A]/60' : 'text-[#1A2E05]'}`}
                            />
                          </div>
                        </td>
                        <td className="px-2 py-2 text-xs font-bold text-[#1A2E05]">
                          <div className="flex flex-col">
                            <span>₹{baseAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            {extraChargesTotal > 0 && (
                              <>
                                <span className="text-[9px] text-[#5C7A1F] bg-[#84A63C]/10 px-1.5 py-0.5 rounded border border-[#84A63C]/20 mt-0.5 whitespace-nowrap self-start font-bold">
                                  Extras: +₹{extraSubTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <span className="text-[#1A2E05] font-black text-[10px] mt-0.5 border-t border-[#DDE5D0] pt-0.5 whitespace-nowrap">
                                  Total: ₹{(baseAmount + extraSubTotal).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2 text-xs font-bold text-orange-600">₹{discount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="px-2 py-2 text-[10px] font-bold text-blue-600">
                          <div className="flex flex-col leading-tight whitespace-nowrap">
                            <span>sgst - ₹{roomSgst.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>
                            <span>cgst - ₹{roomCgst.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>
                            <span className="text-[#1A2E05] font-black mt-0.5 border-t border-blue-200/50 pt-0.5">Total: ₹{roomGst.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>
                            {extraGst > 0 && (
                              <>
                                <span className="text-emerald-700 font-bold text-[9px] mt-0.5">Extras GST: +₹{extraGst.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>
                                <span className="text-emerald-900 font-extrabold text-[10px] border-t border-emerald-300 pt-0.5 mt-0.5">Total GST: ₹{totalGst.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2 text-xs font-bold text-[#1A2E05]">
                          ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex flex-col gap-0.5 items-start">
                            <span
                              className="text-xs font-bold text-green-600 cursor-pointer hover:underline"
                              onClick={() => { setSelectedBill(bill); setIsPayOpen(true); }}
                              title="Click to open Quick Pay ledger"
                            >
                              Paid: ₹{amountPaid.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span
                              className={`${pendingClass} cursor-pointer hover:opacity-80 active:scale-95 transition-all`}
                              onClick={() => {
                                if (pendingDue < -0.1) {
                                  setSelectedBill(bill);
                                  setIsRefundOpen(true);
                                } else {
                                  setSelectedBill(bill);
                                  setIsPayOpen(true);
                                }
                              }}
                              title="Click to open Quick Pay ledger"
                            >
                              {pendingDueStr}
                            </span>
                          </div>
                        </td>
                        <td className="px-2 py-2 text-right">
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => { setSelectedBill(bill); setIsViewOpen(true); }} className="p-1 text-[#7A8A6A] hover:text-green-600 hover:bg-white rounded-md transition-all border border-[#DDE5D0]" title="View Invoice"><Eye size={13} /></button>
                            <button onClick={() => { setSelectedBill(bill); setIsEditOpen(true); }} className="p-1 text-[#7A8A6A] hover:text-blue-600 hover:bg-white rounded-md transition-all border border-[#DDE5D0]" title="Edit Billing"><Edit size={13} /></button>
                            <button onClick={() => { setSelectedBill(bill); setIsPayOpen(true); }} className="px-1.5 py-0.5 bg-amber-50 text-amber-600 hover:bg-amber-100 rounded-md transition-all border border-amber-200 flex items-center gap-1 text-[9.5px] font-black" title="Quick Pay & Ledger"><Wallet size={11} /> Collect</button>
                            <button onClick={() => handleDownloadInvoice(bill)} className="p-1 text-[#7A8A6A] hover:text-[#84A63C] hover:bg-white rounded-md transition-all border border-[#DDE5D0]" title="Download PDF"><Download size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="11" className="py-10 text-center text-[#4A5E38] font-bold text-xs font-bold">
                      No billing history found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Desktop Pagination */}
          <div className="bg-[#F9FAFA] px-6 py-6 flex items-center justify-between border-t border-[#DDE5D0]">
            <p className="text-[10px] font-black text-[#4A5E38]">
              Page <span className="text-[#1A2E05]">{currentPage}</span> / <span className="text-[#1A2E05]">{totalPages}</span> (Total: {totalRecords})
            </p>
            <div className="flex gap-3">
              <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="w-10 h-10 flex items-center justify-center rounded-xl border border-[#DDE5D0] bg-white text-[#1C2B12] disabled:opacity-30 shadow-sm active:scale-95 transition-all"><ChevronLeft size={18} /></button>
              <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="w-10 h-10 flex items-center justify-center rounded-xl border border-[#DDE5D0] bg-white text-[#1C2B12] disabled:opacity-30 shadow-sm active:scale-95 transition-all"><ChevronRight size={18} /></button>
            </div>
          </div>
        </div>
      </div>

      <EditBillModal isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} bill={selectedBill} onSave={handleUpdate} />
      <ViewBillModal isOpen={isViewOpen} onClose={() => setIsViewOpen(false)} bill={selectedBill} onDownload={handleDownloadInvoice} />
      <QuickPayModal isOpen={isPayOpen} onClose={() => setIsPayOpen(false)} bill={selectedBill} onSave={fetchBillingData} />
      <RefundModal isOpen={isRefundOpen} onClose={() => setIsRefundOpen(false)} bill={selectedBill} onSave={fetchBillingData} />

      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }
        .animate-slide-up { animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        
        /* Premium custom top scrollbar styling */
        .custom-top-scrollbar::-webkit-scrollbar {
          height: 6px;
          width: 6px;
        }
        .custom-top-scrollbar::-webkit-scrollbar-track {
          background: #F5F7F0;
          border-radius: 4px;
        }
        .custom-top-scrollbar::-webkit-scrollbar-thumb {
          background-color: rgba(132, 166, 60, 0.35);
          border-radius: 4px;
          transition: background-color 0.2s;
        }
        .custom-top-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: rgba(132, 166, 60, 0.65);
        }
      `}} />
    </div>
  );
};

export default Billing;
