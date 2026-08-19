const { Op } = require('sequelize');
const Booking = require('../models/Booking');

/**
 * Calculates the invoice serial number for a booking based on the hotel's yearly reset settings.
 * Assigns serial numbers in strict chronological order so that every booking gets a unique,
 * incrementing sequence number (e.g. 1256 -> 1257 -> 1258 -> 1259).
 * 
 * @param {Object} booking - The Booking record
 * @param {Object} hotel - The Hotel record
 * @returns {Promise<string>} The serial number string (e.g. "1257" or "001")
 */
const getBookingSerialNumber = async (booking, hotel) => {
  if (!hotel) return '001';

  const baseWhere = {
    hotelId: hotel.id,
    status: { [Op.ne]: 'Cancelled' }
  };

  // If yearly reset is enabled and yearEndingDate is set (format: MM-DD)
  if (hotel.resetInvoiceYearly && hotel.yearEndingDate) {
    const [monthStr, dayStr] = hotel.yearEndingDate.split('-');
    const month = parseInt(monthStr, 10) - 1; // 0-indexed month
    const day = parseInt(dayStr, 10);

    const bookingDate = new Date((booking && booking.createdAt) || Date.now());
    
    // Find the cutoff date in the current calendar year of the booking
    let cutoff = new Date(bookingDate.getFullYear(), month, day, 23, 59, 59, 999);
    
    if (bookingDate <= cutoff) {
      cutoff.setFullYear(bookingDate.getFullYear() - 1);
    }
    
    baseWhere.createdAt = { [Op.gt]: cutoff };
  }

  // Find all active/completed bookings for this hotel within the cycle
  const allBookings = await Booking.findAll({
    where: baseWhere,
    attributes: ['id', 'groupBookingId', 'createdAt', 'invoiceNumber'],
    order: [['createdAt', 'ASC'], ['id', 'ASC']]
  });

  // Group bookings by unique invoice group (groupBookingId or single id) in chronological order
  const uniqueGroups = [];
  const groupMap = new Map();

  for (const b of allBookings) {
    const groupKey = b.groupBookingId || `single-${b.id}`;
    if (!groupMap.has(groupKey)) {
      const groupItem = {
        key: groupKey,
        groupBookingId: b.groupBookingId,
        bookings: [b],
        assignedSeq: 0
      };
      groupMap.set(groupKey, groupItem);
      uniqueGroups.push(groupItem);
    } else {
      groupMap.get(groupKey).bookings.push(b);
    }
  }

  // Target booking key
  const targetGroupKey = (booking && booking.groupBookingId) 
    ? booking.groupBookingId 
    : (booking && booking.id ? `single-${booking.id}` : null);

  let currentSeq = 0;
  let maxDigitLength = 3;

  for (const item of uniqueGroups) {
    const explicitBooking = item.bookings.find(b => b.invoiceNumber);
    if (explicitBooking) {
      const matches = String(explicitBooking.invoiceNumber).match(/\d+/g);
      if (matches) {
        const numStr = matches[matches.length - 1];
        const num = parseInt(numStr, 10);
        if (!isNaN(num)) {
          currentSeq = Math.max(currentSeq, num);
          if (numStr.length > maxDigitLength) {
            maxDigitLength = numStr.length;
          }
        }
      }
      item.assignedSeq = currentSeq;
    } else {
      currentSeq += 1;
      item.assignedSeq = currentSeq;
    }
  }

  // Find assigned sequence for target booking
  let targetSeq = currentSeq;
  if (targetGroupKey && groupMap.has(targetGroupKey)) {
    targetSeq = groupMap.get(targetGroupKey).assignedSeq;
  } else if (booking) {
    // New booking not yet in allBookings
    targetSeq = currentSeq + 1;
  }

  return String(targetSeq).padStart(maxDigitLength, '0');
};

module.exports = {
  getBookingSerialNumber
};
