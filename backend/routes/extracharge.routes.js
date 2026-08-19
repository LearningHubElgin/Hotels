const express = require('express');
const {
  createExtraCharge,
  getAllExtraCharges,
  getExtraChargesByBooking,
  updateExtraCharge,
  deleteExtraCharge
} = require('../controllers/extracharge.controller');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.post('/', createExtraCharge);
router.get('/', getAllExtraCharges);
router.get('/booking/:bookingId', getExtraChargesByBooking);
router.put('/:id', updateExtraCharge);
router.delete('/:id', deleteExtraCharge);

module.exports = router;
