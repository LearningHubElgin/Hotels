import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle, RefreshCw, FileText, Calendar, Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const getTodayYMD = () => {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const getNowTime = () => {
  const today = new Date();
  const hh = String(today.getHours()).padStart(2, '0');
  const min = String(today.getMinutes()).padStart(2, '0');
  return `${hh}:${min}`;
};

const CancelBookingModal = ({ isOpen, onClose, booking, room, onConfirm }) => {
  const { activeHotel } = useAuth();
  const [refundAmount, setRefundAmount] = useState('0');
  const [refundMode, setRefundMode] = useState('Cash');
  const [refundBank, setRefundBank] = useState('');
  const [cancellationReason, setCancellationReason] = useState('');
  const [cancellationDate, setCancellationDate] = useState(getTodayYMD());
  const [cancellationTime, setCancellationTime] = useState(getNowTime());
  const [loading, setLoading] = useState(false);

  const banksList = activeHotel && activeHotel.onlinePaymentBanks
    ? activeHotel.onlinePaymentBanks.split(',').map(b => b.trim()).filter(Boolean)
    : ['paytm', 'gpay', 'sbi', 'phonepe', 'hdfc', 'icici'];

  useEffect(() => {
    if (booking) {
      let paid = parseFloat(booking.amountPaid) || 0;
      if (booking.groupBookings && booking.groupBookings.length > 1) {
        paid = booking.groupBookings.reduce((sum, b) => sum + (parseFloat(b.amountPaid) || 0), 0);
      }
      setRefundAmount(paid > 0 ? String(paid) : '0');
      setRefundMode('Cash');
      setRefundBank('');
      setCancellationReason('');
      setCancellationDate(getTodayYMD());
      setCancellationTime(getNowTime());
    }
  }, [booking, isOpen]);

  if (!isOpen || !booking) return null;

  const isGroup = booking.groupBookings && booking.groupBookings.length > 1;
  const paidAmount = isGroup
    ? booking.groupBookings.reduce((sum, b) => sum + (parseFloat(b.amountPaid) || 0), 0)
    : (parseFloat(booking.amountPaid) || 0);
  const roomNo = isGroup
    ? booking.groupBookings.map(b => b.Room?.roomNumber || b.previousRoomNumber).filter(Boolean).join(', ')
    : (room?.roomNumber || booking.Room?.roomNumber || booking.previousRoomNumber || 'N/A');

  const baseRate = isGroup
    ? booking.groupBookings.reduce((sum, b) => sum + (parseFloat(b.totalAmount) || 0), 0)
    : (parseFloat(booking.totalAmount || 0));
  const gstOption = booking.gstOption || 'none';
  const gstRate = Number(booking.gstRate !== undefined && booking.gstRate !== null ? booking.gstRate : 0);
  const gstAmount = gstOption === 'none' ? 0 : baseRate * (gstRate / 100);
  const grandTotal = Math.round(baseRate + gstAmount);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const refAmtVal = parseFloat(refundAmount) || 0;
    if (refAmtVal > 0 && refundMode === 'Online' && !refundBank) {
      alert('Please select the Bank / Account for online refund.');
      return;
    }

    setLoading(true);
    try {
      await onConfirm({
        refundAmount: refAmtVal,
        refundMode: refundMode === 'Online' ? `Online (${refundBank || 'Online'})` : 'Cash',
        refundBank: refundMode === 'Online' ? refundBank : '',
        cancellationReason,
        cancellationDate,
        cancellationTime
      });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-slide-up border border-[#DDE5D0]">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-rose-50/80 border-b border-rose-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center font-bold">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-rose-950">Cancel Check-In / Booking</h3>
              <p className="text-xs font-medium text-rose-700">{isGroup ? `Rooms ${roomNo}` : `Room ${roomNo}`} • {booking.guestName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="w-8 h-8 flex items-center justify-center bg-white text-gray-500 hover:bg-rose-100 rounded-xl transition-all shadow-sm"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Summary Card */}
          <div className="bg-[#F0F3E8]/60 p-4 rounded-2xl border border-[#DDE5D0] space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-[#4A5E38] font-bold">Guest Name:</span>
              <span className="text-[#1A2E05] font-black">{booking.guestName}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-[#4A5E38] font-bold">Total Amount:</span>
              <span className="text-[#1A2E05] font-black">₹{grandTotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-[#4A5E38] font-bold">Amount Paid So Far:</span>
              <span className={`font-black ${paidAmount > 0 ? 'text-emerald-600' : 'text-gray-600'}`}>₹{paidAmount.toLocaleString()}</span>
            </div>
          </div>

          {/* Refund Section */}
          {paidAmount > 0 ? (
            <div className="bg-amber-50/60 p-4 rounded-2xl border border-amber-200/80 space-y-3">
              <div className="flex items-center gap-2 text-amber-800 text-xs font-bold">
                <RefreshCw size={14} className="text-amber-600 animate-spin-slow" />
                Refund Process Details
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#4A5E38] mb-1">
                    Refund Amount (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={paidAmount}
                    step="0.01"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-bold border border-[#DDE5D0] rounded-xl focus:ring-2 focus:ring-[#84A63C] outline-none"
                  />
                  <span className="text-[10px] text-gray-500 font-medium mt-0.5 block">
                    Max refundable: ₹{paidAmount.toLocaleString()}
                  </span>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#4A5E38] mb-1">
                    Refund Payment Mode
                  </label>
                  <select
                    value={refundMode}
                    onChange={(e) => {
                      setRefundMode(e.target.value);
                      if (e.target.value !== 'Online') setRefundBank('');
                    }}
                    className="w-full px-3 py-2 text-xs font-bold border border-[#DDE5D0] rounded-xl focus:ring-2 focus:ring-[#84A63C] outline-none bg-white cursor-pointer"
                  >
                    <option value="Cash">Cash</option>
                    <option value="Online">Online</option>
                  </select>
                </div>
              </div>

              {refundMode === 'Online' && (
                <div className="pt-1">
                  <label className="block text-[11px] font-bold text-[#4A5E38] mb-1 uppercase tracking-wider">
                    Select Bank
                  </label>
                  <select
                    value={refundBank}
                    onChange={(e) => setRefundBank(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-bold border border-[#DDE5D0] rounded-xl focus:ring-2 focus:ring-[#84A63C] outline-none bg-white cursor-pointer text-[#1A2E05]"
                  >
                    <option value="">-- Choose Bank --</option>
                    {banksList.map(bank => (
                      <option key={bank} value={bank}>{bank}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-500 font-medium italic bg-gray-50 p-3 rounded-xl border border-gray-200">
              No advance payment collected for this booking. Refund is not required.
            </p>
          )}

          {/* Cancellation Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-[#4A5E38] mb-1 flex items-center gap-1">
                <Calendar size={12} /> Cancellation Date
              </label>
              <input
                type="date"
                value={cancellationDate}
                onChange={(e) => setCancellationDate(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold border border-[#DDE5D0] rounded-xl focus:ring-2 focus:ring-[#84A63C] outline-none bg-white text-[#1A2E05] cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[#4A5E38] mb-1 flex items-center gap-1">
                <Clock size={12} /> Cancellation Time
              </label>
              <input
                type="time"
                value={cancellationTime}
                onChange={(e) => setCancellationTime(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold border border-[#DDE5D0] rounded-xl focus:ring-2 focus:ring-[#84A63C] outline-none bg-white text-[#1A2E05] cursor-pointer"
              />
            </div>
          </div>

          {/* Cancellation Reason */}
          <div>
            <label className="block text-[11px] font-bold text-[#4A5E38] mb-1 flex items-center gap-1">
              <FileText size={12} />
              Reason for Cancellation (Optional)
            </label>
            <textarea
              rows="2"
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              placeholder="e.g. Guest cancelled due to travel plan change..."
              className="w-full p-3 text-xs font-medium border border-[#DDE5D0] rounded-xl focus:ring-2 focus:ring-[#84A63C] outline-none resize-none"
            />
          </div>

          <p className="text-[11px] text-[#7A8A6A] font-medium italic">
            * Cancelling will release {isGroup ? `Rooms ${roomNo}` : `Room ${roomNo}`} to Available status and preserve this booking record in Guest History.
          </p>

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-3 bg-[#F0F3E8] text-[#4A5E38] hover:bg-[#DDE5D0] rounded-xl text-xs font-bold transition-all border border-[#DDE5D0]"
            >
              Keep Booking
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 bg-rose-600 text-white hover:bg-rose-700 rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1.5"
            >
              {loading ? 'Processing...' : 'Confirm Cancellation'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default CancelBookingModal;
