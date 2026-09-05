/**
 * Helper utilities for auto-generating and managing Payment Serial Numbers (1, 2, 3...).
 */

/**
 * Gets or auto-generates a serial number for a specific payment item.
 * @param {Object} paymentItem - The payment object from paymentHistory.
 * @param {number} idx - Index of the payment item in the bill's paymentHistory.
 * @param {Object} bill - The booking/bill object.
 * @param {Array} allBills - Array of all bookings/bills.
 * @returns {string} Serial number string (e.g. '1', '2', '3').
 */
export const getAutoPaymentSerialNo = (paymentItem, idx = 0, bill = null, allBills = []) => {
  if (paymentItem && (paymentItem.serialNumber || paymentItem.receiptNumber)) {
    return String(paymentItem.serialNumber || paymentItem.receiptNumber).trim();
  }

  // If no serial number on payment, calculate sequential index from all historical payments
  if (Array.isArray(allBills) && allBills.length > 0 && bill) {
    // Sort bills chronologically by creation/checkIn
    const sorted = [...allBills].sort((a, b) => {
      const tA = new Date(a.createdAt || a.checkInDate || 0).getTime();
      const tB = new Date(b.createdAt || b.checkInDate || 0).getTime();
      return tA - tB || Number(a.id || 0) - Number(b.id || 0);
    });

    let cumulativeCount = 0;
    for (const b of sorted) {
      let bHistory = [];
      try {
        if (b.paymentHistory) {
          bHistory = typeof b.paymentHistory === 'string' ? JSON.parse(b.paymentHistory) : b.paymentHistory;
        }
      } catch (e) {
        bHistory = [];
      }
      if (!Array.isArray(bHistory) || bHistory.length === 0) {
        if (Number(b.amountPaid || 0) > 0) {
          bHistory = [{ amount: b.amountPaid }];
        }
      }

      if (Number(b.id) === Number(bill.id)) {
        return String(cumulativeCount + idx + 1);
      }
      cumulativeCount += bHistory.length;
    }
  }

  return String(idx + 1);
};

/**
 * Gets the next available pure numeric Payment Serial Number across all bookings.
 * @param {Array} allBills - Array of all bookings/bills.
 * @returns {string} Next Serial Number string (e.g. '1', '2', '3'...).
 */
export const getNextPaymentSerialNo = (allBills = []) => {
  let maxSeq = 0;
  let totalPaymentsCount = 0;

  (allBills || []).forEach(b => {
    let history = [];
    try {
      if (b.paymentHistory) {
        history = typeof b.paymentHistory === 'string' ? JSON.parse(b.paymentHistory) : b.paymentHistory;
      }
    } catch (e) {
      history = [];
    }

    if (Array.isArray(history) && history.length > 0) {
      history.forEach(item => {
        totalPaymentsCount++;
        const s = item.serialNumber || item.receiptNumber;
        if (s) {
          const match = String(s).match(/(\d+)$/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxSeq) maxSeq = num;
          }
        }
      });
    } else if (Number(b.amountPaid || 0) > 0) {
      totalPaymentsCount++;
    }
  });

  const nextNum = Math.max(maxSeq, totalPaymentsCount) + 1;
  return String(nextNum);
};
