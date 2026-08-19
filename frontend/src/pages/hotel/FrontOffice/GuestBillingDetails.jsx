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
import { downloadDocumentFile } from '../../../utils/fileDownloader';
import QuickPayModal from '../../../components/QuickPayModal';

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

const formatMoney = (val) => {
  const num = Number(val || 0);
  return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const GuestBillingDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { activeHotel } = useAuth();

  const [booking, setBooking] = useState(location.state?.bill || null);
  const [loading, setLoading] = useState(!location.state?.bill);
  const [error, setError] = useState(null);

  // Modals & previews
  const [isPayOpen, setIsPayOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);

  const fetchBooking = async () => {
    try {
      if (!booking) setLoading(true);
      const res = await api.get(`/bookings/${id}`);
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
    fetchBooking();
  }, [id]);

  // Financial calculations
  const financialData = useMemo(() => {
    if (!booking) return null;

    const baseAmount = Number(booking.totalAmount || 0);
    const discount = Number(booking.discount || 0);
    const amountPaid = Number(booking.amountPaid || 0);
    const gstRate = Number(booking.gstRate !== undefined && booking.gstRate !== null ? booking.gstRate : (activeHotel?.defaultGstRate !== undefined ? Number(activeHotel.defaultGstRate) : 12));
    const gstOption = booking.gstOption || 'none';

    let extraChargesTotal = 0;
    if (booking.extraChargesList && Array.isArray(booking.extraChargesList)) {
      extraChargesTotal = booking.extraChargesList.reduce((sum, ec) => sum + Number(ec.grandTotal || ec.amount || 0), 0);
    } else if (booking.extraCharges) {
      extraChargesTotal = Number(booking.extraCharges);
    }

    const netRoomTotal = Math.max(0, baseAmount - discount);
    let subTotal = netRoomTotal;
    let roomGstAmount = 0;
    let grandTotal = 0;

    if (gstOption === 'exclusive') {
      subTotal = netRoomTotal;
      roomGstAmount = gstRate > 0 ? Math.round((subTotal * (gstRate / 100)) * 100) / 100 : 0;
      grandTotal = subTotal + roomGstAmount + extraChargesTotal;
    } else if (gstOption === 'inclusive') {
      grandTotal = netRoomTotal + extraChargesTotal;
      subTotal = gstRate > 0 ? Math.round((netRoomTotal / (1 + gstRate / 100)) * 100) / 100 : netRoomTotal;
      roomGstAmount = Math.round((netRoomTotal - subTotal) * 100) / 100;
    } else {
      roomGstAmount = 0;
      grandTotal = netRoomTotal + extraChargesTotal;
      subTotal = netRoomTotal;
    }

    let extraGstAmount = 0;
    if (booking.extraChargesList && Array.isArray(booking.extraChargesList)) {
      extraGstAmount = booking.extraChargesList.reduce((s, ec) => s + Number(ec.gstAmount || 0), 0);
    }

    const totalGstAmount = roomGstAmount + extraGstAmount;
    const pendingDue = grandTotal - amountPaid;

    let paymentHistory = [];
    try {
      if (booking.paymentHistory) {
        paymentHistory = JSON.parse(booking.paymentHistory);
      }
    } catch (e) {
      paymentHistory = [];
    }

    return {
      baseAmount,
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
  }, [booking, activeHotel]);

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

  // Room Numbers string
  const roomNumbersStr = booking.groupBookings && booking.groupBookings.length > 0
    ? booking.groupBookings.map(b => cleanRoomNumber(b.Room?.roomNumber || b.roomId)).join(', ')
    : (booking.Room?.roomNumber ? cleanRoomNumber(booking.Room.roomNumber) : 'N/A');

  const checkInDateFormatted = formatDateDMY(booking.checkInDate || booking.createdAt);
  const checkOutDateFormatted = formatDateDMY(booking.checkOutDate);
  const checkInTimeFormatted = booking.checkInTime ? formatTime12hr(booking.checkInTime) : '12:00 PM';
  const checkOutTimeFormatted = booking.checkOutTime ? formatTime12hr(booking.checkOutTime) : '11:00 AM';

  const stayDays = Math.max(1, Math.ceil(Math.abs(new Date(booking.checkOutDate || new Date()) - new Date(booking.checkInDate || new Date())) / (1000 * 60 * 60 * 24)));

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
              <span className="font-black text-xs sm:text-sm text-[#1A2E05]">R-{roomNumbersStr}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#2E4316]">Room Type:</span>
              <span className="font-bold text-[#1A2E05]">{booking.Room?.type || 'Standard'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#2E4316]">Stay Duration:</span>
              <span className="font-black text-[#84A63C]">{stayDays} {stayDays === 1 ? 'Night' : 'Nights'}</span>
            </div>
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
              {financialData?.pendingDue && Math.abs(financialData.pendingDue) < 0.1 ? (
                <span className="text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 text-[9.5px]">
                  No Pending
                </span>
              ) : financialData?.pendingDue && financialData.pendingDue < 0 ? (
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
                  {/* Room Charges */}
                  <tr>
                    <td className="py-2">
                      <p className="font-black text-[#1A2E05]">Room Charges (R-{roomNumbersStr})</p>
                      <p className="text-[9.5px] text-[#2E4316] font-bold">{stayDays} {stayDays === 1 ? 'Night' : 'Nights'} stay</p>
                    </td>
                    <td className="py-2 text-right font-mono text-[#1A2E05]">₹{formatMoney(financialData?.subTotal)}</td>
                    <td className="py-2 text-right text-[#1A2E05]">{financialData?.gstRate}%</td>
                    <td className="py-2 text-right font-mono text-blue-700">
                      ₹{formatMoney(financialData?.roomGstAmount)}
                      <span className="block text-[8.5px] text-[#2E4316] font-bold">
                        (SGST ₹{formatMoney(financialData?.roomGstAmount / 2)} + CGST ₹{formatMoney(financialData?.roomGstAmount / 2)})
                      </span>
                    </td>
                    <td className="py-2 text-right font-mono font-black text-[#1A2E05]">
                      ₹{formatMoney(financialData?.subTotal + financialData?.roomGstAmount)}
                    </td>
                  </tr>

                  {/* Extra Services / Charges if any */}
                  {booking.extraChargesList && booking.extraChargesList.length > 0 && booking.extraChargesList.map((ec, idx) => (
                    <tr key={idx}>
                      <td className="py-2">
                        <p className="font-black text-[#1A2E05]">{ec.serviceName || ec.name || 'Extra Service'}</p>
                        <p className="text-[9.5px] text-[#2E4316] font-bold">{ec.description || 'Extra amenities/services'}</p>
                      </td>
                      <td className="py-2 text-right font-mono text-[#1A2E05]">₹{formatMoney(ec.subtotal || ec.baseAmount || ec.amount)}</td>
                      <td className="py-2 text-right text-[#1A2E05]">{ec.gstRate || 0}%</td>
                      <td className="py-2 text-right font-mono text-blue-700">₹{formatMoney(ec.gstAmount || 0)}</td>
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
                  <span>Total GST: <strong className="text-[#1A2E05]">₹{formatMoney(financialData?.totalGstAmount)}</strong></span>
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
    </div>
  );
};

export default GuestBillingDetails;
