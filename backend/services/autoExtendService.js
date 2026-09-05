const { Op } = require('sequelize');
const Hotel = require('../models/Hotel');
const Booking = require('../models/Booking');
const Room = require('../models/Room');

// Ensure associations are initialized
if (!Booking.associations || !Booking.associations.Room) {
  Booking.belongsTo(Room, { foreignKey: 'roomId' });
}

const parseTimeToMinutes = (timeStr) => {
  if (!timeStr) return 11 * 60 + 30; // 11:30 AM default
  let clean = String(timeStr).trim().toUpperCase();
  const isPM = clean.includes('PM');
  const isAM = clean.includes('AM');
  clean = clean.replace(/AM|PM/gi, '').trim();
  const parts = clean.split(':');
  let hours = parseInt(parts[0], 10) || 0;
  let minutes = parseInt(parts[1], 10) || 0;
  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;
  return hours * 60 + minutes;
};

const getTodayISTString = () => {
  const d = new Date();
  const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
  const istDate = new Date(utc + (3600000 * 5.5));
  const yyyy = istDate.getFullYear();
  const mm = String(istDate.getMonth() + 1).padStart(2, '0');
  const dd = String(istDate.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const getCurrentISTMinutes = () => {
  const d = new Date();
  const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
  const istDate = new Date(utc + (3600000 * 5.5));
  return istDate.getHours() * 60 + istDate.getMinutes();
};

const getDaysBetween = (startDateStr, endDateStr) => {
  if (!startDateStr || !endDateStr) return 1;
  const start = new Date(startDateStr.split('T')[0] + 'T00:00:00Z');
  const end = new Date(endDateStr.split('T')[0] + 'T00:00:00Z');
  const diffMs = end - start;
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return days > 0 ? days : 1;
};

const getNextDayString = (dateStr) => {
  if (!dateStr) return getTodayISTString();
  const plain = dateStr.split('T')[0];
  const d = new Date(plain + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

let lastAutoExtendCheck = 0;

const processAutoExtendOverdueCheckouts = async (force = false) => {
  try {
    const now = Date.now();
    if (!force && (now - lastAutoExtendCheck < 5 * 60 * 1000)) {
      return; // Run at most once every 5 minutes
    }
    lastAutoExtendCheck = now;

    if (!Booking.associations || !Booking.associations.Room) {
      Booking.belongsTo(Room, { foreignKey: 'roomId' });
    }

    const allHotels = await Hotel.findAll();
    const isTruthy = (v) => v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
    const hotels = allHotels.filter(h => isTruthy(h.enableAutoExtendCheckout));

    if (!hotels || hotels.length === 0) return;

    const todayStr = getTodayISTString();
    const currentMinutes = getCurrentISTMinutes();

    for (const hotel of hotels) {
      const cutoffMinutes = parseTimeToMinutes(hotel.autoExtendCutoffTime);

      // Only process if current time in IST is past the hotel's autoExtendCutoffTime
      if (currentMinutes >= cutoffMinutes) {
        const overdueBookings = await Booking.findAll({
          where: {
            hotelId: hotel.id,
            status: 'Active',
            checkOutDate: {
              [Op.lte]: todayStr
            }
          },
          include: [
            { model: Room }
          ]
        });

        for (const booking of overdueBookings) {
          const currentNights = getDaysBetween(booking.checkInDate, booking.checkOutDate);
          const currentTotalAmount = Number(booking.totalAmount || 0);
          const newNights = currentNights + 1;

          const roomNightRate = Number(
            (booking.pricePerNight !== undefined && booking.pricePerNight !== null && Number(booking.pricePerNight) > 0)
              ? booking.pricePerNight
              : (booking.Room?.pricePerNight || 0)
          );
          const perNightRate = roomNightRate > 0
            ? roomNightRate
            : (currentNights > 0 ? (currentTotalAmount / currentNights) : 0);

          const nextCheckOutDate = getNextDayString(booking.checkOutDate);
          const updatedTotal = Math.round((currentTotalAmount + perNightRate) * 100) / 100;

          await booking.update({
            checkOutDate: nextCheckOutDate,
            totalAmount: updatedTotal.toFixed(2)
          });

          console.log(`[Auto-Extend Service] [${hotel.name}] Booking #${booking.id} (${booking.guestName}, Room: ${booking.Room?.roomNumber || booking.roomId}) auto-extended to ${nextCheckOutDate}. New Base Total: ₹${updatedTotal.toFixed(2)} (${newNights} nights).`.green);
        }
      }
    }
  } catch (error) {
    console.error('[Auto-Extend Service] Error processing overdue stays:', error.message);
  }
};

const startAutoExtendScheduler = () => {
  console.log('[Auto-Extend Service] Background stay extension scheduler initialized.'.cyan);
  // Run once on startup after 2s
  setTimeout(processAutoExtendOverdueCheckouts, 2000);
  // Run every 30 seconds
  setInterval(processAutoExtendOverdueCheckouts, 30 * 1000);
};

module.exports = {
  processAutoExtendOverdueCheckouts,
  startAutoExtendScheduler
};
