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
  if (bill && bill.registrationNumber && String(bill.registrationNumber).trim()) {
    return String(bill.registrationNumber).trim();
  }
  if (!bill) return 'REG-001';

  if (Array.isArray(allBills) && allBills.length > 10) {
    const sorted = [...allBills].sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
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
 * Gets the next available serial Registration Number across all bookings.
 * @param {Array} allBills - Array of all bookings/bills.
 * @returns {string} Next Registration Number string (e.g. 'REG-005').
 */
export const getNextAutoRegNo = (allBills = []) => {
  let maxSeq = 0;
  (allBills || []).forEach(b => {
    const reg = b.registrationNumber || '';
    const match = String(reg).match(/(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxSeq) maxSeq = num;
    }
  });
  if (maxSeq === 0) {
    maxSeq = allBills ? allBills.length : 0;
  }
  return `REG-${String(maxSeq + 1).padStart(3, '0')}`;
};

/**
 * Checks if a given Registration Number is unique across all bookings (excluding current booking ID).
 * @param {string} regNo - Registration Number to validate.
 * @param {string|number} currentBillId - ID of current booking to ignore.
 * @param {Array} allBills - Array of all bookings/bills.
 * @returns {boolean} True if unique, false if duplicate.
 */
export const isRegNoUnique = (regNo, currentBillId, allBills = []) => {
  if (!regNo || !String(regNo).trim()) return true;
  const clean = String(regNo).trim().toLowerCase();
  
  return !(allBills || []).some(b => {
    if (currentBillId && Number(b.id) === Number(currentBillId)) return false;
    const bReg = (b.registrationNumber || getAutoRegNo(b, allBills)).trim().toLowerCase();
    return bReg === clean;
  });
};
