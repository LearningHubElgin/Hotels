import React from 'react';
import { createPortal } from 'react-dom';
import { Calendar, Clock, Edit } from 'lucide-react';

const EarlyCheckinWarningModal = ({ isOpen, onClose, onEdit, booking }) => {
  if (!isOpen || !booking) return null;

  const formattedDate = booking.checkInDate
    ? booking.checkInDate.split('T')[0].split('-').reverse().join('-')
    : 'N/A';

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-slide-up p-6 text-center border border-[#DDE5D0]">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4 border border-amber-200">
          <Calendar size={32} className="text-amber-600" />
        </div>

        <h3 className="text-xl font-bold text-[#1A2E05] mb-2">Early Check-In Notice</h3>

        <div className="bg-[#F0F3E8]/60 p-4 rounded-2xl border border-[#DDE5D0] mb-6 text-left space-y-2">
          <p className="text-xs font-semibold text-[#4A5E38]">
            Guest <span className="font-bold text-[#1A2E05]">{booking.guestName}</span> is scheduled to check in on:
          </p>
          <div className="text-sm font-black text-[#1A2E05] bg-white px-3 py-2 rounded-xl border border-[#DDE5D0] flex items-center gap-2">
            <Clock size={16} className="text-[#84A63C]" />
            {formattedDate} {booking.checkInTime ? `at ${booking.checkInTime}` : ''}
          </div>
          <p className="text-[11px] font-medium text-[#7A8A6A] pt-1">
            Today is not the scheduled check-in date. If the guest has arrived early today, please update the check-in date first.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-[#F0F3E8] text-[#4A5E38] hover:bg-[#DDE5D0] rounded-xl text-xs font-bold transition-all border border-[#DDE5D0]"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onClose();
              if (onEdit) onEdit(booking);
            }}
            className="flex-1 py-3 bg-[#84A63C] text-white hover:opacity-90 rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1.5"
          >
            <Edit size={14} />
            Edit Date
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default EarlyCheckinWarningModal;
