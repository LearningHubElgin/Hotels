import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Wallet, CreditCard, RotateCcw } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

export const computeRefundOverpayment = (bill, activeHotel) => {
  if (!bill) return { grandTotal: 0, totalPaid: 0, overpaidAmount: 0 };
  let baseAmount = Number(bill.totalAmount || 0);
  let discount = Number(bill.discount || 0);
  let amountPaid = Number(bill.amountPaid || 0);

  if (bill.groupBookings && bill.groupBookings.length > 1) {
    baseAmount = bill.groupBookings.reduce((sum, b) => sum + Number(b.totalAmount || 0), 0);
    discount = bill.groupBookings.reduce((sum, b) => sum + Number(b.discount || 0), 0);
    amountPaid = bill.groupBookings.reduce((sum, b) => sum + Number(b.amountPaid || 0), 0);
  }

  const defaultGst = activeHotel?.defaultGstRate !== undefined ? Number(activeHotel.defaultGstRate) : 12;
  const gstRate = Number(bill.gstRate !== undefined && bill.gstRate !== null ? bill.gstRate : defaultGst);
  const gstOption = bill.gstOption || 'none';

  let extraGrandTotal = 0;
  if (bill.extraChargesList && Array.isArray(bill.extraChargesList) && bill.extraChargesList.length > 0) {
    extraGrandTotal = bill.extraChargesList.reduce((sum, ec) => sum + Number(ec.grandTotal || ec.amount || 0), 0);
  } else if (bill.extraCharges) {
    extraGrandTotal = Number(bill.extraCharges || 0);
  }

  const netRoomTotal = Math.max(0, baseAmount - discount);
  let grandTotal = 0;

  if (gstOption === 'exclusive') {
    const roomGst = gstRate > 0 ? Math.round((netRoomTotal * (gstRate / 100)) * 100) / 100 : 0;
    grandTotal = netRoomTotal + roomGst + extraGrandTotal;
  } else {
    grandTotal = netRoomTotal + extraGrandTotal;
  }

  let parsedHistory = [];
  try {
    if (bill.paymentHistory) {
      parsedHistory = typeof bill.paymentHistory === 'string' ? JSON.parse(bill.paymentHistory) : bill.paymentHistory;
    }
  } catch (err) {
    console.error(err);
  }

  const totalPaid = amountPaid || (Array.isArray(parsedHistory) ? parsedHistory.reduce((sum, h) => sum + Number(h.amount || 0), 0) : 0);
  const overpaidAmount = Math.max(0, totalPaid - grandTotal);

  return { grandTotal, totalPaid, overpaidAmount, parsedHistory };
};

const RefundModal = ({ isOpen, onClose, bill, onSave }) => {
  const { activeHotel } = useAuth();
  const [refundMode, setRefundMode] = useState('Cash');
  const [refundBank, setRefundBank] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const banksList = activeHotel && activeHotel.onlinePaymentBanks
    ? activeHotel.onlinePaymentBanks.split(',').map(b => b.trim()).filter(Boolean)
    : [];

  useEffect(() => {
    if (isOpen && bill) {
      document.body.style.overflow = 'hidden';
      setRefundMode('Cash');
      setRefundBank(banksList[0] || '');
      setIsSubmitting(false);
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, bill]);

  if (!isOpen || !bill) return null;

  const { grandTotal, overpaidAmount, parsedHistory } = computeRefundOverpayment(bill, activeHotel);

  const handleRefund = async () => {
    if (overpaidAmount <= 0.1) {
      alert("No overpayment to refund");
      return;
    }

    setIsSubmitting(true);
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

    const historyArr = Array.isArray(parsedHistory) ? parsedHistory : [];
    const updatedHistory = [...historyArr, refundTx];
    const newTotalPaid = updatedHistory.reduce((sum, h) => sum + Number(h.amount || 0), 0);
    const pendingDue = grandTotal - newTotalPaid;
    const paymentStatus = pendingDue <= 0.1 ? 'Paid' : (newTotalPaid === 0 ? 'Pending' : 'Partial');

    try {
      await api.put(`/bookings/${bill.id}`, {
        paymentHistory: JSON.stringify(updatedHistory),
        amountPaid: newTotalPaid,
        paymentStatus
      });
      if (onSave) onSave();
      onClose();
    } catch (err) {
      console.error("Error processing refund", err);
      alert(err.response?.data?.message || "Failed to process refund");
    } finally {
      setIsSubmitting(false);
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
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="flex-1 py-2.5 border border-[#DDE5D0] text-[#7A8A6A] hover:bg-[#F0F3E8] hover:text-[#1A2E05] rounded-xl text-xs font-black transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleRefund}
            className="flex-1 py-2.5 bg-[#84A63C] text-white font-black text-xs rounded-xl shadow-md shadow-[#84A63C]/25 hover:bg-[#739331] active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <RotateCcw size={14} className={isSubmitting ? 'animate-spin' : ''} />
            <span>{isSubmitting ? 'Processing...' : `Refund ₹${overpaidAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default RefundModal;
