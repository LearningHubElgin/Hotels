const express = require('express');
const { 
  getHotels, 
  createHotel, 
  updateHotel, 
  createUserForHotel, 
  getHotelUsers,
  getHotelById,
  updateHotelUser,
  deleteHotelUser
} = require('../controllers/hotel.controller');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.route('/')
  .get(authorize('superadmin'), getHotels)
  .post(authorize('superadmin'), createHotel);

router.route('/:id')
  .get(getHotelById)
  .put(updateHotel);

router.route('/:id/users')
  .get(getHotelUsers)
  .post(authorize('superadmin'), createUserForHotel);

router.route('/:id/users/:userId')
  .put(authorize('superadmin'), updateHotelUser)
  .delete(authorize('superadmin'), deleteHotelUser);

module.exports = router;
