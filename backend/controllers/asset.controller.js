const Asset = require('../models/Asset');
const AssetLog = require('../models/AssetLog');
const { Op } = require('sequelize');
const { logActivity } = require('../utils/activityLogger');

// @desc    Get all assets
// @route   GET /api/assets
// @access  Private
exports.getAssets = async (req, res, next) => {
  try {
    const hotelId = req.user.hotelId;
    const { search, category, status, location } = req.query;

    const whereClause = { hotelId };

    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { assetId: { [Op.like]: `%${search}%` } },
        { brand: { [Op.like]: `%${search}%` } }
      ];
    }

    if (category) {
      whereClause.category = category;
    }

    if (status) {
      whereClause.status = status;
    }

    if (location) {
      whereClause.location = location;
    }

    const assets = await Asset.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({
      success: true,
      count: assets.length,
      data: assets
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single asset
// @route   GET /api/assets/:id
// @access  Private
exports.getAsset = async (req, res, next) => {
  try {
    const hotelId = req.user.hotelId;
    const asset = await Asset.findOne({
      where: { id: req.params.id, hotelId },
      include: [{
        model: AssetLog,
        as: 'AssetLogs',
        order: [['date', 'DESC'], ['createdAt', 'DESC']]
      }]
    });

    if (!asset) {
      res.status(404);
      throw new Error('Asset not found');
    }

    res.status(200).json({
      success: true,
      data: asset
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new asset
// @route   POST /api/assets
// @access  Private
exports.createAsset = async (req, res, next) => {
  try {
    const hotelId = req.user.hotelId;
    const { name, category, brand, serialNumber, purchaseDate, purchasePrice, location, status, notes } = req.body;

    // Generate custom assetId (e.g. AST-001)
    const count = await Asset.count({ where: { hotelId } });
    const assetId = `AST-${String(count + 1).padStart(3, '0')}`;

    const asset = await Asset.create({
      assetId,
      name,
      category,
      brand,
      serialNumber,
      purchaseDate,
      purchasePrice,
      location,
      status: status || 'Active',
      notes,
      hotelId
    });

    await logActivity({
      req,
      hotelId: req.user.hotelId,
      moduleName: 'Inventory',
      action: 'Asset Added',
      entityType: 'Asset',
      entityId: asset.id,
      entityName: asset.name,
      description: `Asset item '${asset.name}' (ID: ${asset.assetId}) was added by ${req.user.username}.`,
      newValue: asset
    });

    res.status(201).json({
      success: true,
      data: asset
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update asset
// @route   PUT /api/assets/:id
// @access  Private
exports.updateAsset = async (req, res, next) => {
  try {
    const hotelId = req.user.hotelId;
    let asset = await Asset.findOne({ where: { id: req.params.id, hotelId } });

    if (!asset) {
      res.status(404);
      throw new Error('Asset not found');
    }

    const oldAssetData = asset.toJSON();
    asset = await asset.update(req.body);

    await logActivity({
      req,
      hotelId: req.user.hotelId,
      moduleName: 'Inventory',
      action: 'Asset Updated',
      entityType: 'Asset',
      entityId: asset.id,
      entityName: asset.name,
      description: `Asset item '${asset.name}' details were updated by ${req.user.username}.`,
      oldValue: oldAssetData,
      newValue: asset
    });

    res.status(200).json({
      success: true,
      data: asset
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete asset
// @route   DELETE /api/assets/:id
// @access  Private
exports.deleteAsset = async (req, res, next) => {
  try {
    const hotelId = req.user.hotelId;
    const asset = await Asset.findOne({ where: { id: req.params.id, hotelId } });

    if (!asset) {
      res.status(404);
      throw new Error('Asset not found');
    }

    const deletedAssetData = asset.toJSON();
    await asset.destroy();

    await logActivity({
      req,
      hotelId: req.user.hotelId,
      moduleName: 'Inventory',
      action: 'Asset Deleted',
      entityType: 'Asset',
      entityId: asset.id,
      entityName: asset.name,
      description: `Asset item '${asset.name}' (ID: ${asset.assetId}) was deleted by ${req.user.username}.`,
      oldValue: deletedAssetData
    });

    res.status(200).json({
      success: true,
      message: 'Asset removed successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all asset logs
// @route   GET /api/assets/logs
// @access  Private
exports.getAssetLogs = async (req, res, next) => {
  try {
    const hotelId = req.user.hotelId;
    const { status } = req.query;

    const whereClause = { hotelId };
    if (status) {
      whereClause.status = status;
    }

    const logs = await AssetLog.findAll({
      where: whereClause,
      include: [{
        model: Asset,
        attributes: ['id', 'assetId', 'name', 'location', 'status']
      }],
      order: [['date', 'DESC'], ['createdAt', 'DESC']]
    });

    res.status(200).json({
      success: true,
      count: logs.length,
      data: logs
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create asset log
// @route   POST /api/assets/logs
// @access  Private
exports.createAssetLog = async (req, res, next) => {
  try {
    const hotelId = req.user.hotelId;
    const { assetId, issue, date, status, cost, remarks, updateAssetStatus } = req.body;

    const asset = await Asset.findOne({ where: { id: assetId, hotelId } });
    if (!asset) {
      res.status(404);
      throw new Error('Asset not found');
    }

    const log = await AssetLog.create({
      assetId,
      issue,
      date,
      status: status || 'Pending',
      cost: cost || 0.00,
      remarks,
      hotelId
    });

    // Update parent asset status if requested
    if (updateAssetStatus) {
      await asset.update({ status: updateAssetStatus });
    } else if (status === 'Completed') {
      // If completed immediately, reset to Active
      await asset.update({ status: 'Active' });
    }

    await logActivity({
      req,
      hotelId: req.user.hotelId,
      moduleName: 'Housekeeping',
      action: 'Task Created',
      entityType: 'AssetLog',
      entityId: log.id,
      entityName: asset.name,
      description: `Maintenance issue reported for asset '${asset.name}': '${issue}'.`,
      newValue: log
    });

    res.status(201).json({
      success: true,
      data: log
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update asset log
// @route   PUT /api/assets/logs/:id
// @access  Private
exports.updateAssetLog = async (req, res, next) => {
  try {
    const hotelId = req.user.hotelId;
    let log = await AssetLog.findOne({
      where: { id: req.params.id, hotelId },
      include: [Asset]
    });

    if (!log) {
      res.status(404);
      throw new Error('Asset log not found');
    }

    const oldLogData = log.toJSON();
    log = await log.update(req.body);

    // If log is completed, reset the parent asset's status back to Active
    if (req.body.status === 'Completed' && log.Asset) {
      await log.Asset.update({ status: 'Active' });
    }

    await logActivity({
      req,
      hotelId: req.user.hotelId,
      moduleName: 'Housekeeping',
      action: req.body.status === 'Completed' ? 'Task Completed' : 'Task Assigned',
      entityType: 'AssetLog',
      entityId: log.id,
      entityName: log.Asset ? log.Asset.name : 'Asset',
      description: `Asset maintenance log status changed to '${req.body.status || log.status}'.`,
      oldValue: oldLogData,
      newValue: log
    });

    res.status(200).json({
      success: true,
      data: log
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete asset log
// @route   DELETE /api/assets/logs/:id
// @access  Private
exports.deleteAssetLog = async (req, res, next) => {
  try {
    const hotelId = req.user.hotelId;
    const log = await AssetLog.findOne({ where: { id: req.params.id, hotelId } });

    if (!log) {
      res.status(404);
      throw new Error('Asset log not found');
    }

    await log.destroy();

    res.status(200).json({
      success: true,
      message: 'Asset log removed successfully'
    });
  } catch (error) {
    next(error);
  }
};
