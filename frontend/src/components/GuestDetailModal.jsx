import React, { useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X, User, Phone, Mail, Calendar, CreditCard, Clock, Globe, MapPin,
  Loader2, LogOut, LogIn, Receipt, Edit, Users, FileText, CheckCircle,
  AlertCircle, Building, Hash, UserCheck, Eye, Download, Wallet, Check
} from 'lucide-react';
import { cleanRoomNumber } from '../utils/roomHelper';
import { useNavigate } from 'react-router-dom';
import api, { getUploadUrl } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { downloadDocumentFile } from '../utils/fileDownloader';
import CancelBookingModal from './CancelBookingModal';

// ============================================================
// 1. UTILITY FUNCTIONS
// ============================================================

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

const formatDateDMY = (dateStr) => {
  if (!dateStr) return '';
  const plain = dateStr.split('T')[0];
  if (/^\d{2}-\d{2}-\d{4}$/.test(plain)) {
    return plain;
  }
  const [y, m, d] = plain.split('-');
  if (!y || !m || !d) return dateStr;
  if (y.length === 4) {
    return `${d}-${m}-${y}`;
  }
  return dateStr;
};

const formatDateFromISO = (dateStr) => {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  } catch (e) {
    return dateStr;
  }
};

const formatBookingDateTime = (createdAt) => {
  if (!createdAt) return 'N/A';
  const isoStr = typeof createdAt === 'string' ? createdAt : new Date(createdAt).toISOString();
  const parts = isoStr.split('T');
  if (parts.length < 2) return new Date(createdAt).toLocaleString();

  const datePart = parts[0];
  const timePart = parts[1].substring(0, 5);
  const [yyyy, mm, dd] = datePart.split('-');

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthIndex = parseInt(mm, 10) - 1;
  const formattedDate = `${dd} ${months[monthIndex]} ${yyyy}`;

  const [hourStr, minStr] = timePart.split(':');
  let hour = parseInt(hourStr, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12;
  hour = hour ? hour : 12;
  const formattedTime = `${String(hour).padStart(2, '0')}:${minStr} ${ampm}`;

  return `${formattedDate} • ${formattedTime}`;
};

const safeParseJSON = (value, fallback) => {
  if (!value) return fallback;
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch (e) {
    console.error('Failed to parse JSON field', e);
    return fallback;
  }
};



// ============================================================
// 2. PRESENTATIONAL COMPONENTS
// ============================================================

const Field = ({ label, children, icon: Icon, className = '' }) => (
  <div className={`space-y-0.5 ${className}`}>
    <span className="text-[10px] sm:text-xs font-semibold text-[#7A8A6A] tracking-wider block">
      {label}
    </span>
    <span className="text-xs sm:text-sm font-semibold text-[#1A2E05] flex items-center gap-1.5">
      {Icon && <Icon size={12} className="text-[#84A63C] flex-shrink-0 sm:w-3.5 sm:h-3.5" />}
      {children}
    </span>
  </div>
);

const StatusBadge = ({ status, totalRoomRate, amountPaid }) => {
  const isPaid = Math.max(0, totalRoomRate - amountPaid) <= 0.1;

  if (isPaid || status === 'Paid') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] sm:text-xs font-semibold tracking-wider rounded-lg border border-emerald-200 shadow-sm">
        <CheckCircle size={10} className="text-emerald-600 sm:w-[11px] sm:h-[11px]" /> Paid
      </span>
    );
  }
  if (status === 'Partial') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] sm:text-xs font-semibold tracking-wider rounded-lg border border-amber-200 shadow-sm">
        <AlertCircle size={10} className="text-amber-600 sm:w-[11px] sm:h-[11px]" /> Partial
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-100 text-rose-800 text-[10px] sm:text-xs font-semibold tracking-wider rounded-lg border border-rose-200 shadow-sm">
      <AlertCircle size={10} className="text-rose-600 sm:w-[11px] sm:h-[11px]" /> Pending
    </span>
  );
};

const DocumentThumb = ({ src, label, onPreview, size = 'h-14 sm:h-16' }) => {
  if (!src) return null;
  const resolvedSrc = getUploadUrl(src);
  const isPdf = src.startsWith('data:application/pdf') || src.toLowerCase().includes('.pdf');

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[9px] sm:text-[10px] font-semibold text-amber-800 tracking-wider block">{label}</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            downloadDocumentFile(src, label.replace(/\s+/g, '_').toLowerCase());
          }}
          className="text-amber-700 hover:text-amber-900 p-0.5 rounded hover:bg-amber-100/80 transition-colors"
          title={`Download ${label}`}
        >
          <Download size={11} />
        </button>
      </div>
      <div
        className={`${size} rounded-xl overflow-hidden border border-amber-200/80 bg-white hover:border-amber-400 transition-all cursor-pointer group relative shadow-sm`}
        onClick={() => onPreview(resolvedSrc)}
      >
        {isPdf ? (
          <div className="w-full h-full bg-red-50 text-red-700 flex flex-col items-center justify-center border border-red-100/50 rounded-xl relative p-1">
            <FileText size={18} className="text-red-500" />
            <span className="text-[8px] font-bold mt-1 uppercase text-center block leading-none">PDF ID</span>
          </div>
        ) : (
          <img
            src={resolvedSrc}
            alt={label}
            className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
          />
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center rounded-xl">
          <Eye size={14} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-md animate-in fade-in zoom-in" />
        </div>
      </div>
    </div>
  );
};

// ============================================================
// 3. GUEST DOCUMENTS SECTION
// ============================================================

const PrimaryGuestDocuments = ({ booking, onPreview }) => {
  const isForeign = booking.nationality === 'Foreign';

  return (
    <div className="mt-3 pt-3 border-t border-amber-200/60">
      <h5 className="text-[11px] sm:text-xs font-semibold text-amber-800 tracking-wider mb-2 flex items-center gap-1.5">
        <FileText size={12} className="text-amber-600" /> Primary Guest Documents
      </h5>
      <div className="bg-amber-50/20 rounded-xl p-3 space-y-2.5 border border-amber-100/80 shadow-sm">
        <div className="grid grid-cols-2 gap-2.5 text-xs sm:text-sm">
          <div>
            <span className="text-[9px] sm:text-[10px] font-semibold text-amber-700 tracking-wider block">ID Type</span>
            <p className="font-semibold text-[#1A2E05]">{booking.idType || 'Aadhar'}</p>
          </div>
          <div>
            <span className="text-[9px] sm:text-[10px] font-semibold text-amber-700 tracking-wider block">ID Number</span>
            <p className="font-semibold text-[#1A2E05]">{booking.idProof || 'N/A'}</p>
          </div>
          {booking.purposeOfVisit && (
            <div className="col-span-2">
              <span className="text-[9px] sm:text-[10px] font-semibold text-amber-700 tracking-wider block">Purpose of Visit</span>
              <p className="font-semibold text-[#1A2E05]">{booking.purposeOfVisit}</p>
            </div>
          )}
        </div>

        {isForeign && (
          <div className="grid grid-cols-2 gap-3 text-xs sm:text-sm border-t border-amber-200/50 pt-2">
            <div>
              <span className="text-[9px] sm:text-[10px] font-semibold text-amber-700 tracking-wider block">Passport Expiry</span>
              <p className="font-medium text-[#1A2E05]">{formatDateDMY(booking.passportExpiry) || 'N/A'}</p>
            </div>
            <div>
              <span className="text-[9px] sm:text-[10px] font-semibold text-amber-700 tracking-wider block">Country</span>
              <p className="font-medium text-[#1A2E05]">{booking.country || 'N/A'}</p>
            </div>
            <div>
              <span className="text-[9px] sm:text-[10px] font-semibold text-amber-700 tracking-wider block">Visa Number</span>
              <p className="font-medium text-[#1A2E05]">{booking.visaNumber || 'N/A'}</p>
            </div>
            <div>
              <span className="text-[9px] sm:text-[10px] font-semibold text-amber-700 tracking-wider block">Visa Type</span>
              <p className="font-medium text-[#1A2E05]">{booking.visaType || 'N/A'}</p>
            </div>
            <div>
              <span className="text-[9px] sm:text-[10px] font-semibold text-amber-700 tracking-wider block">Visa Expiry</span>
              <p className="font-medium text-[#1A2E05]">{formatDateDMY(booking.visaExpiry) || 'N/A'}</p>
            </div>
            <div>
              <span className="text-[9px] sm:text-[10px] font-semibold text-amber-700 tracking-wider block">Arrival From</span>
              <p className="font-medium text-[#1A2E05]">{booking.arrivalFrom || 'N/A'}</p>
            </div>
            <div>
              <span className="text-[9px] sm:text-[10px] font-semibold text-amber-700 tracking-wider block">Next Destination</span>
              <p className="font-medium text-[#1A2E05]">{booking.nextDestination || 'N/A'}</p>
            </div>
            <div>
              <span className="text-[9px] sm:text-[10px] font-semibold text-amber-700 tracking-wider block">Purpose of Visit</span>
              <p className="font-medium text-[#1A2E05]">{booking.purposeOfVisit || 'N/A'}</p>
            </div>
          </div>
        )}

        {(booking.guestPhoto || booking.aadhaarFront || booking.aadhaarBack) && (
          <div className="grid grid-cols-3 gap-3 pt-2.5 border-t border-amber-200/50">
            <DocumentThumb src={booking.guestPhoto} label="Guest Photo" onPreview={onPreview} />
            <DocumentThumb
              src={booking.aadhaarFront}
              label={isForeign ? 'Passport Front' : `${(booking.idType || 'ID').toUpperCase()} Front`}
              onPreview={onPreview}
            />
            <DocumentThumb
              src={booking.aadhaarBack}
              label={isForeign ? 'Visa Page' : `${(booking.idType || 'ID').toUpperCase()} Back`}
              onPreview={onPreview}
            />
          </div>
        )}

        {booking.signature && (
          <div className="pt-2.5 border-t border-amber-200/50">
            <span className="text-[10px] font-semibold text-amber-700 tracking-wider block mb-1">Guest Signature</span>
            <div
              className="w-32 h-12 rounded-xl overflow-hidden border border-amber-200 bg-white hover:border-amber-400 transition-colors cursor-pointer p-1"
              onClick={() => onPreview(booking.signature)}
            >
              <img
                src={booking.signature}
                alt="Signature"
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// 4. EXTRA GUESTS SECTION
// ============================================================

const ExtraGuestCard = ({ guest, onPreview, showPerGuestRoom }) => (
  <div className="bg-white rounded-xl p-3 space-y-2.5 border border-teal-100 shadow-sm">
    <div className="flex items-center gap-3 mb-2">
      <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-teal-50 border border-teal-200 text-teal-800 text-xs sm:text-sm font-bold flex items-center justify-center flex-shrink-0">
        {guest.name ? guest.name[0].toUpperCase() : 'G'}
      </div>
      <div className="flex-1 min-w-0">
        <span className="font-bold text-sm sm:text-base text-[#1A2E05] capitalize flex items-center gap-1.5 flex-wrap">
          {guest.name || 'N/A'}
          {guest.isChild && (
            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200 rounded-md inline-block">
              Child
            </span>
          )}
          {showPerGuestRoom && (guest.assignedRoomNumber || guest.assignedRoomId) && (
            <span className="px-2 py-0.5 text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-md inline-block">
              Room {guest.assignedRoomNumber || guest.assignedRoomId}
            </span>
          )}
        </span>
        {guest.phone && (
          <span className="flex items-center gap-1 text-[10px] sm:text-xs font-medium text-[#7A8A6A] mt-0.5">
            <Phone size={10} className="text-teal-500" />
            {guest.phone}
          </span>
        )}
      </div>
    </div>

    {/* Structured Age / Gender / Father Info block */}
    <div className="grid grid-cols-3 gap-2.5 bg-teal-50/20 p-2 rounded-xl border border-teal-100/50 text-xs sm:text-sm">
      {guest.fatherName ? (
        <div className="col-span-3 pb-1 border-b border-teal-100/40">
          <span className="text-[9px] sm:text-[10px] font-semibold text-teal-700 tracking-wider block">Father / Guardian Name</span>
          <p className="font-semibold text-[#1A2E05]">{guest.fatherName}</p>
        </div>
      ) : null}
      <div>
        <span className="text-[9px] sm:text-[10px] font-semibold text-teal-700 tracking-wider block">Age</span>
        <p className="font-medium text-[#1A2E05]">{guest.age ? `${guest.age} yrs` : 'N/A'}</p>
      </div>
      <div>
        <span className="text-[9px] sm:text-[10px] font-semibold text-teal-700 tracking-wider block">Gender</span>
        <p className="font-medium text-[#1A2E05]">{guest.gender || 'N/A'}</p>
      </div>
    </div>

    {/* ID Type / Number Card */}
    {(guest.idType || guest.idNumber) && (
      <div className="grid grid-cols-2 gap-2.5 bg-teal-50/20 p-2 rounded-xl border border-teal-100/50 text-xs sm:text-sm">
        <div>
          <span className="text-[9px] sm:text-[10px] font-semibold text-teal-700 tracking-wider block">ID Type</span>
          <p className="font-medium text-[#1A2E05]">{guest.idType || 'N/A'}</p>
        </div>
        <div>
          <span className="text-[9px] sm:text-[10px] font-semibold text-teal-700 tracking-wider block">ID Number</span>
          <p className="font-medium text-[#1A2E05]">{guest.idNumber || 'N/A'}</p>
        </div>
      </div>
    )}

    {guest.idType === 'Passport' && (
      <div className="grid grid-cols-2 gap-2.5 bg-teal-50/20 p-2 rounded-xl border border-teal-100/50 text-xs sm:text-sm">
        <div>
          <span className="text-[9px] sm:text-[10px] font-semibold text-teal-700 tracking-wider block">Passport Expiry</span>
          <p className="font-medium text-[#1A2E05]">{formatDateDMY(guest.passportExpiry) || 'N/A'}</p>
        </div>
        <div>
          <span className="text-[9px] sm:text-[10px] font-semibold text-teal-700 tracking-wider block">Visa Number</span>
          <p className="font-medium text-[#1A2E05]">{guest.visaNumber || 'N/A'}</p>
        </div>
        <div>
          <span className="text-[9px] sm:text-[10px] font-semibold text-teal-700 tracking-wider block">Visa Expiry</span>
          <p className="font-medium text-[#1A2E05]">{formatDateDMY(guest.visaExpiry) || 'N/A'}</p>
        </div>
        <div>
          <span className="text-[9px] sm:text-[10px] font-semibold text-teal-700 tracking-wider block">Country</span>
          <p className="font-medium text-[#1A2E05]">{guest.country || 'N/A'}</p>
        </div>
      </div>
    )}

    {(guest.idFront || guest.idBack) && (
      <div className="grid grid-cols-2 gap-3 pt-2.5 border-t border-teal-100/50">
        <DocumentThumb
          src={guest.idFront}
          label={guest.idType === 'Passport' ? 'Passport Front' : 'ID Front'}
          onPreview={onPreview}
        />
        <DocumentThumb
          src={guest.idBack}
          label={guest.idType === 'Passport' ? 'Visa Page' : 'ID Back'}
          onPreview={onPreview}
        />
      </div>
    )}
  </div>
);

const ExtraGuestsList = ({ extraGuests, onPreview }) => {
  if (!extraGuests || extraGuests.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-teal-200/60">
      <h5 className="text-xs font-semibold text-teal-800 tracking-wider mb-2 flex items-center gap-1.5">
        <Users size={12} className="text-teal-600" /> Additional Registered Guests ({extraGuests.length})
      </h5>
      <div className="space-y-2">
        {extraGuests.map((guest, idx) => (
          <ExtraGuestCard key={idx} guest={guest} onPreview={onPreview} />
        ))}
      </div>
    </div>
  );
};

// ============================================================
// 5. PAYMENT LEDGER
// ============================================================

const buildPaymentLogs = (roomsList) => {
  const allLogs = [];
  const isGroup = roomsList.length > 1;

  if (isGroup) {
    // Group bookings share identical paymentHistory strings.
    // We only parse from the first booking to prevent duplicates, and aggregate room names.
    const firstRoom = roomsList[0];
    let logs = safeParseJSON(firstRoom.paymentHistory, []);

    const roomNumbers = roomsList
      .map(r => r.Room?.roomNumber || r.previousRoomNumber)
      .map(cleanRoomNumber)
      .filter(Boolean);
    const roomLabel = roomNumbers.length > 0 ? ` (Rooms ${roomNumbers.join(', ')})` : '';

    logs.forEach((log) => {
      allLogs.push({
        ...log,
        roomLabel,
        paymentMode: log.paymentMode || firstRoom.paymentMode || 'Cash',
        paymentBank: log.paymentBank || firstRoom.paymentBank || null,
      });
    });
  } else {
    roomsList.forEach((r) => {
      let logs = safeParseJSON(r.paymentHistory, []);

      if (logs.length === 0 && parseFloat(r.amountPaid || 0) > 0) {
        const rDate = r.checkInDate ? formatDateDMY(r.checkInDate) : 'N/A';
        const rTime = r.checkInTime
          ? formatTime12hr(r.checkInTime)
          : (r.createdAt ? new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : '');
        logs = [{
          amount: parseFloat(r.amountPaid),
          date: rDate,
          time: rTime,
          paymentMode: r.paymentMode || 'Cash',
          paymentBank: r.paymentBank || null,
        }];
      }

      logs.forEach((log) => {
        const roomNumber = r.Room?.roomNumber || r.previousRoomNumber;
        const roomLabel = roomNumber ? ` (Room ${cleanRoomNumber(roomNumber)})` : '';
        allLogs.push({
          ...log,
          roomLabel,
          paymentMode: log.paymentMode || r.paymentMode || 'Cash',
          paymentBank: log.paymentBank || r.paymentBank || null,
        });
      });
    });
  }

  return allLogs;
};

const PaymentLedgerLog = ({ roomsList }) => {
  const allLogs = useMemo(() => buildPaymentLogs(roomsList), [roomsList]);

  if (allLogs.length === 0) {
    return (
      <div className="text-center text-xs font-semibold text-[#7A8A6A] py-6 bg-purple-50/20 rounded-2xl border border-purple-100">
        No payment records found
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {allLogs.map((log, index) => (
        <div
          key={index}
          className="flex items-center justify-between bg-white p-3.5 rounded-2xl border border-purple-100 hover:border-purple-300 transition-all shadow-sm"
        >
          <div className="flex items-start gap-3 flex-1">
            <div className="w-2 h-2 rounded-full bg-purple-500 mt-1.5 flex-shrink-0" />
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-[#1A2E05]">
                Payment on {log.date} {log.time && `at ${log.time}`}
                <span className="text-[#7A8A6A] font-medium">{log.roomLabel}</span>
              </p>
              <div className="flex items-center gap-2 text-[10px] font-medium text-purple-700">
                <span>Mode: <span className="text-[#1A2E05]">{log.paymentMode}</span></span>
                {log.paymentMode === 'Online' && log.paymentBank && (
                  <>
                    <span className="text-purple-200">|</span>
                    <span>Bank: <span className="text-[#1A2E05]">{log.paymentBank}</span></span>
                  </>
                )}
              </div>
            </div>
          </div>
          <span className="text-xs font-semibold text-purple-700 whitespace-nowrap">
            ₹{formatMoney(log.amount)}
          </span>
        </div>
      ))}
    </div>
  );
};

// ============================================================
// 6. IMAGE LIGHTBOX
// ============================================================

const ImageLightbox = ({ src, onClose }) => {
  if (!src) return null;
  const isPdf = src.startsWith('data:application/pdf') || src.toLowerCase().includes('.pdf');

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div className="absolute top-4 right-4 flex items-center gap-2 z-50">
        <button
          type="button"
          className="p-2.5 bg-white/20 hover:bg-white/30 text-white rounded-full transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5 px-3.5 text-xs font-bold shadow-lg"
          onClick={(e) => {
            e.stopPropagation();
            downloadDocumentFile(src, 'document_preview');
          }}
          title="Download Document"
        >
          <Download size={15} />
          <span>Download</span>
        </button>
        <button
          type="button"
          className="p-2.5 bg-white/20 hover:bg-white/30 text-white rounded-full transition-all hover:scale-105 active:scale-95"
          onClick={onClose}
          title="Close Preview"
        >
          <X size={20} />
        </button>
      </div>

      <div className="relative max-w-5xl max-h-[85vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        {isPdf ? (
          <div className="flex flex-col items-center gap-4 w-[85vw] max-w-4xl">
            <iframe
              src={src}
              title="PDF Document Preview"
              className="w-full h-[70vh] rounded-2xl border border-white/10 bg-white"
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => downloadDocumentFile(src, 'document_preview')}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition-colors flex items-center gap-1.5"
              >
                <Download size={14} /> Download PDF
              </button>
              <button
                type="button"
                onClick={() => window.open(src, '_blank')}
                className="px-5 py-2.5 bg-[#84A63C] hover:bg-[#729231] text-white text-xs font-bold rounded-xl shadow-md transition-colors"
              >
                Open PDF in New Tab
              </button>
            </div>
          </div>
        ) : (
          <img
            src={src}
            alt="Document preview"
            className="max-w-full max-h-[85vh] rounded-3xl shadow-2xl object-contain border border-white/10"
          />
        )}
      </div>
    </div>,
    document.body
  );
};

// ============================================================
// 7. MAIN COMPONENT
// ============================================================

const GuestDetailModal = ({
  isOpen,
  onClose,
  booking,
  room,
  loading,
  onCheckOut,
  onCheckIn,
  onEdit,
  onDeleteSuccess
}) => {
  const { activeHotel } = useAuth();
  const [previewImage, setPreviewImage] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isCheckoutDropdownOpen, setIsCheckoutDropdownOpen] = useState(false);
  const navigate = useNavigate();

  const [editingRoomId, setEditingRoomId] = useState(null);
  const [roomEditForm, setRoomEditForm] = useState({
    checkInDate: '',
    checkInTime: '',
    checkOutDate: '',
    checkOutTime: ''
  });
  const [isSavingRoomEdit, setIsSavingRoomEdit] = useState(false);

  const handleStartEditRoomDate = (gb) => {
    setEditingRoomId(gb.id);
    const inDateOnly = gb.checkInDate ? gb.checkInDate.split('T')[0] : '';
    const outDateOnly = gb.checkOutDate ? gb.checkOutDate.split('T')[0] : '';
    setRoomEditForm({
      checkInDate: inDateOnly,
      checkInTime: gb.checkInTime || '12:00',
      checkOutDate: outDateOnly,
      checkOutTime: gb.checkOutTime || '11:00'
    });
  };

  const handleSaveRoomEdit = async (gbId) => {
    try {
      setIsSavingRoomEdit(true);
      await api.put(`/bookings/${gbId}`, {
        checkInDate: roomEditForm.checkInDate,
        checkInTime: roomEditForm.checkInTime,
        checkOutDate: roomEditForm.checkOutDate,
        checkOutTime: roomEditForm.checkOutTime,
        isSingleRoomDateUpdate: true
      });
      setEditingRoomId(null);
      if (onDeleteSuccess) {
        await onDeleteSuccess();
      }
    } catch (error) {
      console.error('Error saving room dates:', error);
      alert(error.response?.data?.message || 'Failed to update room check-in/out dates and time');
    } finally {
      setIsSavingRoomEdit(false);
    }
  };

  const handleCancelCheckin = () => {
    if (!booking) return;
    setIsCancelModalOpen(true);
  };

  const handleExecuteCancel = async (cancellationData) => {
    try {
      setIsDeleting(true);
      await api.delete(`/bookings/${booking.id}`, { data: cancellationData });
      setIsCancelModalOpen(false);
      if (onDeleteSuccess) {
        onDeleteSuccess();
      } else {
        onClose();
      }
    } catch (error) {
      console.error('Error cancelling booking:', error);
      alert(error.response?.data?.message || 'Failed to cancel check-in');
    } finally {
      setIsDeleting(false);
    }
  };

  const isTodayCheckin = useMemo(() => {
    if (!booking?.checkInDate) return false;
    const checkInDateOnly = booking.checkInDate.split('T')[0];

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    return checkInDateOnly === todayStr;
  }, [booking]);

  const roomsList = useMemo(() => {
    if (booking?.groupBookings?.length > 0) return booking.groupBookings;
    return booking ? [booking] : [];
  }, [booking]);

  const activeGroupRooms = useMemo(() => {
    if (!booking?.groupBookings || booking.groupBookings.length === 0) {
      return (booking && booking.status === 'Active') ? [booking] : [];
    }
    return booking.groupBookings.filter(gb => gb.status === 'Active');
  }, [booking]);

  const roomNumbersString = useMemo(() => {
    if (!roomsList || !roomsList.length) return room?.roomNumber || 'N/A';

    const nums = roomsList
      .map(r => r.Room?.roomNumber || r.roomNumber)
      .filter(Boolean);

    if (nums.length === 0) return room?.roomNumber || 'N/A';
    const uniqueNums = [...new Set(nums)];
    return uniqueNums.join(', ');
  }, [roomsList, room]);

  const { totalRoomRate: rawTotalRoomRate, amountPaid, totalDiscount } = useMemo(() => {
    if (!booking) return { totalRoomRate: 0, amountPaid: 0, totalDiscount: 0 };
    if (booking.groupBookings?.length > 0) {
      return {
        totalRoomRate: booking.groupBookings.reduce((sum, b) => sum + Number(b.totalAmount || 0), 0),
        amountPaid: booking.groupBookings.reduce((sum, b) => sum + Number(b.amountPaid || 0), 0),
        totalDiscount: booking.groupBookings.reduce((sum, b) => sum + Number(b.discount || 0), 0)
      };
    }
    return {
      totalRoomRate: Number(booking.totalAmount || 0),
      amountPaid: Number(booking.amountPaid || 0),
      totalDiscount: Number(booking.discount || 0)
    };
  }, [booking]);

  const extraGuests = useMemo(() => safeParseJSON(booking?.extraGuests, []), [booking]);

  const { adultsCount, childrenCount } = useMemo(() => {
    if (!booking) return { adultsCount: 1, childrenCount: 0 };
    let children = 0;
    if (booking.isChild) children += 1;
    if (Array.isArray(extraGuests)) {
      extraGuests.forEach(g => {
        if (g.isChild) children += 1;
      });
    }
    const total = booking.numberOfGuests || 1;
    const adults = Math.max(1, total - children);
    return { adultsCount: adults, childrenCount: children };
  }, [booking, extraGuests]);

  const primaryRoomNumber = useMemo(() => {
    if (!booking) return '';
    if (booking.assignedRoomNumber) return booking.assignedRoomNumber;
    if (booking.assignedRoomId && booking.groupBookings) {
      const gb = booking.groupBookings.find(b => Number(b.roomId) === Number(booking.assignedRoomId));
      if (gb) return cleanRoomNumber(gb.Room?.roomNumber || gb.roomNumber);
    }
    return cleanRoomNumber(booking.Room?.roomNumber || booking.roomNumber);
  }, [booking]);

  const roomShiftDetails = useMemo(() => {
    if (!booking || !booking.previousRoomNumber) return null;
    const checkInStr = booking.checkInDate ? booking.checkInDate.split('T')[0] : '';
    const checkOutStr = booking.checkOutDate ? booking.checkOutDate.split('T')[0] : '';
    if (!checkInStr || !checkOutStr) return null;

    const cIn = new Date(checkInStr);
    const cOut = new Date(checkOutStr);
    const totalStayDays = Math.max(1, Math.ceil(Math.abs(cOut - cIn) / (1000 * 60 * 60 * 24)));

    let shiftDateStr = booking.shiftDate || (booking.updatedAt ? booking.updatedAt.split('T')[0] : '');
    const todayStr = new Date().toISOString().split('T')[0];

    if (!shiftDateStr || shiftDateStr < checkInStr || shiftDateStr > checkOutStr) {
      if (todayStr > checkInStr && todayStr <= checkOutStr) {
        shiftDateStr = todayStr;
      } else {
        const midDays = Math.max(1, Math.floor(totalStayDays / 2));
        const midDate = new Date(cIn.getTime() + midDays * 86400000);
        shiftDateStr = midDate.toISOString().split('T')[0];
      }
    }

    let prevDays = 0;
    if (shiftDateStr > checkInStr) {
      prevDays = Math.min(totalStayDays - 1, Math.ceil(Math.abs(new Date(shiftDateStr) - cIn) / (1000 * 60 * 60 * 24)));
    }
    const curDays = Math.max(1, totalStayDays - prevDays);

    const prevRatesList = String(booking.previousRoomRate || '').split(/→|->|,|>/).map(s => Number(s.trim())).filter(n => !isNaN(n));
    const defaultPrevRate = prevRatesList.length > 0
      ? prevRatesList[0]
      : (booking.Room?.pricePerNight ? Number(booking.Room.pricePerNight) : 0);
    const rawPrevStr = String(booking.previousRoomNumber);
    const prevRooms = rawPrevStr.split(/→|->|,|>/).map(s => cleanRoomNumber(s.trim())).filter(Boolean);

    const curRoomNum = primaryRoomNumber || cleanRoomNumber(booking.Room?.roomNumber);
    const allRoomsInOrder = [...prevRooms];
    if (curRoomNum && allRoomsInOrder[allRoomsInOrder.length - 1] !== curRoomNum) {
      allRoomsInOrder.push(curRoomNum);
    }

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

    let roomTotalSum = Math.max(0, parseFloat(booking.totalAmount || 0) - parseFloat(booking.discount || 0));

    const actualShiftTime = booking.shiftTime
      || (booking.updatedAt ? new Date(booking.updatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '12:00 PM');

    const items = [];
    const rawShiftTimesStr = booking.shiftTime || booking.roomShiftTimes || '';
    const shiftTimesList = String(rawShiftTimesStr).split(/→|->|,|>/).map(s => s.trim()).filter(Boolean);

    allRoomsInOrder.forEach((rmNum, idx) => {
      const isCurrent = idx === allRoomsInOrder.length - 1;
      let days = 0;
      let startStr = '', endStr = '';

      if (idx === 0) {
        days = prevDays;
        startStr = formatShortWithTime(booking.checkInDate, booking.checkInTime, '12:00 PM');
        const firstShiftT = shiftTimesList[0] || (allRoomsInOrder.length === 2 ? actualShiftTime : '');
        endStr = firstShiftT ? formatShortWithTime(shiftDateStr, firstShiftT, '02:00 PM') : '';
      } else if (!isCurrent) {
        days = 0; // Same-day shift
        const prevStepTime = shiftTimesList[idx - 1] || '';
        const thisStepTime = shiftTimesList[idx] || '';
        if (thisStepTime && thisStepTime !== prevStepTime) {
          startStr = formatShortWithTime(shiftDateStr, thisStepTime, '02:00 PM');
        } else if (prevStepTime && idx === 1) {
          startStr = formatShortWithTime(shiftDateStr, prevStepTime, '02:00 PM');
        } else {
          startStr = ''; // Do not repeat fallback timestamp
        }
        endStr = startStr;
      } else {
        days = curDays;
        const lastShiftTime = shiftTimesList[shiftTimesList.length - 1] || actualShiftTime;
        startStr = formatShortWithTime(shiftDateStr, lastShiftTime, '02:00 PM');
        endStr = formatShortWithTime(booking.checkOutDate, booking.checkOutTime, '11:00 AM');
      }

      const isSameDayShift = (days === 0) || (startStr === endStr);
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

      items.push({
        roomNumber: rmNum,
        days,
        rate,
        total,
        isCurrent,
        isSameDayShift,
        startStr,
        endStr,
        dateRangeStr: isSameDayShift ? startStr : `${startStr} → ${endStr}`
      });
    });

    const prevTotalSum = items.filter(it => !it.isCurrent).reduce((sum, it) => sum + it.total, 0);
    const curIdx = items.findIndex(it => it.isCurrent);
    if (curIdx !== -1) {
      const curDaysCount = items[curIdx].days;
      const calcRem = roomTotalSum - prevTotalSum;
      let curRate = (curDaysCount > 0 && calcRem > 0)
        ? (calcRem / curDaysCount)
        : (Number(booking.Room?.pricePerNight || 0) || defaultPrevRate);
      let curTotal = curDaysCount * curRate;

      if (curTotal === 0 && roomTotalSum > prevTotalSum) {
        curTotal = roomTotalSum - prevTotalSum;
        curRate = curDaysCount > 0 ? (curTotal / curDaysCount) : curRate;
      }

      items[curIdx].total = curTotal;
      items[curIdx].rate = curRate;
    }

    const totalRoomSum = items.reduce((sum, item) => sum + item.total, 0);

    return {
      items,
      totalRoomSum
    };
  }, [booking, primaryRoomNumber]);

  const scaledRoomShiftItems = useMemo(() => {
    if (!booking) return [];
    const groupList = (booking.groupBookings && booking.groupBookings.length > 0) ? booking.groupBookings : [booking];

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

    const allScheduleItems = [];

    groupList.forEach((b) => {
      const curRmNum = cleanRoomNumber(b.Room?.roomNumber || b.roomNumber);
      const checkInStr = b.checkInDate ? b.checkInDate.split('T')[0] : '';
      const checkOutStr = b.checkOutDate ? b.checkOutDate.split('T')[0] : '';

      let stayDays = 1;
      if (checkInStr && checkOutStr) {
        stayDays = Math.max(1, Math.ceil(Math.abs(new Date(checkOutStr) - new Date(checkInStr)) / (1000 * 60 * 60 * 24)));
      }

      if (b.previousRoomNumber) {
        let shiftDateStr = b.shiftDate || (b.updatedAt ? b.updatedAt.split('T')[0] : '');
        const todayStr = new Date().toISOString().split('T')[0];
        if (!shiftDateStr || shiftDateStr < checkInStr || shiftDateStr > checkOutStr) {
          if (todayStr > checkInStr && todayStr <= checkOutStr) shiftDateStr = todayStr;
          else shiftDateStr = checkInStr;
        }

        let prevDays = 0;
        if (shiftDateStr > checkInStr) {
          prevDays = Math.min(stayDays - 1, Math.ceil(Math.abs(new Date(shiftDateStr) - new Date(checkInStr)) / (1000 * 60 * 60 * 24)));
        }
        const curDays = Math.max(1, stayDays - prevDays);

        const prevRatesList = String(b.previousRoomRate || '').split(/→|->|,|>/).map(s => Number(s.trim())).filter(n => !isNaN(n));
        const defaultPrevRate = prevRatesList.length > 0 ? prevRatesList[0] : (b.Room?.pricePerNight ? Number(b.Room.pricePerNight) : 0);
        const prevRooms = String(b.previousRoomNumber).split(/\s*(?:→|->|─>|&rarr;|[,\->→])\s*/).map(s => cleanRoomNumber(s.trim())).filter(Boolean);

        const allRoomsInOrder = [...prevRooms];
        if (curRmNum && allRoomsInOrder[allRoomsInOrder.length - 1] !== curRmNum) {
          allRoomsInOrder.push(curRmNum);
        }

        const rawShiftTimesStr = b.shiftTime || b.roomShiftTimes || '';
        const shiftTimesList = String(rawShiftTimesStr).split(/→|->|,|>/).map(s => s.trim()).filter(Boolean);
        const actualShiftTime = b.shiftTime || (b.updatedAt ? new Date(b.updatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '12:00 PM');

        const roomItems = [];
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

          roomItems.push({
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

        const prevTotalSum = roomItems.filter(it => !it.isCurrent).reduce((sum, it) => sum + it.total, 0);
        const curIdx = roomItems.findIndex(it => it.isCurrent);
        if (curIdx !== -1) {
          const curDaysCount = roomItems[curIdx].days;
          const roomNetTotal = Math.max(0, Number(b.totalAmount || 0) - Number(b.discount || 0));
          const calcRem = roomNetTotal - prevTotalSum;
          let curRate = (curDaysCount > 0 && calcRem > 0)
            ? (calcRem / curDaysCount)
            : (Number(b.Room?.pricePerNight || 0) || defaultPrevRate);
          let curTotal = curDaysCount * curRate;
          if (curTotal === 0 && roomNetTotal > prevTotalSum) {
            curTotal = roomNetTotal - prevTotalSum;
            curRate = curDaysCount > 0 ? (curTotal / curDaysCount) : curRate;
          }
          roomItems[curIdx].total = curTotal;
          roomItems[curIdx].rate = curRate;
        }

        allScheduleItems.push(...roomItems);
      } else {
        const inStr = formatShortWithTime(b.checkInDate, b.checkInTime, '12:00 PM');
        const outStr = formatShortWithTime(b.checkOutDate, b.checkOutTime, '11:00 AM');
        const dateRangeStr = `${inStr} → ${outStr}`;
        const roomNetTotal = Number(b.totalAmount || 0);
        const ratePerNight = stayDays > 0 ? (roomNetTotal / stayDays) : (b.Room?.pricePerNight ? Number(b.Room.pricePerNight) : roomNetTotal);

        allScheduleItems.push({
          roomNumber: curRmNum,
          days: stayDays,
          rate: ratePerNight,
          total: roomNetTotal,
          isCurrent: true,
          isSameDayShift: false,
          startStr: inStr,
          endStr: outStr,
          dateRangeStr
        });
      }
    });

    return allScheduleItems;
  }, [booking]);

  const handlePreview = useCallback((src) => {
    setPreviewImage(src);
  }, []);

  const handleClosePreview = useCallback(() => {
    setPreviewImage(null);
  }, []);

  if (!isOpen) return null;

  const calculatedScheduleTotal = (scaledRoomShiftItems && scaledRoomShiftItems.length > 0)
    ? scaledRoomShiftItems.reduce((sum, item) => sum + Number(item.total || 0), 0)
    : 0;

  const totalRoomRate = calculatedScheduleTotal > 0
    ? calculatedScheduleTotal
    : (rawTotalRoomRate > 0 ? rawTotalRoomRate : 0);

  const gstOption = booking?.gstOption || 'none';
  const gstRate = Number(booking?.gstRate || 0);

  let netTaxableBase = Math.max(0, totalRoomRate - totalDiscount);
  if (gstOption === 'inclusive' && amountPaid > netTaxableBase && Math.abs(amountPaid - Math.round(netTaxableBase * (1 + gstRate / 100))) < 1.5) {
    netTaxableBase = amountPaid;
  }

  let baseAmount = netTaxableBase;
  let gstAmount = 0;
  let grandTotal = netTaxableBase;

  if (gstOption === 'inclusive' || gstOption === 'exclusive') {
    grandTotal = netTaxableBase;
    baseAmount = Math.round((grandTotal / (1 + gstRate / 100)) * 100) / 100;
    gstAmount = Math.round((grandTotal - baseAmount) * 100) / 100;
  } else {
    baseAmount = netTaxableBase;
    gstAmount = 0;
    grandTotal = baseAmount;
  }

  let extraServicesTotal = 0;
  if (booking) {
    let food = Number(booking.foodCharges || 0);
    let extras = Number(booking.extraCharges || 0);
    if (booking.groupBookings?.length > 0) {
      const gFood = booking.groupBookings.reduce((sum, b) => sum + Number(b.foodCharges || 0), 0);
      const gExtras = booking.groupBookings.reduce((sum, b) => sum + Number(b.extraCharges || 0), 0);
      food = Math.max(food, gFood);
      extras = Math.max(extras, gExtras);
    }
    extraServicesTotal = food + extras;
  }

  const finalGrandTotal = grandTotal + extraServicesTotal;
  const rawPending = finalGrandTotal - amountPaid;
  const pendingDue = rawPending > 0.1 ? Math.round(rawPending * 100) / 100 : 0;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm overflow-hidden">
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl flex flex-col max-h-[95vh] sm:max-h-[92vh] animate-in fade-in zoom-in-95 duration-200 border border-[#DDE5D0]">

        {/* Header */}
        <div className="py-2 px-3 sm:py-2.5 sm:px-5 border-b border-[#DDE5D0] flex items-center justify-between bg-indigo-50/40 rounded-t-2xl flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center shadow-sm flex-shrink-0">
              <User className="text-indigo-600" size={15} />
            </div>
            <div>
              <h3 className="text-xs sm:text-base font-bold text-[#1A2E05] leading-snug">
                Room {roomNumbersString} • Guest Details
              </h3>
              <p className="text-[9px] sm:text-xs font-medium text-indigo-600 tracking-wider leading-none">
                Active check-in overview
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 sm:p-1.5 hover:bg-indigo-100 hover:text-indigo-900 rounded-xl text-[#7A8A6A] transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-2.5 sm:p-4 space-y-3 sm:space-y-4 no-scrollbar">
          {loading ? (
            <div className="py-12 sm:py-16 flex flex-col items-center justify-center gap-2.5">
              <Loader2 className="animate-spin text-indigo-500" size={28} />
              <p className="text-xs sm:text-sm font-semibold text-[#7A8A6A] tracking-wider">Retrieving guest ledger...</p>
            </div>
          ) : !booking ? (
            <div className="py-10 sm:py-12 text-center">
              <div className="w-14 h-14 bg-gray-50 border border-[#DDE5D0] rounded-2xl flex items-center justify-center mx-auto mb-2.5">
                <User size={24} className="text-[#7A8A6A]" />
              </div>
              <h4 className="text-base sm:text-lg font-bold text-[#1A2E05]">No active booking details found</h4>
              <p className="text-xs sm:text-sm font-medium text-[#7A8A6A] mt-1 max-w-sm mx-auto leading-relaxed">
                The room is currently occupied, but we could not find an associated active checkout guest record.
              </p>
              <button
                onClick={onCheckOut}
                className="mt-3.5 px-3.5 py-1.5 sm:py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs sm:text-sm font-semibold tracking-wider shadow-md active:scale-95 transition-all inline-flex items-center gap-1.5"
              >
                <LogOut size={12} /> Force release room
              </button>
            </div>
          ) : (
            <>
              {/* Two-column layout */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">

                {/* Left column - Guest profile */}
                <div className="space-y-3 sm:space-y-4">
                  <div className="bg-[#F5F7F0]/40 rounded-xl p-2.5 sm:p-4 border border-[#DDE5D0] shadow-sm">
                    <div className="flex items-center gap-3 sm:gap-4 mb-2.5 sm:mb-3.5">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white text-base sm:text-lg font-bold flex items-center justify-center flex-shrink-0 shadow-md">
                        {booking.guestName ? booking.guestName[0].toUpperCase() : 'G'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-base sm:text-lg font-bold text-[#1A2E05] truncate capitalize flex items-center gap-1.5 flex-wrap">
                          {booking.guestName || 'N/A'}
                          {activeHotel?.enablePerGuestRoomAssignment && primaryRoomNumber && (
                            <span className="px-2 py-0.5 text-[9px] font-bold bg-blue-100 text-blue-800 border border-blue-200 rounded-md inline-block">
                              Room {primaryRoomNumber}
                            </span>
                          )}
                          {booking.isChild && (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200 rounded-md inline-block">
                              Child
                            </span>
                          )}
                        </h4>
                        <div className="flex items-center gap-2 text-xs sm:text-sm font-medium text-[#7A8A6A] mt-0.5">
                          <span className="flex items-center gap-1">
                            <Phone size={11} className="text-blue-500" />
                            {booking.phone || 'N/A'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 bg-white p-2 sm:p-2.5 rounded-xl border border-[#DDE5D0] shadow-sm">
                      <Field label="Father / Guardian">
                        {booking.fatherName || 'N/A'}
                      </Field>
                      <Field label="Age">
                        {booking.age ? `${booking.age} yrs` : 'N/A'}
                      </Field>
                      <Field label="Gender">
                        {booking.gender || 'N/A'}
                      </Field>
                      <Field label="Nationality" icon={Globe}>
                        {booking.nationality || 'N/A'}
                      </Field>
                    </div>

                    {booking.email && (
                      <div className="mt-2 sm:mt-2.5 bg-white p-2 sm:p-2.5 rounded-xl border border-[#DDE5D0] shadow-sm">
                        <Field label="Email address" icon={Mail}>
                          <span className="truncate block text-xs sm:text-sm" title={booking.email}>{booking.email}</span>
                        </Field>
                      </div>
                    )}

                    {booking.address && (
                      <div className="mt-2 sm:mt-2.5 bg-white p-2 sm:p-2.5 rounded-xl border border-[#DDE5D0] shadow-sm">
                        <Field label="Physical address" icon={MapPin}>
                          <span className="leading-relaxed block text-xs sm:text-sm">{booking.address}</span>
                        </Field>
                      </div>
                    )}

                    <PrimaryGuestDocuments booking={booking} onPreview={handlePreview} />
                    <ExtraGuestsList extraGuests={extraGuests} onPreview={handlePreview} showPerGuestRoom={activeHotel?.enablePerGuestRoomAssignment === true} />
                  </div>
                </div>

                {/* Right column - Stay details & Payment */}
                <div className="space-y-3 sm:space-y-4">
                  {/* Stay details */}
                  <div className="bg-emerald-50/20 rounded-xl p-2.5 sm:p-4 border border-emerald-100/70 shadow-sm">
                    <h4 className="text-xs sm:text-sm font-bold text-emerald-800 tracking-wider flex items-center gap-2 mb-2 sm:mb-3">
                      <Calendar size={13} className="text-emerald-500" />
                      Stay details
                    </h4>

                    <div className="relative pl-4 sm:pl-5 space-y-3 sm:space-y-4 border-l-2 border-dashed border-emerald-200/80 ml-1.5 sm:ml-2">
                      <div className="relative">
                        <div className="absolute -left-[23px] sm:-left-[27px] top-1 bg-white p-0.5 rounded-full">
                          <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-blue-500 border-2 border-white shadow shadow-blue-500/10" />
                        </div>
                        <Field label="Booking time" icon={Clock}>
                          {booking.bookingDate ? formatDateFromISO(booking.bookingDate) : (booking.createdAt ? formatDateFromISO(booking.createdAt) : 'N/A')} •{' '}
                          {booking.bookingTime
                            ? formatTime12hr(booking.bookingTime)
                            : (booking.createdAt
                              ? new Date(booking.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
                              : '12:00 PM')}
                        </Field>
                      </div>
                      <div className="relative">
                        <div className="absolute -left-[23px] sm:-left-[27px] top-1 bg-white p-0.5 rounded-full">
                          <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-emerald-500 border-2 border-white shadow shadow-emerald-500/10" />
                        </div>
                        <Field label="Check-in" icon={Clock}>
                          {booking.checkInDate ? formatDateFromISO(booking.checkInDate) : 'N/A'} •{' '}
                          {booking.checkInTime
                            ? formatTime12hr(booking.checkInTime)
                            : (booking.createdAt
                              ? new Date(booking.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
                              : '12:00 PM')}
                        </Field>
                      </div>
                      <div className="relative">
                        <div className="absolute -left-[23px] sm:-left-[27px] top-1 bg-white p-0.5 rounded-full">
                          <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-rose-500 border-2 border-white shadow shadow-rose-500/10" />
                        </div>
                        <Field label="Check-out" icon={Clock}>
                          {booking.checkOutDate ? formatDateFromISO(booking.checkOutDate) : 'N/A'} •{' '}
                          {booking.checkOutTime ? formatTime12hr(booking.checkOutTime) : '11:00 AM'}
                        </Field>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 mt-3 pt-2.5 border-t border-emerald-100">
                      <Field label="Booking type">
                        {booking.bookingType || 'Walk-in'}
                      </Field>
                      <Field label="Guests count">
                        {adultsCount} {adultsCount === 1 ? 'Adult' : 'Adults'} • {childrenCount} {childrenCount === 1 ? 'Child' : 'Children'}
                      </Field>
                    </div>

                    {booking?.groupBookings?.length > 1 && (
                      <div className="mt-3 pt-2.5 border-t border-emerald-200 space-y-2">
                        <span className="text-[10px] font-black text-emerald-900 uppercase tracking-wider block">
                          Room Stay Breakdown ({booking.groupBookings.length} Rooms):
                        </span>
                        <div className="space-y-2">
                          {booking.groupBookings.map((gb, idx) => {
                            const rmNum = gb.Room?.roomNumber || gb.roomNumber || `Room ${gb.roomId}`;
                            const isCheckedOut = gb.status === 'Completed';
                            const inDateStr = gb.checkInDate ? formatDateFromISO(gb.checkInDate) : 'N/A';
                            const inTimeStr = gb.checkInTime ? formatTime12hr(gb.checkInTime) : (gb.checkInDate ? '06:55 PM' : '12:00 PM');
                            const outDateStr = gb.checkOutDate ? formatDateFromISO(gb.checkOutDate) : 'N/A';
                            const outTimeStr = gb.checkOutTime ? formatTime12hr(gb.checkOutTime) : '10:30 AM';
                            const isEditingThisRoom = editingRoomId === gb.id;

                            return (
                              <div key={idx} className="bg-white p-2.5 sm:p-3 rounded-xl border border-emerald-200/80 shadow-xs space-y-2">
                                <div className="flex items-center justify-between gap-2 text-xs">
                                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                                    <span className="font-extrabold text-[#1A2E05]">Room {rmNum}</span>
                                    {isCheckedOut ? (
                                      <span className="px-2 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300 rounded-full">
                                        Checked Out ({outDateStr} • {outTimeStr})
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full">
                                        Active Stay ({inDateStr} • {inTimeStr} → {outDateStr} • {outTimeStr})
                                      </span>
                                    )}
                                  </div>
                                  <span className="font-extrabold text-[#1A2E05] text-sm shrink-0">
                                    ₹{Number(gb.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                </div>

                                <div className="flex items-center justify-between pt-0.5 gap-2">
                                  <button
                                    type="button"
                                    onClick={() => isEditingThisRoom ? setEditingRoomId(null) : handleStartEditRoomDate(gb)}
                                    className="px-2.5 py-1 text-[#5C7A1F] hover:bg-[#F0F3E8] bg-[#F5F7F0]/60 border border-[#DDE5D0] rounded-lg transition-all inline-flex items-center gap-1.5 text-[10px] font-bold active:scale-95 shadow-xs"
                                    title="Edit Check-in & Check-out Date/Time for this room"
                                  >
                                    <Edit size={11} />
                                    <span>{isEditingThisRoom ? 'Cancel Edit' : 'Edit Time/Date'}</span>
                                  </button>

                                  {!isCheckedOut && (
                                    <button
                                      type="button"
                                      onClick={() => onCheckOut({ singleRoomId: gb.roomId || gb.Room?.id || gb.id })}
                                      className="px-2.5 py-1 text-amber-800 hover:bg-amber-100 bg-amber-50 border border-amber-300 rounded-lg transition-all inline-flex items-center gap-1.5 text-[10px] font-bold active:scale-95 shadow-xs"
                                      title={`Check out Room ${rmNum} only`}
                                    >
                                      <LogOut size={11} />
                                      <span>Check-out Room {rmNum} Only</span>
                                    </button>
                                  )}
                                </div>

                                {isEditingThisRoom && (() => {
                                  const fullIn = roomEditForm.checkInDate ? `${roomEditForm.checkInDate}T${roomEditForm.checkInTime || '12:00'}` : null;
                                  const fullOut = roomEditForm.checkOutDate ? `${roomEditForm.checkOutDate}T${roomEditForm.checkOutTime || '11:00'}` : null;
                                  const inD = fullIn ? new Date(fullIn) : null;
                                  const outD = fullOut ? new Date(fullOut) : null;
                                  let previewDays = 1;
                                  if (inD && outD && !isNaN(inD.getTime()) && !isNaN(outD.getTime())) {
                                    const diffHours = (outD - inD) / (1000 * 60 * 60);
                                    previewDays = Math.max(1, Math.ceil(diffHours / 24));
                                  }
                                  const nightlyRate = Number(gb.Room?.pricePerNight || (Number(gb.totalAmount || 0) / 1));
                                  const previewTotal = previewDays * nightlyRate;

                                  return (
                                    <div className="p-2.5 bg-emerald-50/70 rounded-xl border border-emerald-200 text-xs space-y-2.5 animate-in fade-in zoom-in-95 duration-150">
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                          <label className="text-[9px] font-black text-emerald-900 tracking-wider uppercase block">Check-in Date & Time</label>
                                          <div className="flex gap-1.5">
                                            <input
                                              type="date"
                                              value={roomEditForm.checkInDate}
                                              onChange={(e) => setRoomEditForm(prev => ({ ...prev, checkInDate: e.target.value }))}
                                              className="w-full px-2 py-1 bg-white border border-emerald-300 rounded-lg text-xs font-bold text-[#1A2E05] focus:outline-none focus:border-emerald-600"
                                            />
                                            <input
                                              type="time"
                                              value={roomEditForm.checkInTime}
                                              onChange={(e) => setRoomEditForm(prev => ({ ...prev, checkInTime: e.target.value }))}
                                              className="w-24 px-1.5 py-1 bg-white border border-emerald-300 rounded-lg text-xs font-bold text-[#1A2E05] focus:outline-none focus:border-emerald-600"
                                            />
                                          </div>
                                        </div>
                                        <div className="space-y-1">
                                          <label className="text-[9px] font-black text-emerald-900 tracking-wider uppercase block">Check-out Date & Time</label>
                                          <div className="flex gap-1.5">
                                            <input
                                              type="date"
                                              value={roomEditForm.checkOutDate}
                                              onChange={(e) => setRoomEditForm(prev => ({ ...prev, checkOutDate: e.target.value }))}
                                              className="w-full px-2 py-1 bg-white border border-emerald-300 rounded-lg text-xs font-bold text-[#1A2E05] focus:outline-none focus:border-emerald-600"
                                            />
                                            <input
                                              type="time"
                                              value={roomEditForm.checkOutTime}
                                              onChange={(e) => setRoomEditForm(prev => ({ ...prev, checkOutTime: e.target.value }))}
                                              className="w-24 px-1.5 py-1 bg-white border border-emerald-300 rounded-lg text-xs font-bold text-[#1A2E05] focus:outline-none focus:border-emerald-600"
                                            />
                                          </div>
                                        </div>
                                      </div>

                                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-emerald-200/60 flex-wrap sm:flex-nowrap">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className="text-[10px] font-extrabold text-emerald-900">New Rate:</span>
                                          <span className="text-emerald-800 text-xs font-black">₹{previewTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                          <span className="text-[9.5px] font-bold text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded-md border border-emerald-300/80 whitespace-nowrap">
                                            {previewDays} {previewDays === 1 ? 'Day' : 'Days'} × ₹{nightlyRate.toLocaleString()}/night
                                          </span>
                                        </div>

                                        <div className="flex justify-end gap-2 shrink-0 ml-auto">
                                          <button
                                            type="button"
                                            onClick={() => setEditingRoomId(null)}
                                            className="px-2.5 py-1 text-[10px] font-bold text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100"
                                          >
                                            Cancel
                                          </button>
                                          <button
                                            type="button"
                                            disabled={isSavingRoomEdit}
                                            onClick={() => handleSaveRoomEdit(gb.id)}
                                            className="px-3 py-1 text-[10px] font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-sm flex items-center gap-1.5 active:scale-95 transition-all"
                                          >
                                            {isSavingRoomEdit ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                                            <span>Save Room Dates & Time</span>
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {booking.invoiceNumber && (
                      <div className="mt-2 pt-2 border-t border-emerald-100">
                        <span className="text-[10px] sm:text-xs font-semibold text-emerald-800 tracking-wider block">
                          Invoice number
                        </span>
                        <span className="text-xs sm:text-sm font-mono font-semibold text-[#1A2E05] mt-0.5 block">
                          {(() => {
                            if (booking.groupBookings && booking.groupBookings.length > 0) {
                              const sortedGb = [...booking.groupBookings].sort((x, y) => x.id - y.id);
                              return sortedGb[0]?.invoiceNumber || booking.invoiceNumber;
                            }
                            return booking.invoiceNumber;
                          })()}
                        </span>
                      </div>
                    )}
                  </div>
                        {/* Payment & billing */}
                  <div className="bg-purple-50/20 rounded-xl p-3 sm:p-4 border border-purple-100/80 shadow-xs space-y-3">
                    <div className="flex items-center justify-between border-b border-purple-100/70 pb-2">
                      <h4 className="text-xs sm:text-sm font-bold text-purple-800 tracking-wider flex items-center gap-2">
                        <CreditCard size={14} className="text-purple-600" />
                        Payment & Billing Info
                      </h4>
                      {scaledRoomShiftItems && scaledRoomShiftItems.length > 1 && (
                        <span className="text-[10px] font-extrabold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-200 uppercase tracking-wider">
                          Shifted Booking
                        </span>
                      )}
                    </div>

                    {/* Room Shift & Tariff Schedule Breakdown Table */}
                    {scaledRoomShiftItems && scaledRoomShiftItems.length > 0 && (
                      <div className="bg-white rounded-xl border border-purple-100 p-2.5 space-y-2 shadow-xs">
                        <span className="text-[10px] font-bold text-purple-800 uppercase tracking-wider block border-b border-purple-50 pb-1">
                          Room Tariff Breakdown & Shift History
                        </span>
                        <div className="space-y-1.5">
                          {scaledRoomShiftItems.map((item, idx) => {
                            if (item.isSameDayShift || item.days === 0) {
                              return (
                                <div key={idx} className="flex items-center justify-between text-[10px] bg-gray-50/80 px-2.5 py-1.5 rounded-lg border border-gray-200/60 text-gray-500">
                                  <div className="flex items-center gap-1.5 font-bold">
                                    <span className="text-gray-700 font-extrabold">Room {item.roomNumber}</span>
                                    <span className="text-[9px] bg-amber-50 text-amber-700 px-1.5 py-0.2 rounded border border-amber-200">Same-Day Shift</span>
                                    {item.dateRangeStr && <span className="text-[9px] text-gray-400 font-normal">({item.dateRangeStr})</span>}
                                  </div>
                                  <span className="font-extrabold text-gray-700">
                                    {item.total > 0 ? `₹${formatMoney(item.total)}` : '₹0.00 (No Charge)'}
                                  </span>
                                </div>
                              );
                            }

                            return (
                              <div
                                key={idx}
                                className={`flex flex-col sm:flex-row sm:items-center justify-between p-2 rounded-lg border text-xs gap-1 sm:gap-0 ${
                                  item.isCurrent
                                    ? 'bg-emerald-50/40 border-emerald-200 text-emerald-950 font-medium'
                                    : 'bg-purple-50/30 border-purple-100 text-purple-950'
                                }`}
                              >
                                <div className="flex flex-col">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`font-black text-xs ${item.isCurrent ? 'text-emerald-900' : 'text-purple-900'}`}>
                                      Room {item.roomNumber}
                                    </span>
                                    {item.isCurrent && (
                                      <span className="text-[9px] font-black bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded border border-emerald-300">
                                        Current Room
                                      </span>
                                    )}
                                  </div>
                                  {item.dateRangeStr && (
                                    <span className="text-[10px] font-semibold text-gray-600 mt-0.5">
                                      {item.dateRangeStr}
                                    </span>
                                  )}
                                  <span className="text-[10px] text-gray-500 font-bold mt-0.5">
                                    {item.days} {item.days === 1 ? 'Night' : 'Nights'} @ ₹{formatMoney(item.rate)}/night
                                  </span>
                                </div>
                                <span className="font-extrabold text-sm text-[#1A2E05] sm:text-right">
                                  ₹{formatMoney(item.total)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Financial Totals Summary Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-2.5">
                      <div className="bg-white p-2.5 sm:p-3 rounded-xl border border-purple-100 flex flex-col justify-between shadow-xs">
                        <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider block">
                          Total Rate
                        </span>
                        <span className="text-base sm:text-lg font-black text-[#1A2E05] block mt-0.5">
                          ₹{formatMoney(finalGrandTotal)}
                        </span>
                        <div className="mt-2 pt-1.5 border-t border-purple-100 flex flex-col gap-1 text-[10px] text-[#7A8A6A] font-bold">
                          <div className="flex justify-between items-center">
                            <span>Base Room Charge:</span>
                            <span className="text-[#1A2E05]">₹{formatMoney(baseAmount + totalDiscount)}</span>
                          </div>
                          {totalDiscount > 0 && (
                            <>
                              <div className="flex justify-between items-center text-rose-600">
                                <span>Discount:</span>
                                <span>- ₹{formatMoney(totalDiscount)}</span>
                              </div>
                              <div className="flex justify-between items-center border-t border-purple-100/50 pt-0.5">
                                <span>Net Base:</span>
                                <span className="text-[#1A2E05]">₹{formatMoney(baseAmount)}</span>
                              </div>
                            </>
                          )}
                          <div className="flex justify-between items-center">
                            <span>GST ({gstOption === 'none' ? '0' : gstRate}%):</span>
                            <span className="text-[#1A2E05]">₹{formatMoney(gstAmount)}</span>
                          </div>
                          {extraServicesTotal > 0 && (
                            <div className="flex justify-between items-center text-amber-700 font-extrabold border-t border-purple-100/50 pt-0.5">
                              <span>Extras (Services/Food):</span>
                              <span>+ ₹{formatMoney(extraServicesTotal)}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="bg-emerald-600 p-2.5 sm:p-3 rounded-xl border border-emerald-500 text-center flex flex-col justify-between shadow-xs text-white">
                        <span className="text-[10px] font-bold text-emerald-100 uppercase tracking-wider block text-left">
                          Amount Paid
                        </span>
                        <span className="text-xl sm:text-2xl font-black block my-auto text-left">
                          ₹{formatMoney(amountPaid)}
                        </span>
                        <span className="text-[9.5px] text-emerald-100/80 block text-left font-medium">
                          {amountPaid >= finalGrandTotal ? 'Fully Settled' : 'Partially Paid'}
                        </span>
                      </div>

                      <div className={`p-2.5 sm:p-3 rounded-xl border flex flex-col justify-between shadow-xs ${pendingDue > 0
                          ? 'bg-rose-600 border-rose-500 text-white shadow-rose-600/10'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-950'
                        }`}>
                        <span className={`text-[10px] font-bold uppercase tracking-wider block text-left ${pendingDue > 0 ? 'text-rose-100' : 'text-emerald-800'}`}>
                          Pending Due
                        </span>
                        <span className={`text-xl sm:text-2xl font-black block my-auto text-left ${pendingDue > 0 ? 'text-white' : 'text-emerald-800'}`}>
                          ₹{formatMoney(pendingDue)}
                        </span>
                        <span className={`text-[9.5px] block text-left font-medium ${pendingDue > 0 ? 'text-rose-100/80' : 'text-emerald-700'}`}>
                          {pendingDue > 0 ? 'Balance Payment Remaining' : 'No Due Balance'}
                        </span>
                      </div>
                    </div>

                    {pendingDue > 0 && (
                      <button
                        onClick={() => {
                          onClose();
                          navigate(`/dashboard/front-office/billing?search=${encodeURIComponent(booking.guestName || '')}`);
                        }}
                        className="w-full mt-2 py-1.5 sm:py-2 bg-[#84A63C] hover:bg-[#72932E] text-white rounded-xl text-xs sm:text-sm font-semibold tracking-wider shadow-md active:scale-95 transition-all inline-flex items-center justify-center gap-1.5"
                      >
                        <Wallet size={12} /> Collect Money
                      </button>
                    )}

                    <div className="mt-2.5 pt-2.5 border-t border-purple-100">
                      <h5 className="text-xs sm:text-sm font-bold text-purple-800 tracking-wider flex items-center gap-1.5 mb-2">
                        <Receipt size={13} className="text-purple-500" />
                        Payment ledger log
                      </h5>
                      <PaymentLedgerLog roomsList={roomsList} />
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-2.5 sm:p-3 bg-gray-50 border-t border-[#DDE5D0] rounded-b-2xl flex flex-wrap items-center justify-between gap-2 flex-shrink-0">
          <button
            onClick={onClose}
            className="py-2 px-3.5 text-xs sm:text-sm font-bold text-gray-700 hover:bg-gray-200 border border-gray-300 rounded-lg transition-all active:scale-95 bg-white text-center shrink-0"
          >
            Close
          </button>
          
          <div className="flex flex-wrap items-center gap-2 justify-end shrink min-w-0">
            {!loading && booking && (booking.status === 'Confirmed' || isTodayCheckin) && (
              <button
                onClick={handleCancelCheckin}
                disabled={isDeleting}
                className="py-2 px-2.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-xs sm:text-sm font-semibold tracking-wider transition-all inline-flex items-center justify-center gap-1.5"
                title={booking.status === 'Confirmed' ? 'Cancel Reservation' : 'Cancel Check-in'}
              >
                {isDeleting ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                <span className="truncate">{booking.status === 'Confirmed' ? 'Cancel Reservation' : 'Cancel Check-in'}</span>
              </button>
            )}
            {!loading && booking && onEdit && (
              <button
                onClick={onEdit}
                className="py-2 px-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs sm:text-sm font-semibold tracking-wider shadow-md active:scale-95 transition-all inline-flex items-center justify-center gap-1.5"
              >
                <Edit size={12} /> <span className="truncate">Edit check-in</span>
              </button>
            )}
            {!loading && booking && (
              booking.status === 'Confirmed' ? (
                <button
                  onClick={() => {
                    if (onCheckIn) {
                      onCheckIn();
                    } else if (onEdit) {
                      onEdit();
                    }
                  }}
                  className="py-2 px-2.5 bg-[#84A63C] hover:bg-[#729232] text-white rounded-lg text-xs sm:text-sm font-semibold tracking-wider shadow-md active:scale-95 transition-all inline-flex items-center justify-center gap-1.5"
                >
                  <LogIn size={12} /> <span className="truncate">Check-in guest</span>
                </button>
              ) : (
                (booking?.groupBookings?.length > 1 || roomsList.length > 1) ? (
                  <>
                    {activeGroupRooms.length > 1 ? (
                      <div className="relative inline-block text-left">
                        <button
                          type="button"
                          onClick={() => setIsCheckoutDropdownOpen(prev => !prev)}
                          className="py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs sm:text-sm font-semibold tracking-wider shadow-md active:scale-95 transition-all inline-flex items-center justify-center gap-1.5"
                          title="Select a specific room to check out"
                        >
                          <LogOut size={12} />
                          <span>Check-out Room ▾</span>
                        </button>

                        {isCheckoutDropdownOpen && (
                          <div className="absolute right-0 bottom-full mb-2 w-56 rounded-xl bg-white shadow-2xl border border-amber-200 py-1.5 z-50 animate-in fade-in zoom-in-95">
                            <div className="px-3 py-1 text-[9px] font-black text-amber-900 uppercase tracking-wider border-b border-amber-100 flex items-center justify-between">
                              <span>Select Room to Check-Out</span>
                              <X size={10} className="cursor-pointer" onClick={() => setIsCheckoutDropdownOpen(false)} />
                            </div>
                            <div className="max-h-48 overflow-y-auto py-1">
                              {activeGroupRooms.map((activeGb) => {
                                const rmNumberStr = activeGb.Room?.roomNumber || activeGb.roomNumber || `Room ${activeGb.roomId}`;
                                const targetRoomId = activeGb.roomId || activeGb.Room?.id || activeGb.id;
                                return (
                                  <button
                                    key={activeGb.id}
                                    type="button"
                                    onClick={() => {
                                      setIsCheckoutDropdownOpen(false);
                                      onCheckOut({ singleRoomId: targetRoomId });
                                    }}
                                    className="w-full text-left px-3 py-2 text-xs font-bold text-gray-800 hover:bg-amber-50 hover:text-amber-900 flex items-center justify-between transition-colors"
                                  >
                                    <span>Check-out Room {rmNumberStr} Only</span>
                                    <LogOut size={11} className="text-amber-600" />
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : activeGroupRooms.length === 1 ? (
                      <button
                        onClick={() => onCheckOut({ singleRoomId: activeGroupRooms[0].roomId || activeGroupRooms[0].Room?.id || activeGroupRooms[0].id })}
                        className="py-2 px-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs sm:text-sm font-semibold tracking-wider shadow-md active:scale-95 transition-all inline-flex items-center justify-center gap-1.5"
                        title={`Check-out Room ${activeGroupRooms[0].Room?.roomNumber || activeGroupRooms[0].roomNumber} only`}
                      >
                        <LogOut size={12} /> <span className="truncate">Check-out Room {activeGroupRooms[0].Room?.roomNumber || activeGroupRooms[0].roomNumber} Only</span>
                      </button>
                    ) : null}

                    <button
                      onClick={() => onCheckOut()}
                      className="py-2 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs sm:text-sm font-semibold tracking-wider shadow-md active:scale-95 transition-all inline-flex items-center justify-center gap-1.5"
                      title="Check-out all active rooms in this group booking"
                    >
                      <LogOut size={12} /> <span className="truncate">Check-out All Rooms</span>
                    </button>
                  </>
                ) : (
                  <button
                    onClick={onCheckOut}
                    className="py-2 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs sm:text-sm font-semibold tracking-wider shadow-md active:scale-95 transition-all inline-flex items-center justify-center gap-1.5"
                  >
                    <LogOut size={12} /> <span className="truncate">Check-out guest</span>
                  </button>
                )
              )
            )}
          </div>
        </div>
      </div>

      <ImageLightbox src={previewImage} onClose={handleClosePreview} />
      <CancelBookingModal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        booking={booking}
        room={room}
        onConfirm={handleExecuteCancel}
      />

      <style dangerouslySetInnerHTML={{
        __html: `
          .no-scrollbar::-webkit-scrollbar { display: none; }
          .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        `,
      }} />
    </div>,
    document.body
  );
};

export default GuestDetailModal;