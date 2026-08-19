const express = require('express');
const { 
  getBillingSummary, 
  getDashboardStats, 
  getAvailabilityData, 
  getSuperAdminDashboardStats,
  getTransactions,
  getBalanceSheet
} = require('../controllers/analytics.controller');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.get('/billing', getBillingSummary);
router.get('/dashboard', getDashboardStats);
router.get('/availability', getAvailabilityData);
router.get('/superadmin/dashboard', getSuperAdminDashboardStats);
router.get('/transactions', getTransactions);
router.get('/balance-sheet', getBalanceSheet);

module.exports = router;
