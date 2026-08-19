const express = require('express');
const {
  getAssets,
  getAsset,
  createAsset,
  updateAsset,
  deleteAsset,
  getAssetLogs,
  createAssetLog,
  updateAssetLog,
  deleteAssetLog
} = require('../controllers/asset.controller');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.route('/')
  .get(getAssets)
  .post(createAsset);

router.route('/logs')
  .get(getAssetLogs)
  .post(createAssetLog);

router.route('/logs/:id')
  .put(updateAssetLog)
  .delete(deleteAssetLog);

router.route('/:id')
  .get(getAsset)
  .put(updateAsset)
  .delete(deleteAsset);

module.exports = router;
