const express = require('express');
const {
  createKot,
  getAllKots,
  getKotById,
  updateKot,
  updateKotStatus,
  updateKotBilling,
  deleteKot,
  getKotsByBooking
} = require('../controllers/kot.controller');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.post('/', createKot);
router.get('/', getAllKots);
router.get('/:id', getKotById);
router.put('/:id', updateKot);
router.put('/:id/status', updateKotStatus);
router.put('/:id/billing', updateKotBilling);
router.delete('/:id', deleteKot);
router.get('/booking/:bookingId', getKotsByBooking);

module.exports = router;
