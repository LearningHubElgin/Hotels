import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { LogOut, X, AlertTriangle, CreditCard } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const CheckoutConfirmModal = ({ isOpen, onClose, onConfirm, booking, room }) => {
  const navigate = useNavigate();

  const today = new Date();
  const defaultDate = today.toISOString().split('T')[0];
  const defaultTime = today.toTimeString().split(' ')[0].substring(0, 5);

  const [checkOutDate, setCheckOutDate] = useState(defaultDate);
  const [checkOutTime, setCheckOutTime] = useState(defaultTime);

  if (!isOpen || !booking) return null;

  const guestName = booking.guestName || 'N/A';
  const roomNumber = room?.roomNumber || booking.roomNumber || 'N/A';

  const isGroup = booking?.groupBookings && booking.groupBookings.length > 0;
  const totalRoomRate = isGroup
    ? booking.groupBookings.reduce((sum, b) => sum + Number(b.totalAmount || 0), 0)
    : Number(booking?.totalAmount || 0);
  const totalDiscount = isGroup
    ? booking.groupBookings.reduce((sum, b) => sum + Number(b.discount || 0), 0)
    : Number(booking?.discount || 0);
  const amountPaid = isGroup
    ? booking.groupBookings.reduce((sum, b) => sum + Number(b.amountPaid || 0), 0)
    : Number(booking?.amountPaid || 0);

  const gstOption = booking?.gstOption || 'none';
  const gstRate = Number(booking?.gstRate || 0);

  const grandTotal = Math.max(0, totalRoomRate - totalDiscount);
  let baseAmount = grandTotal;
  let gstAmount = 0;

  if (gstOption === 'exclusive' && gstRate > 0) {
    baseAmount = Number((grandTotal / (1 + gstRate / 100)).toFixed(2));
    gstAmount = Number((grandTotal - baseAmount).toFixed(2));
  } else if (gstOption === 'inclusive' && gstRate > 0) {
    baseAmount = Number((grandTotal / (1 + gstRate / 100)).toFixed(2));
    gstAmount = Number((grandTotal - baseAmount).toFixed(2));
  }

  const totalAmount = grandTotal;
  const rawPending = grandTotal - amountPaid;
  const outstandingBalance = rawPending > 0.05 ? Math.round(rawPending * 100) / 100 : 0;
  const hasOutstanding = outstandingBalance > 0.01;

  return createPortal(
    <div className="fixed inset-0 w-screen h-screen z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-white w-full max-w-[390px] rounded-[1.8rem] p-4.5 shadow-2xl animate-slide-up relative border border-[#DDE5D0] flex flex-col items-center text-center">
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          type="button"
          className="absolute top-3 right-3 p-1.5 hover:bg-[#F0F3E8] rounded-full transition-all text-[#7A8A6A] hover:text-[#1A2E05]"
        >
          <X size={16} />
        </button>

        {/* Circular Top Icon */}
        <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-2.5 border transition-all duration-300 ${
          hasOutstanding 
            ? 'bg-red-50 text-red-500 border-red-100' 
            : 'bg-emerald-50 text-emerald-500 border-emerald-100'
        }`}>
          <LogOut size={20} className={hasOutstanding ? 'text-red-500' : 'text-emerald-500'} />
        </div>

        {/* Title */}
        <h3 className="text-lg font-black text-[#1A2E05] tracking-tight mb-1">Check-out Confirmation</h3>
        
        {/* Description */}
        <p className="text-[11px] text-[#7A8A6A] font-semibold leading-relaxed mb-3 max-w-xs">
          Check out guest <strong className="text-[#1C2B12]">{guestName}</strong> from Room <strong className="text-[#1C2B12]">{roomNumber}</strong>?
        </p>

        {/* Outstanding Balance Alert Card */}
        {hasOutstanding && (
          <div className="w-full bg-[#FFF5F5] border border-[#FCD2D2] rounded-2xl p-2.5 text-left space-y-2 mb-2.5 animate-fade-in">
            <div className="flex items-center gap-1.5 text-red-700 font-extrabold text-[9px] uppercase tracking-wider">
              <AlertTriangle size={12} className="text-red-500" />
              Outstanding Balance Due
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white p-2.5 rounded-xl border border-[#FCD2D2]/50 text-left shadow-sm">
                <span className="text-[8px] font-bold text-[#7A8A6A] uppercase block">Room Charge</span>
                <span className="text-xs font-black text-[#1A2E05] mt-0.5 block">₹{totalAmount.toFixed(2)}</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-[#FCD2D2]/50 text-left shadow-sm">
                <span className="text-[8px] font-bold text-[#7A8A6A] uppercase block">Amount Paid</span>
                <span className="text-xs font-black text-[#1A2E05] mt-0.5 block">₹{amountPaid.toFixed(2)}</span>
              </div>
            </div>

            <div className="bg-[#FFF0F0] border border-[#FCD2D2] p-2 rounded-xl flex justify-between items-center text-red-800">
              <span className="text-[9px] font-bold uppercase tracking-wide">Collect Before Checkout:</span>
              <span className="font-black text-xs">₹{outstandingBalance.toFixed(2)}</span>
            </div>

            {/* Go to Billing button */}
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate(`/dashboard/front-office/billing?search=${encodeURIComponent(guestName)}`);
              }}
              className="w-full flex items-center justify-center gap-1.5 py-2 bg-white border border-red-400 text-red-600 hover:bg-red-50 rounded-xl font-bold text-[10px] transition-all active:scale-[0.98]"
            >
              <CreditCard size={12} />
              Go to Billing &amp; Payment
            </button>
          </div>
        )}

        {/* Actual Checkout Date & Time Overwrite Form */}
        <div className="w-full bg-[#F5F7F0] border border-[#DDE5D0] rounded-2xl p-2.5 text-left space-y-2 mb-2.5">
          <span className="text-[9px] font-black text-[#4A5E38] uppercase tracking-wider block ml-0.5">Set Actual Check-out Date &amp; Time</span>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-1.5 bg-white border border-[#DDE5D0] rounded-xl px-2 py-1">
              <span className="text-[9px] font-bold text-[#7A8A6A] uppercase shrink-0">Date:</span>
              <input
                type="date"
                value={checkOutDate}
                onChange={(e) => setCheckOutDate(e.target.value)}
                className="w-full bg-transparent text-[11px] font-bold focus:outline-none p-0 border-none cursor-pointer"
              />
            </div>
            <div className="flex items-center gap-1.5 bg-white border border-[#DDE5D0] rounded-xl px-2 py-1">
              <span className="text-[9px] font-bold text-[#7A8A6A] uppercase shrink-0">Time:</span>
              <input
                type="time"
                value={checkOutTime}
                onChange={(e) => setCheckOutTime(e.target.value)}
                className="w-full bg-transparent text-[11px] font-bold focus:outline-none p-0 border-none cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Instantly Warning Box */}
        <div className="w-full bg-[#FFF9F2] border border-[#FFE8CC] rounded-2xl p-2.5 text-left space-y-1 mb-4">
          <div className="flex items-center gap-1.5 text-orange-800 font-extrabold text-[9px] uppercase tracking-wider">
            <AlertTriangle size={11} className="text-orange-500" />
            Proceeding will instantly:
          </div>
          <ul className="list-disc pl-3.5 text-[9px] text-orange-700 font-semibold space-y-0.5">
            <li>Charge the guest's final folio</li>
            <li>Deactivate their digital key access</li>
            <li>Clear the room availability calendar</li>
          </ul>
        </div>

        {/* Buttons Action Bar */}
        <div className="grid grid-cols-2 gap-2.5 w-full">
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-4 bg-gray-50 border border-[#DDE5D0] text-gray-700 rounded-xl hover:bg-gray-100 transition-all font-bold text-[10px] active:scale-[0.98]"
          >
            No, Cancel
          </button>
          
          <button
            type="button"
            onClick={() => onConfirm(checkOutDate, checkOutTime)}
            className={`py-2.5 px-4 text-white rounded-xl transition-all font-bold text-[10px] flex items-center justify-center gap-1 active:scale-[0.98] shadow-sm ${
              hasOutstanding
                ? 'bg-red-600 hover:bg-red-700 shadow-red-600/10'
                : 'bg-[#009E60] hover:bg-[#008751] shadow-emerald-600/10'
            }`}
          >
            {!hasOutstanding && <span className="font-extrabold text-xs">✓</span>}
            {hasOutstanding ? 'Yes, Check-out anyway' : 'Yes, Check-out'}
          </button>
        </div>

      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes slideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
          .animate-fade-in { animation: fadeIn 0.3s ease-out forwards; }
          .animate-slide-up { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        `
      }} />
    </div>,
    document.body
  );
};

export default CheckoutConfirmModal;
