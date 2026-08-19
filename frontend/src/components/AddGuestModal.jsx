import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Users, User, Calendar, CreditCard, X, CheckCircle2, ChevronRight, Mail, Phone, Globe, Loader2, Camera, Upload, Trash2, Edit2, FileText,
  Maximize2, Minimize2, Bookmark, Tag, AlertTriangle, Eye, Download
} from 'lucide-react';
import api, { getUploadUrl } from '../services/api';
import WebcamCapture from './WebcamCapture';
import ImageCropper from './ImageCropper';
import { compressImage } from '../utils/imageCompressor';
import { cleanRoomNumber } from '../utils/roomHelper';
import { useAuth } from '../context/AuthContext';
import GstCalculator from './GstCalculator';

const convertTo24Hour = (timeStr) => {
  if (!timeStr) return "11:00";
  if (!timeStr.includes("AM") && !timeStr.includes("PM")) {
    return timeStr.substring(0, 5);
  }
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return "11:00";
  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const ampm = match[3].toUpperCase();

  if (ampm === "PM" && hours < 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;

  return `${hours.toString().padStart(2, '0')}:${minutes}`;
};

const formatDateForInput = (dateStr) => {
  if (!dateStr) return '';
  const dateOnly = dateStr.split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    return dateOnly;
  }
  if (/^\d{2}-\d{2}-\d{4}$/.test(dateOnly)) {
    const [d, m, y] = dateOnly.split('-');
    return `${y}-${m}-${d}`;
  }
  try {
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
  } catch (e) { }
  return '';
};

const AddGuestModal = ({ isOpen, onClose, onConfirm, initialData = null, preSelectedRoomId = null, inline = false, onlyReservation = false }) => {
  const { activeHotel } = useAuth();
  const platformsList = activeHotel && activeHotel.bookingPlatforms
    ? activeHotel.bookingPlatforms.split(',').map(p => p.trim()).filter(Boolean)
    : [];

  const banksList = activeHotel && activeHotel.onlinePaymentBanks
    ? activeHotel.onlinePaymentBanks.split(',').map(b => b.trim()).filter(Boolean)
    : [];

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [occupiedPopupReason, setOccupiedPopupReason] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanningSide, setScanningSide] = useState('front');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [showOccupiedPopup, setShowOccupiedPopup] = useState(false);

  const getLocalDateTimeString = (dateInput, defaultTime = null) => {
    if (!dateInput) return '';
    const dateObj = new Date(dateInput);
    if (isNaN(dateObj.getTime())) return '';
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    let hours = String(dateObj.getHours()).padStart(2, '0');
    let minutes = String(dateObj.getMinutes()).padStart(2, '0');
    if (defaultTime) {
      const parts = defaultTime.split(':');
      hours = parts[0].padStart(2, '0');
      minutes = (parts[1] || '00').substring(0, 2).padStart(2, '0');
    }
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const formatDisplayDateTime = (dateTimeStr) => {
    if (!dateTimeStr) return '';
    const [datePart, timePart] = dateTimeStr.split('T');
    if (!datePart) return '';

    const [year, month, day] = datePart.split('-');
    const formattedDate = `${day}-${month}-${year}`;

    if (!timePart) return formattedDate;
    const [hourStr, minStr] = timePart.split(':');
    const hour = parseInt(hourStr);
    const min = minStr ? minStr.substring(0, 2) : '00';

    if (isNaN(hour)) return `${formattedDate} ${timePart}`;

    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    const formattedHour = String(hour12).padStart(2, '0');

    return `${formattedDate} ${formattedHour}:${min} ${ampm}`;
  };

  const generateTimeOptions = () => {
    const options = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let min of ['00', '30']) {
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 || 12;
        const displayHour = String(hour12).padStart(2, '0');
        const value = `${String(hour).padStart(2, '0')}:${min}`;
        const label = `${displayHour}:${min} ${ampm}`;
        options.push({ value, label });
      }
    }
    return options;
  };

  const getTimeOptionsForValue = (currentVal) => {
    const baseOptions = generateTimeOptions();
    if (!currentVal) return baseOptions;
    const timeOnly = currentVal.includes('T') ? currentVal.split('T')[1] : currentVal;
    if (!timeOnly) return baseOptions;
    const exists = baseOptions.some(opt => opt.value === timeOnly);
    if (!exists) {
      const parts = timeOnly.split(':');
      const h = parseInt(parts[0]);
      const m = parts[1] || '00';
      if (!isNaN(h)) {
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        const displayH = String(h12).padStart(2, '0');
        const label = `${displayH}:${m} ${ampm}`;
        baseOptions.push({ value: timeOnly, label });
        baseOptions.sort((a, b) => a.value.localeCompare(b.value));
      }
    }
    return baseOptions;
  };

  const handleDateChange = (name, dateVal) => {
    setFormData(prev => {
      const currentVal = prev[name] || '';
      const timePart = currentVal.includes('T') ? currentVal.split('T')[1] : '12:00';
      return {
        ...prev,
        [name]: `${dateVal}T${timePart}`
      };
    });
  };

  const handleTimeChange = (name, timeVal) => {
    setFormData(prev => {
      const currentVal = prev[name] || '';
      const datePart = currentVal.includes('T') ? currentVal.split('T')[0] : getLocalDateTimeString(new Date()).split('T')[0];
      const newVal = `${datePart}T${timeVal}`;
      return { ...prev, [name]: newVal };
    });
  };

  const [formData, setFormData] = useState({
    guestName: '', phone: '', email: '', nationality: 'Indian',
    gender: 'Male', age: '', idType: 'Aadhar', idNumber: '', address: '',
    numberOfGuests: 1, numberOfAdults: 1, numberOfChildren: 0,
    aadhaarFront: null, aadhaarBack: null, signature: null,
    guestPhoto: null, isChild: false,
    bookingDate: getLocalDateTimeString(new Date()),
    checkInDate: getLocalDateTimeString(new Date()),
    checkOutDate: getLocalDateTimeString(new Date(Date.now() + 86400000), convertTo24Hour(activeHotel?.checkoutTime)),
    bookingType: 'Walk-in', roomId: '', amountPaid: 0, paymentStatus: 'Pending',
    totalAmount: 0,
    passportNumber: '', passportExpiry: '', visaNumber: '', visaType: 'Tourist',
    visaExpiry: '', country: 'United States', arrivalFrom: '', nextDestination: '',
    purposeOfVisit: '',
    paymentMode: 'Cash',
    paymentBank: '',
    guestGst: '',
    companyName: '',
    companyAddress: '',
    discount: 0
  });

  const [extraGuests, setExtraGuests] = useState([]);
  const [scanningExtraIndex, setScanningExtraIndex] = useState(null);
  const [croppingIndex, setCroppingIndex] = useState(null);

  const [isEditingAmount, setIsEditingAmount] = useState(false);
  const [tempAmount, setTempAmount] = useState('');
  const [isCustomIdType, setIsCustomIdType] = useState(false);
  const [croppingImage, setCroppingImage] = useState(null);
  const [croppingField, setCroppingField] = useState(null);
  const [originalImages, setOriginalImages] = useState({ aadhaarFront: null, aadhaarBack: null, guestPhoto: null });
  const [selectedRoomIds, setSelectedRoomIds] = useState([]);
  const [customRates, setCustomRates] = useState({});
  const [showRoomDropdown, setShowRoomDropdown] = useState(false);
  const [bookingMode, setBookingMode] = useState('single');
  const dropdownRef = useRef(null);

  const [gstOption, setGstOption] = useState('none');
  const [isCustomGst, setIsCustomGst] = useState(false);
  const [gstRate, setGstRate] = useState(12);
  const [lockWarningModal, setLockWarningModal] = useState({ show: false, message: '' });

  const calculateMinPastAccruedCharges = () => {
    if (!initialData) return 0;
    const isGroup = initialData.groupBookings && initialData.groupBookings.length > 1;
    const bookings = isGroup ? initialData.groupBookings : [initialData];
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
        const savedEarlyCharge = Number(initialData.earlyCheckInCharge || 0);
        const primaryId = initialData.roomId ? Number(initialData.roomId) : null;
        const isPrimary = Number(b.id) === Number(initialData.id) || Number(b.roomId) === primaryId || idx === 0;
        const earlyDeduction = isPrimary ? savedEarlyCharge : 0;
        const bBase = Number(b.totalAmount || 0) - earlyDeduction;

        const ratePerNight = totalDays > 0 ? (bBase / totalDays) : bBase;

        totalPastMin += (ratePerNight * pastDays);
      }
    });

    return Math.round(totalPastMin * 100) / 100;
  };

  useEffect(() => {
    if (activeHotel?.defaultGstRate !== undefined) {
      const rate = Number(activeHotel.defaultGstRate);
      setGstRate(rate);
      setIsCustomGst(![5, 12, 18, 28].includes(rate));
    }
    if (activeHotel?.defaultGstOption !== undefined) {
      setGstOption(activeHotel.defaultGstOption);
    }
  }, [activeHotel]);

  const handleGstOptionChange = (newOption) => {
    if (newOption === gstOption) return;
    setGstOption(newOption);
    if (newOption === 'none') {
      setGstRate(0);
    } else {
      const defaultRate = activeHotel?.defaultGstRate !== undefined ? Number(activeHotel.defaultGstRate) : 12;
      setGstRate(gstRate === 0 ? defaultRate : gstRate);
    }
  };

  const handleGstRateChange = (newRate) => {
    const parsedRate = Number(newRate || 0);
    setFormData(prev => {
      let updatedTotal = prev.totalAmount;
      if (gstOption === 'inclusive') {
        const inclusiveAmount = prev.totalAmount ? Number(prev.totalAmount) * (1 + Number(gstRate || 0) / 100) : 0;
        const raw = inclusiveAmount ? (inclusiveAmount / (1 + parsedRate / 100)) : 0;
        updatedTotal = raw ? Number((Math.round(raw * 100) / 100).toFixed(2)) : '';
      }
      return {
        ...prev,
        totalAmount: updatedTotal
      };
    });
    setGstRate(parsedRate);
  };


  const [bookingTypeCategory, setBookingTypeCategory] = useState('Walk-in');
  const [selectedPlatform, setSelectedPlatform] = useState(platformsList[0] || '');

  const [chargePreviousDay, setChargePreviousDay] = useState(false);
  const [earlyCheckInCharge, setEarlyCheckInCharge] = useState(0);
  const [earlyCheckInType, setEarlyCheckInType] = useState('full_day');
  const [submitStatus, setSubmitStatus] = useState('Active');
  const [previewDoc, setPreviewDoc] = useState(null);

  const isEarlyCheckIn = (() => {
    if (!formData.checkInDate || !formData.checkInDate.includes('T')) return false;
    const checkInTime = formData.checkInDate.split('T')[1];
    const checkoutTime24 = convertTo24Hour(activeHotel?.checkoutTime);
    return checkInTime && checkInTime < checkoutTime24;
  })();

  const earlyCheckInInitializedRef = useRef(false);

  useEffect(() => {
    if (initialData) return; // In edit mode, initialData defines chargePreviousDay
    setChargePreviousDay(false);
  }, [isEarlyCheckIn, initialData]);

  useEffect(() => {
    if (initialData) return; // In edit mode, initialData defines earlyCheckInCharge
    if (isEarlyCheckIn && selectedRoomIds.length && rooms.length) {
      let standardTotal = 0;
      selectedRoomIds.forEach(id => {
        const r = rooms.find(room => room.id === id);
        if (r) standardTotal += Number(r.pricePerNight || 0);
      });
      setEarlyCheckInCharge(standardTotal);
    } else {
      setEarlyCheckInCharge(0);
    }
  }, [isEarlyCheckIn, selectedRoomIds, rooms, initialData]);

  const [countriesList, setCountriesList] = useState([
    'United States', 'Bangladesh', 'Nepal', 'Bhutan', 'United Kingdom', 'Germany',
    'Canada', 'Australia', 'France', 'Singapore', 'Malaysia', 'India', 'Japan',
    'United Arab Emirates', 'Saudi Arabia', 'Russia', 'Sri Lanka', 'Maldives',
    'Thailand', 'Italy', 'Switzerland', 'Netherlands', 'New Zealand', 'China',
    'South Africa', 'Brazil', 'Argentina', 'Mexico', 'Spain', 'Sweden', 'Others'
  ].sort((a, b) => a.localeCompare(b)));

  useEffect(() => {
    // Keep standard fallback country list to remain fully offline-capable and avoid browser console CORS alerts
  }, []);

  const handleBookingTypeCategoryChange = (e) => {
    const category = e.target.value;
    setBookingTypeCategory(category);

    if (category === 'Online') {
      const platform = selectedPlatform || platformsList[0] || '';
      setSelectedPlatform(platform);
      setFormData(prev => ({ ...prev, bookingType: platform ? `Online - ${platform}` : 'Online' }));
    } else {
      setFormData(prev => ({ ...prev, bookingType: category }));
    }
  };

  const handlePlatformChange = (e) => {
    const platform = e.target.value;
    setSelectedPlatform(platform);
    setFormData(prev => ({ ...prev, bookingType: platform ? `Online - ${platform}` : 'Online' }));
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);



  const handleFullscreenToggle = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error(`Error entering fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen().catch((err) => {
        console.error(`Error exiting fullscreen: ${err.message}`);
      });
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowRoomDropdown(false);
      }
    };
    if (showRoomDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showRoomDropdown]);

  useEffect(() => {
    if (isOpen) {
      fetchRooms();
      fetchBookings();
      if (initialData) {
        let cat = 'Walk-in';
        let plat = platformsList[0] || '';
        if (initialData.bookingType && initialData.bookingType.startsWith('Online')) {
          cat = 'Online';
          const parts = initialData.bookingType.split(' - ');
          plat = parts[1] || platformsList[0] || '';
        } else if (initialData.bookingType) {
          cat = initialData.bookingType;
        }
        setBookingTypeCategory(cat);
        setSelectedPlatform(plat);

        let parsedExtra = [];
        try {
          if (initialData.extraGuests) {
            const list = typeof initialData.extraGuests === 'string'
              ? JSON.parse(initialData.extraGuests)
              : initialData.extraGuests;
            parsedExtra = list.map(g => ({
              name: g.name || '',
              phone: g.phone || '',
              age: g.age || '',
              gender: g.gender || 'Male',
              nationality: g.nationality || 'Indian',
              idType: g.idType || 'Aadhar',
              idNumber: g.idNumber || '',
              passportExpiry: formatDateForInput(g.passportExpiry),
              visaNumber: g.visaNumber || '',
              visaExpiry: formatDateForInput(g.visaExpiry),
              country: g.country || 'United States',
              idFront: g.idFront || null,
              idBack: g.idBack || null,
              isChild: !!g.isChild
            }));
          }
        } catch (e) {
          console.error("Failed to parse extraGuests", e);
        }
        setExtraGuests(parsedExtra || []);

        const totalGuests = initialData.numberOfGuests || 1;
        const childrenCount = (initialData.isChild ? 1 : 0) + parsedExtra.filter(g => g.isChild).length;
        const adultsCount = Math.max(1, totalGuests - childrenCount);

        if (initialData.isRepeatCheckIn) {
          const totalGuests = (parsedExtra || []).length + 1;
          const childrenCount = (initialData.isChild ? 1 : 0) + parsedExtra.filter(g => g.isChild).length;
          const adultsCount = Math.max(1, totalGuests - childrenCount);

          setFormData({
            ...initialData,
            id: undefined,
            groupBookingId: undefined,
            previousRoomNumber: undefined,
            previousRoomRate: undefined,
            previousRoomId: undefined,
            shiftDate: undefined,
            status: 'Active',
            fatherName: initialData.fatherName || '',
            guestPhoto: initialData.guestPhoto || null,
            idNumber: initialData.idProof || initialData.idNumber || '',
            address: initialData.address || '',
            isChild: !!initialData.isChild,
            numberOfGuests: totalGuests,
            numberOfAdults: adultsCount,
            numberOfChildren: childrenCount,
            bookingDate: getLocalDateTimeString(new Date()),
            checkInDate: getLocalDateTimeString(new Date()),
            checkOutDate: getLocalDateTimeString(new Date(Date.now() + 86400000), convertTo24Hour(activeHotel?.checkoutTime)),
            passportNumber: initialData.passportNumber || '',
            passportExpiry: formatDateForInput(initialData.passportExpiry),
            visaNumber: initialData.visaNumber || '',
            visaType: initialData.visaType || 'Tourist',
            visaExpiry: formatDateForInput(initialData.visaExpiry),
            country: initialData.country || 'United States',
            arrivalFrom: initialData.arrivalFrom || '',
            nextDestination: initialData.nextDestination || '',
            purposeOfVisit: initialData.purposeOfVisit || '',
            paymentMode: 'Cash',
            paymentBank: '',
            amountPaid: 0,
            paymentStatus: 'Pending',
            guestGst: initialData.guestGst || '',
            companyName: initialData.companyName || '',
            companyAddress: initialData.companyAddress || '',
            discount: 0,
            discountReason: ''
          });

          if (initialData.selectedRoomId) {
            setSelectedRoomIds([Number(initialData.selectedRoomId)]);
          }
        } else {
          setFormData({
            ...initialData,
            fatherName: initialData.fatherName || '',
            guestPhoto: initialData.guestPhoto || null,
            idNumber: initialData.idProof || '',
            address: initialData.address || '',
            isChild: !!initialData.isChild,
            numberOfAdults: adultsCount,
            numberOfChildren: childrenCount,
            bookingDate: initialData.bookingDate ? (initialData.bookingDate.includes('T') ? initialData.bookingDate : `${initialData.bookingDate}T${initialData.bookingTime || '12:00'}`) : (initialData.createdAt ? getLocalDateTimeString(new Date(initialData.createdAt)) : getLocalDateTimeString(new Date())),
            checkInDate: getLocalDateTimeString(initialData.checkInDate, initialData.checkInTime || '12:00'),
            checkOutDate: getLocalDateTimeString(initialData.checkOutDate, initialData.checkOutTime || convertTo24Hour(activeHotel?.checkoutTime)),
            passportNumber: initialData.passportNumber || '',
            passportExpiry: formatDateForInput(initialData.passportExpiry),
            visaNumber: initialData.visaNumber || '',
            visaType: initialData.visaType || 'Tourist',
            visaExpiry: formatDateForInput(initialData.visaExpiry),
            country: initialData.country || 'United States',
            arrivalFrom: initialData.arrivalFrom || '',
            nextDestination: initialData.nextDestination || '',
            purposeOfVisit: initialData.purposeOfVisit || '',
            paymentMode: initialData.paymentMode || 'Cash',
            paymentBank: initialData.paymentBank || '',
            guestGst: initialData.guestGst || '',
            companyName: initialData.companyName || '',
            companyAddress: initialData.companyAddress || '',
            discount: initialData.discount || (initialData.groupBookings ? initialData.groupBookings.reduce((sum, b) => sum + Number(b.discount || 0), 0) : 0),
            discountReason: initialData.discountReason || ''
          });
        }
        setOriginalImages({
          aadhaarFront: initialData.originalAadhaarFront || null,
          aadhaarBack: initialData.originalAadhaarBack || null,
          guestPhoto: initialData.originalGuestPhoto || null
        });
        const startStr = initialData.checkInDate ? initialData.checkInDate.split('T')[0] : '';
        const endStr = initialData.checkOutDate ? initialData.checkOutDate.split('T')[0] : '';
        const start = new Date(startStr);
        const end = new Date(endStr);
        const diffDays = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)) || 1;

        const savedGstOption = initialData.gstOption || ((initialData.gstRate && Number(initialData.gstRate) > 0) ? 'exclusive' : 'none');
        const savedGstRate = initialData.gstRate !== undefined && initialData.gstRate !== null ? Number(initialData.gstRate) : (activeHotel?.defaultGstRate !== undefined ? Number(activeHotel.defaultGstRate) : 12);
        const rateFactor = savedGstOption === 'inclusive' ? (1 + Number(savedGstRate || 0) / 100) : 1;

        const initialCustomRates = {};
        const savedEarlyCharge = Number(initialData.earlyCheckInCharge || 0);
        const initHasEarlyFullDay = !!(initialData.chargePreviousDay && (initialData.earlyCheckInType === 'full_day' || !initialData.earlyCheckInCharge || Number(initialData.earlyCheckInCharge) === 0));
        const initEffectiveDays = initHasEarlyFullDay ? diffDays + 1 : diffDays;

        if (initialData.isRepeatCheckIn) {
          // Room already set at line 489 via setSelectedRoomIds;
          // Use default GST settings for new check-in
          setCustomRates({});
          setBookingMode('single');
          const defRate = activeHotel?.defaultGstRate !== undefined ? Number(activeHotel.defaultGstRate) : 12;
          setGstOption(activeHotel?.defaultGstOption || 'none');
          setGstRate(defRate);
          setIsCustomGst(![5, 12, 18, 28].includes(defRate));
          setChargePreviousDay(false);
          setEarlyCheckInCharge(0);
          setEarlyCheckInType('full_day');
        } else if (initialData.groupBookings && initialData.groupBookings.length > 1) {
          setSelectedRoomIds(initialData.groupBookings.map(b => Number(b.roomId)));
          setBookingMode('multiple');

          const totalAmount = initialData.groupBookings.reduce((sum, b) => sum + Number(b.totalAmount || 0), 0);
          const amountPaid = initialData.groupBookings.reduce((sum, b) => sum + Number(b.amountPaid || 0), 0);
          setFormData(prev => ({ ...prev, totalAmount, amountPaid }));

          // For group bookings, early check-in charge is stored on primary row only
          // Distribute the subtraction proportionally or just subtract from first room
            const primaryId = initialData.roomId ? Number(initialData.roomId) : null;
          initialData.groupBookings.forEach(b => {
            if (b.previousRoomNumber) return; // Do not derive old rate for shifted room
            const earlyDeduction = (Number(b.id) === Number(initialData.id) || Number(b.roomId) === primaryId) ? savedEarlyCharge : 0;
            let bBase = Number(b.totalAmount || 0) - earlyDeduction;
            if (savedGstOption === 'exclusive' && savedGstRate > 0) {
              bBase = bBase / (1 + savedGstRate / 100);
            }
            let bRoomDays = initEffectiveDays;
            if (b.status === 'Completed' && b.checkInDate && b.checkOutDate) {
              const bStart = new Date(b.checkInDate.split('T')[0]);
              const bEnd = new Date(b.checkOutDate.split('T')[0]);
              const daysDiff = Math.max(1, Math.ceil(Math.abs(bEnd - bStart) / (1000 * 60 * 60 * 24)));
              if (!isNaN(daysDiff)) {
                bRoomDays = initHasEarlyFullDay ? daysDiff + 1 : daysDiff;
              }
            }
            let rate = bBase / bRoomDays;
            if (Math.abs(rate - Math.round(rate)) < 0.02) {
              rate = Math.round(rate);
            } else {
              rate = Math.round(rate * 100) / 100;
            }
            initialCustomRates[b.roomId] = rate;
          });
        } else {
          setSelectedRoomIds(initialData.roomId ? [Number(initialData.roomId)] : []);
          setBookingMode('single');

          if (initialData.roomId) {
            if (initialData.previousRoomNumber) {
              const checkInStr = initialData.checkInDate ? initialData.checkInDate.split('T')[0] : '';
              const checkOutStr = initialData.checkOutDate ? initialData.checkOutDate.split('T')[0] : '';
              const cIn = new Date(checkInStr);
              const cOut = new Date(checkOutStr);
              const totalStayDays = Math.max(1, Math.ceil(Math.abs(cOut - cIn) / (1000 * 60 * 60 * 24)));
              let shiftDateStr = initialData.shiftDate || (initialData.updatedAt ? initialData.updatedAt.split('T')[0] : '');
              const todayStr = getLocalDateTimeString(new Date()).split('T')[0];

              if (!shiftDateStr || shiftDateStr < checkInStr || shiftDateStr > checkOutStr) {
                if (todayStr > checkInStr && todayStr <= checkOutStr) shiftDateStr = todayStr;
                else shiftDateStr = new Date(cIn.getTime() + Math.max(1, Math.floor(totalStayDays / 2)) * 86400000).toISOString().split('T')[0];
              }

              let prevDays = 0;
              if (shiftDateStr > checkInStr) {
                prevDays = Math.min(totalStayDays - 1, Math.ceil(Math.abs(new Date(shiftDateStr) - cIn) / (1000 * 60 * 60 * 24)));
              }
              const curDays = Math.max(1, totalStayDays - prevDays);

              const prevRatesList = String(initialData.previousRoomRate || '').split(/→|->|,|>/).map(s => Number(s.trim())).filter(n => !isNaN(n));
              const prevRooms = String(initialData.previousRoomNumber).split(/\s*(?:→|->|─>|&rarr;|[,\->→])\s*/).map(s => cleanRoomNumber(s.trim())).filter(Boolean);

              let prevTotalSum = 0;
              if (prevRooms.length > 0) {
                let remainingPrevDays = prevDays;
                prevRooms.forEach((pRm, pIdx) => {
                  const daysForThisRoom = pIdx === 0 ? prevDays : 0;
                  const pKey = `prev_${initialData.roomId}_${pIdx}`;
                  const pRate = prevRatesList[pIdx] !== undefined ? prevRatesList[pIdx] : (prevRatesList[0] !== undefined ? prevRatesList[0] : 0);
                  initialCustomRates[pKey] = pRate;
                  const prevRoomCharge = daysForThisRoom > 0 ? (pRate * daysForThisRoom) : pRate;
                  prevTotalSum += prevRoomCharge;
                });
              }

              let totalAmt = Number(initialData.totalAmount || 0) - savedEarlyCharge;
              if (savedGstOption === 'exclusive' && savedGstRate > 0) {
                totalAmt = totalAmt / (1 + savedGstRate / 100);
              }
              const currentRoomTotal = Math.max(0, totalAmt - prevTotalSum);
              let curRate = currentRoomTotal / curDays;
              if (curRate <= 0) {
                const rmObj = rooms.find(r => Number(r.id) === Number(initialData.roomId));
                let baseRmPrice = rmObj?.pricePerNight ? Number(rmObj.pricePerNight) : (matchingBooking?.Room?.pricePerNight ? Number(matchingBooking.Room.pricePerNight) : 800);
                if (savedGstOption === 'inclusive' && savedGstRate > 0) {
                  baseRmPrice = Math.round((baseRmPrice / (1 + savedGstRate / 100)) * 100) / 100;
                }
                curRate = baseRmPrice;
              }
              if (Math.abs(curRate - Math.round(curRate)) < 0.02) {
                curRate = Math.round(curRate);
              } else {
                curRate = Math.round(curRate * 100) / 100;
              }
              initialCustomRates[initialData.roomId] = curRate;
            } else {
              let bBase = Number(initialData.totalAmount || 0) - savedEarlyCharge;
              if (savedGstOption === 'exclusive' && savedGstRate > 0) {
                bBase = bBase / (1 + savedGstRate / 100);
              }
              let rate = bBase / initEffectiveDays;
              if (Math.abs(rate - Math.round(rate)) < 0.02) {
                rate = Math.round(rate);
              } else {
                rate = Math.round(rate * 100) / 100;
              }
              initialCustomRates[initialData.roomId] = rate;
            }
          }
        }
        setCustomRates(initialCustomRates);
        const standardIds = ['Aadhar', 'Passport', 'Driving License', 'Voter ID'];
        if (initialData.idType && !standardIds.includes(initialData.idType)) {
          setIsCustomIdType(true);
        } else {
          setIsCustomIdType(false);
        }
        if (!initialData.isRepeatCheckIn) {
          const hasEarly = !!(initialData.chargePreviousDay || (initialData.earlyCheckInCharge && Number(initialData.earlyCheckInCharge) > 0));
          setChargePreviousDay(hasEarly);
          setEarlyCheckInCharge(initialData.earlyCheckInCharge !== undefined && initialData.earlyCheckInCharge !== null ? Number(initialData.earlyCheckInCharge) : 0);
          const initType = initialData.earlyCheckInType || (initialData.earlyCheckInCharge && Number(initialData.earlyCheckInCharge) > 0 ? 'custom_fee' : 'full_day');
          setEarlyCheckInType(initType);
          setGstOption(savedGstOption);
          setGstRate(savedGstRate);
          setIsCustomGst(initialData.gstRate ? ![5, 12, 18, 28].includes(Number(initialData.gstRate)) : false);
        }
      } else {
        earlyCheckInInitializedRef.current = false;
        earlyCheckInInitializedRef._pastFirst = false;
        setBookingTypeCategory('Walk-in');
        setSelectedPlatform(platformsList[0] || '');
        setFormData({
          guestName: '', fatherName: '', phone: '', email: '', nationality: 'Indian',
          gender: 'Male', age: '', idType: 'Aadhar', idNumber: '', address: '',
          numberOfGuests: 1, numberOfAdults: 1, numberOfChildren: 0,
          aadhaarFront: null, aadhaarBack: null, signature: null,
          guestPhoto: null, isChild: false,
          bookingDate: getLocalDateTimeString(new Date()),
          checkInDate: getLocalDateTimeString(new Date()),
          checkOutDate: getLocalDateTimeString(new Date(Date.now() + 86400000), convertTo24Hour(activeHotel?.checkoutTime)),
          bookingType: 'Walk-in', roomId: preSelectedRoomId || '', amountPaid: 0, paymentStatus: 'Pending',
          totalAmount: 0,
          passportNumber: '', passportExpiry: '', visaNumber: '', visaType: 'Tourist',
          visaExpiry: '', country: 'United States', arrivalFrom: '', nextDestination: '',
          purposeOfVisit: '',
          paymentMode: 'Cash',
          paymentBank: '',
          discountReason: ''
        });
        setExtraGuests([]);
        setSelectedRoomIds(preSelectedRoomId ? [Number(preSelectedRoomId)] : []);
        setOriginalImages({ aadhaarFront: null, aadhaarBack: null, guestPhoto: null });
        setIsCustomIdType(false);
        const defRate = activeHotel?.defaultGstRate !== undefined ? Number(activeHotel.defaultGstRate) : 12;
        setGstOption(activeHotel?.defaultGstOption || 'none');
        setGstRate(defRate);
        setIsCustomGst(![5, 12, 18, 28].includes(defRate));
        setCustomRates({});
      }
    }
  }, [isOpen, initialData, preSelectedRoomId]);

  useEffect(() => {
    if (formData.phone.length === 10 && !initialData) {
      const fetchGuest = async () => {
        try {
          const response = await api.get(`/bookings/guest/${formData.phone}`);
          if (response.data.data) {
            const guest = response.data.data;
            setFormData(prev => ({
              ...prev,
              guestName: guest.guestName || prev.guestName,
              email: guest.email || prev.email,
              gender: guest.gender || prev.gender,
              age: guest.age || prev.age,
              nationality: guest.nationality || prev.nationality,
              idType: guest.idType || prev.idType,
              idNumber: guest.idProof || prev.idNumber,
              address: guest.address || prev.address,
              aadhaarFront: guest.aadhaarFront || prev.aadhaarFront,
              aadhaarBack: guest.aadhaarBack || prev.aadhaarBack,
              guestPhoto: guest.guestPhoto || prev.guestPhoto,
              signature: guest.signature || prev.signature,
              guestGst: guest.guestGst || prev.guestGst,
              companyName: guest.companyName || prev.companyName,
              companyAddress: guest.companyAddress || prev.companyAddress
            }));
          }
        } catch (err) {
          console.error("Guest lookup failed", err);
        }
      };
      fetchGuest();
    }
  }, [formData.phone]);

  const roomCalculationDetails = useMemo(() => {
    if (!selectedRoomIds.length || !rooms.length) return [];

    const startStr = formData.checkInDate ? formData.checkInDate.split('T')[0] : '';
    const endStr = formData.checkOutDate ? formData.checkOutDate.split('T')[0] : '';
    if (!startStr || !endStr) return [];

    const start = new Date(startStr);
    const end = new Date(endStr);
    const baseDays = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)) || 1;
    const effectiveDays = (chargePreviousDay && earlyCheckInType === 'full_day') ? baseDays + 1 : baseDays;

    const details = [];
    selectedRoomIds.forEach(id => {
      let selectedRoom = rooms.find(r => r.id === id || String(r.id) === String(id) || String(r.roomNumber) === cleanRoomNumber(id));
      if (!selectedRoom && initialData?.groupBookings) {
        const b = initialData.groupBookings.find(gb => Number(gb.roomId) === Number(id) || String(gb.Room?.roomNumber) === String(id));
        if (b && b.Room) selectedRoom = b.Room;
      }
      if (!selectedRoom && initialData?.Room) {
        selectedRoom = initialData.Room;
      }
      if (!selectedRoom) return;

      const initialBookingRate = initialData?.totalAmount ? Number(initialData.totalAmount) : 0;
      const rawRateVal = customRates[id] !== undefined
        ? customRates[id]
        : (selectedRoom.pricePerNight ? Number(selectedRoom.pricePerNight) : initialBookingRate);
      const rate = rawRateVal === '' ? '' : (isNaN(Number(rawRateVal)) ? 0 : Number(rawRateVal));
      const calcRate = Number(rate) || 0;

      // Check if this room booking had a room shift
      const matchingBooking = initialData?.groupBookings && initialData.groupBookings.length > 1
        ? initialData.groupBookings.find(b => Number(b.roomId) === Number(id))
        : (initialData && Number(initialData.roomId) === Number(id) ? initialData : null);

      if (matchingBooking && matchingBooking.previousRoomNumber) {
        let shiftDateStr = matchingBooking.shiftDate || (matchingBooking.updatedAt ? matchingBooking.updatedAt.split('T')[0] : '');
        const todayYMDStr = getLocalDateTimeString(new Date()).split('T')[0];

        if (!shiftDateStr || shiftDateStr < startStr || shiftDateStr > endStr) {
          if (todayYMDStr > startStr && todayYMDStr <= endStr) {
            shiftDateStr = todayYMDStr;
          } else {
            const midDays = Math.max(1, Math.floor(effectiveDays / 2));
            const midDate = new Date(start.getTime() + midDays * 86400000);
            shiftDateStr = midDate.toISOString().split('T')[0];
          }
        }

        let prevDays = 0;
        if (shiftDateStr > startStr) {
          prevDays = Math.min(effectiveDays - 1, Math.ceil(Math.abs(new Date(shiftDateStr) - start) / (1000 * 60 * 60 * 24)));
        }
        const curDays = Math.max(1, effectiveDays - prevDays);

        const prevRoomObj = rooms.find(r => cleanRoomNumber(r.roomNumber) === cleanRoomNumber(matchingBooking.previousRoomNumber) || r.id === matchingBooking.previousRoomId);
        const prevRates = String(matchingBooking.previousRoomRate || '').split(/→|->|,|>/).map(s => Number(s.trim())).filter(n => !isNaN(n));
        const prevType = matchingBooking.previousRoomType || prevRoomObj?.type || selectedRoom.type || 'Deluxe';

        const prevRooms = String(matchingBooking.previousRoomNumber).split(/\s*(?:→|->|─>|&rarr;|[,\->→])\s*/).map(s => cleanRoomNumber(s.trim())).filter(Boolean);
        if (prevRooms.length > 0) {
          prevRooms.forEach((pRm, pIdx) => {
            const daysForThisRoom = pIdx === 0 ? prevDays : 0;
            const pKey = `prev_${id}_${pIdx}`;
            const pRoomObj = rooms.find(r => cleanRoomNumber(r.roomNumber) === cleanRoomNumber(pRm));
            const fallbackP = prevRates[pIdx] !== undefined && !isNaN(prevRates[pIdx]) ? prevRates[pIdx] : (pRoomObj?.pricePerNight ? Number(pRoomObj.pricePerNight) : Number(rate));
            const rawVal = customRates[pKey] !== undefined
              ? customRates[pKey]
              : (customRates[`prev_${id}`] !== undefined ? customRates[`prev_${id}`] : fallbackP);
            const pRate = rawVal;
            const pNum = Number(rawVal) || 0;
            const pTotal = daysForThisRoom > 0 ? (pNum * daysForThisRoom) : pNum;
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

        const prevTotalSum = details.filter(d => d.isShiftedPrevious).reduce((s, d) => s + (Number(d.total) || 0), 0);
        const remBase = (matchingBooking.totalAmount ? Number(matchingBooking.totalAmount) : 0) - prevTotalSum;
        const fallbackCurRate = (curDays > 0 && remBase > 0)
          ? (remBase / curDays)
          : ((selectedRoom.pricePerNight && Number(selectedRoom.pricePerNight) > 0)
              ? (gstOption === 'inclusive' && gstRate > 0
                  ? Math.round((Number(selectedRoom.pricePerNight) / (1 + gstRate / 100)) * 100) / 100
                  : Number(selectedRoom.pricePerNight))
              : (matchingBooking.Room?.pricePerNight ? Number(matchingBooking.Room.pricePerNight) : Number(rate || 0)));

        const curRawVal = customRates[id] !== undefined
          ? customRates[id]
          : fallbackCurRate;
        const curRate = curRawVal;
        const curNum = Number(curRawVal) || 0;
        const curTotal = curNum * curDays;
        details.push({
          roomId: id,
          roomNumber: selectedRoom.roomNumber || 'N/A',
          type: selectedRoom.type || '',
          rate: curRate,
          days: curDays,
          total: curTotal
        });
      } else {
        let roomDays = effectiveDays;
        if (matchingBooking?.status === 'Completed' && matchingBooking.checkInDate && matchingBooking.checkOutDate) {
          const bStart = new Date(matchingBooking.checkInDate.split('T')[0]);
          const bEnd = new Date(matchingBooking.checkOutDate.split('T')[0]);
          const daysDiff = Math.max(1, Math.ceil(Math.abs(bEnd - bStart) / (1000 * 60 * 60 * 24)));
          if (!isNaN(daysDiff)) {
            roomDays = (chargePreviousDay && earlyCheckInType === 'full_day') ? daysDiff + 1 : daysDiff;
          }
        }
        const totalBase = calcRate * roomDays;
        details.push({
          roomId: id,
          roomNumber: selectedRoom.roomNumber || 'N/A',
          type: selectedRoom.type || '',
          rate: rate,
          days: roomDays,
          total: totalBase,
          status: matchingBooking?.status
        });
      }
    });

    return details;
  }, [selectedRoomIds, rooms, formData.checkInDate, formData.checkOutDate, chargePreviousDay, earlyCheckInType, customRates, initialData]);

  useEffect(() => {
    if (!selectedRoomIds.length || !rooms.length) return;

    let total = roomCalculationDetails.reduce((sum, item) => sum + Number(item.total || 0), 0);

    if (chargePreviousDay && earlyCheckInType === 'custom_fee') {
      total += Number(earlyCheckInCharge || 0);
    }

    let isSameAsInitial = false;
    if (initialData) {
      const initialStart = initialData.checkInDate?.split('T')[0];
      const initialEnd = initialData.checkOutDate?.split('T')[0];
      if (formData.checkInDate === initialStart && formData.checkOutDate === initialEnd) {
        const initialRoomIds = initialData.groupBookings && initialData.groupBookings.length > 1
          ? initialData.groupBookings.map(b => Number(b.roomId)).sort().join(',')
          : [Number(initialData.roomId)].sort().join(',');
        const currentRoomIds = [...selectedRoomIds].sort().join(',');
        if (currentRoomIds === initialRoomIds) {
          const customRatesModified = Object.keys(customRates).some(id => {
            const currentVal = customRates[id];
            const matchingInitial = initialData.groupBookings && initialData.groupBookings.length > 1
              ? initialData.groupBookings.find(b => Number(b.roomId) === Number(id))
              : (Number(initialData.roomId) === Number(id) ? initialData : null);
            if (!matchingInitial) return false;
            const initHasEarlyFullDay = !!(initialData.chargePreviousDay && (initialData.earlyCheckInType === 'full_day' || !initialData.earlyCheckInCharge || Number(initialData.earlyCheckInCharge) === 0));
            const initDays = Math.ceil(Math.abs(new Date(initialEnd) - new Date(initialStart)) / (1000 * 60 * 60 * 24)) || 1;
            const initEffectiveDays = initHasEarlyFullDay ? initDays + 1 : initDays;
            const initialRate = Number(matchingInitial.totalAmount || 0) / initEffectiveDays;
            return Math.abs(currentVal - initialRate) > 0.0001;
          });

          if (!customRatesModified && !initialData.previousRoomNumber) {
            isSameAsInitial = true;
          }
        }
      }
    }

    if (!isSameAsInitial) {
      setFormData(prev => ({ ...prev, totalAmount: total }));
    }
  }, [roomCalculationDetails, gstOption, gstRate, chargePreviousDay, earlyCheckInCharge, earlyCheckInType, initialData, selectedRoomIds, rooms, formData.checkInDate, formData.checkOutDate, customRates]);

  const fetchRooms = async () => {
    try {
      const response = await api.get('/rooms');
      setRooms(response.data.data);
    } catch (error) {
      console.error('Error fetching rooms:', error);
    }
  };

  const fetchBookings = async () => {
    try {
      const response = await api.get('/bookings/active');
      if (response.data?.data) {
        setBookings(response.data.data);
      }
    } catch (err) {
      console.error('Error fetching bookings:', err);
    }
  };

  const checkRoomAvailability = (roomId, checkIn, checkOut) => {
    if (!checkIn || !checkOut) return { available: true };

    let cleanCheckIn, cleanCheckOut;
    try {
      cleanCheckIn = new Date(checkIn).toISOString().split('T')[0];
      cleanCheckOut = new Date(checkOut).toISOString().split('T')[0];
    } catch (e) {
      return { available: true };
    }

    const roomBookings = bookings.filter(b =>
      b.roomId === roomId &&
      b.id !== (initialData?.id || '') &&
      ['Active', 'Confirmed'].includes(b.status)
    );

    const overlappingBooking = roomBookings.find(b => {
      try {
        const bCheckIn = new Date(b.checkInDate).toISOString().split('T')[0];
        const bCheckOut = new Date(b.checkOutDate).toISOString().split('T')[0];
        return bCheckIn < cleanCheckOut && bCheckOut > cleanCheckIn;
      } catch (e) {
        return false;
      }
    });

    if (overlappingBooking) {
      const ciDate = new Date(overlappingBooking.checkInDate);
      const coDate = new Date(overlappingBooking.checkOutDate);
      const formattedCheckIn = `${String(ciDate.getDate()).padStart(2, '0')}/${String(ciDate.getMonth() + 1).padStart(2, '0')}`;
      const formattedCheckOut = `${String(coDate.getDate()).padStart(2, '0')}/${String(coDate.getMonth() + 1).padStart(2, '0')}`;
      return {
        available: false,
        reason: `Booked [${formattedCheckIn} - ${formattedCheckOut}]`
      };
    }

    const today = new Date().toISOString().split('T')[0];
    const room = rooms.find(r => r.id === roomId);
    const roomStatus = room?.status?.toLowerCase();

    if (roomStatus === 'cleaning') {
      return {
        available: false,
        reason: 'Cleaning',
        statusType: 'cleaning'
      };
    }

    if (roomStatus === 'maintenance') {
      return {
        available: false,
        reason: 'Maintenance',
        statusType: 'maintenance'
      };
    }

    const isOccupiedToday = roomStatus === 'occupied';
    const overlapsToday = cleanCheckIn <= today && cleanCheckOut > today;

    if (isOccupiedToday && overlapsToday) {
      return {
        available: false,
        reason: 'Occupied Today',
        statusType: 'occupied'
      };
    }

    const upcomingBooking = roomBookings.find(b => {
      try {
        const bCheckIn = new Date(b.checkInDate).toISOString().split('T')[0];
        return bCheckIn > today;
      } catch (e) {
        return false;
      }
    });
    if (upcomingBooking) {
      const ciDate = new Date(upcomingBooking.checkInDate);
      const coDate = new Date(upcomingBooking.checkOutDate);
      const formattedCheckIn = `${String(ciDate.getDate()).padStart(2, '0')}/${String(ciDate.getMonth() + 1).padStart(2, '0')}`;
      const formattedCheckOut = `${String(coDate.getDate()).padStart(2, '0')}/${String(coDate.getMonth() + 1).padStart(2, '0')}`;
      return {
        available: true,
        upcoming: `Upcoming [${formattedCheckIn} - ${formattedCheckOut}]`
      };
    }

    return { available: true };
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    if (name === 'nationality' && value === 'Foreign') {
      setExtraGuests(prev => prev.map(g => {
        if (!g.idType || g.idType === 'Aadhar' || g.idType === 'Driving License' || g.idType === 'Voter ID') {
          return { ...g, idType: 'Passport' };
        }
        return g;
      }));
    }
  };

  const handleToggleRoom = (roomId) => {
    const availability = checkRoomAvailability(roomId, formData.checkInDate, formData.checkOutDate);
    const isCurrentRoomInEdit = initialData && initialData.roomId === roomId;

    if (!availability.available && !isCurrentRoomInEdit && !selectedRoomIds.includes(roomId)) {
      setOccupiedPopupReason(availability.reason);
      setShowOccupiedPopup(true);
      return;
    }

    const id = Number(roomId);
    if (bookingMode === 'single') {
      if (selectedRoomIds.map(Number).includes(id)) {
        setSelectedRoomIds([]);
      } else {
        setSelectedRoomIds([id]);
        setShowRoomDropdown(false);
      }
    } else {
      if (selectedRoomIds.map(Number).includes(id)) {
        setSelectedRoomIds(prev => prev.map(Number).filter(x => x !== id));
      } else {
        setSelectedRoomIds(prev => [...new Set([...prev.map(Number), id])]);
      }
    }
  };

  const handleFileChange = (e, field, index = null) => {
    const file = e.target.files[0];
    if (file) {
      if (file.type === 'application/pdf') {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (index !== null) {
            setExtraGuests(prev => {
              const newList = [...prev];
              newList[index] = { ...newList[index], [field]: reader.result };
              return newList;
            });
          } else {
            setOriginalImages(prev => ({ ...prev, [field]: reader.result }));
            setFormData(prev => ({ ...prev, [field]: reader.result }));
          }
        };
        reader.readAsDataURL(file);
      } else {
        const reader = new FileReader();
        reader.onloadend = async () => {
          const compressedImage = await compressImage(reader.result, 1200, 0.75);
          if (index !== null) {
            setCroppingImage(compressedImage);
            setCroppingField(field);
            setCroppingIndex(index);
          } else {
            setOriginalImages(prev => ({ ...prev, [field]: compressedImage }));
            setCroppingImage(compressedImage);
            setCroppingField(field);
            setCroppingIndex(null);
          }
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleCapture = async (image) => {
    let targetField = 'aadhaarFront';
    if (scanningSide === 'back') targetField = 'aadhaarBack';
    else if (scanningSide === 'photo') targetField = 'guestPhoto';
    else if (scanningSide === 'extraFront') targetField = 'idFront';
    else if (scanningSide === 'extraBack') targetField = 'idBack';

    const compressedImage = await compressImage(image, 1200, 0.75);
    if (scanningExtraIndex !== null) {
      setCroppingImage(compressedImage);
      setCroppingField(targetField);
      setCroppingIndex(scanningExtraIndex);
    } else {
      setOriginalImages(prev => ({ ...prev, [targetField]: compressedImage }));
      setCroppingImage(compressedImage);
      setCroppingField(targetField);
      setCroppingIndex(null);
    }
  };

  const handleCropComplete = async (croppedImage) => {
    if (croppingIndex !== null) {
      setExtraGuests(prev => {
        const newList = [...prev];
        newList[croppingIndex] = { ...newList[croppingIndex], [croppingField]: croppedImage };
        return newList;
      });
      setCroppingIndex(null);
    } else {
      setFormData(prev => ({ ...prev, [croppingField]: croppedImage }));
    }
    setCroppingImage(null);
    setCroppingField(null);
    setIsScanning(false);
  };

  useEffect(() => {
    if (selectedRoomIds.length > 0) {
      if (formData.assignedRoomId && !selectedRoomIds.map(Number).includes(Number(formData.assignedRoomId))) {
        setFormData(prev => ({ ...prev, assignedRoomId: selectedRoomIds[0] }));
      }
      setExtraGuests(prev => prev.map(g => {
        if (!g.assignedRoomId || !selectedRoomIds.map(Number).includes(Number(g.assignedRoomId))) {
          const defaultRoomId = selectedRoomIds[0];
          const r = rooms.find(room => Number(room.id) === Number(defaultRoomId));
          return {
            ...g,
            assignedRoomId: defaultRoomId,
            assignedRoomNumber: cleanRoomNumber(r?.roomNumber || defaultRoomId)
          };
        }
        return g;
      }));
    }
  }, [selectedRoomIds, rooms]);

  const handleAddExtraGuest = () => {
    setExtraGuests(prev => {
      const defaultId = formData.nationality === 'Foreign' ? 'Passport' : 'Aadhar';
      const defaultRoomId = selectedRoomIds[0] || '';
      const r = rooms.find(room => Number(room.id) === Number(defaultRoomId));
      const newList = [...prev, {
        name: '', phone: '', age: '', gender: 'Male', nationality: 'Indian',
        idType: defaultId, idNumber: '', idFront: null, idBack: null, isChild: false,
        assignedRoomId: defaultRoomId,
        assignedRoomNumber: cleanRoomNumber(r?.roomNumber || defaultRoomId)
      }];
      setFormData(f => ({ ...f, numberOfGuests: 1 + newList.length }));
      return newList;
    });
  };

  const handleRemoveExtraGuest = (index) => {
    setExtraGuests(prev => {
      const newList = prev.filter((_, idx) => idx !== index);
      setFormData(f => ({ ...f, numberOfGuests: 1 + newList.length }));
      return newList;
    });
  };

  const handleExtraGuestChange = (index, field, value) => {
    setExtraGuests(prev => {
      const newList = [...prev];
      newList[index] = { ...newList[index], [field]: value };
      return newList;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.guestName || !formData.guestName.trim()) {
      return alert('Guest Name is a mandatory field.');
    }
    if (!selectedRoomIds.length) return alert('Please select a room');

    if (activeHotel?.lockPastStayCharges && initialData) {
      const minPast = calculateMinPastAccruedCharges();
      const currentProposedRoomCharges = Number(formData.totalAmount || 0);
      if (minPast > 0 && currentProposedRoomCharges < minPast) {
        setLockWarningModal({
          show: true,
          message: `Action Restricted: Lock Past Stay Charges is enabled for this hotel. You cannot reduce or modify charges accrued for past completed stay days (minimum ₹${minPast.toFixed(2)}).`
        });
        return;
      }
    }

    let [cInD, cInT] = (formData.checkInDate || '').split('T');
    const [cOutD, cOutT] = (formData.checkOutDate || '').split('T');
    const [bD, bT] = (formData.bookingDate || '').split('T');

    const inputCheckInYMD = cInD || '';
    const inputCheckOutYMD = cOutD || '';
    const bookingYMD = bD || '';

    if (inputCheckInYMD && bookingYMD && inputCheckInYMD < bookingYMD) {
      formData.bookingDate = formData.checkInDate;
    }

    if (activeHotel?.restrictBackDates === true) {
      const todayYMD = getLocalDateTimeString(new Date()).split('T')[0];

      // Check-in restriction: past check-in dates of active stays cannot be changed
      if (initialData && initialData.checkInDate && initialData.status === 'Active') {
        const origCheckInYMD = initialData.checkInDate.split('T')[0];
        if (origCheckInYMD < todayYMD && inputCheckInYMD !== origCheckInYMD) {
          return alert(`You cannot change a past check-in date (${origCheckInYMD}) for an active stay.`);
        }
      }

      // New booking check-in check
      if (!initialData && inputCheckInYMD < todayYMD) {
        return alert(`Check-in date cannot be set to a past date.`);
      }

      // Check-out restriction: cannot set check-out date to a past date (before today or before original check-out/check-in date)
      const origCheckOutYMD = initialData?.checkOutDate ? initialData.checkOutDate.split('T')[0] : null;
      const minValidCheckout = origCheckOutYMD
        ? (origCheckOutYMD < todayYMD ? origCheckOutYMD : todayYMD)
        : (inputCheckInYMD > todayYMD ? inputCheckInYMD : todayYMD);

      if (inputCheckOutYMD < minValidCheckout) {
        return alert(`Check-out date cannot be set earlier than ${minValidCheckout}.`);
      }
    }

    if (formData.nationality === 'Foreign' && (!formData.passportNumber || !formData.passportNumber.trim())) {
      return alert('Passport Number is required for Foreign guests.');
    }

    const amountPaidVal = parseFloat(formData.amountPaid) || 0;

    if (formData.paymentMode === 'Online' && amountPaidVal > 0 && banksList.length > 0 && (!formData.paymentBank || !formData.paymentBank.trim())) {
      return alert('Please select a Bank / Account for Online / UPI payment.');
    }
    const totalAmountVal = parseFloat(formData.totalAmount) || 0;
    const numberOfGuestsVal = parseInt(formData.numberOfGuests) || 1;
    const discountVal = parseFloat(formData.discount) || 0;
    const netTotalVal = Math.max(0, totalAmountVal - discountVal);

    let subTotalVal = 0;
    let gstAmtVal = 0;
    let grandTotalVal = 0;

    if (gstOption === 'inclusive') {
      grandTotalVal = netTotalVal;
      subTotalVal = Math.round((netTotalVal / (1 + gstRate / 100)) * 100) / 100;
      gstAmtVal = Math.round((netTotalVal - subTotalVal) * 100) / 100;
    } else if (gstOption === 'exclusive') {
      subTotalVal = netTotalVal;
      gstAmtVal = Math.round((subTotalVal * (gstRate / 100)) * 100) / 100;
      grandTotalVal = Math.round((subTotalVal + gstAmtVal) * 100) / 100;
    } else {
      subTotalVal = netTotalVal;
      gstAmtVal = 0;
      grandTotalVal = netTotalVal;
    }

    let paymentStatus = 'Pending';
    if (amountPaidVal >= grandTotalVal && grandTotalVal > 0) {
      paymentStatus = 'Paid';
    } else if (amountPaidVal > 0) {
      paymentStatus = 'Partial';
    }


    const today = new Date();
    const currentDate = today.toLocaleDateString('en-GB').replace(/\//g, '-');
    const currentTime = today.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

    let finalHistory = [];
    if (initialData && !initialData.isRepeatCheckIn) {
      try {
        finalHistory = initialData.paymentHistory ? JSON.parse(initialData.paymentHistory) : [];
      } catch (e) {
        finalHistory = [];
      }

      if (finalHistory.length > 0) {
        const initialTotalPaid = initialData.groupBookings && initialData.groupBookings.length > 1
          ? initialData.groupBookings.reduce((sum, b) => sum + Number(b.amountPaid || 0), 0)
          : Number(initialData.amountPaid || 0);

        if (Math.abs(amountPaidVal - initialTotalPaid) > 0.01) {
          if (finalHistory[0]) {
            finalHistory[0].amount = amountPaidVal;
            finalHistory[0].paymentMode = formData.paymentMode || 'Cash';
            finalHistory[0].paymentBank = formData.paymentMode === 'Online' ? (formData.paymentBank || '') : '';
          }
          finalHistory = [finalHistory[0]];
        }
      } else if (amountPaidVal > 0) {
        const checkInDateStr = initialData.checkInDate ? initialData.checkInDate.split('T')[0] : '';
        const origDate = checkInDateStr ? checkInDateStr.split('-').reverse().join('-') : currentDate;
        finalHistory.push({
          amount: amountPaidVal,
          date: origDate,
          time: initialData.checkInTime || '12:00 PM',
          paymentMode: formData.paymentMode || 'Cash',
          paymentBank: formData.paymentMode === 'Online' ? (formData.paymentBank || '') : ''
        });
      }
    } else {
      if (amountPaidVal > 0) {
        finalHistory.push({
          amount: amountPaidVal,
          date: currentDate,
          time: currentTime,
          paymentMode: formData.paymentMode || 'Cash',
          paymentBank: formData.paymentMode === 'Online' ? (formData.paymentBank || '') : ''
        });
      }
    }

    const todayYMD = getLocalDateTimeString(new Date()).split('T')[0];

    let finalSubmitStatus = submitStatus;
    if (initialData && initialData.status && !initialData.isRepeatCheckIn) {
      finalSubmitStatus = (submitStatus !== 'Active' && inputCheckInYMD > todayYMD) ? 'Confirmed' : submitStatus;
    } else if (submitStatus !== 'Active' && inputCheckInYMD > todayYMD) {
      finalSubmitStatus = 'Confirmed';
    }

    setLoading(true);
    await onConfirm({
      ...formData,
      discount: Number(formData.discount || 0),
      chargePreviousDay: chargePreviousDay,
      earlyCheckInCharge: (chargePreviousDay && earlyCheckInType === 'custom_fee') ? (Number(earlyCheckInCharge) || 0) : 0,
      earlyCheckInType: earlyCheckInType,
      status: finalSubmitStatus,
      paymentHistory: JSON.stringify(finalHistory),
      gstOption: gstOption,
      gstRate: gstRate,
      paymentMode: formData.paymentMode || 'Cash',
      paymentBank: formData.paymentMode === 'Online' ? (formData.paymentBank || '') : '',
      bookingDate: bD || cInD || '',
      bookingTime: bT || cInT || '12:00',
      checkInDate: cInD || '',
      checkInTime: cInT || '12:00',
      checkOutDate: cOutD || '',
      checkOutTime: cOutT || '23:00',
      numberOfGuests: numberOfGuestsVal,
      amountPaid: amountPaidVal,
      totalAmount: totalAmountVal,
      previousRoomRate: (() => {
        if (roomCalculationDetails && roomCalculationDetails.length > 0) {
          const prevItems = roomCalculationDetails.filter(item => item.isShiftedPrevious);
          if (prevItems.length > 0) {
            return prevItems.map(item => (item.rate !== undefined && item.rate !== null && item.rate !== '') ? item.rate : 0).join(' → ');
          }
        }
        return initialData?.previousRoomRate;
      })(),
      paymentStatus: paymentStatus,
      roomId: (initialData?.groupBookings && initialData.groupBookings.length > 1) ? initialData.roomId : selectedRoomIds[0],
      selectedRoomIds: selectedRoomIds,
      customRates: customRates,
      roomCalculationDetails: roomCalculationDetails,
      phone: formData.phone || "0000000000",
      gender: formData.gender || "Male",
      age: formData.age || 30,
      idType: formData.nationality === 'Foreign' ? 'Passport' : (formData.idType || "Aadhar"),
      idProof: formData.nationality === 'Foreign' ? formData.passportNumber : (formData.idNumber || "N/A"),
      address: formData.address || "",
      nationality: formData.nationality || "Indian",
      passportNumber: formData.nationality === 'Foreign' ? (formData.passportNumber || '') : '',
      passportExpiry: formData.nationality === 'Foreign' ? (formData.passportExpiry || '') : '',
      visaNumber: formData.nationality === 'Foreign' ? (formData.visaNumber || '') : '',
      visaType: formData.nationality === 'Foreign' ? (formData.visaType || 'Tourist') : '',
      visaExpiry: formData.nationality === 'Foreign' ? (formData.visaExpiry || '') : '',
      country: formData.nationality === 'Foreign' ? (formData.country || 'United States') : 'India',
      arrivalFrom: formData.nationality === 'Foreign' ? (formData.arrivalFrom || '') : '',
      nextDestination: formData.nationality === 'Foreign' ? (formData.nextDestination || '') : '',
      purposeOfVisit: formData.purposeOfVisit || '',
      originalAadhaarFront: originalImages.aadhaarFront,
      originalAadhaarBack: originalImages.aadhaarBack,
      guestPhoto: formData.guestPhoto,
      originalGuestPhoto: originalImages.guestPhoto,
      extraGuests: JSON.stringify(extraGuests)
    });
    setLoading(false);
  };

  const roomRatesSum = roomCalculationDetails.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const earlyFee = (chargePreviousDay && earlyCheckInType === 'custom_fee') ? Number(earlyCheckInCharge || 0) : 0;
  const rawTotalTariff = roomRatesSum + earlyFee;

  const discount = Number(formData.discount || 0);
  const netRoom = Math.max(0, rawTotalTariff - discount);

  let subTotal = 0;
  let gstAmount = 0;
  let grandTotal = 0;

  if (gstOption === 'inclusive') {
    grandTotal = netRoom;
    subTotal = Math.round((netRoom / (1 + gstRate / 100)) * 100) / 100;
    gstAmount = Math.round((netRoom - subTotal) * 100) / 100;
  } else if (gstOption === 'exclusive') {
    subTotal = netRoom;
    gstAmount = Math.round((netRoom * (gstRate / 100)) * 100) / 100;
    grandTotal = subTotal + gstAmount;
  } else {
    subTotal = netRoom;
    gstAmount = 0;
    grandTotal = subTotal;
  }

  const todayYMD = getLocalDateTimeString(new Date()).split('T')[0];
  const isRestrictOn = activeHotel?.restrictBackDates === true;
  const isCheckInPast = initialData?.checkInDate && (initialData.checkInDate.split('T')[0] < todayYMD);
  const isBookingPast = initialData?.bookingDate && (initialData.bookingDate.split('T')[0] < todayYMD);

  const isBookingDisabled = !!initialData && isRestrictOn && isBookingPast;
  const isCheckInDisabled = !!initialData && isRestrictOn && isCheckInPast;

  const checkInMinDate = isRestrictOn ? todayYMD : undefined;
  const checkInDateOnly = formData.checkInDate ? formData.checkInDate.split('T')[0] : todayYMD;
  const origCheckOutDate = initialData?.checkOutDate ? initialData.checkOutDate.split('T')[0] : null;

  const checkOutMinDate = isRestrictOn
    ? (origCheckOutDate ? (origCheckOutDate < todayYMD ? origCheckOutDate : todayYMD) : (checkInDateOnly > todayYMD ? checkInDateOnly : todayYMD))
    : checkInDateOnly;

  const currentCheckOutYMD = formData.checkOutDate ? formData.checkOutDate.split('T')[0] : '';
  const effectiveCheckOutMin = isRestrictOn
    ? (currentCheckOutYMD && checkOutMinDate && currentCheckOutYMD < checkOutMinDate ? currentCheckOutYMD : checkOutMinDate)
    : checkInDateOnly;



  const gstIncluded = gstOption === 'inclusive';
  const displayRoomCharges = Number(grandTotal || 0).toFixed(2);


  if (!inline && !isOpen) return null;

  const modalBody = (
    <div className={`bg-white w-full flex flex-col relative transition-all duration-300 ${inline ? 'h-full max-h-none rounded-none' : isFullscreen ? 'h-full max-h-screen rounded-none' : 'sm:max-w-5xl lg:max-w-[1140px] max-h-[94vh] rounded-2xl shadow-2xl animate-slide-up'}`}>
      {!inline && (
        <div className="p-3 sm:p-3.5 border-b border-[#DDE5D0] flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold text-[#1A2E05] tracking-tight">{onlyReservation ? 'New Reservation' : 'Guest Registry'}</h2>
            <p className="text-[10px] font-bold text-[#4A5E38] mt-0.5">{onlyReservation ? 'Create advance booking reservation' : 'Complete onboarding & ID verification'}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleFullscreenToggle}
              className="w-8 h-8 flex items-center justify-center bg-[#F0F3E8] text-[#5C7A1F] hover:bg-[#84A63C] hover:text-white rounded-xl transition-all shadow-sm active:scale-95"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center bg-[#F0F3E8] text-[#7A8A6A] hover:bg-rose-50 hover:text-rose-600 rounded-xl transition-all shadow-sm active:scale-95"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
      <form onSubmit={handleSubmit} autoComplete="off" className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto md:overflow-hidden p-3.5 sm:p-5 flex flex-col md:min-h-0">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-0 md:flex-1 md:min-h-0">
            {/* Left Column: Guest Information */}
            <div className="md:col-span-7 space-y-4 flex flex-col justify-between md:pr-5 md:border-r border-[#DDE5D0] md:max-h-full md:overflow-y-auto custom-top-scrollbar">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Users size={18} className="text-[#5C7A1F]" />
                    <h3 className="text-sm font-semibold text-[#1A2E05]">Guest Information</h3>
                  </div>
                </div>

                {activeHotel?.enablePerGuestRoomAssignment && selectedRoomIds.length > 1 && (
                  <div className="space-y-1.5 bg-[#84A63C]/10 p-2.5 rounded-xl border border-[#84A63C]/30 shadow-sm animate-fade-in">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-[#5C7A1F] uppercase tracking-wider block">
                        🏨 Primary Guest Assigned Room *
                      </label>
                      <span className="text-[9px] font-bold text-[#4A5E38] bg-white px-2 py-0.5 rounded-md border border-[#84A63C]/20">
                        Multiple Rooms Selected ({selectedRoomIds.length})
                      </span>
                    </div>
                    <select
                      name="assignedRoomId"
                      value={formData.assignedRoomId || selectedRoomIds[0] || ''}
                      onChange={(e) => {
                        const selId = Number(e.target.value);
                        setFormData(prev => ({ ...prev, assignedRoomId: selId }));
                      }}
                      className="w-full px-3 py-2 bg-white border border-[#84A63C]/40 rounded-xl text-xs font-bold focus:outline-none focus:border-[#84A63C] text-[#1A2E05] cursor-pointer"
                    >
                      {selectedRoomIds.map(id => {
                        const r = rooms.find(room => Number(room.id) === Number(id));
                        return (
                          <option key={id} value={id}>
                            Room {cleanRoomNumber(r?.roomNumber || id)} {r?.type ? `(${r.type})` : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}
                <div className="space-y-3">
                  {/* Row 1: Primary Required Contact Details */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-[#1A2E05] ml-1 uppercase tracking-wider block">Guest Name *</label>
                      <input
                        name="guestName"
                        required
                        value={formData.guestName || ''}
                        onChange={handleChange}
                        type="text"
                        placeholder="Full Name"
                        autoComplete="one-time-code"
                        className="w-full px-3 py-2 bg-white border border-[#C8D6B0] rounded-xl text-xs font-bold focus:outline-none focus:bg-white focus:border-[#84A63C] transition-all text-[#1A2E05]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-[#1A2E05] ml-1 uppercase tracking-wider block">Phone Number *</label>
                      <input
                        name="phone"
                        required
                        value={formData.phone || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          const cleanVal = val.replace(/\D/g, '').slice(0, 10);
                          setFormData(prev => ({ ...prev, phone: cleanVal }));
                        }}
                        type="tel"
                        placeholder="Phone Number"
                        autoComplete="one-time-code"
                        className="w-full px-3 py-2 bg-white border border-[#C8D6B0] rounded-xl text-xs font-bold focus:outline-none focus:bg-white focus:border-[#84A63C] transition-all text-[#1A2E05]"
                      />
                    </div>
                  </div>

                  {/* Row 2: Secondary Personal & Contact Info */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-[#1A2E05] ml-1 uppercase tracking-wider block">Father / Guardian Name</label>
                      <input
                        name="fatherName"
                        value={formData.fatherName || ''}
                        onChange={handleChange}
                        type="text"
                        placeholder="Father's / Guardian's Name"
                        autoComplete="one-time-code"
                        className="w-full px-3 py-2 bg-white border border-[#C8D6B0] rounded-xl text-xs font-bold focus:outline-none focus:bg-white focus:border-[#84A63C] transition-all text-[#1A2E05]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-[#1A2E05] ml-1 uppercase tracking-wider block">Email Address</label>
                      <input
                        name="email"
                        value={formData.email || ''}
                        onChange={handleChange}
                        type="email"
                        placeholder="email@example.com"
                        autoComplete="one-time-code"
                        className="w-full px-3 py-2 bg-white border border-[#C8D6B0] rounded-xl text-xs font-bold focus:outline-none focus:bg-white focus:border-[#84A63C] transition-all text-[#1A2E05]"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-[#1A2E05] ml-1 uppercase tracking-wider block">Gender</label>
                      <select
                        name="gender"
                        value={formData.gender || 'Male'}
                        onChange={handleChange}
                        className="w-full px-3 py-2 bg-white border border-[#C8D6B0] rounded-xl text-xs font-bold focus:outline-none focus:bg-white focus:border-[#84A63C] transition-all cursor-pointer text-[#1A2E05]"
                      >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-[#1A2E05] ml-1 uppercase tracking-wider block">Age</label>
                      <input
                        name="age"
                        value={formData.age || ''}
                        onChange={handleChange}
                        type="number"
                        placeholder="Age"
                        min="0"
                        max="120"
                        onWheel={(e) => e.target.blur()}
                        className="w-full px-3 py-2 bg-white border border-[#C8D6B0] rounded-xl text-xs font-bold focus:outline-none focus:bg-white focus:border-[#84A63C] transition-all text-[#1A2E05]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-[#1A2E05] ml-1 uppercase tracking-wider block">Guest Type</label>
                      <select
                        name="isChild"
                        value={formData.isChild ? 'Child' : 'Adult'}
                        onChange={(e) => {
                          const val = e.target.value === 'Child';
                          setFormData(prev => ({ ...prev, isChild: val }));
                        }}
                        className="w-full px-3 py-2 bg-white border border-[#C8D6B0] rounded-xl text-xs font-bold focus:outline-none focus:bg-white focus:border-[#84A63C] transition-all cursor-pointer text-[#1A2E05]"
                      >
                        <option value="Adult">Adult</option>
                        <option value="Child">Child</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-[#1A2E05] ml-1 uppercase tracking-wider block">Nationality</label>
                      <select
                        name="nationality"
                        value={formData.nationality}
                        onChange={handleChange}
                        className="w-full px-3 py-2 bg-white border border-[#C8D6B0] rounded-xl text-xs font-bold focus:outline-none focus:bg-white focus:border-[#84A63C] transition-all cursor-pointer text-[#1A2E05]"
                      >
                        <option value="Indian">Indian</option>
                        <option value="Foreign">Foreign</option>
                      </select>
                    </div>
                  </div>

                  {formData.nationality === 'Foreign' ? (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-[#4A5E38] ml-1">Passport Number *</label>
                          <input
                            name="passportNumber"
                            required={formData.nationality === 'Foreign'}
                            value={formData.passportNumber || ''}
                            onChange={handleChange}
                            type="text"
                            placeholder="Passport Number"
                            autoComplete="one-time-code"
                            className="w-full px-3 py-2 bg-white border border-[#DDE5D0] rounded-xl text-xs font-bold focus:outline-none focus:bg-white focus:border-[#84A63C] transition-all"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-[#4A5E38] ml-1">Passport Expiry</label>
                          <input
                            name="passportExpiry"
                            value={formData.passportExpiry || ''}
                            onChange={handleChange}
                            type="date"
                            className="w-full px-3 py-2 bg-white border border-[#DDE5D0] rounded-xl text-xs font-bold focus:outline-none focus:bg-white focus:border-[#84A63C] transition-all text-center"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-[#4A5E38] ml-1">Visa Number</label>
                          <input
                            name="visaNumber"
                            value={formData.visaNumber || ''}
                            onChange={handleChange}
                            type="text"
                            placeholder="Visa Number"
                            autoComplete="one-time-code"
                            className="w-full px-3 py-2 bg-white border border-[#DDE5D0] rounded-xl text-xs font-bold focus:outline-none focus:bg-white focus:border-[#84A63C] transition-all"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-[#4A5E38] ml-1">Visa Type</label>
                          <select
                            name="visaType"
                            value={formData.visaType || 'Tourist'}
                            onChange={handleChange}
                            className="w-full px-3 py-2 bg-white border border-[#DDE5D0] rounded-xl text-xs font-bold focus:outline-none focus:bg-white focus:border-[#84A63C] transition-all cursor-pointer text-[#1A2E05]"
                          >
                            <option value="Tourist">Tourist</option>
                            <option value="Business">Business</option>
                            <option value="Employment">Employment</option>
                            <option value="Student">Student</option>
                            <option value="Medical">Medical</option>
                            <option value="Conference">Conference</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-[#4A5E38] ml-1">Visa Expiry Date</label>
                          <input
                            name="visaExpiry"
                            value={formData.visaExpiry || ''}
                            onChange={handleChange}
                            type="date"
                            className="w-full px-3 py-2 bg-white border border-[#DDE5D0] rounded-xl text-xs font-bold focus:outline-none focus:bg-white focus:border-[#84A63C] transition-all text-center"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-[#4A5E38] ml-1">Country *</label>
                          <select
                            name="country"
                            required={formData.nationality === 'Foreign'}
                            value={formData.country || 'United States'}
                            onChange={handleChange}
                            className="w-full px-3 py-2 bg-white border border-[#DDE5D0] rounded-xl text-xs font-bold focus:outline-none focus:bg-white focus:border-[#84A63C] transition-all cursor-pointer text-[#1A2E05]"
                          >
                            {countriesList.map(country => (
                              <option key={country} value={country}>{country}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-[#4A5E38] ml-1">Arrival From</label>
                          <input
                            name="arrivalFrom"
                            value={formData.arrivalFrom || ''}
                            onChange={handleChange}
                            type="text"
                            placeholder="e.g. Dubai"
                            autoComplete="one-time-code"
                            className="w-full px-3 py-2 bg-white border border-[#DDE5D0] rounded-xl text-xs font-bold focus:outline-none focus:bg-white focus:border-[#84A63C] transition-all"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-[#4A5E38] ml-1">Next Destination</label>
                          <input
                            name="nextDestination"
                            value={formData.nextDestination || ''}
                            onChange={handleChange}
                            type="text"
                            placeholder="e.g. Singapore"
                            autoComplete="one-time-code"
                            className="w-full px-3 py-2 bg-white border border-[#DDE5D0] rounded-xl text-xs font-bold focus:outline-none focus:bg-white focus:border-[#84A63C] transition-all"
                          />
                        </div>
                      </div>

                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-[#4A5E38] ml-1">ID Type</label>
                          <select
                            name="idType"
                            value={formData.idType || 'Aadhar'}
                            onChange={handleChange}
                            className="w-full px-3 py-2 bg-white border border-[#DDE5D0] rounded-xl text-xs font-bold focus:outline-none focus:bg-white focus:border-[#84A63C] transition-all cursor-pointer text-[#1A2E05]"
                          >
                            <option value="Aadhar">Aadhar</option>
                            <option value="Passport">Passport</option>
                            <option value="Driving License">Driving License</option>
                            <option value="Voter ID">Voter ID</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-[#4A5E38] ml-1">ID Number</label>
                          <input
                            name="idNumber"
                            value={formData.idNumber || ''}
                            onChange={handleChange}
                            type="text"
                            placeholder="ID Number"
                            autoComplete="one-time-code"
                            className="w-full px-3 py-2 bg-white border border-[#DDE5D0] rounded-xl text-xs font-bold focus:outline-none focus:bg-white focus:border-[#84A63C] transition-all"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-[#1A2E05] ml-1 uppercase tracking-wider block">Address</label>
                      <textarea
                        name="address"
                        value={formData.address || ''}
                        onChange={handleChange}
                        rows={2}
                        placeholder="Guest Address"
                        autoComplete="one-time-code"
                        className="w-full px-3 py-2 bg-white border border-[#C8D6B0] rounded-xl text-xs font-bold focus:outline-none focus:bg-white focus:border-[#84A63C] transition-all text-[#1A2E05] resize-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-[#4A5E38] ml-1">Purpose of Visit</label>
                      <input
                        name="purposeOfVisit"
                        value={formData.purposeOfVisit || ''}
                        onChange={handleChange}
                        type="text"
                        placeholder="e.g. Tourism, Business, Personal"
                        autoComplete="off"
                        className="w-full px-3 py-2 bg-white border border-[#DDE5D0] rounded-xl text-xs font-bold focus:outline-none focus:bg-white focus:border-[#84A63C] transition-all text-[#1A2E05]"
                      />
                      <div className="flex flex-wrap gap-1 mt-1">
                        {['Tourism', 'Business', 'Personal', 'Medical', 'Official'].map((item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, purposeOfVisit: item }))}
                            className={`text-[9px] font-bold px-2 py-0.5 rounded-lg border transition-all ${formData.purposeOfVisit === item
                                ? 'bg-[#84A63C] text-white border-[#84A63C]'
                                : 'bg-white text-[#4A5E38] border-[#DDE5D0] hover:bg-[#F0F3E8] hover:border-[#84A63C]'
                              }`}
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-[#4A5E38] ml-1">No. of Adults</label>
                      <input
                        name="numberOfAdults"
                        value={formData.numberOfAdults !== undefined ? formData.numberOfAdults : ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : Number(e.target.value);
                          setFormData(prev => {
                            const adults = val === '' ? 0 : val;
                            const children = prev.numberOfChildren === '' ? 0 : prev.numberOfChildren;
                            return {
                              ...prev,
                              numberOfAdults: val,
                              numberOfGuests: Number(adults) + Number(children)
                            };
                          });
                        }}
                        type="number"
                        min="1"
                        onWheel={(e) => e.target.blur()}
                        className="w-full px-3 py-2 bg-white border border-[#DDE5D0] rounded-xl text-xs font-bold focus:outline-none focus:bg-white focus:border-[#84A63C] transition-all text-[#1A2E05]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-[#4A5E38] ml-1">No. of Children</label>
                      <input
                        name="numberOfChildren"
                        value={formData.numberOfChildren !== undefined ? formData.numberOfChildren : ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : Number(e.target.value);
                          setFormData(prev => {
                            const adults = prev.numberOfAdults === '' ? 0 : prev.numberOfAdults;
                            const children = val === '' ? 0 : val;
                            return {
                              ...prev,
                              numberOfChildren: val,
                              numberOfGuests: Number(adults) + Number(children)
                            };
                          });
                        }}
                        type="number"
                        min="0"
                        onWheel={(e) => e.target.blur()}
                        className="w-full px-3 py-2 bg-white border border-[#DDE5D0] rounded-xl text-xs font-bold focus:outline-none focus:bg-white focus:border-[#84A63C] transition-all text-[#1A2E05]"
                      />
                    </div>
                  </div>

                  {/* ID Proof Documents Section */}
                  <div className="space-y-3 pt-4 border-t border-[#DDE5D0]/60">
                    <div className="flex items-center gap-3">
                      <CreditCard size={18} className="text-[#5C7A1F]" />
                      <h3 className="text-sm font-semibold text-[#1A2E05]">ID Proof Documents</h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Aadhaar / Passport Front Side */}
                      <div className="bg-white p-2.5 rounded-2xl border border-[#DDE5D0] flex flex-col items-center justify-between min-h-[140px] relative hover:shadow-sm hover:border-[#84A63C]/30 transition-all">
                        <span className="text-[10px] font-black text-[#4A5E38] uppercase tracking-wider self-start mb-1">
                          {formData.nationality === 'Foreign'
                            ? 'Passport Front *'
                            : (formData.idType && formData.idType.toLowerCase() === 'other'
                              ? 'ID Document Front'
                              : `${(formData.idType || 'Aadhaar').toUpperCase()} FRONT`)}
                        </span>

                        {formData.aadhaarFront ? (
                          <div className="relative w-full h-16 rounded-xl overflow-hidden group border border-[#DDE5D0]">
                            {(formData.aadhaarFront.startsWith('data:application/pdf') || formData.aadhaarFront.toLowerCase().includes('.pdf')) ? (
                              <div className="flex flex-col items-center justify-center bg-red-50 text-red-700 w-full h-full cursor-pointer rounded-xl" onClick={() => setPreviewDoc({ url: getUploadUrl(formData.aadhaarFront), title: `${(formData.idType || 'Aadhaar').toUpperCase()} FRONT` })}>
                                <FileText size={22} />
                                <span className="text-[8px] font-black uppercase mt-1">PDF ID Document</span>
                              </div>
                            ) : (
                              <img src={getUploadUrl(formData.aadhaarFront)} alt="Front ID" className="w-full h-full object-cover cursor-pointer" onClick={() => setPreviewDoc({ url: getUploadUrl(formData.aadhaarFront), title: `${(formData.idType || 'Aadhaar').toUpperCase()} FRONT` })} />
                            )}
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-1.5 p-1">
                              <button type="button" onClick={() => setPreviewDoc({ url: getUploadUrl(formData.aadhaarFront), title: `${(formData.idType || 'Aadhaar').toUpperCase()} FRONT` })} className="px-2 py-1 bg-[#F0F3E8] hover:bg-[#84A63C] hover:text-white text-[#1A2E05] rounded-lg transition-all border border-[#DDE5D0] flex items-center gap-1 text-[9px] font-black shadow-sm" title="View Document"><Eye size={11} /> View</button>
                              <label htmlFor="aadhaar-front-upload" className="p-1 bg-white text-[#1A2E05] hover:bg-[#84A63C] hover:text-white rounded-lg cursor-pointer transition-all border border-[#DDE5D0]" title="Re-upload"><Upload size={11} /></label>
                              <button type="button" onClick={() => { setScanningSide('front'); setIsScanning(true); }} className="p-1 bg-white text-[#1A2E05] hover:bg-[#84A63C] hover:text-white rounded-lg transition-all border border-[#DDE5D0]" title="Scan"><Camera size={11} /></button>
                              <button type="button" onClick={() => setFormData(prev => ({ ...prev, aadhaarFront: null }))} className="p-1 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-lg transition-all border border-red-200" title="Delete"><Trash2 size={11} /></button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-1 w-full space-y-2">
                            <div className="p-1.5 bg-[#F0F3E8] rounded-xl text-[#5C7A1F]">
                              <CreditCard size={16} />
                            </div>
                            <div className="flex flex-col gap-1 w-full">
                              <label htmlFor="aadhaar-front-upload" className="w-full justify-center px-3 py-1 bg-[#F0F3E8] hover:bg-[#84A63C] hover:text-white text-[#1A2E05] text-[9px] font-bold rounded-xl cursor-pointer transition-all flex items-center gap-1.5 border border-[#DDE5D0]/60 hover:border-transparent active:scale-[0.98]">
                                <Upload size={11} /> {formData.nationality === 'Foreign' ? 'Upload Front' : 'Upload Front'}
                              </label>
                              <button type="button" onClick={() => { setScanningSide('front'); setIsScanning(true); }} className="w-full justify-center px-3 py-1 bg-[#F0F3E8] hover:bg-[#84A63C] hover:text-white text-[#1A2E05] text-[9px] font-bold rounded-xl transition-all flex items-center gap-1.5 border border-[#DDE5D0]/60 hover:border-transparent active:scale-[0.98]">
                                <Camera size={11} /> Scan
                              </button>
                            </div>
                          </div>
                        )}
                        <input
                          id="aadhaar-front-upload"
                          type="file"
                          accept="image/*,application/pdf"
                          onChange={(e) => handleFileChange(e, 'aadhaarFront')}
                          className="hidden"
                        />
                      </div>

                      {/* Aadhaar / Passport Back Side / Visa Page */}
                      <div className="bg-white p-2.5 rounded-2xl border border-[#DDE5D0] flex flex-col items-center justify-between min-h-[140px] relative hover:shadow-sm hover:border-[#84A63C]/30 transition-all">
                        <span className="text-[10px] font-black text-[#4A5E38] uppercase tracking-wider self-start mb-1">
                          {formData.nationality === 'Foreign'
                            ? 'Visa Page *'
                            : (formData.idType && formData.idType.toLowerCase() === 'other'
                              ? 'ID Document Back'
                              : `${(formData.idType || 'Aadhaar').toUpperCase()} BACK`)}
                        </span>

                        {formData.aadhaarBack ? (
                          <div className="relative w-full h-16 rounded-xl overflow-hidden group border border-[#DDE5D0]">
                            {(formData.aadhaarBack.startsWith('data:application/pdf') || formData.aadhaarBack.toLowerCase().includes('.pdf')) ? (
                              <div className="flex flex-col items-center justify-center bg-red-50 text-red-700 w-full h-full cursor-pointer rounded-xl" onClick={() => setPreviewDoc({ url: getUploadUrl(formData.aadhaarBack), title: `${(formData.idType || 'Aadhaar').toUpperCase()} BACK` })}>
                                <FileText size={22} />
                                <span className="text-[8px] font-black uppercase mt-1">PDF ID Document</span>
                              </div>
                            ) : (
                              <img src={getUploadUrl(formData.aadhaarBack)} alt="Back ID" className="w-full h-full object-cover cursor-pointer" onClick={() => setPreviewDoc({ url: getUploadUrl(formData.aadhaarBack), title: `${(formData.idType || 'Aadhaar').toUpperCase()} BACK` })} />
                            )}
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-1.5 p-1">
                              <button type="button" onClick={() => setPreviewDoc({ url: getUploadUrl(formData.aadhaarBack), title: `${(formData.idType || 'Aadhaar').toUpperCase()} BACK` })} className="px-2 py-1 bg-[#F0F3E8] hover:bg-[#84A63C] hover:text-white text-[#1A2E05] rounded-lg transition-all border border-[#DDE5D0] flex items-center gap-1 text-[9px] font-black shadow-sm" title="View Document"><Eye size={11} /> View</button>
                              <label htmlFor="aadhaar-back-upload" className="p-1 bg-white text-[#1A2E05] hover:bg-[#84A63C] hover:text-white rounded-lg cursor-pointer transition-all border border-[#DDE5D0]" title="Re-upload"><Upload size={11} /></label>
                              <button type="button" onClick={() => { setScanningSide('back'); setIsScanning(true); }} className="p-1 bg-white text-[#1A2E05] hover:bg-[#84A63C] hover:text-white rounded-lg transition-all border border-[#DDE5D0]" title="Scan"><Camera size={11} /></button>
                              <button type="button" onClick={() => setFormData(prev => ({ ...prev, aadhaarBack: null }))} className="p-1 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-lg transition-all border border-red-200" title="Delete"><Trash2 size={11} /></button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-1 w-full space-y-2">
                            <div className="p-1.5 bg-[#F0F3E8] rounded-xl text-[#5C7A1F]">
                              <CreditCard size={16} />
                            </div>
                            <div className="flex flex-col gap-1 w-full">
                              <label htmlFor="aadhaar-back-upload" className="w-full justify-center px-3 py-1 bg-[#F0F3E8] hover:bg-[#84A63C] hover:text-white text-[#1A2E05] text-[9px] font-bold rounded-xl cursor-pointer transition-all flex items-center gap-1.5 border border-[#DDE5D0]/60 hover:border-transparent active:scale-[0.98]">
                                <Upload size={11} /> {formData.nationality === 'Foreign' ? 'Upload Visa' : 'Upload Back'}
                              </label>
                              <button type="button" onClick={() => { setScanningSide('back'); setIsScanning(true); }} className="w-full justify-center px-3 py-1 bg-[#F0F3E8] hover:bg-[#84A63C] hover:text-white text-[#1A2E05] text-[9px] font-bold rounded-xl transition-all flex items-center gap-1.5 border border-[#DDE5D0]/60 hover:border-transparent active:scale-[0.98]">
                                <Camera size={11} /> Scan
                              </button>
                            </div>
                          </div>
                        )}
                        <input
                          id="aadhaar-back-upload"
                          type="file"
                          accept="image/*,application/pdf"
                          onChange={(e) => handleFileChange(e, 'aadhaarBack')}
                          className="hidden"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Guest Photo Section */}
                  <div className="space-y-3 pt-4 border-t border-[#DDE5D0]/60">
                    <div className="flex items-center gap-3">
                      <User size={18} className="text-[#5C7A1F]" />
                      <h3 className="text-sm font-semibold text-[#1A2E05]">Guest Photo</h3>
                    </div>

                    <div className="bg-white p-2.5 rounded-2xl border border-[#DDE5D0] flex items-center justify-between min-h-[75px] relative hover:shadow-sm hover:border-[#84A63C]/30 transition-all">
                      {formData.guestPhoto ? (
                        <div className="flex items-center gap-4 w-full">
                          <div className="relative w-16 h-16 rounded-xl overflow-hidden group shrink-0 border border-[#DDE5D0]">
                            <img src={getUploadUrl(formData.guestPhoto)} alt="Guest Profile" className="w-full h-full object-cover cursor-pointer" onClick={() => setPreviewDoc({ url: getUploadUrl(formData.guestPhoto), title: 'Guest Photo' })} />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-1.5">
                              <button type="button" onClick={() => setPreviewDoc({ url: getUploadUrl(formData.guestPhoto), title: 'Guest Photo' })} className="p-1 bg-white text-[#1A2E05] hover:text-[#84A63C] rounded-lg hover:scale-105 transition-transform" title="View Photo"><Eye size={10} /></button>
                              <button type="button" onClick={() => setFormData(prev => ({ ...prev, guestPhoto: null }))} className="p-1 bg-white text-red-600 rounded-lg hover:scale-105 transition-transform" title="Delete"><Trash2 size={10} /></button>
                            </div>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-[#1A2E05]">Profile Picture Uploaded</p>
                            <p className="text-[10px] font-semibold text-[#7A8A6A] mt-0.5">Click view to inspect high quality image</p>
                          </div>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => setPreviewDoc({ url: getUploadUrl(formData.guestPhoto), title: 'Guest Photo' })} className="px-3 py-2 bg-[#F0F3E8] hover:bg-[#84A63C] hover:text-white text-[#1A2E05] text-[10px] font-black rounded-xl transition-all border border-[#DDE5D0]/60 hover:border-transparent flex items-center gap-1.5" title="View Photo"><Eye size={12} /> View</button>
                            <label htmlFor="guest-photo-upload" className="p-2 bg-[#F0F3E8] hover:bg-[#84A63C] hover:text-white text-[#1A2E05] rounded-xl cursor-pointer transition-all border border-[#DDE5D0]/60 hover:border-transparent" title="Upload New Photo"><Upload size={14} /></label>
                            <button type="button" onClick={() => { setScanningSide('photo'); setIsScanning(true); }} className="p-2 bg-[#F0F3E8] hover:bg-[#84A63C] hover:text-white text-[#1A2E05] rounded-xl transition-all border border-[#DDE5D0]/60 hover:border-transparent" title="Capture from Camera"><Camera size={14} /></button>
                            <button type="button" onClick={() => setFormData(prev => ({ ...prev, guestPhoto: null }))} className="p-2 bg-red-50 hover:bg-red-600 text-red-600 hover:text-white rounded-xl transition-all border border-red-200 hover:border-transparent" title="Delete Photo"><Trash2 size={14} /></button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between w-full gap-4">
                          <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-[#F0F3E8] rounded-xl text-[#5C7A1F]">
                              <User size={20} />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-[#1A2E05]">Add Passport Size Photo</p>
                              <p className="text-[10px] font-semibold text-[#7A8A6A] mt-0.5">Upload a JPEG/PNG file or take snapshot</p>
                            </div>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <label htmlFor="guest-photo-upload" className="px-3 py-2 bg-[#F0F3E8] hover:bg-[#84A63C] hover:text-white text-[#1A2E05] text-[10px] font-bold rounded-xl cursor-pointer transition-all flex items-center gap-1.5 border border-[#DDE5D0]/60 hover:border-transparent active:scale-[0.98]">
                              <Upload size={11} /> Upload
                            </label>
                            <button type="button" onClick={() => { setScanningSide('photo'); setIsScanning(true); }} className="px-3 py-2 bg-[#F0F3E8] hover:bg-[#84A63C] hover:text-white text-[#1A2E05] text-[10px] font-bold rounded-xl transition-all flex items-center gap-1.5 border border-[#DDE5D0]/60 hover:border-transparent active:scale-[0.98]">
                              <Camera size={11} /> Camera
                            </button>
                          </div>
                        </div>
                      )}
                      <input
                        id="guest-photo-upload"
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFileChange(e, 'guestPhoto')}
                        className="hidden"
                      />
                    </div>
                  </div>

                  {/* Additional Registered Guests UI Block */}
                  <div className="space-y-3 pt-4 border-t border-[#DDE5D0]/60">
                    <div className="flex items-center justify-between ml-1">
                      <span className="text-[10px] font-black text-[#4A5E38] uppercase tracking-wider">Additional Registered Guests</span>
                      <button
                        type="button"
                        onClick={handleAddExtraGuest}
                        className="px-2.5 py-1 bg-[#84A63C]/10 hover:bg-[#84A63C]/20 text-[#5C7A1F] text-[9px] font-black rounded-lg transition-all flex items-center gap-1 cursor-pointer border border-transparent"
                      >
                        + Add Guest
                      </button>
                    </div>
                    {extraGuests.length > 0 && (
                      <div className="space-y-2">
                        {extraGuests.map((guest, idx) => (
                          <div key={idx} className="bg-white p-3 rounded-xl border border-[#DDE5D0] space-y-2.5 relative hover:border-[#84A63C]/30 transition-all shadow-sm">
                            <button
                              type="button"
                              onClick={() => handleRemoveExtraGuest(idx)}
                              className="absolute top-2 right-2 p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 size={13} />
                            </button>

                            {activeHotel?.enablePerGuestRoomAssignment && selectedRoomIds.length > 1 && (
                              <div className="space-y-1 bg-[#84A63C]/10 p-2 rounded-lg border border-[#84A63C]/30 mb-2">
                                <div className="flex items-center justify-between">
                                  <label className="text-[9px] font-black text-[#5C7A1F] uppercase tracking-wider block ml-0.5">
                                    🏨 Assigned Room for {guest.name || `Extra Guest ${idx + 1}`}
                                  </label>
                                </div>
                                <select
                                  value={guest.assignedRoomId || selectedRoomIds[0] || ''}
                                  onChange={(e) => {
                                    const selId = Number(e.target.value);
                                    const r = rooms.find(room => Number(room.id) === selId);
                                    handleExtraGuestChange(idx, 'assignedRoomId', selId);
                                    handleExtraGuestChange(idx, 'assignedRoomNumber', cleanRoomNumber(r?.roomNumber || selId));
                                  }}
                                  className="w-full px-2 py-1.5 bg-white border border-[#84A63C]/40 rounded-lg text-[10px] font-bold focus:outline-none focus:border-[#84A63C] cursor-pointer text-[#1A2E05]"
                                >
                                  {selectedRoomIds.map(id => {
                                    const r = rooms.find(room => Number(room.id) === Number(id));
                                    return (
                                      <option key={id} value={id}>
                                        Room {cleanRoomNumber(r?.roomNumber || id)} {r?.type ? `(${r.type})` : ''}
                                      </option>
                                    );
                                  })}
                                </select>
                              </div>
                            )}
                            {/* Row 1: Name + Mobile */}
                            <div className="grid grid-cols-2 gap-3 pr-6">
                              <div className="space-y-1">
                                <label className="text-[9px] font-bold text-[#4A5E38] ml-0.5">Guest Name</label>
                                <input
                                  type="text"
                                  placeholder="Name"
                                  value={guest.name || ''}
                                  onChange={(e) => handleExtraGuestChange(idx, 'name', e.target.value)}
                                  autoComplete="off"
                                  className="w-full px-3 py-1.5 bg-[#FBFDF8] border border-[#DDE5D0] rounded-lg text-[10px] font-bold focus:outline-none focus:border-[#84A63C]"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] font-bold text-[#4A5E38] ml-0.5">Mobile (Optional)</label>
                                <input
                                  type="text"
                                  placeholder="Mobile Number"
                                  value={guest.phone || ''}
                                  onChange={(e) => handleExtraGuestChange(idx, 'phone', e.target.value)}
                                  autoComplete="off"
                                  className="w-full px-3 py-1.5 bg-[#FBFDF8] border border-[#DDE5D0] rounded-lg text-[10px] font-bold focus:outline-none focus:border-[#84A63C]"
                                />
                              </div>
                            </div>

                            {/* Row 2: Age | Guest Type | Gender | Nationality — responsive layout */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-2">
                              <div className="space-y-1">
                                <label className="text-[9px] font-bold text-[#4A5E38] ml-0.5">Age</label>
                                <input
                                  type="number"
                                  placeholder="Age"
                                  value={guest.age || ''}
                                  onChange={(e) => handleExtraGuestChange(idx, 'age', e.target.value)}
                                  onWheel={(e) => e.target.blur()}
                                  className="w-full px-2 py-1.5 bg-[#FBFDF8] border border-[#DDE5D0] rounded-lg text-[10px] font-bold focus:outline-none focus:border-[#84A63C]"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] font-bold text-[#4A5E38] ml-0.5">Guest Type</label>
                                <select
                                  value={guest.isChild ? 'Child' : 'Adult'}
                                  onChange={(e) => handleExtraGuestChange(idx, 'isChild', e.target.value === 'Child')}
                                  className="w-full px-1.5 py-1.5 bg-[#FBFDF8] border border-[#DDE5D0] rounded-lg text-[10px] font-bold focus:outline-none focus:border-[#84A63C] cursor-pointer text-[#1A2E05]"
                                >
                                  <option value="Adult">Adult</option>
                                  <option value="Child">Child</option>
                                </select>
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] font-bold text-[#4A5E38] ml-0.5">Gender</label>
                                <select
                                  value={guest.gender || 'Male'}
                                  onChange={(e) => handleExtraGuestChange(idx, 'gender', e.target.value)}
                                  className="w-full px-1.5 py-1.5 bg-[#FBFDF8] border border-[#DDE5D0] rounded-lg text-[10px] font-bold focus:outline-none focus:border-[#84A63C] cursor-pointer text-[#1A2E05]"
                                >
                                  <option value="Male">Male</option>
                                  <option value="Female">Female</option>
                                  <option value="Other">Other</option>
                                </select>
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] font-bold text-[#4A5E38] ml-0.5">Nationality</label>
                                <select
                                  value={guest.nationality || 'Indian'}
                                  onChange={(e) => {
                                    const nat = e.target.value;
                                    handleExtraGuestChange(idx, 'nationality', nat);
                                    // Auto-reset idType when nationality changes
                                    handleExtraGuestChange(idx, 'idType', nat === 'Foreign' ? 'Passport' : 'Aadhar');
                                  }}
                                  className="w-full px-2 py-1.5 bg-[#FBFDF8] border border-[#DDE5D0] rounded-lg text-[10px] font-bold focus:outline-none focus:border-[#84A63C] cursor-pointer text-[#1A2E05]"
                                >
                                  <option value="Indian">Indian</option>
                                  <option value="Foreign">Foreign</option>
                                </select>
                              </div>
                            </div>

                            {/* Extra Guest ID Type & Number */}
                            <div className="grid grid-cols-2 gap-3 mt-2">
                              <div className="space-y-1">
                                <label className="text-[9px] font-bold text-[#4A5E38] ml-0.5">ID Type</label>
                                <select
                                  value={guest.idType || (guest.nationality === 'Foreign' ? 'Passport' : 'Aadhar')}
                                  onChange={(e) => handleExtraGuestChange(idx, 'idType', e.target.value)}
                                  className="w-full px-2 py-1.5 bg-[#FBFDF8] border border-[#DDE5D0] rounded-lg text-[10px] font-bold focus:outline-none focus:border-[#84A63C] cursor-pointer"
                                >
                                  {(guest.nationality || 'Indian') === 'Foreign' ? (
                                    <>
                                      <option value="Passport">Passport</option>
                                      <option value="Other">Other</option>
                                    </>
                                  ) : (
                                    <>
                                      <option value="Aadhar">Aadhar</option>
                                      <option value="Driving License">Driving License</option>
                                      <option value="Voter ID">Voter ID</option>
                                      <option value="PAN Card">PAN Card</option>
                                      <option value="Other">Other</option>
                                    </>
                                  )}
                                </select>
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] font-bold text-[#4A5E38] ml-0.5">ID Number</label>
                                <input
                                  type="text"
                                  placeholder="ID Number"
                                  value={guest.idNumber || ''}
                                  onChange={(e) => handleExtraGuestChange(idx, 'idNumber', e.target.value)}
                                  autoComplete="off"
                                  className="w-full px-3 py-1.5 bg-[#FBFDF8] border border-[#DDE5D0] rounded-lg text-[10px] font-bold focus:outline-none focus:border-[#84A63C]"
                                />
                              </div>
                            </div>

                            {guest.idType === 'Passport' && (
                              <>
                                <div className="grid grid-cols-2 gap-3 mt-2">
                                  <div className="space-y-1">
                                    <label className="text-[9px] font-bold text-[#4A5E38] ml-0.5">Passport Expiry</label>
                                    <input
                                      type="date"
                                      value={guest.passportExpiry || ''}
                                      onChange={(e) => handleExtraGuestChange(idx, 'passportExpiry', e.target.value)}
                                      className="w-full px-3 py-1.5 bg-[#FBFDF8] border border-[#DDE5D0] rounded-lg text-[10px] font-bold focus:outline-none focus:border-[#84A63C]"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[9px] font-bold text-[#4A5E38] ml-0.5">Visa Number</label>
                                    <input
                                      type="text"
                                      placeholder="Visa Number"
                                      value={guest.visaNumber || ''}
                                      onChange={(e) => handleExtraGuestChange(idx, 'visaNumber', e.target.value)}
                                      className="w-full px-3 py-1.5 bg-[#FBFDF8] border border-[#DDE5D0] rounded-lg text-[10px] font-bold focus:outline-none focus:border-[#84A63C]"
                                    />
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3 mt-2">
                                  <div className="space-y-1">
                                    <label className="text-[9px] font-bold text-[#4A5E38] ml-0.5">Visa Expiry Date</label>
                                    <input
                                      type="date"
                                      value={guest.visaExpiry || ''}
                                      onChange={(e) => handleExtraGuestChange(idx, 'visaExpiry', e.target.value)}
                                      className="w-full px-3 py-1.5 bg-[#FBFDF8] border border-[#DDE5D0] rounded-lg text-[10px] font-bold focus:outline-none focus:border-[#84A63C]"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[9px] font-bold text-[#4A5E38] ml-0.5">Country</label>
                                    <select
                                      value={guest.country || 'United States'}
                                      onChange={(e) => handleExtraGuestChange(idx, 'country', e.target.value)}
                                      className="w-full px-2 py-1.5 bg-[#FBFDF8] border border-[#DDE5D0] rounded-lg text-[10px] font-bold focus:outline-none focus:border-[#84A63C] cursor-pointer text-[#1A2E05]"
                                    >
                                      {countriesList.map(country => (
                                        <option key={country} value={country}>{country}</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              </>
                            )}

                            {/* Extra Guest ID Scan/Upload */}
                            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#DDE5D0]/30 mt-2">
                              {/* ID Front Side */}
                              <div className="flex flex-col items-center justify-center p-2 bg-[#FBFDF8] rounded-xl border border-[#DDE5D0] relative min-h-[90px]">
                                <span className="text-[8px] font-bold text-[#4A5E38] uppercase tracking-wider mb-1">
                                  {guest.nationality === 'Foreign' || guest.idType === 'Passport'
                                    ? 'Passport Front'
                                    : (guest.idType && guest.idType.toLowerCase() === 'other'
                                      ? 'ID Front'
                                      : `${(guest.idType || 'Aadhaar').toUpperCase()} FRONT`)}
                                </span>
                                {guest.idFront ? (
                                  <div className="relative w-full h-12 rounded-lg overflow-hidden group border border-[#DDE5D0]">
                                    {(guest.idFront.startsWith('data:application/pdf') || guest.idFront.toLowerCase().includes('.pdf')) ? (
                                      <div className="flex flex-col items-center justify-center bg-red-50 text-red-700 w-full h-full cursor-pointer" onClick={() => setPreviewDoc({ url: getUploadUrl(guest.idFront), title: `Extra Guest ID Front` })}>
                                        <FileText size={16} />
                                        <span className="text-[8px] font-bold mt-0.5">PDF ID</span>
                                      </div>
                                    ) : (
                                      <img src={getUploadUrl(guest.idFront)} alt="ID Front" className="w-full h-full object-cover cursor-pointer" onClick={() => setPreviewDoc({ url: getUploadUrl(guest.idFront), title: `Extra Guest ID Front` })} />
                                    )}
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-1 p-1">
                                      <button type="button" onClick={() => setPreviewDoc({ url: getUploadUrl(guest.idFront), title: `Extra Guest ID Front` })} className="px-1.5 py-0.5 bg-[#F0F3E8] hover:bg-[#84A63C] hover:text-white text-[#1A2E05] rounded transition-all border border-[#DDE5D0] flex items-center gap-0.5 text-[8px] font-black" title="View Document"><Eye size={9} /> View</button>
                                      <button type="button" onClick={() => handleExtraGuestChange(idx, 'idFront', null)} className="p-1 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded transition-all border border-red-200" title="Delete"><Trash2 size={9} /></button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex gap-1.5 w-full mt-1">
                                    <label htmlFor={`extra-front-upload-${idx}`} className="flex-1 justify-center px-1.5 py-1 bg-[#F0F3E8] hover:bg-[#84A63C] hover:text-white text-[#1A2E05] text-[8px] font-black rounded-lg cursor-pointer transition-all flex items-center gap-1 border border-[#DDE5D0]/60 active:scale-[0.98]">
                                      <Upload size={9} /> Upload
                                    </label>
                                    <button type="button" onClick={() => { setScanningExtraIndex(idx); setScanningSide('extraFront'); setIsScanning(true); }} className="flex-1 justify-center px-1.5 py-1 bg-[#F0F3E8] hover:bg-[#84A63C] hover:text-white text-[#1A2E05] text-[8px] font-black rounded-lg transition-all flex items-center gap-1 border border-[#DDE5D0]/60 active:scale-[0.98]">
                                      <Camera size={9} /> Scan
                                    </button>
                                    <input
                                      id={`extra-front-upload-${idx}`}
                                      type="file"
                                      accept="image/*,application/pdf"
                                      onChange={(e) => handleFileChange(e, 'idFront', idx)}
                                      className="hidden"
                                    />
                                  </div>
                                )}
                              </div>

                              {/* ID Back Side */}
                              <div className="flex flex-col items-center justify-center p-2 bg-[#FBFDF8] rounded-xl border border-[#DDE5D0] relative min-h-[90px]">
                                <span className="text-[8px] font-bold text-[#4A5E38] uppercase tracking-wider mb-1">
                                  {guest.nationality === 'Foreign' || guest.idType === 'Passport'
                                    ? 'Visa Page'
                                    : (guest.idType && guest.idType.toLowerCase() === 'other'
                                      ? 'ID Back'
                                      : `${(guest.idType || 'Aadhaar').toUpperCase()} BACK`)}
                                </span>
                                {guest.idBack ? (
                                  <div className="relative w-full h-12 rounded-lg overflow-hidden group border border-[#DDE5D0]">
                                    {(guest.idBack.startsWith('data:application/pdf') || guest.idBack.toLowerCase().includes('.pdf')) ? (
                                      <div className="flex flex-col items-center justify-center bg-red-50 text-red-700 w-full h-full cursor-pointer" onClick={() => setPreviewDoc({ url: getUploadUrl(guest.idBack), title: `Extra Guest ID Back` })}>
                                        <FileText size={16} />
                                        <span className="text-[8px] font-bold mt-0.5">PDF ID</span>
                                      </div>
                                    ) : (
                                      <img src={getUploadUrl(guest.idBack)} alt="ID Back" className="w-full h-full object-cover cursor-pointer" onClick={() => setPreviewDoc({ url: getUploadUrl(guest.idBack), title: `Extra Guest ID Back` })} />
                                    )}
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-1 p-1">
                                      <button type="button" onClick={() => setPreviewDoc({ url: getUploadUrl(guest.idBack), title: `Extra Guest ID Back` })} className="px-1.5 py-0.5 bg-[#F0F3E8] hover:bg-[#84A63C] hover:text-white text-[#1A2E05] rounded transition-all border border-[#DDE5D0] flex items-center gap-0.5 text-[8px] font-black" title="View Document"><Eye size={9} /> View</button>
                                      <button type="button" onClick={() => handleExtraGuestChange(idx, 'idBack', null)} className="p-1 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded transition-all border border-red-200" title="Delete"><Trash2 size={9} /></button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex gap-1.5 w-full mt-1">
                                    <label htmlFor={`extra-back-upload-${idx}`} className="flex-1 justify-center px-1.5 py-1 bg-[#F0F3E8] hover:bg-[#84A63C] hover:text-white text-[#1A2E05] text-[8px] font-black rounded-lg cursor-pointer transition-all flex items-center gap-1 border border-[#DDE5D0]/60 active:scale-[0.98]">
                                      <Upload size={9} /> Upload
                                    </label>
                                    <button type="button" onClick={() => { setScanningExtraIndex(idx); setScanningSide('extraBack'); setIsScanning(true); }} className="flex-1 justify-center px-1.5 py-1 bg-[#F0F3E8] hover:bg-[#84A63C] hover:text-white text-[#1A2E05] text-[8px] font-black rounded-lg transition-all flex items-center gap-1 border border-[#DDE5D0]/60 active:scale-[0.98]">
                                      <Camera size={9} /> Scan
                                    </button>
                                    <input
                                      id={`extra-back-upload-${idx}`}
                                      type="file"
                                      accept="image/*,application/pdf"
                                      onChange={(e) => handleFileChange(e, 'idBack', idx)}
                                      className="hidden"
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-[#4A5E38] ml-1">Booking Type</label>
                      <select
                        name="bookingTypeCategory"
                        value={bookingTypeCategory}
                        onChange={handleBookingTypeCategoryChange}
                        className="w-full px-3 py-2 bg-white border border-[#DDE5D0] rounded-xl text-xs font-bold focus:outline-none focus:bg-white focus:border-[#84A63C] transition-all cursor-pointer text-[#1A2E05]"
                      >
                        <option value="Walk-in">Walk-in</option>
                        <option value="Online">Online</option>
                      </select>
                    </div>

                    {bookingTypeCategory === 'Online' && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-[#4A5E38] ml-1">Online Platform</label>
                        <select
                          name="bookingPlatform"
                          value={selectedPlatform}
                          onChange={handlePlatformChange}
                          className="w-full px-3 py-2 bg-white border border-[#DDE5D0] rounded-xl text-xs font-bold focus:outline-none focus:bg-white focus:border-[#84A63C] transition-all cursor-pointer text-[#1A2E05]"
                        >
                          {platformsList.length > 0 ? (
                            platformsList.map(platform => (
                              <option key={platform} value={platform}>{platform}</option>
                            ))
                          ) : (
                            <option value="">No platforms configured</option>
                          )}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="p-4 bg-white/40 border border-[#DDE5D0]/60 rounded-xl space-y-1">
                <span className="text-[9px] font-black text-[#5C7A1F] block">Quick Tip</span>
                <p className="text-[10px] text-[#4A5E38] leading-relaxed font-semibold">
                  Please ensure the guest's name matches their official ID. The email address will be used to automatically deliver the aggregated room tax invoice upon check-out.
                </p>
              </div>
            </div>

            <div className="md:col-span-5 space-y-4 flex flex-col justify-between md:pl-5 md:max-h-full md:overflow-y-auto custom-top-scrollbar">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Calendar size={18} className="text-[#4A5E38]" />
                  <h3 className="text-sm font-semibold text-[#1A2E05]">Stay Details</h3>
                </div>
                <div className="space-y-3">
                  <div className="space-y-2 relative" ref={dropdownRef}>
                    <div className="flex items-center justify-between ml-1">
                      <label className="text-[10px] font-bold text-[#4A5E38]">Room Selection</label>
                      <div className="flex bg-[#F0F3E8] p-0.5 rounded-lg border border-[#DDE5D0]">
                        <button
                          type="button"
                          onClick={() => {
                            setBookingMode('single');
                            setSelectedRoomIds(prev => prev.slice(0, 1));
                          }}
                          className={`px-2.5 py-1 rounded-md text-[9px] font-extrabold transition-all duration-300 ${bookingMode === 'single'
                            ? 'bg-[#84A63C] text-white shadow-sm'
                            : 'text-[#7A8A6A] hover:bg-[#E2E8D5]'
                            }`}
                        >
                          Single
                        </button>
                        <button
                          type="button"
                          onClick={() => setBookingMode('multiple')}
                          className={`px-2.5 py-1 rounded-md text-[9px] font-extrabold transition-all duration-300 ${bookingMode === 'multiple'
                            ? 'bg-[#84A63C] text-white shadow-sm'
                            : 'text-[#7A8A6A] hover:bg-[#E2E8D5]'
                            }`}
                        >
                          Multiple
                        </button>
                      </div>
                    </div>

                    <div
                      onClick={() => setShowRoomDropdown(!showRoomDropdown)}
                      className="w-full min-h-[48px] px-4 py-2 bg-white border border-[#DDE5D0] rounded-xl text-sm font-bold cursor-pointer flex flex-wrap gap-1.5 items-center justify-between"
                    >
                      {selectedRoomIds.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {selectedRoomIds.map(id => {
                            const r = rooms.find(room => room.id === id) || (initialData?.Room && initialData.roomId === id ? { roomNumber: initialData.Room.roomNumber } : null);
                            return (
                              <span
                                key={id}
                                className="bg-[#84A63C]/10 text-[#5C7A1F] px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-[#84A63C]/20 transition-all"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleRoom(id);
                                }}
                              >
                                Room {r ? cleanRoomNumber(r.roomNumber) : 'N/A'}
                                <X size={12} className="stroke-[2.5]" />
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-[#7A8A6A]/60 text-xs">Select Rooms...</span>
                      )}
                      <ChevronRight size={16} className={`text-[#7A8A6A] transform transition-transform duration-300 ${showRoomDropdown ? 'rotate-90' : ''}`} />
                    </div>

                    {showRoomDropdown && (
                      <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-[#DDE5D0] rounded-2xl shadow-2xl z-[200] max-h-60 overflow-y-auto p-3 grid grid-cols-2 sm:grid-cols-3 gap-2 animate-fade-in no-scrollbar">
                        {rooms.map(room => {
                          const isSelected = selectedRoomIds.includes(room.id);
                          const availability = checkRoomAvailability(room.id, formData.checkInDate, formData.checkOutDate);
                          const isAvailable = availability.available || (initialData && initialData.roomId === room.id);

                          let containerStyle = '';
                          let textStyle = '';

                          if (isSelected) {
                            containerStyle = 'bg-[#84A63C] text-white border-[#84A63C] shadow-md shadow-[#84A63C]/20';
                            textStyle = 'text-white/80';
                          } else if (isAvailable) {
                            containerStyle = 'bg-[#F0F3E8] text-[#1A2E05] border-[#DDE5D0] hover:bg-white hover:border-[#84A63C]';
                            textStyle = 'text-[#7A8A6A]';
                          } else if (availability.statusType === 'cleaning') {
                            containerStyle = 'bg-blue-50 text-blue-700 border-blue-200 cursor-not-allowed opacity-90';
                            textStyle = 'text-blue-600 font-bold';
                          } else if (availability.statusType === 'maintenance') {
                            containerStyle = 'bg-amber-50 text-amber-700 border-amber-200 cursor-not-allowed opacity-90';
                            textStyle = 'text-amber-600 font-bold';
                          } else {
                            containerStyle = 'bg-red-50 text-red-400 border-red-100 cursor-not-allowed opacity-60';
                            textStyle = 'text-red-400';
                          }

                          return (
                            <div
                              key={room.id}
                              onClick={() => handleToggleRoom(room.id)}
                              className={`p-2.5 rounded-xl border text-center cursor-pointer transition-all duration-300 flex flex-col justify-center items-center gap-0.5 ${containerStyle}`}
                            >
                              <span className="text-xs font-black">Room {room.roomNumber}</span>
                              <span className={`text-[8px] font-extrabold ${textStyle}`}>
                                {activeHotel?.hasRoomType !== false && `${room.type} `}({isSelected
                                  ? 'Selected'
                                  : isAvailable
                                    ? (availability.upcoming ? availability.upcoming : 'Vacant')
                                    : availability.reason})
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="space-y-4">
                    {/* Booking (Date & Time) */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-[#1A2E05] ml-1 uppercase tracking-wider block">Booking (Date & Time)</label>
                      <div className="flex gap-2">
                        <div className="flex-[3]">
                          <input
                            type="date"
                            value={formData.bookingDate ? formatDateForInput(formData.bookingDate) : ''}
                            onChange={(e) => handleDateChange('bookingDate', e.target.value)}
                            disabled={isBookingDisabled}
                            className="w-full px-3 py-2 bg-white border border-[#C8D6B0] rounded-xl text-xs font-black focus:outline-none focus:border-[#84A63C] transition-all cursor-pointer text-[#1A2E05] disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-gray-50"
                          />
                        </div>
                        <div className="flex-[2] min-w-[120px]">
                          <input
                            type="time"
                            value={formData.bookingDate ? formData.bookingDate.split('T')[1] || '12:00' : '12:00'}
                            onChange={(e) => handleTimeChange('bookingDate', e.target.value)}
                            disabled={isBookingDisabled}
                            className="w-full px-3 py-2 bg-white border border-[#C8D6B0] rounded-xl text-xs font-black focus:outline-none focus:border-[#84A63C] transition-all text-center cursor-pointer text-[#1A2E05] disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-gray-50"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Check-in Group */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-[#1A2E05] ml-1 uppercase tracking-wider block">Check-in (Date & Time)</label>
                      <div className="flex gap-2">
                        <div className="flex-[3]">
                          <input
                            type="date"
                            value={formData.checkInDate ? formatDateForInput(formData.checkInDate) : ''}
                            onChange={(e) => handleDateChange('checkInDate', e.target.value)}
                            disabled={isCheckInDisabled}
                            className="w-full px-3 py-2 bg-white border border-[#C8D6B0] rounded-xl text-xs font-black focus:outline-none focus:border-[#84A63C] transition-all cursor-pointer text-[#1A2E05] disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-gray-50"
                          />
                        </div>
                        <div className="flex-[2] min-w-[120px]">
                          <input
                            type="time"
                            value={formData.checkInDate ? formData.checkInDate.split('T')[1] || '12:00' : '12:00'}
                            onChange={(e) => handleTimeChange('checkInDate', e.target.value)}
                            disabled={isCheckInDisabled}
                            className="w-full px-3 py-2 bg-white border border-[#C8D6B0] rounded-xl text-xs font-black focus:outline-none focus:border-[#84A63C] transition-all text-center cursor-pointer text-[#1A2E05] disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-gray-50"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Check-out Group */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-[#1A2E05] ml-1 uppercase tracking-wider block">Check-out (Date & Time)</label>
                      <div className="flex gap-2">
                        <div className="flex-[3]">
                          <input
                            type="date"
                            value={formData.checkOutDate ? formatDateForInput(formData.checkOutDate) : ''}
                            onChange={(e) => handleDateChange('checkOutDate', e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-[#C8D6B0] rounded-xl text-xs font-black focus:outline-none focus:border-[#84A63C] transition-all cursor-pointer text-[#1A2E05]"
                          />
                        </div>
                        <div className="flex-[2] min-w-[120px]">
                          <input
                            type="time"
                            value={formData.checkOutDate ? formData.checkOutDate.split('T')[1] || convertTo24Hour(activeHotel?.checkoutTime) : convertTo24Hour(activeHotel?.checkoutTime)}
                            onChange={(e) => handleTimeChange('checkOutDate', e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-[#DDE5D0] rounded-xl text-xs font-bold focus:outline-none focus:border-[#84A63C] transition-all text-center"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  {(isEarlyCheckIn || chargePreviousDay || Number(earlyCheckInCharge) > 0) && (
                    <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 mt-4 space-y-2.5 animate-fade-in text-left">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <p className="text-[10px] font-black text-amber-900 uppercase tracking-wider">Early Check-in</p>
                          <p className="text-[9px] text-amber-700 font-semibold leading-tight">
                            Guest check-in time is before standard checkout time ({activeHotel?.checkoutTime || '11:00 AM'}). Charge for early check-in?
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={chargePreviousDay}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setChargePreviousDay(checked);
                            if (!checked) {
                              setEarlyCheckInCharge(0);
                            } else if (earlyCheckInType === 'custom_fee' && (!earlyCheckInCharge || Number(earlyCheckInCharge) === 0)) {
                              let standardTotal = 0;
                              selectedRoomIds.forEach(id => {
                                const r = rooms.find(room => room.id === id);
                                if (r) standardTotal += Number(r.pricePerNight || 0);
                              });
                              setEarlyCheckInCharge(standardTotal);
                            }
                          }}
                          className="w-4 h-4 text-[#84A63C] border-[#DDE5D0] rounded focus:ring-[#84A63C] cursor-pointer"
                        />
                      </div>

                      {chargePreviousDay && (
                        <div className="space-y-2 border-t border-amber-200/80 pt-2 animate-fade-in">
                          <label className="text-[9px] font-black text-amber-800 uppercase tracking-wider block">
                            Early Check-in Mode
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <label className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-bold cursor-pointer transition-all ${earlyCheckInType === 'full_day'
                              ? 'bg-white border-[#84A63C] text-[#1A2E05] shadow-sm'
                              : 'bg-amber-100/60 border-amber-200 text-amber-900 hover:bg-amber-100'
                              }`}>
                              <input
                                type="radio"
                                name="earlyCheckInType"
                                value="full_day"
                                checked={earlyCheckInType === 'full_day'}
                                onChange={() => {
                                  setEarlyCheckInType('full_day');
                                  setEarlyCheckInCharge(0);
                                }}
                                className="text-[#84A63C] focus:ring-[#84A63C]"
                              />
                              <span className="text-[10px] sm:text-xs">Previous Full Day</span>
                            </label>

                            <label className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-bold cursor-pointer transition-all ${earlyCheckInType === 'custom_fee'
                              ? 'bg-white border-[#84A63C] text-[#1A2E05] shadow-sm'
                              : 'bg-amber-100/60 border-amber-200 text-amber-900 hover:bg-amber-100'
                              }`}>
                              <input
                                type="radio"
                                name="earlyCheckInType"
                                value="custom_fee"
                                checked={earlyCheckInType === 'custom_fee'}
                                onChange={() => {
                                  setEarlyCheckInType('custom_fee');
                                  if (!earlyCheckInCharge || Number(earlyCheckInCharge) === 0) {
                                    let standardTotal = 0;
                                    selectedRoomIds.forEach(id => {
                                      const r = rooms.find(room => room.id === id);
                                      if (r) standardTotal += Number(r.pricePerNight || 0);
                                    });
                                    setEarlyCheckInCharge(standardTotal);
                                  }
                                }}
                                className="text-[#84A63C] focus:ring-[#84A63C]"
                              />
                              <span className="text-[10px] sm:text-xs">Custom Charge (₹)</span>
                            </label>
                          </div>

                          {earlyCheckInType === 'custom_fee' && (
                            <div className="space-y-1 pt-1 animate-fade-in text-left">
                              <label className="text-[9px] font-black text-amber-800 uppercase tracking-wider block">
                                Amount to charge for early check-in (₹)
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={earlyCheckInCharge}
                                onChange={(e) => setEarlyCheckInCharge(e.target.value === '' ? '' : (parseFloat(e.target.value) || 0))}
                                onWheel={(e) => e.target.blur()}
                                className="w-full px-3 py-1.5 bg-white border border-amber-300 rounded-xl text-xs font-bold focus:outline-none focus:border-[#84A63C] text-[#1A2E05]"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* GST Calculator & Summary Card */}
              <GstCalculator
                showCorporateDetails={false}
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
                onFieldChange={handleChange}
                roomCalculationDetails={roomCalculationDetails}
                onRoomRateChange={(roomId, newRate) => {
                  setCustomRates(prev => ({
                    ...prev,
                    [roomId]: newRate
                  }));
                }}
                chargePreviousDay={chargePreviousDay && earlyCheckInType === 'custom_fee'}
                earlyCheckInCharge={earlyCheckInCharge}
                onEarlyCheckInChargeChange={setEarlyCheckInCharge}
                discount={Number(formData.discount || 0)}
              />

              {/* Discount Card */}
              <div className="bg-[#FBFDF8] p-2.5 rounded-xl border border-[#DDE5D0] space-y-1.5 mt-2 transition-all duration-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Tag size={13} className="text-[#84A63C]" />
                    <span className="text-xs font-bold text-[#1A2E05]">Discount</span>
                  </div>
                  {Number(formData.discount || 0) > 0 && (
                    <span className="text-[9px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.2 rounded-full">
                      Applied: ₹{Number(formData.discount).toLocaleString()}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-0.5">
                    <label className="text-[9px] font-black text-[#1A2E05] tracking-wider uppercase block">Discount Amount (₹)</label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-black text-[#1A2E05]">₹</span>
                      <input
                        name="discount"
                        value={formData.discount ?? ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : Number(e.target.value);
                          setFormData(prev => ({ ...prev, discount:val }));
                        }}
                        type="number"
                        step="any"
                        min="0"
                        placeholder="0.00"
                        onWheel={(e) => e.target.blur()}
                        className="w-full pl-6 pr-2.5 py-1 bg-white border border-[#C8D6B0] focus:border-[#84A63C] rounded-lg text-xs font-black text-[#1A2E05] transition-all placeholder:text-[#7A8A6A]/60"
                      />
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <label className="text-[9px] font-black text-[#1A2E05] tracking-wider uppercase block">Purpose of Discount</label>
                    <input
                      name="discountReason"
                      value={formData.discountReason || ''}
                      onChange={handleChange}
                      type="text"
                      placeholder="e.g. Corporate, VIP, Promo"
                      className="w-full px-2.5 py-1 bg-white border border-[#C8D6B0] focus:border-[#84A63C] rounded-lg text-xs font-bold text-[#1A2E05] transition-all placeholder:font-normal placeholder:text-[#7A8A6A]/60"
                    />
                  </div>
                </div>
              </div>

              {/* Payment Collection Card */}
              <div className="bg-[#FBFDF8] p-2.5 rounded-xl border border-[#DDE5D0] space-y-2 mt-2 transition-all duration-200">
                <div className="flex items-center justify-between border-b border-[#DDE5D0]/40 pb-1">
                  <div className="flex items-center gap-1.5">
                    <CreditCard size={13} className="text-[#84A63C]" />
                    <span className="text-xs font-bold text-[#1A2E05]">Payment Collection</span>
                  </div>
                  <span className="text-[9px] font-bold text-[#7A8A6A]">
                    Mode: {formData.paymentMode || 'Cash'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-0.5">
                    <label className="text-[9px] font-black text-[#1A2E05] tracking-wider uppercase block">Amount Paid (₹)</label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-black text-[#1A2E05]">₹</span>
                      <input
                        name="amountPaid"
                        value={formData.amountPaid ?? ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : Number(e.target.value);
                          setFormData(prev => ({ ...prev, amountPaid: val }));
                        }}
                        type="number"
                        step="any"
                        min="0"
                        placeholder="0.00"
                        onWheel={(e) => e.target.blur()}
                        className="w-full pl-6 pr-2.5 py-1 bg-white border border-[#C8D6B0] focus:border-[#84A63C] rounded-lg text-xs font-black text-[#1A2E05] transition-all placeholder:text-[#7A8A6A]/60"
                      />
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <label className="text-[9px] font-black text-[#1A2E05] tracking-wider uppercase block">Payment Mode</label>
                    <select
                      name="paymentMode"
                      value={formData.paymentMode || 'Cash'}
                      onChange={handleChange}
                      className="w-full px-2 py-1 bg-white border border-[#C8D6B0] focus:border-[#84A63C] rounded-lg text-xs font-black text-[#1A2E05] cursor-pointer transition-all"
                    >
                      <option value="Cash">Cash</option>
                      <option value="Online">Online / UPI</option>
                      <option value="Card">Card / POS</option>
                    </select>
                  </div>
                </div>

                {formData.paymentMode === 'Online' && banksList.length > 0 && (
                  <div className="space-y-0.5 animate-fade-in">
                    <label className="text-[9px] font-black text-[#1A2E05] tracking-wider uppercase block">
                      Select Bank / Account <span className="text-red-500">*</span>
                    </label>
                    <select
                      name="paymentBank"
                      value={formData.paymentBank || ''}
                      onChange={handleChange}
                      className={`w-full px-2 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                        (formData.paymentMode === 'Online' && (parseFloat(formData.amountPaid) || 0) > 0 && (!formData.paymentBank || !formData.paymentBank.trim()))
                          ? 'bg-red-50 border-2 border-red-500 text-red-700 focus:border-red-600 focus:ring-1 focus:ring-red-500'
                          : 'bg-white border border-[#C8D6B0] focus:border-[#84A63C] text-[#1A2E05]'
                      }`}
                    >
                      <option value="">-- Choose Bank --</option>
                      {banksList.map(bank => (
                        <option key={bank} value={bank}>{bank}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Corporate / GST Details Section */}
              {gstOption !== 'none' && (
                <div className="bg-[#FBFDF8] p-2.5 rounded-xl border border-[#C8D6B0] space-y-2 mt-2 animate-fade-in text-left transition-all duration-200">
                  <div className="space-y-0.5">
                    <label className="text-[9px] font-black text-[#1A2E05] tracking-wider uppercase block">Customer GST Number</label>
                    <input
                      type="text"
                      name="guestGst"
                      value={formData.guestGst || ''}
                      onChange={handleChange}
                      placeholder="e.g. 27AAAAA1111A1Z1"
                      autoComplete="one-time-code"
                      className="w-full px-2.5 py-1 bg-white border border-[#C8D6B0] focus:border-[#84A63C] rounded-lg text-xs font-black uppercase text-[#1A2E05] transition-all placeholder:normal-case placeholder:font-normal placeholder:text-[#7A8A6A]/60 tracking-wider"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-0.5">
                      <label className="text-[9px] font-black text-[#1A2E05] tracking-wider uppercase block">Company Name</label>
                      <input
                        type="text"
                        name="companyName"
                        value={formData.companyName || ''}
                        onChange={handleChange}
                        placeholder="e.g. ABC Pvt Ltd"
                        autoComplete="one-time-code"
                        className="w-full px-2.5 py-1 bg-white border border-[#C8D6B0] focus:border-[#84A63C] rounded-lg text-xs font-black text-[#1A2E05] transition-all placeholder:text-[#7A8A6A]/60"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <label className="text-[9px] font-black text-[#4A5E38] tracking-wider uppercase block">Company Address</label>
                      <input
                        type="text"
                        name="companyAddress"
                        value={formData.companyAddress || ''}
                        onChange={handleChange}
                        placeholder="e.g. Mumbai, India"
                        autoComplete="one-time-code"
                        className="w-full px-2.5 py-1 bg-white border border-[#DDE5D0] focus:border-[#84A63C] rounded-lg text-xs font-bold text-[#1A2E05] transition-all placeholder:text-[#7A8A6A]/50"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="p-4 bg-[#1A2E05] text-white rounded-2xl text-center space-y-1 relative group mt-4">
                <p className="text-[10px] font-bold text-[#84A63C]">Total Billing</p>
                <div className="flex items-center justify-center gap-2">
                  <p className="text-2xl font-bold">₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-3.5 bg-white border-t border-[#DDE5D0] flex gap-3 shrink-0 shadow-lg">
          <button type="button" onClick={onClose} disabled={loading} className="flex-1 py-2.5 text-xs font-black text-[#4A5E38] hover:bg-[#F0F3E8] hover:text-[#1A2E05] transition-all rounded-xl border border-[#C8D6B0]">Discard</button>
          {!initialData ? (
            <>
              <button
                type="submit"
                disabled={loading}
                onClick={() => setSubmitStatus('Confirmed')}
                className={`py-2.5 px-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all border flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] ${onlyReservation ? 'flex-1 bg-[#84A63C] text-white border-transparent hover:opacity-90' : 'flex-1 bg-amber-50 text-amber-800 hover:bg-amber-100 border-amber-300'}`}
              >
                <Bookmark size={14} />
                {loading && submitStatus === 'Confirmed' ? 'Reserving...' : 'Reserve Room'}
              </button>
              {!onlyReservation && (
                <button
                  type="submit"
                  disabled={loading}
                  onClick={() => setSubmitStatus('Active')}
                  className="flex-[1.5] py-2.5 px-3 bg-[#769733] text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-[#658327] shadow-md flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all"
                >
                  {loading && submitStatus === 'Active' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  {loading && submitStatus === 'Active' ? 'Checking in...' : 'Check-in Guest'}
                </button>
              )}
            </>
          ) : (
            <button
              type="submit"
              disabled={loading}
              className="flex-[2.5] py-2.5 px-3 bg-[#769733] text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-[#658327] shadow-md flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {loading ? 'Saving...' : 'Confirm & Save Changes'}
            </button>
          )}
        </div>
      </form>

      {isScanning && <WebcamCapture onCapture={handleCapture} onClose={() => setIsScanning(false)} />}

      {croppingImage && (
        <ImageCropper
          image={croppingImage}
          onCrop={handleCropComplete}
          onCancel={() => { setCroppingImage(null); setCroppingField(null); setCroppingIndex(null); setScanningExtraIndex(null); }}
        />
      )}

      {isAiLoading && (
        <div className="absolute inset-0 z-[150] bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center animate-fade-in">
          <div className="w-20 h-20 border-4 border-[#84A63C]/20 border-t-[#84A63C] rounded-full animate-spin mb-4"></div>
          <p className="text-sm font-bold text-[#1A2E05] animate-pulse">AI is Reading ID Card...</p>
          <p className="text-[10px] font-medium text-[#4A5E38] mt-1">Extracting name & details</p>
        </div>
      )}

      {showOccupiedPopup && (
        <div className="absolute inset-0 z-[160] bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center animate-fade-in">
          <div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center text-center max-w-sm w-full mx-4 animate-slide-up">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <X size={32} className="text-red-500" />
            </div>
            <h3 className="text-xl font-bold text-[#1A2E05] mb-2">Room Unavailable</h3>
            <p className="text-sm text-[#7A8A6A] mb-6">{occupiedPopupReason || 'This room is already booked or not available. Please select another room.'}</p>
            <button onClick={() => setShowOccupiedPopup(false)} className="w-full py-3 bg-[#1A2E05] text-white rounded-xl text-sm font-bold hover:opacity-90 transition-all">Okay</button>
          </div>
        </div>
      )}

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

      {previewDoc && (
        <div className="fixed inset-0 z-[10060] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-white rounded-3xl overflow-hidden max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl relative border border-[#DDE5D0] animate-slide-up">
            <div className="px-5 py-3.5 bg-[#F0F3E8] border-b border-[#DDE5D0] flex items-center justify-between">
              <h3 className="font-black text-[#1A2E05] text-sm uppercase tracking-wider">{previewDoc.title || 'Document Preview'}</h3>
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                className="p-1.5 rounded-xl bg-white text-[#7A8A6A] hover:bg-rose-50 hover:text-rose-600 transition-all border border-[#DDE5D0]"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-auto flex items-center justify-center bg-[#F9FAFA] min-h-[300px]">
              {previewDoc.url && (previewDoc.url.startsWith('data:application/pdf') || previewDoc.url.toLowerCase().includes('.pdf')) ? (
                <iframe src={previewDoc.url} title={previewDoc.title} className="w-full h-[70vh] rounded-xl border border-[#DDE5D0]" />
              ) : (
                <img src={previewDoc.url} alt={previewDoc.title} className="max-w-full max-h-[75vh] object-contain rounded-2xl shadow-md border border-[#DDE5D0]" />
              )}
            </div>
            <div className="px-5 py-3 bg-white border-t border-[#DDE5D0] flex justify-end gap-3">
              <a
                href={previewDoc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-[#84A63C] text-white rounded-xl text-xs font-black hover:bg-[#729231] transition-all shadow-sm flex items-center gap-1.5"
              >
                <Download size={14} /> Open Original / Download
              </a>
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                className="px-4 py-2 bg-[#F0F3E8] text-[#1A2E05] rounded-xl text-xs font-bold hover:bg-[#E2E8D5] transition-all border border-[#DDE5D0]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      <style dangerouslySetInnerHTML={{
        __html: `
            input[type="number"]::-webkit-outer-spin-button,
            input[type="number"]::-webkit-inner-spin-button {
              -webkit-appearance: none;
              margin: 0;
            }
            input[type="number"] {
              -moz-appearance: textfield;
            }
            .guest-registry-modal-container input,
            .guest-registry-modal-container select,
            .guest-registry-modal-container label,
            .guest-registry-modal-container button:not(.w-8):not(.h-8),
            .guest-registry-modal-container option,
            .guest-registry-modal-container span:not(.text-lg):not(.text-xl):not(.text-2xl):not(.text-3xl):not(.text-xl *):not(.text-2xl *):not(.text-3xl *),
            .guest-registry-modal-container p:not(.text-lg):not(.text-xl):not(.text-2xl):not(.text-3xl):not(.text-xl *):not(.text-2xl *):not(.text-3xl *) {
              font-size: 12px !important;
            }
          `
      }} />
    </div>
  );

  if (inline) {
    return (
      <div className="w-full bg-white rounded-3xl border border-[#DDE5D0] shadow-xl overflow-hidden guest-registry-modal-container">
        {modalBody}
      </div>
    );
  }

  return createPortal(
    <div className={`guest-registry-modal-container fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in overflow-hidden ${isFullscreen ? '' : 'p-2 sm:p-3'}`}>
      {modalBody}
    </div>,
    document.body
  );
};

export default AddGuestModal;
