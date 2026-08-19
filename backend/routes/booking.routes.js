const express = require('express');
const { 
  createBooking, 
  getRoomBooking, 
  checkOut,
  getActiveBookings,
  checkIn,
  updateBooking,
  getGuestHistory,
  getGuestByPhone,
  getBookingById,
  deleteBooking
} = require('../controllers/booking.controller');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.post('/', createBooking);
router.get('/active', getActiveBookings);
router.get('/history', getGuestHistory);
router.get('/guest/:phone', getGuestByPhone);
router.get('/room/:roomId', getRoomBooking);
router.get('/:id', getBookingById);
router.put('/:id/checkout', checkOut);
router.put('/:id/checkin', checkIn);
router.put('/:id', updateBooking);
router.delete('/:id', deleteBooking);

module.exports = router;
