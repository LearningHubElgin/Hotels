/**
 * Helper utilities for auto-generating and validating Booking Registration Numbers.
 */

/**
 * Gets or auto-generates a serial Registration Number for a booking.
 * @param {Object} bill - The booking/bill object.
 * @param {Array} allBills - Array of all bookings/bills.
 * @returns {string} Registration Number string (e.g. 'REG-001').
 */
export const getAutoRegNo = (bill, allBills = []) => {
  if (!bill || bill.status === 'Cancelled') return '-';
  if (bill.registrationNumber && String(bill.registrationNumber).trim() && String(bill.registrationNumber).trim() !== '-') {
    return String(bill.registrationNumber).trim();
  }

  const activeBills = (allBills || []).filter(b => b && b.status !== 'Cancelled');
  if (Array.isArray(activeBills) && activeBills.length > 0) {
    const sorted = [...activeBills].sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
    const idx = sorted.findIndex(b => Number(b.id) === Number(bill.id));
    if (idx >= 0) return `REG-${String(idx + 1).padStart(3, '0')}`;
  }

  const numId = Number(bill.id);
  if (!isNaN(numId) && numId > 0) {
    return `REG-${String(numId).padStart(3, '0')}`;
  }

  return 'REG-001';
};

/**
 * Gets the next available serial Registration Number across all bookings (excluding cancelled).
 * @param {Array} allBills - Array of all bookings/bills.
 * @returns {string} Next Registration Number string (e.g. 'REG-005').
 */
export const getNextAutoRegNo = (allBills = []) => {
  let maxSeq = 0;
  (allBills || []).forEach(b => {
    if (b.status === 'Cancelled') return;
    const reg = b.registrationNumber || '';
    const match = String(reg).match(/(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxSeq) maxSeq = num;
    }
  });
  if (maxSeq === 0) {
    const activeBills = (allBills || []).filter(b => b && b.status !== 'Cancelled');
    maxSeq = activeBills.length;
  }
  return `REG-${String(maxSeq + 1).padStart(3, '0')}`;
};

/**
 * Checks if a given Registration Number is unique across all active bookings (excluding current booking ID).
 * @param {string} regNo - Registration Number to validate.
 * @param {string|number} currentBillId - ID of current booking to ignore.
 * @param {Array} allBills - Array of all bookings/bills.
 * @returns {boolean} True if unique, false if duplicate.
 */
export const isRegNoUnique = (regNo, currentBillId, allBills = []) => {
  if (!regNo || !String(regNo).trim() || String(regNo).trim() === '-') return true;
  const clean = String(regNo).trim().toLowerCase();
  
  return !(allBills || []).some(b => {
    if (b.status === 'Cancelled') return false;
    if (currentBillId && Number(b.id) === Number(currentBillId)) return false;
    const bReg = (b.registrationNumber || getAutoRegNo(b, allBills)).trim().toLowerCase();
    return bReg === clean;
  });
};
