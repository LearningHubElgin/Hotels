const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getActivityLogs,
  getActivitySummary,
  streamActivityLogs,
  cleanupLogs
} = require('../controllers/activityLog.controller');

// All activity logs routes are protected
router.use(protect);

router.get('/', getActivityLogs);
router.get('/summary', getActivitySummary);
router.get('/stream', streamActivityLogs);
router.post('/cleanup', authorize('superadmin', 'admin'), cleanupLogs);

module.exports = router;
