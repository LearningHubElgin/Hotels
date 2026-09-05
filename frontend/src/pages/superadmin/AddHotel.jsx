import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Building, Phone, Mail, MapPin, Loader2, AlertCircle, CheckCircle,
  ArrowLeft, Eye, EyeOff, Key, ShieldCheck, Receipt, Globe,
  Wallet, Lock, Settings2, Sparkles, Layers, SlidersHorizontal,
  Landmark, Plus, Trash2
} from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { decodeId } from '../../utils/hashids';

const isTruthy = (v) => v === true || v === 1 || v === '1' || v === 'true';

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

const DEFAULT_ROOM_COLORS = {
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

const parseRoomColors = (strOrObj) => {
  if (!strOrObj) return DEFAULT_ROOM_COLORS;
  if (typeof strOrObj === 'object') return { ...DEFAULT_ROOM_COLORS, ...strOrObj };
  try {
    return { ...DEFAULT_ROOM_COLORS, ...JSON.parse(strOrObj) };
  } catch (e) {
    return DEFAULT_ROOM_COLORS;
  }
};

const ToggleCard = ({ label, description, checked, onChange, children }) => {
  const isON = Boolean(checked);
  return (
    <div className="bg-[#FBFDF8] border border-[#DDE5D0] hover:border-[#84A63C]/40 rounded-2xl p-3.5 space-y-2.5 transition-all shadow-2xs">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-bold text-[#1A2E05]">{label}</span>
          {description && <span className="text-[10px] text-[#7A8A6A] font-semibold leading-relaxed">{description}</span>}
        </div>
        <button
          type="button"
          onClick={() => onChange(!isON)}
          className={`relative inline-flex h-5 w-9.5 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isON ? 'bg-[#84A63C]' : 'bg-[#DDE5D0]'
            }`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${isON ? 'translate-x-4.5' : 'translate-x-0'
              }`}
          />
        </button>
      </div>
      {isON && children && (
        <div className="pt-2.5 border-t border-[#DDE5D0]/60 animate-fade-in">
          {children}
        </div>
      )}
    </div>
  );
};

const AddHotel = () => {
  const { id: rawId } = useParams();
  const id = decodeId(rawId);
  const navigate = useNavigate();
  const { refreshHotel } = useAuth();
  const isEditMode = !!id;

  const [hotelForm, setHotelForm] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    logoUrl: '',
    gstin: '',
    city: '',
    state: '',
    hotelType: 'Hotel',
    hasKot: true,
    hasAccounts: true,
    hasAssets: true,
    hasActivityLogs: true,
    hasOpeningBalance: true,
    openingCashBalance: 0,
    openingBankBalance: 0,
    bankOpeningBalances: '',
    lockOpeningBalance: false,
    defaultGstRate: 12,
    defaultGstOption: 'none',
    hasRoomType: false,
    defaultHsnCode: '996311',
    billingTemplateId: 'template_1',
    allowHotelEdit: false,
    allowBillingEdit: true,
    allowPaymentEdit: true,
    allowEditOldPayments: false,
    enableRegistrationNumber: false,
    enablePaymentSerialNumber: false,
    allowRoomAdd: true,
    allowRoomDelete: true,
    checkoutTime: '11:00',
    invoicePrefix: 'INV-',
    since: '',
    bookingPlatforms: '',
    onlinePaymentBanks: '',
    roomTypes: '',
    restrictBackDates: false,
    resetInvoiceYearly: false,
    yearEndingDate: '03-31',
    enablePerGuestRoomAssignment: false,
    enableAutoExtendCheckout: false,
    autoExtendCutoffTime: '11:30',
    lockPastStayCharges: false,
    roomCardColors: ''
  });

  const [bankBalancesState, setBankBalancesState] = useState({});
  const [customBankName, setCustomBankName] = useState('');
  const [showAddCustomBank, setShowAddCustomBank] = useState(false);

  const [templates, setTemplates] = useState([]);
  const [userForm, setUserForm] = useState({ username: '', password: '', role: 'admin' });
  const [adminUserId, setAdminUserId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const res = await api.get('/billing-templates');
        if (res.data.success) {
          setTemplates(res.data.data);
        }
      } catch (err) {
        console.error('Error fetching billing templates:', err);
      }
    };
    fetchTemplates();
  }, []);

  useEffect(() => {
    const fetchHotelAndCredentials = async () => {
      try {
        setLoading(true);
        // 1. Fetch Hotel Profile
        const hotelRes = await api.get(`/hotels/${id}`);
        if (hotelRes.data.success) {
          const h = hotelRes.data.data;

          let parsedBankBalances = {};
          try {
            if (h.bankOpeningBalances) {
              parsedBankBalances = typeof h.bankOpeningBalances === 'string'
                ? JSON.parse(h.bankOpeningBalances)
                : (h.bankOpeningBalances || {});
            }
          } catch (e) {
            parsedBankBalances = {};
          }

          const hotelBanks = (h.onlinePaymentBanks || '')
            .split(',')
            .map(b => b.trim())
            .filter(Boolean);
          const storedBanks = Object.keys(parsedBankBalances || {});
          const allBanks = Array.from(new Set([...hotelBanks, ...storedBanks]));

          const initialBankMap = {};
          allBanks.forEach(b => {
            initialBankMap[b] = (parsedBankBalances[b] !== undefined && parsedBankBalances[b] !== null)
              ? String(parsedBankBalances[b])
              : '';
          });
          setBankBalancesState(initialBankMap);

          setHotelForm({
            name: h.name || '',
            address: h.address || '',
            phone: h.phone || '',
            email: h.email || '',
            logoUrl: h.logoUrl || '',
            gstin: h.gstin || '',
            city: h.city || '',
            state: h.state || '',
            hotelType: h.hotelType || 'Hotel',
            hasKot: h.hasKot !== false,
            hasAccounts: h.hasAccounts !== false,
            hasAssets: h.hasAssets !== false,
            hasActivityLogs: h.hasActivityLogs !== false,
            hasOpeningBalance: h.hasOpeningBalance !== false,
            openingCashBalance: h.openingCashBalance || 0,
            openingBankBalance: h.openingBankBalance || 0,
            bankOpeningBalances: h.bankOpeningBalances ? (typeof h.bankOpeningBalances === 'object' ? JSON.stringify(h.bankOpeningBalances) : h.bankOpeningBalances) : '',
            lockOpeningBalance: isTruthy(h.lockOpeningBalance),
            defaultGstRate: h.defaultGstRate !== undefined ? h.defaultGstRate : 12,
            defaultGstOption: h.defaultGstOption || 'none',
            hasRoomType: h.hasRoomType !== false,
            defaultHsnCode: h.defaultHsnCode || '996311',
            billingTemplateId: h.billingTemplateId || 'template_1',
            allowHotelEdit: isTruthy(h.allowHotelEdit),
            allowBillingEdit: h.allowBillingEdit !== false,
            allowPaymentEdit: h.allowPaymentEdit !== false,
            allowEditOldPayments: isTruthy(h.allowEditOldPayments),
            allowRoomAdd: h.allowRoomAdd !== false,
            allowRoomDelete: h.allowRoomDelete !== false,
            checkoutTime: convertTo24Hour(h.checkoutTime),
            invoicePrefix: (h.invoicePrefix !== undefined && h.invoicePrefix !== null) ? h.invoicePrefix : 'INV-',
            since: h.since || '',
            bookingPlatforms: h.bookingPlatforms || '',
            onlinePaymentBanks: h.onlinePaymentBanks || '',
            roomTypes: Array.isArray(h.roomTypes) ? h.roomTypes.map(rt => rt.name).join(', ') : (h.roomTypes || ''),
            restrictBackDates: isTruthy(h.restrictBackDates),
            resetInvoiceYearly: isTruthy(h.resetInvoiceYearly),
            yearEndingDate: h.yearEndingDate || '03-31',
            enablePerGuestRoomAssignment: isTruthy(h.enablePerGuestRoomAssignment),
            enableAutoExtendCheckout: isTruthy(h.enableAutoExtendCheckout),
            autoExtendCutoffTime: convertTo24Hour(h.autoExtendCutoffTime || '11:30 AM'),
            lockPastStayCharges: isTruthy(h.lockPastStayCharges),
            enableRegistrationNumber: isTruthy(h.enableRegistrationNumber),
            enablePaymentSerialNumber: isTruthy(h.enablePaymentSerialNumber),
            roomCardColors: h.roomCardColors || ''
          });
        }

        // 2. Fetch Users and find the admin account
        const usersRes = await api.get(`/hotels/${id}/users`);
        if (usersRes.data.success) {
          const usersList = usersRes.data.data;
          const adminAccount = usersList.find(u => u.role === 'admin');
          if (adminAccount) {
            setAdminUserId(adminAccount.id);
            setUserForm({
              username: adminAccount.username || '',
              password: '',
              role: 'admin'
            });
          }
        }
      } catch (err) {
        console.error(err);
        setError('Failed to load hotel profile and login credentials.');
      } finally {
        setLoading(false);
      }
    };

    if (isEditMode) {
      fetchHotelAndCredentials();
    } else {
      setHotelForm({
        name: '',
        address: '',
        phone: '',
        email: '',
        logoUrl: '',
        gstin: '',
        city: '',
        state: '',
        hotelType: 'Hotel',
        hasKot: true,
        hasAccounts: true,
        hasAssets: true,
        hasActivityLogs: true,
        hasOpeningBalance: true,
        openingCashBalance: 0,
        openingBankBalance: 0,
        bankOpeningBalances: '',
        lockOpeningBalance: false,
        defaultGstRate: 12,
        defaultGstOption: 'none',
        hasRoomType: false,
        defaultHsnCode: '996311',
        billingTemplateId: 'template_1',
        allowHotelEdit: false,
        allowBillingEdit: true,
        allowPaymentEdit: true,
        allowRoomAdd: true,
        allowRoomDelete: true,
        checkoutTime: '11:00',
        invoicePrefix: 'INV-',
        since: '',
        bookingPlatforms: '',
        onlinePaymentBanks: '',
        roomTypes: '',
        restrictBackDates: false,
        resetInvoiceYearly: false,
        yearEndingDate: '03-31',
        enablePerGuestRoomAssignment: false,
        enableAutoExtendCheckout: false,
        autoExtendCutoffTime: '11:30'
      });
      setBankBalancesState({});
      setUserForm({ username: '', password: '', role: 'admin' });
      setAdminUserId(null);
      setError('');
      setSuccess('');
    }
  }, [id, isEditMode]);

  const handleHotelChange = (e) => {
    const { name, value } = e.target;
    setHotelForm(prev => ({ ...prev, [name]: value }));
  };

  const handleUserChange = (e) => {
    const { name, value } = e.target;
    setUserForm(prev => ({ ...prev, [name]: value }));
  };

  const activeBankList = useMemo(() => {
    const fromHotel = (hotelForm.onlinePaymentBanks || '')
      .split(',')
      .map(b => b.trim())
      .filter(Boolean);
    const fromState = Object.keys(bankBalancesState || {});
    return Array.from(new Set([...fromHotel, ...fromState]));
  }, [hotelForm.onlinePaymentBanks, bankBalancesState]);

  const handleBankBalanceChange = (bankName, val) => {
    setBankBalancesState(prev => {
      const updated = { ...prev, [bankName]: val };
      let sum = 0;
      const cleanMap = {};
      activeBankList.forEach(b => {
        const bankVal = b === bankName ? val : (updated[b] !== undefined ? updated[b] : '');
        const num = parseFloat(bankVal);
        if (!isNaN(num) && num > 0) {
          cleanMap[b] = num;
          sum += num;
        } else if (!isNaN(num)) {
          cleanMap[b] = num;
        }
      });

      setHotelForm(hPrev => ({
        ...hPrev,
        openingBankBalance: sum,
        bankOpeningBalances: Object.keys(cleanMap).length > 0 ? JSON.stringify(cleanMap) : ''
      }));

      return updated;
    });
  };

  const handleRemoveBank = (bankName) => {
    setBankBalancesState(prev => {
      const updated = { ...prev };
      delete updated[bankName];

      let sum = 0;
      const cleanMap = {};
      Object.entries(updated).forEach(([b, v]) => {
        const num = parseFloat(v);
        if (!isNaN(num) && num > 0) {
          cleanMap[b] = num;
          sum += num;
        } else if (!isNaN(num)) {
          cleanMap[b] = num;
        }
      });

      const updatedOnlineBanks = (hotelForm.onlinePaymentBanks || '')
        .split(',')
        .map(b => b.trim())
        .filter(b => b && b.toLowerCase() !== bankName.toLowerCase())
        .join(', ');

      setHotelForm(hPrev => ({
        ...hPrev,
        onlinePaymentBanks: updatedOnlineBanks,
        openingBankBalance: sum,
        bankOpeningBalances: Object.keys(cleanMap).length > 0 ? JSON.stringify(cleanMap) : ''
      }));

      return updated;
    });
  };

  const handleAddCustomBank = () => {
    const trimmed = (customBankName || '').trim();
    if (!trimmed) return;

    setBankBalancesState(prev => ({
      ...prev,
      [trimmed]: prev[trimmed] !== undefined ? prev[trimmed] : ''
    }));

    const currentBanks = (hotelForm.onlinePaymentBanks || '')
      .split(',')
      .map(b => b.trim())
      .filter(Boolean);
    if (!currentBanks.some(b => b.toLowerCase() === trimmed.toLowerCase())) {
      const updatedOnline = currentBanks.length > 0
        ? `${hotelForm.onlinePaymentBanks}, ${trimmed}`
        : trimmed;
      setHotelForm(hPrev => ({
        ...hPrev,
        onlinePaymentBanks: updatedOnline
      }));
    }

    setCustomBankName('');
    setShowAddCustomBank(false);
  };

  const handleLoadDefaultBanks = () => {
    const defaultBanks = ['Paytm', 'Google Pay', 'SBI Bank', 'HDFC Bank', 'ICICI Bank'];
    setBankBalancesState(prev => {
      const nextState = { ...prev };
      defaultBanks.forEach(b => {
        if (nextState[b] === undefined) {
          nextState[b] = '';
        }
      });
      return nextState;
    });

    const currentBanks = (hotelForm.onlinePaymentBanks || '')
      .split(',')
      .map(b => b.trim())
      .filter(Boolean);
    const combined = Array.from(new Set([...currentBanks, ...defaultBanks])).join(', ');
    setHotelForm(prev => ({
      ...prev,
      onlinePaymentBanks: combined
    }));
  };

  const handleFormSubmit = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setSuccess('');

    if (!isEditMode && (!userForm.username || !userForm.password)) {
      setError('Hotel Login Username and Password are required.');
      return;
    }
    if (isEditMode && !userForm.username) {
      setError('Hotel Login Username is required.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ...hotelForm,
        openingCashBalance: Number(hotelForm.openingCashBalance || 0),
        openingBankBalance: Number(hotelForm.openingBankBalance || 0),
        bankOpeningBalances: hotelForm.bankOpeningBalances || null
      };

      if (isEditMode) {
        // 1. Update Hotel Profile
        await api.put(`/hotels/${id}`, payload);

        // Update activeHotel in localStorage if this is the active workspace
        const storedHotel = localStorage.getItem('activeHotel');
        if (storedHotel) {
          const activeHotelObj = JSON.parse(storedHotel);
          if (activeHotelObj.id === id) {
            localStorage.setItem('activeHotel', JSON.stringify({
              ...activeHotelObj,
              ...payload
            }));
          }
        }
        if (refreshHotel) {
          await refreshHotel(id);
        }

        // 2. Update Admin Login Credentials (if provided)
        if (userForm.username) {
          try {
            if (adminUserId) {
              const userPayload = {
                username: userForm.username,
                role: 'admin'
              };
              if (userForm.password) {
                userPayload.password = userForm.password;
              }
              await api.put(`/hotels/${id}/users/${adminUserId}`, userPayload);
            } else {
              await api.post(`/hotels/${id}/users`, {
                username: userForm.username,
                password: userForm.password || 'password123',
                role: 'admin'
              });
            }
          } catch (userErr) {
            console.warn('Notice updating admin credentials:', userErr.response?.data?.message || userErr.message);
          }
        }

        setSuccess('Hotel profile settings updated successfully!');
        setTimeout(() => {
          navigate('/superadmin/hotels');
        }, 1200);

      } else {
        // Create Mode
        const hotelRes = await api.post('/hotels', payload);
        if (hotelRes.data.success) {
          const createdHotel = hotelRes.data.data;

          await api.post(`/hotels/${createdHotel.id}/users`, {
            username: userForm.username,
            password: userForm.password,
            role: 'admin'
          });

          setSuccess(`Hotel "${createdHotel.name}" and login account registered successfully!`);
          setTimeout(() => {
            navigate('/superadmin/hotels');
          }, 1500);
        }
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to save hotel details and login credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-[#84A63C]" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in max-w-6xl mx-auto pb-12">
      {/* Sticky Header with Back Button and Actions (Sticks right below the 72px dashboard header) */}
      <div className="bg-white/95 backdrop-blur-md sticky top-[72px] z-30 py-3.5 px-4 rounded-2xl border border-[#DDE5D0] shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 transition-all">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/superadmin/hotels')}
            className="p-2 rounded-xl bg-[#F5F7F0] hover:bg-[#EAF0DE] text-[#4A5E38] transition-all"
            title="Back to Directory"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h2 className="text-base sm:text-lg font-black text-[#1A2E05] tracking-tight flex items-center gap-2">
              <Building size={18} className="text-[#84A63C]" />
              {isEditMode ? `Manage Hotel: ${hotelForm.name}` : 'Register New Hotel'}
            </h2>
            <p className="text-[11px] text-[#7A8A6A] font-semibold">
              {isEditMode ? 'Configure property settings, financial rules, and module privileges' : 'Register a new property profile and set login credentials'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={() => navigate('/superadmin/hotels')}
            className="bg-white border border-[#DDE5D0] hover:bg-[#F5F7F0] text-[#4A5E38] px-4 py-2 rounded-xl text-xs font-bold transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleFormSubmit}
            disabled={submitting}
            className="bg-[#84A63C] hover:bg-[#729231] text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md shadow-[#84A63C]/10 flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 size={13} className="animate-spin" /> Saving...
              </>
            ) : (
              isEditMode ? 'Update Hotel Profile' : 'Save Hotel Profile'
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-50 border border-red-100 text-red-700 text-xs font-semibold shadow-sm animate-shake">
          <AlertCircle size={18} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-semibold shadow-sm">
          <CheckCircle size={18} className="shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <form onSubmit={handleFormSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Basic Info, Location, Tax & Channel Configs (Span 7) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Card 1: Basic Information */}
          <div className="bg-white border border-[#DDE5D0] shadow-xs rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#F0F3E8] pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-[#84A63C]/10 rounded-lg text-[#84A63C]">
                  <Building size={16} />
                </div>
                <h3 className="font-bold text-[#1A2E05] text-xs uppercase tracking-wider">Basic Property Profile</h3>
              </div>
              {hotelForm.since && (
                <span className="text-[10px] font-bold text-[#7A8A6A] bg-[#F5F7F0] px-2.5 py-1 rounded-full border border-[#DDE5D0]">
                  Est. {hotelForm.since}
                </span>
              )}
            </div>

            {/* Logo Uploader */}
            <div className="flex items-center gap-4 bg-[#FBFDF8] p-3 rounded-2xl border border-[#DDE5D0]">
              <div className="w-16 h-16 rounded-2xl overflow-hidden border border-[#DDE5D0] flex items-center justify-center bg-white shrink-0 shadow-inner">
                {hotelForm.logoUrl ? (
                  <img src={hotelForm.logoUrl} alt="Hotel Logo" className="w-full h-full object-cover" />
                ) : (
                  <Building size={24} className="text-[#84A63C]" />
                )}
              </div>
              <div className="space-y-1">
                <span className="text-xs font-bold text-[#1A2E05] block">Property Brand Logo</span>
                <p className="text-[10px] text-[#7A8A6A] font-medium">Displayed on billing receipts, invoices, and stay reports.</p>
                <div className="flex gap-2 pt-0.5">
                  <input
                    id="logoUpload"
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = () => setHotelForm(prev => ({ ...prev, logoUrl: reader.result }));
                        reader.readAsDataURL(file);
                      }
                    }}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => document.getElementById('logoUpload').click()}
                    className="bg-white hover:bg-[#F5F7F0] text-[#4A5E38] text-[10px] font-bold px-3 py-1 rounded-lg border border-[#DDE5D0] transition-colors shadow-2xs"
                  >
                    Upload Image
                  </button>
                  {hotelForm.logoUrl && (
                    <button
                      type="button"
                      onClick={() => setHotelForm(prev => ({ ...prev, logoUrl: '' }))}
                      className="bg-red-50 hover:bg-red-100 text-red-600 text-[10px] font-bold px-3 py-1 rounded-lg border border-red-200 transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Inputs Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1">
                <label className="text-[10px] font-extrabold text-[#4A5E38] uppercase tracking-wider block" htmlFor="name">
                  Hotel / Property Name *
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  value={hotelForm.name}
                  onChange={handleHotelChange}
                  className="w-full bg-[#F5F7F0] border border-[#DDE5D0] focus:border-[#84A63C] focus:bg-white focus:outline-none rounded-xl px-3 py-2 text-xs font-bold text-[#1A2E05]"
                  placeholder="e.g. Royal Grand Hotel"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-extrabold text-[#4A5E38] uppercase tracking-wider block" htmlFor="hotelType">
                  Property Category *
                </label>
                <select
                  id="hotelType"
                  name="hotelType"
                  required
                  value={hotelForm.hotelType || 'Hotel'}
                  onChange={handleHotelChange}
                  className="w-full bg-[#F5F7F0] border border-[#DDE5D0] focus:border-[#84A63C] focus:bg-white focus:outline-none rounded-xl px-3 py-2 text-xs font-bold cursor-pointer text-[#1A2E05]"
                >
                  <option value="Hotel">Hotel</option>
                  <option value="Lodge">Lodge</option>
                  <option value="Banquet">Banquet</option>
                  <option value="Hotel & Banquet">Hotel & Banquet</option>
                  <option value="Resort">Resort</option>
                  <option value="Inn">Inn</option>
                  <option value="Motel">Motel</option>
                  <option value="Guest House">Guest House</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-extrabold text-[#4A5E38] uppercase tracking-wider block" htmlFor="phone">
                  Contact Phone Number
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="text"
                  value={hotelForm.phone}
                  onChange={handleHotelChange}
                  className="w-full bg-[#F5F7F0] border border-[#DDE5D0] focus:border-[#84A63C] focus:bg-white focus:outline-none rounded-xl px-3 py-2 text-xs font-bold text-[#1A2E05]"
                  placeholder="e.g. +91 9876543210"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-extrabold text-[#4A5E38] uppercase tracking-wider block" htmlFor="email">
                  Email Address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={hotelForm.email}
                  onChange={handleHotelChange}
                  className="w-full bg-[#F5F7F0] border border-[#DDE5D0] focus:border-[#84A63C] focus:bg-white focus:outline-none rounded-xl px-3 py-2 text-xs font-bold text-[#1A2E05]"
                  placeholder="e.g. info@royalgrand.com"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-extrabold text-[#4A5E38] uppercase tracking-wider block" htmlFor="since">
                  Established Year (Since)
                </label>
                <input
                  id="since"
                  name="since"
                  type="text"
                  value={hotelForm.since || ''}
                  onChange={handleHotelChange}
                  className="w-full bg-[#F5F7F0] border border-[#DDE5D0] focus:border-[#84A63C] focus:bg-white focus:outline-none rounded-xl px-3 py-2 text-xs font-bold text-[#1A2E05]"
                  placeholder="e.g. 2005"
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="text-[10px] font-extrabold text-[#4A5E38] uppercase tracking-wider block" htmlFor="address">
                  Physical Address
                </label>
                <textarea
                  id="address"
                  name="address"
                  rows="2"
                  value={hotelForm.address}
                  onChange={handleHotelChange}
                  className="w-full bg-[#F5F7F0] border border-[#DDE5D0] focus:border-[#84A63C] focus:bg-white focus:outline-none rounded-xl px-3 py-2 text-xs font-semibold text-[#1A2E05] resize-none"
                  placeholder="Street Address, Area details..."
                />
              </div>
            </div>
          </div>

          {/* Card 2: Location & System Settings */}
          <div className="bg-white border border-[#DDE5D0] shadow-xs rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-[#F0F3E8] pb-3">
              <div className="p-1.5 bg-[#84A63C]/10 rounded-lg text-[#84A63C]">
                <MapPin size={16} />
              </div>
              <h3 className="font-bold text-[#1A2E05] text-xs uppercase tracking-wider">Location & Operational Standards</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1">
                <label className="text-[10px] font-extrabold text-[#4A5E38] uppercase tracking-wider block" htmlFor="city">
                  City *
                </label>
                <input
                  id="city"
                  name="city"
                  type="text"
                  required
                  value={hotelForm.city}
                  onChange={handleHotelChange}
                  className="w-full bg-[#F5F7F0] border border-[#DDE5D0] focus:border-[#84A63C] focus:bg-white focus:outline-none rounded-xl px-3 py-2 text-xs font-bold text-[#1A2E05]"
                  placeholder="e.g. Kolkata"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-extrabold text-[#4A5E38] uppercase tracking-wider block" htmlFor="state">
                  State *
                </label>
                <input
                  id="state"
                  name="state"
                  type="text"
                  required
                  value={hotelForm.state}
                  onChange={handleHotelChange}
                  className="w-full bg-[#F5F7F0] border border-[#DDE5D0] focus:border-[#84A63C] focus:bg-white focus:outline-none rounded-xl px-3 py-2 text-xs font-bold text-[#1A2E05]"
                  placeholder="e.g. West Bengal"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-extrabold text-[#4A5E38] uppercase tracking-wider block" htmlFor="checkoutTime">
                  Default Checkout Time *
                </label>
                <input
                  id="checkoutTime"
                  name="checkoutTime"
                  type="time"
                  required
                  value={hotelForm.checkoutTime || '11:00'}
                  onChange={handleHotelChange}
                  className="w-full bg-[#F5F7F0] border border-[#DDE5D0] focus:border-[#84A63C] focus:bg-white focus:outline-none rounded-xl px-3 py-2 text-xs font-bold text-[#1A2E05]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-extrabold text-[#4A5E38] uppercase tracking-wider block" htmlFor="invoicePrefix">
                  Invoice Prefix Format
                </label>
                <input
                  id="invoicePrefix"
                  name="invoicePrefix"
                  type="text"
                  value={hotelForm.invoicePrefix || ''}
                  onChange={handleHotelChange}
                  className="w-full bg-[#F5F7F0] border border-[#DDE5D0] focus:border-[#84A63C] focus:bg-white focus:outline-none rounded-xl px-3 py-2 text-xs font-bold text-[#1A2E05]"
                  placeholder="e.g. INV-"
                />
              </div>
            </div>
          </div>

          {/* Card 3: Tax & Billing Rules */}
          <div className="bg-white border border-[#DDE5D0] shadow-xs rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-[#F0F3E8] pb-3">
              <div className="p-1.5 bg-[#84A63C]/10 rounded-lg text-[#84A63C]">
                <Receipt size={16} />
              </div>
              <h3 className="font-bold text-[#1A2E05] text-xs uppercase tracking-wider">Tax & Invoice Defaults</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="space-y-1">
                <label className="text-[10px] font-extrabold text-[#4A5E38] uppercase tracking-wider block" htmlFor="gstin">
                  GSTIN Registration No.
                </label>
                <input
                  id="gstin"
                  name="gstin"
                  type="text"
                  value={hotelForm.gstin}
                  onChange={handleHotelChange}
                  className="w-full bg-[#F5F7F0] border border-[#DDE5D0] focus:border-[#84A63C] focus:bg-white focus:outline-none rounded-xl px-3 py-2 text-xs font-bold text-[#1A2E05]"
                  placeholder="e.g. 19AAAAA0000A1Z5"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-extrabold text-[#4A5E38] uppercase tracking-wider block" htmlFor="defaultGstOption">
                  Default GST Mode *
                </label>
                <select
                  id="defaultGstOption"
                  name="defaultGstOption"
                  value={hotelForm.defaultGstOption}
                  onChange={handleHotelChange}
                  className="w-full bg-[#F5F7F0] border border-[#DDE5D0] focus:border-[#84A63C] focus:bg-white focus:outline-none rounded-xl px-3 py-2 text-xs font-bold cursor-pointer text-[#1A2E05]"
                >
                  <option value="none">No GST</option>
                  <option value="inclusive">Including GST</option>
                  <option value="exclusive">Excluding GST</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-extrabold text-[#4A5E38] uppercase tracking-wider block" htmlFor="defaultGstRate">
                  Default GST Rate (%) *
                </label>
                <input
                  id="defaultGstRate"
                  name="defaultGstRate"
                  type="number"
                  required
                  min="0"
                  max="100"
                  value={hotelForm.defaultGstRate}
                  onChange={handleHotelChange}
                  className="w-full bg-[#F5F7F0] border border-[#DDE5D0] focus:border-[#84A63C] focus:bg-white focus:outline-none rounded-xl px-3 py-2 text-xs font-bold text-[#1A2E05]"
                  placeholder="e.g. 12"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-extrabold text-[#4A5E38] uppercase tracking-wider block" htmlFor="defaultHsnCode">
                  Default HSN / SAC Code
                </label>
                <input
                  id="defaultHsnCode"
                  name="defaultHsnCode"
                  type="text"
                  value={hotelForm.defaultHsnCode}
                  onChange={handleHotelChange}
                  className="w-full bg-[#F5F7F0] border border-[#DDE5D0] focus:border-[#84A63C] focus:bg-white focus:outline-none rounded-xl px-3 py-2 text-xs font-bold text-[#1A2E05]"
                  placeholder="e.g. 996311"
                />
              </div>
            </div>
          </div>

          {/* Card 4: Channels & Room Types */}
          <div className="bg-white border border-[#DDE5D0] shadow-xs rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-[#F0F3E8] pb-3">
              <div className="p-1.5 bg-[#84A63C]/10 rounded-lg text-[#84A63C]">
                <Globe size={16} />
              </div>
              <h3 className="font-bold text-[#1A2E05] text-xs uppercase tracking-wider">Channels & Room Categories</h3>
            </div>

            <div className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-[10px] font-extrabold text-[#4A5E38] uppercase tracking-wider block" htmlFor="bookingPlatforms">
                  Online Booking Platforms List (Comma-Separated)
                </label>
                <input
                  id="bookingPlatforms"
                  name="bookingPlatforms"
                  type="text"
                  value={hotelForm.bookingPlatforms || ''}
                  onChange={handleHotelChange}
                  className="w-full bg-[#F5F7F0] border border-[#DDE5D0] focus:border-[#84A63C] focus:bg-white focus:outline-none rounded-xl px-3 py-2 text-xs font-bold text-[#1A2E05]"
                  placeholder="e.g. Booking.com, Agoda, MakeMyTrip, Goibibo"
                />
                <p className="text-[9px] text-[#7A8A6A] font-semibold mt-0.5">Receptionists can select these platforms when creating online reservations.</p>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-extrabold text-[#4A5E38] uppercase tracking-wider block" htmlFor="onlinePaymentBanks">
                  Online Payment Banks & Wallets (Comma-Separated)
                </label>
                <input
                  id="onlinePaymentBanks"
                  name="onlinePaymentBanks"
                  type="text"
                  value={hotelForm.onlinePaymentBanks || ''}
                  onChange={handleHotelChange}
                  className="w-full bg-[#F5F7F0] border border-[#DDE5D0] focus:border-[#84A63C] focus:bg-white focus:outline-none rounded-xl px-3 py-2 text-xs font-bold text-[#1A2E05]"
                  placeholder="e.g. Paytm, Google Pay, ICICI Bank, SBI Bank"
                />
                <p className="text-[9px] text-[#7A8A6A] font-semibold mt-0.5">Options for receptionists to choose payment destinations.</p>
              </div>

              {/* Room Type Toggle & Input */}
              <ToggleCard
                label="Room Category Configurations (Deluxe, Suite, etc.)"
                description="Enable custom room categories assignment for stay overviews and pricing plans."
                checked={hotelForm.hasRoomType}
                onChange={(val) => setHotelForm(prev => ({ ...prev, hasRoomType: val }))}
              >
                <div className="space-y-1">
                  <label className="text-[10px] font-extrabold text-[#4A5E38] uppercase tracking-wider block" htmlFor="roomTypes">
                    Configured Room Categories (Comma-Separated)
                  </label>
                  <input
                    id="roomTypes"
                    name="roomTypes"
                    type="text"
                    value={hotelForm.roomTypes || ''}
                    onChange={handleHotelChange}
                    className="w-full bg-white border border-[#DDE5D0] focus:border-[#84A63C] focus:outline-none rounded-xl px-3 py-2 text-xs font-bold text-[#1A2E05]"
                    placeholder="e.g. Deluxe Room, Single Room, Double Room, Executive Suite"
                  />
                </div>
              </ToggleCard>
            </div>
          </div>
        </div>

        {/* Right Column: Credentials, Features & Permission Rules (Span 5) */}
        <div className="lg:col-span-5 space-y-5 min-w-0 lg:sticky lg:top-[140px] lg:max-h-[calc(100vh-160px)] lg:overflow-y-auto pr-1.5 custom-scrollbar">
          {/* Card 5: Login Credentials */}
          <div className="bg-white border border-[#DDE5D0] shadow-xs rounded-2xl p-5 space-y-3.5">
            <div className="flex items-center gap-2 border-b border-[#F0F3E8] pb-3">
              <div className="p-1.5 bg-[#84A63C]/10 rounded-lg text-[#84A63C]">
                <Key size={16} />
              </div>
              <div>
                <h3 className="font-bold text-[#1A2E05] text-xs uppercase tracking-wider">Hotel Admin Login Account</h3>
                <p className="text-[10px] text-[#7A8A6A] font-semibold">Primary login account credentials for this property</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-extrabold text-[#4A5E38] uppercase tracking-wider block" htmlFor="hotelUsername">
                  Login Username *
                </label>
                <input
                  id="hotelUsername"
                  name="username"
                  type="text"
                  required
                  value={userForm.username}
                  onChange={handleUserChange}
                  className="w-full bg-[#F5F7F0] border border-[#DDE5D0] focus:border-[#84A63C] focus:bg-white focus:outline-none rounded-xl px-3 py-2 text-xs font-bold text-[#1A2E05]"
                  placeholder="e.g. omlodge_admin"
                  autoComplete="off"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-extrabold text-[#4A5E38] uppercase tracking-wider block" htmlFor="hotelPassword">
                  Account Password *
                </label>
                <div className="relative">
                  <input
                    id="hotelPassword"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required={!isEditMode}
                    value={userForm.password}
                    onChange={handleUserChange}
                    className="w-full bg-[#F5F7F0] border border-[#DDE5D0] focus:border-[#84A63C] focus:bg-white focus:outline-none rounded-xl pl-3 pr-10 py-2 text-xs font-bold text-[#1A2E05]"
                    placeholder={isEditMode ? "Leave blank to keep existing password" : "Enter account password"}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#7A8A6A]/60 hover:text-[#84A63C] transition-colors"
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Card 6: Module Features & Privileges */}
          <div className="bg-white border border-[#DDE5D0] shadow-xs rounded-2xl p-5 space-y-3.5">
            <div className="flex items-center gap-2 border-b border-[#F0F3E8] pb-3">
              <div className="p-1.5 bg-[#84A63C]/10 rounded-lg text-[#84A63C]">
                <ShieldCheck size={16} />
              </div>
              <div>
                <h3 className="font-bold text-[#1A2E05] text-xs uppercase tracking-wider">Module Privileges</h3>
                <p className="text-[10px] text-[#7A8A6A] font-semibold">Enable or disable specific features for this hotel</p>
              </div>
            </div>

            <div className="space-y-2.5">
              <ToggleCard
                label="KOT Management (Kitchen & Food)"
                description="Allow hotel to create, track, and print Kitchen Order Tickets."
                checked={hotelForm.hasKot}
                onChange={(val) => setHotelForm(prev => ({ ...prev, hasKot: val }))}
              />

              <ToggleCard
                label="Accounts Management (Transactions)"
                description="Allow hotel to track cash/online transactions and operational expenses."
                checked={hotelForm.hasAccounts}
                onChange={(val) => setHotelForm(prev => ({ ...prev, hasAccounts: val }))}
              />

              <ToggleCard
                label="Assets Management (Inventory)"
                description="Allow hotel to log equipment maintenance timeline and property assets."
                checked={hotelForm.hasAssets}
                onChange={(val) => setHotelForm(prev => ({ ...prev, hasAssets: val }))}
              />

              <ToggleCard
                label="Activity Logs (Audit Tracker)"
                description="Allow hotel to view audit trail history of actions taken by users."
                checked={hotelForm.hasActivityLogs}
                onChange={(val) => setHotelForm(prev => ({ ...prev, hasActivityLogs: val }))}
              />

              <ToggleCard
                label="Opening Balance Management"
                description="Allow hotel to track starting cash and bank balances in financial reports."
                checked={hotelForm.hasOpeningBalance}
                onChange={(val) => setHotelForm(prev => ({ ...prev, hasOpeningBalance: val }))}
              >
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[9px] font-extrabold text-[#4A5E38] uppercase tracking-wider block mb-1">Cash Opening (₹)</label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#7A8A6A]">₹</span>
                        <input
                          type="number"
                          step="any"
                          value={hotelForm.openingCashBalance}
                          onChange={(e) => setHotelForm(prev => ({ ...prev, openingCashBalance: e.target.value }))}
                          className="w-full pl-6 pr-2.5 py-1.5 bg-white border border-[#DDE5D0] rounded-xl text-xs font-bold text-[#1A2E05] focus:outline-none focus:border-[#84A63C]"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[9px] font-extrabold text-[#4A5E38] uppercase tracking-wider block">Bank Opening (₹)</label>
                        {activeBankList.length > 0 && (
                          <span className="text-[8px] font-extrabold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                            Total
                          </span>
                        )}
                      </div>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#7A8A6A]">₹</span>
                        <input
                          type="number"
                          step="any"
                          value={hotelForm.openingBankBalance}
                          onChange={(e) => setHotelForm(prev => ({ ...prev, openingBankBalance: e.target.value }))}
                          className="w-full pl-6 pr-2.5 py-1.5 bg-white border border-[#DDE5D0] rounded-xl text-xs font-bold text-[#1A2E05] focus:outline-none focus:border-[#84A63C]"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Bank-wise Starting Balances */}
                  <div className="bg-[#F4F7EE]/80 rounded-xl p-3 border border-[#DDE5D0] space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Landmark size={13} className="text-[#4A5E38]" />
                        <span className="text-[10px] font-black text-[#1A2E05] uppercase tracking-wider">
                          Bank & Online Accounts Breakdown
                        </span>
                      </div>
                      <span className="text-[9px] font-extrabold text-[#4A5E38] bg-white px-2 py-0.5 rounded-full border border-[#DDE5D0] shadow-2xs">
                        {activeBankList.length} {activeBankList.length === 1 ? 'account' : 'accounts'}
                      </span>
                    </div>

                    <p className="text-[9.5px] text-[#7A8A6A] font-semibold leading-tight">
                      Specify starting balance for each bank account. Totals update automatically above.
                    </p>

                    {activeBankList.length === 0 ? (
                      <div className="bg-white rounded-xl p-3 text-center border border-dashed border-[#DDE5D0] space-y-2">
                        <p className="text-xs font-medium text-[#7A8A6A]">No bank accounts configured yet.</p>
                        <button
                          type="button"
                          onClick={handleLoadDefaultBanks}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-[#84A63C] hover:underline"
                        >
                          <Plus size={11} /> Load common banks (Paytm, GPay, SBI, HDFC, ICICI)
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                        {activeBankList.map(bank => {
                          const val = bankBalancesState[bank] !== undefined ? bankBalancesState[bank] : '';
                          return (
                            <div
                              key={bank}
                              className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-[#DDE5D0] shadow-2xs hover:border-[#84A63C]/50 transition-all"
                            >
                              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                <div className="w-1.5 h-1.5 rounded-full bg-[#84A63C] shrink-0" />
                                <span className="text-xs font-bold text-[#1A2E05] truncate" title={bank}>
                                  {bank}
                                </span>
                              </div>
                              <div className="relative w-28 sm:w-32 shrink-0">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-black text-[#7A8A6A]">₹</span>
                                <input
                                  type="number"
                                  step="any"
                                  value={val}
                                  onChange={(e) => handleBankBalanceChange(bank, e.target.value)}
                                  placeholder="0.00"
                                  className="w-full pl-6 pr-2 py-1 bg-[#FBFDF8] border border-[#DDE5D0] rounded-lg text-xs font-bold text-[#1A2E05] focus:bg-white focus:outline-none focus:border-[#84A63C] text-right"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveBank(bank)}
                                className="text-[#A5B595] hover:text-rose-600 p-1 transition-colors shrink-0"
                                title={`Remove ${bank}`}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Add new bank account row */}
                    <div className="pt-0.5">
                      {showAddCustomBank ? (
                        <div className="flex items-center gap-1.5 bg-white p-2 rounded-xl border border-[#84A63C]/70 shadow-2xs animate-fade-in">
                          <input
                            type="text"
                            value={customBankName}
                            onChange={(e) => setCustomBankName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddCustomBank();
                              }
                            }}
                            placeholder="e.g. Bank of Baroda, Axis, PhonePe"
                            className="flex-1 px-2.5 py-1 text-xs border border-[#DDE5D0] rounded-lg font-bold text-[#1A2E05] focus:outline-none focus:border-[#84A63C]"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={handleAddCustomBank}
                            className="px-3 py-1 bg-[#84A63C] text-white rounded-lg text-xs font-bold hover:bg-[#729231] transition-colors shrink-0"
                          >
                            Add
                          </button>
                          <button
                            type="button"
                            onClick={() => { setShowAddCustomBank(false); setCustomBankName(''); }}
                            className="px-2 py-1 text-[#7A8A6A] hover:text-[#1A2E05] text-xs font-bold shrink-0"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowAddCustomBank(true)}
                          className="inline-flex items-center gap-1 text-[11px] font-extrabold text-[#4A5E38] hover:text-[#84A63C] transition-colors py-0.5"
                        >
                          <Plus size={13} /> Add another bank / account
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#DDE5D0]/60 flex items-center justify-between gap-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-bold text-[#1A2E05]">Lock Opening Balance Edit</span>
                      <span className="text-[9px] text-[#7A8A6A] font-semibold">Prevent hotel staff from modifying starting amounts once set.</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setHotelForm(prev => ({ ...prev, lockOpeningBalance: !prev.lockOpeningBalance }))}
                      className={`relative inline-flex h-4.5 w-8 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${hotelForm.lockOpeningBalance ? 'bg-amber-600' : 'bg-[#DDE5D0]'
                        }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${hotelForm.lockOpeningBalance ? 'translate-x-3.5' : 'translate-x-0'
                          }`}
                      />
                    </button>
                  </div>
                </div>
              </ToggleCard>
            </div>
          </div>

          {/* Card 7: Operational Restrictions & Permissions */}
          <div className="bg-white border border-[#DDE5D0] shadow-xs rounded-2xl p-5 space-y-3.5">
            <div className="flex items-center gap-2 border-b border-[#F0F3E8] pb-3">
              <div className="p-1.5 bg-[#84A63C]/10 rounded-lg text-[#84A63C]">
                <Lock size={16} />
              </div>
              <div>
                <h3 className="font-bold text-[#1A2E05] text-xs uppercase tracking-wider">Staff Permissions & Rules</h3>
                <p className="text-[10px] text-[#7A8A6A] font-semibold">Control editing rights and operational restrictions</p>
              </div>
            </div>

            <div className="space-y-2.5">
              <ToggleCard
                label="Allow Hotel Profile Edit"
                description="Allow hotel admin to update logo, address, phone, and GSTIN numbers."
                checked={hotelForm.allowHotelEdit}
                onChange={(val) => setHotelForm(prev => ({ ...prev, allowHotelEdit: val }))}
              />

              <ToggleCard
                label="Allow Edit Checked-Out Guest Billing"
                description="Allow receptionists to modify room rates, discount amounts, and billing rules for checked-out / completed guests."
                checked={hotelForm.allowBillingEdit}
                onChange={(val) => setHotelForm(prev => ({ ...prev, allowBillingEdit: val }))}
              />

              <ToggleCard
                label="Enable Registration Number Feature"
                description="Show serial Registration Number (Reg. No.) column, modal inputs, and search across Front Office Billing and Guest History pages for this hotel."
                checked={hotelForm.enableRegistrationNumber}
                onChange={(val) => setHotelForm(prev => ({ ...prev, enableRegistrationNumber: val }))}
              />
            </div>

            {/* Payment Permissions Sub-Section */}
            <div className="mt-4 pt-3.5 border-t border-[#F0F3E8]">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1 bg-amber-50 rounded-md text-amber-600">
                  <Wallet size={13} />
                </div>
                <h4 className="font-bold text-[#1A2E05] text-[10px] uppercase tracking-wider">Payment Permissions</h4>
              </div>
              <div className="space-y-2.5">
                <ToggleCard
                  label="Allow Edit Checked-Out Guest Payments"
                  description="Allow receptionists to add/edit payment transaction history for guests who have already checked out."
                  checked={hotelForm.allowPaymentEdit}
                  onChange={(val) => setHotelForm(prev => ({ ...prev, allowPaymentEdit: val }))}
                />

                <ToggleCard
                  label="Allow Edit Old Payments & Receipts"
                  description="Allow receptionists to edit or delete past/old payment transactions recorded on previous dates. When disabled, only today's payments can be edited."
                  checked={hotelForm.allowEditOldPayments}
                  onChange={(val) => setHotelForm(prev => ({ ...prev, allowEditOldPayments: val }))}
                />

                <ToggleCard
                  label="Enable Payment Serial Number"
                  description="Automatically generate and assign a sequential payment serial number (1, 2, 3...) for every money collection/transaction, and display it in Accounts and Billing."
                  checked={hotelForm.enablePaymentSerialNumber}
                  onChange={(val) => setHotelForm(prev => ({ ...prev, enablePaymentSerialNumber: val }))}
                />
              </div>
            </div>
            {/* Other Permissions Sub-Section */}
            <div className="mt-4 pt-3.5 border-t border-[#F0F3E8]">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1 bg-blue-50 rounded-md text-blue-600">
                  <Settings2 size={13} />
                </div>
                <h4 className="font-bold text-[#1A2E05] text-[10px] uppercase tracking-wider">Booking & Room Permissions</h4>
              </div>
              <div className="space-y-2.5">
                <ToggleCard
                  label="Allow Adding New Rooms"
                  description="Allow hotel admin to add new rooms to floor plans."
                  checked={hotelForm.allowRoomAdd}
                  onChange={(val) => setHotelForm(prev => ({ ...prev, allowRoomAdd: val }))}
                />

                <ToggleCard
                  label="Allow Deleting Rooms"
                  description="Allow hotel admin to delete existing rooms from floor inventory."
                  checked={hotelForm.allowRoomDelete}
                  onChange={(val) => setHotelForm(prev => ({ ...prev, allowRoomDelete: val }))}
                />

                <ToggleCard
                  label="Restrict Back-Dated Bookings"
                  description="Block receptionists from selecting check-in dates prior to today."
                  checked={hotelForm.restrictBackDates}
                  onChange={(val) => setHotelForm(prev => ({ ...prev, restrictBackDates: val }))}
                />

                <ToggleCard
                  label="Per-Guest Room Selection in Group Bookings"
                  description="Allow receptionists to select specific rooms for each guest when booking multiple rooms."
                  checked={hotelForm.enablePerGuestRoomAssignment}
                  onChange={(val) => setHotelForm(prev => ({ ...prev, enablePerGuestRoomAssignment: val }))}
                />

                <ToggleCard
                  label="Auto-Extend Overdue Checkouts & Charges"
                  description="Automatically extend check-out date by +1 day and add 1 day's room charge if a guest has not checked out after the specified cutoff time."
                  checked={hotelForm.enableAutoExtendCheckout}
                  onChange={(val) => setHotelForm(prev => ({ ...prev, enableAutoExtendCheckout: val }))}
                >
                  <div className="space-y-1">
                    <label className="text-[9px] font-extrabold text-[#4A5E38] uppercase tracking-wider block mb-1">
                      Auto-Extend Cutoff Time
                    </label>
                    <input
                      type="time"
                      value={hotelForm.autoExtendCutoffTime || '11:30'}
                      onChange={(e) => setHotelForm(prev => ({ ...prev, autoExtendCutoffTime: e.target.value }))}
                      className="w-full bg-white border border-[#DDE5D0] focus:border-[#84A63C] focus:outline-none rounded-xl px-3 py-2 text-xs font-bold text-[#1A2E05]"
                    />
                    <p className="text-[9px] text-[#7A8A6A] font-semibold mt-1">
                      If an active guest has not checked out past this cutoff time on their checkout date, their stay will auto-extend by +1 day and add 1 day's room rate.
                    </p>
                  </div>
                </ToggleCard>

                <ToggleCard
                  label="Lock Past Stay Charges & Rates"
                  description="Block hotel staff from modifying or reducing room rates and charges accrued for past completed stay days."
                  checked={hotelForm.lockPastStayCharges}
                  onChange={(val) => setHotelForm(prev => ({ ...prev, lockPastStayCharges: val }))}
                />

                <ToggleCard
                  label="Reset Invoice Serial Number Yearly"
                  description="Reset invoice numbering back to 1 on a specific financial year-end date."
                  checked={hotelForm.resetInvoiceYearly}
                  onChange={(val) => setHotelForm(prev => ({ ...prev, resetInvoiceYearly: val }))}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className="text-[9px] font-extrabold text-[#4A5E38] uppercase tracking-wider block mb-1">Month</label>
                      <select
                        value={hotelForm.yearEndingDate ? hotelForm.yearEndingDate.split('-')[0] : '03'}
                        onChange={(e) => {
                          const month = e.target.value;
                          const day = hotelForm.yearEndingDate ? hotelForm.yearEndingDate.split('-')[1] : '31';
                          setHotelForm(prev => ({ ...prev, yearEndingDate: `${month}-${day}` }));
                        }}
                        className="w-full bg-white border border-[#DDE5D0] focus:border-[#84A63C] focus:outline-none rounded-xl px-2.5 py-1.5 text-xs font-bold cursor-pointer text-[#1A2E05]"
                      >
                        <option value="01">January</option>
                        <option value="02">February</option>
                        <option value="03">March</option>
                        <option value="04">April</option>
                        <option value="05">May</option>
                        <option value="06">June</option>
                        <option value="07">July</option>
                        <option value="08">August</option>
                        <option value="09">September</option>
                        <option value="10">October</option>
                        <option value="11">November</option>
                        <option value="12">December</option>
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="text-[9px] font-extrabold text-[#4A5E38] uppercase tracking-wider block mb-1">Day</label>
                      <select
                        value={hotelForm.yearEndingDate ? hotelForm.yearEndingDate.split('-')[1] : '31'}
                        onChange={(e) => {
                          const month = hotelForm.yearEndingDate ? hotelForm.yearEndingDate.split('-')[0] : '03';
                          const day = e.target.value;
                          setHotelForm(prev => ({ ...prev, yearEndingDate: `${month}-${day}` }));
                        }}
                        className="w-full bg-white border border-[#DDE5D0] focus:border-[#84A63C] focus:outline-none rounded-xl px-2.5 py-1.5 text-xs font-bold cursor-pointer text-[#1A2E05]"
                      >
                        {Array.from({ length: 31 }, (_, i) => {
                          const dayVal = String(i + 1).padStart(2, '0');
                          return <option key={dayVal} value={dayVal}>{i + 1}</option>;
                        })}
                      </select>
                    </div>
                  </div>
                </ToggleCard>
              </div>
            </div>

            {/* Billing Template Choice */}
            <div className="pt-3 border-t border-[#F0F3E8] space-y-1">
              <label className="text-[10px] font-extrabold text-[#4A5E38] uppercase tracking-wider block" htmlFor="billingTemplateId">
                Invoice / Billing Template *
              </label>
              <select
                id="billingTemplateId"
                name="billingTemplateId"
                value={hotelForm.billingTemplateId || 'template_1'}
                onChange={(e) => setHotelForm(prev => ({ ...prev, billingTemplateId: e.target.value }))}
                className="w-full bg-[#F5F7F0] border border-[#DDE5D0] focus:border-[#84A63C] focus:outline-none rounded-xl px-3 py-2 text-xs font-semibold text-[#1A2E05] cursor-pointer"
              >
                {templates.length > 0 ? (
                  templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))
                ) : (
                  <>
                    <option value="template_1">Emerald Modern</option>
                    <option value="template_2">Classic Minimal</option>
                    <option value="template_3">Warm Luxury</option>
                  </>
                )}
              </select>
              <p className="text-[9px] text-[#7A8A6A] font-semibold leading-normal">
                Select the structural design and color theme for dynamic invoices.
              </p>
            </div>
          </div>

          {/* Card 8: Room Status Card Colors */}
          {(() => {
            const currentColors = parseRoomColors(hotelForm.roomCardColors);
            const updateColor = (key, val) => {
              const updated = { ...currentColors, [key]: val };
              setHotelForm(prev => ({ ...prev, roomCardColors: JSON.stringify(updated) }));
            };

            const applyPreset = (preset) => {
              setHotelForm(prev => ({ ...prev, roomCardColors: JSON.stringify(preset) }));
            };

            return (
              <div className="bg-white border border-[#DDE5D0] shadow-xs rounded-2xl p-5 space-y-3.5">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-[#F0F3E8] pb-3 gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-[#84A63C]/10 rounded-lg text-[#84A63C]">
                      <Sparkles size={16} />
                    </div>
                    <div>
                      <h3 className="font-bold text-[#1A2E05] text-xs uppercase tracking-wider">Room Status Card Colors</h3>
                      <p className="text-[10px] text-[#7A8A6A] font-semibold">Customize room card background & text colors on Stay Overview</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setHotelForm(prev => ({ ...prev, roomCardColors: '' }))}
                    className="px-2.5 py-1 text-[10px] font-bold text-[#84A63C] hover:bg-[#84A63C]/10 border border-[#84A63C]/30 rounded-lg transition-all"
                  >
                    Reset Defaults
                  </button>
                </div>

                {/* Theme Preset Buttons */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-extrabold text-[#4A5E38] uppercase tracking-wider block">
                    Quick Color Theme Presets:
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={() => applyPreset({ occupiedBg: '#1C2B12', occupiedText: '#FFFFFF', availableBg: '#FFFFFF', availableText: '#1A2E05', reservedBg: '#EFF6FF', reservedText: '#1E3A8A' })}
                      className="p-2 border border-[#DDE5D0] rounded-xl hover:border-[#84A63C] text-left transition-all bg-white"
                    >
                      <span className="text-[10px] font-bold text-[#1A2E05] block">1. Classic Olive (Default)</span>
                      <div className="flex gap-1 mt-1">
                        <span className="w-4 h-4 rounded-full bg-[#1C2B12]"></span>
                        <span className="w-4 h-4 rounded-full bg-white border border-gray-300"></span>
                        <span className="w-4 h-4 rounded-full bg-[#EFF6FF] border border-blue-200"></span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => applyPreset({ occupiedBg: '#991B1B', occupiedText: '#FFFFFF', availableBg: '#059669', availableText: '#FFFFFF', reservedBg: '#EFF6FF', reservedText: '#1E40AF', cleaningBg: '#E0F2FE', cleaningText: '#0284C7', maintenanceBg: '#FEF3C7', maintenanceText: '#D97706' })}
                      className="p-2 border border-[#DDE5D0] rounded-xl hover:border-[#84A63C] text-left transition-all bg-white"
                    >
                      <span className="text-[10px] font-bold text-[#1A2E05] block">2. Red & Green</span>
                      <div className="flex gap-1 mt-1">
                        <span className="w-4 h-4 rounded-full bg-[#991B1B]"></span>
                        <span className="w-4 h-4 rounded-full bg-[#059669]"></span>
                        <span className="w-4 h-4 rounded-full bg-[#EFF6FF] border border-blue-200"></span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => applyPreset({ occupiedBg: '#E11D48', occupiedText: '#FFFFFF', availableBg: '#10B981', availableText: '#FFFFFF', reservedBg: '#4F46E5', reservedText: '#FFFFFF' })}
                      className="p-2 border border-[#DDE5D0] rounded-xl hover:border-[#84A63C] text-left transition-all bg-white"
                    >
                      <span className="text-[10px] font-bold text-[#1A2E05] block">3. Rose & Mint</span>
                      <div className="flex gap-1 mt-1">
                        <span className="w-4 h-4 rounded-full bg-[#E11D48]"></span>
                        <span className="w-4 h-4 rounded-full bg-[#10B981]"></span>
                        <span className="w-4 h-4 rounded-full bg-[#4F46E5]"></span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => applyPreset({ occupiedBg: '#B91C1C', occupiedText: '#FFFFFF', availableBg: '#F8FAFC', availableText: '#0F172A', reservedBg: '#E0F2FE', reservedText: '#0369A1' })}
                      className="p-2 border border-[#DDE5D0] rounded-xl hover:border-[#84A63C] text-left transition-all bg-white"
                    >
                      <span className="text-[10px] font-bold text-[#1A2E05] block">4. Red & Soft White</span>
                      <div className="flex gap-1 mt-1">
                        <span className="w-4 h-4 rounded-full bg-[#B91C1C]"></span>
                        <span className="w-4 h-4 rounded-full bg-[#F8FAFC] border border-gray-300"></span>
                        <span className="w-4 h-4 rounded-full bg-[#E0F2FE]"></span>
                      </div>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* Occupied / Booked Room Color */}
                  <div className="p-3 bg-[#FBFDF8] border border-[#DDE5D0] rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#1A2E05]">Occupied / Booked Room</span>
                      <span className="text-[10px] font-mono text-[#7A8A6A]">{currentColors.occupiedBg}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] font-bold text-[#4A5E38] block mb-0.5">Card Background</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={currentColors.occupiedBg}
                            onChange={(e) => updateColor('occupiedBg', e.target.value)}
                            className="w-8 h-8 rounded-lg cursor-pointer border border-[#DDE5D0]"
                          />
                          <input
                            type="text"
                            value={currentColors.occupiedBg}
                            onChange={(e) => updateColor('occupiedBg', e.target.value)}
                            className="w-full px-2 py-1 bg-white border border-[#DDE5D0] rounded-lg text-xs font-bold font-mono text-[#1A2E05]"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-[#4A5E38] block mb-0.5">Text Color</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={currentColors.occupiedText}
                            onChange={(e) => updateColor('occupiedText', e.target.value)}
                            className="w-8 h-8 rounded-lg cursor-pointer border border-[#DDE5D0]"
                          />
                          <input
                            type="text"
                            value={currentColors.occupiedText}
                            onChange={(e) => updateColor('occupiedText', e.target.value)}
                            className="w-full px-2 py-1 bg-white border border-[#DDE5D0] rounded-lg text-xs font-bold font-mono text-[#1A2E05]"
                          />
                        </div>
                      </div>
                    </div>
                    <div
                      style={{ backgroundColor: currentColors.occupiedBg, color: currentColors.occupiedText }}
                      className="w-full h-8 rounded-lg flex items-center justify-center font-bold text-xs shadow-xs transition-all"
                    >
                      Room 101 (Occupied Preview)
                    </div>
                  </div>

                  {/* Multiple Rooms / Group Booking Color */}
                  <div className="p-3 bg-[#FBFDF8] border border-[#DDE5D0] rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#1A2E05]">Multiple Rooms (Group Booking)</span>
                      <span className="text-[10px] font-mono text-[#7A8A6A]">{currentColors.multipleBg || '#115E59'}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] font-bold text-[#4A5E38] block mb-0.5">Card Background</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={currentColors.multipleBg || '#115E59'}
                            onChange={(e) => updateColor('multipleBg', e.target.value)}
                            className="w-8 h-8 rounded-lg cursor-pointer border border-[#DDE5D0]"
                          />
                          <input
                            type="text"
                            value={currentColors.multipleBg || '#115E59'}
                            onChange={(e) => updateColor('multipleBg', e.target.value)}
                            className="w-full px-2 py-1 bg-white border border-[#DDE5D0] rounded-lg text-xs font-bold font-mono text-[#1A2E05]"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-[#4A5E38] block mb-0.5">Text Color</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={currentColors.multipleText || '#FFFFFF'}
                            onChange={(e) => updateColor('multipleText', e.target.value)}
                            className="w-8 h-8 rounded-lg cursor-pointer border border-[#DDE5D0]"
                          />
                          <input
                            type="text"
                            value={currentColors.multipleText || '#FFFFFF'}
                            onChange={(e) => updateColor('multipleText', e.target.value)}
                            className="w-full px-2 py-1 bg-white border border-[#DDE5D0] rounded-lg text-xs font-bold font-mono text-[#1A2E05]"
                          />
                        </div>
                      </div>
                    </div>
                    <div
                      style={{ backgroundColor: currentColors.multipleBg || '#115E59', color: currentColors.multipleText || '#FFFFFF' }}
                      className="w-full h-8 rounded-lg flex items-center justify-center font-bold text-xs shadow-xs transition-all"
                    >
                      Room 101 & 102 (Multiple Rooms Preview)
                    </div>
                  </div>

                  {/* Available Room Color */}
                  <div className="p-3 bg-[#FBFDF8] border border-[#DDE5D0] rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#1A2E05]">Available Room</span>
                      <span className="text-[10px] font-mono text-[#7A8A6A]">{currentColors.availableBg}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] font-bold text-[#4A5E38] block mb-0.5">Card Background</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={currentColors.availableBg}
                            onChange={(e) => updateColor('availableBg', e.target.value)}
                            className="w-8 h-8 rounded-lg cursor-pointer border border-[#DDE5D0]"
                          />
                          <input
                            type="text"
                            value={currentColors.availableBg}
                            onChange={(e) => updateColor('availableBg', e.target.value)}
                            className="w-full px-2 py-1 bg-white border border-[#DDE5D0] rounded-lg text-xs font-bold font-mono text-[#1A2E05]"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-[#4A5E38] block mb-0.5">Text Color</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={currentColors.availableText}
                            onChange={(e) => updateColor('availableText', e.target.value)}
                            className="w-8 h-8 rounded-lg cursor-pointer border border-[#DDE5D0]"
                          />
                          <input
                            type="text"
                            value={currentColors.availableText}
                            onChange={(e) => updateColor('availableText', e.target.value)}
                            className="w-full px-2 py-1 bg-white border border-[#DDE5D0] rounded-lg text-xs font-bold font-mono text-[#1A2E05]"
                          />
                        </div>
                      </div>
                    </div>
                    <div
                      style={{ backgroundColor: currentColors.availableBg, color: currentColors.availableText }}
                      className="w-full h-8 rounded-lg flex items-center justify-center font-bold text-xs border border-[#DDE5D0] shadow-xs transition-all"
                    >
                      Room 102 (Available Preview)
                    </div>
                  </div>

                  {/* Reserved Room Color */}
                  <div className="p-3 bg-[#FBFDF8] border border-[#DDE5D0] rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#1A2E05]">Reserved Room</span>
                      <span className="text-[10px] font-mono text-[#7A8A6A]">{currentColors.reservedBg}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] font-bold text-[#4A5E38] block mb-0.5">Card Background</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={currentColors.reservedBg}
                            onChange={(e) => updateColor('reservedBg', e.target.value)}
                            className="w-8 h-8 rounded-lg cursor-pointer border border-[#DDE5D0]"
                          />
                          <input
                            type="text"
                            value={currentColors.reservedBg}
                            onChange={(e) => updateColor('reservedBg', e.target.value)}
                            className="w-full px-2 py-1 bg-white border border-[#DDE5D0] rounded-lg text-xs font-bold font-mono text-[#1A2E05]"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-[#4A5E38] block mb-0.5">Text Color</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={currentColors.reservedText}
                            onChange={(e) => updateColor('reservedText', e.target.value)}
                            className="w-8 h-8 rounded-lg cursor-pointer border border-[#DDE5D0]"
                          />
                          <input
                            type="text"
                            value={currentColors.reservedText}
                            onChange={(e) => updateColor('reservedText', e.target.value)}
                            className="w-full px-2 py-1 bg-white border border-[#DDE5D0] rounded-lg text-xs font-bold font-mono text-[#1A2E05]"
                          />
                        </div>
                      </div>
                    </div>
                    <div
                      style={{ backgroundColor: currentColors.reservedBg, color: currentColors.reservedText }}
                      className="w-full h-8 rounded-lg flex items-center justify-center font-bold text-xs border border-blue-200 shadow-xs transition-all"
                    >
                      Room 103 (Reserved Preview)
                    </div>
                  </div>

                  {/* Maintenance Room Color */}
                  <div className="p-3 bg-[#FBFDF8] border border-[#DDE5D0] rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#1A2E05]">Maintenance Room</span>
                      <span className="text-[10px] font-mono text-[#7A8A6A]">{currentColors.maintenanceBg}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] font-bold text-[#4A5E38] block mb-0.5">Card Background</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={currentColors.maintenanceBg}
                            onChange={(e) => updateColor('maintenanceBg', e.target.value)}
                            className="w-8 h-8 rounded-lg cursor-pointer border border-[#DDE5D0]"
                          />
                          <input
                            type="text"
                            value={currentColors.maintenanceBg}
                            onChange={(e) => updateColor('maintenanceBg', e.target.value)}
                            className="w-full px-2 py-1 bg-white border border-[#DDE5D0] rounded-lg text-xs font-bold font-mono text-[#1A2E05]"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-[#4A5E38] block mb-0.5">Text Color</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={currentColors.maintenanceText}
                            onChange={(e) => updateColor('maintenanceText', e.target.value)}
                            className="w-8 h-8 rounded-lg cursor-pointer border border-[#DDE5D0]"
                          />
                          <input
                            type="text"
                            value={currentColors.maintenanceText}
                            onChange={(e) => updateColor('maintenanceText', e.target.value)}
                            className="w-full px-2 py-1 bg-white border border-[#DDE5D0] rounded-lg text-xs font-bold font-mono text-[#1A2E05]"
                          />
                        </div>
                      </div>
                    </div>
                    <div
                      style={{ backgroundColor: currentColors.maintenanceBg, color: currentColors.maintenanceText }}
                      className="w-full h-8 rounded-lg flex items-center justify-center font-bold text-xs border border-amber-200 shadow-xs transition-all"
                    >
                      Room 104 (Maintenance Preview)
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </form>
    </div>
  );
};

export default AddHotel;
