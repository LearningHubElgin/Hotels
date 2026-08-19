import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, LogIn, Calendar, Clock, User, DoorOpen } from 'lucide-react';

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

const QuickCheckInModal = ({ isOpen, onClose, booking, roomNumber, onConfirm }) => {
  const [checkInDate, setCheckInDate] = useState(getTodayYMD());
  const [checkInTime, setCheckInTime] = useState(getNowTime());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (booking && isOpen) {
      const bDate = booking.checkInDate ? booking.checkInDate.split('T')[0] : getTodayYMD();
      setCheckInDate(bDate);
      setCheckInTime(getNowTime());
    }
  }, [booking, isOpen]);

  if (!isOpen || !booking) return null;

  const roomNo = roomNumber || booking.Room?.roomNumber || booking.previousRoomNumber || 'N/A';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onConfirm(booking.id, checkInDate, checkInTime);
      onClose();
    } catch (err) {
      console.error('Error during check-in:', err);
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden animate-slide-up border border-[#DDE5D0]">
        {/* Header */}
        <div className="p-4 bg-[#F5F7F0] border-b border-[#DDE5D0] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-[#84A63C]/10 text-[#84A63C] rounded-xl flex items-center justify-center font-bold">
              <LogIn size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#1A2E05]">Confirm Guest Check-In</h3>
              <p className="text-[10px] font-semibold text-[#7A8A6A]">Verify check-in date & time</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="w-7 h-7 flex items-center justify-center bg-white text-gray-500 hover:bg-[#DDE5D0] rounded-xl transition-all shadow-sm"
          >
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3.5">
          {/* Guest & Room Summary Card */}
          <div className="bg-[#F5F7F0]/60 p-3 rounded-2xl border border-[#DDE5D0] space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#4A5E38] font-bold flex items-center gap-1">
                <DoorOpen size={13} className="text-[#84A63C]" /> Room Number:
              </span>
              <span className="text-[#1A2E05] font-black bg-white px-2 py-0.5 rounded border border-[#DDE5D0]">
                Room {roomNo}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#4A5E38] font-bold flex items-center gap-1">
                <User size={13} className="text-[#84A63C]" /> Guest Name:
              </span>
              <span className="text-[#1A2E05] font-black">{booking.guestName}</span>
            </div>
          </div>

          {/* Editable Date & Time Fields */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[10px] font-bold text-[#4A5E38] mb-1 flex items-center gap-1">
                <Calendar size={12} /> Check-In Date
              </label>
              <input
                type="date"
                value={checkInDate}
                onChange={(e) => setCheckInDate(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-bold border border-[#DDE5D0] rounded-xl focus:ring-2 focus:ring-[#84A63C] outline-none bg-white text-[#1A2E05] cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#4A5E38] mb-1 flex items-center gap-1">
                <Clock size={12} /> Check-In Time
              </label>
              <input
                type="time"
                value={checkInTime}
                onChange={(e) => setCheckInTime(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-bold border border-[#DDE5D0] rounded-xl focus:ring-2 focus:ring-[#84A63C] outline-none bg-white text-[#1A2E05] cursor-pointer"
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-2 bg-[#F0F3E8] text-[#4A5E38] hover:bg-[#DDE5D0] rounded-xl text-xs font-bold transition-all border border-[#DDE5D0]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-[1.5] py-2 bg-[#84A63C] text-white hover:opacity-90 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95"
            >
              {loading ? 'Processing...' : 'Confirm Check-In'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default QuickCheckInModal;
