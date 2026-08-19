const { Op, fn, col } = require('sequelize');
const ActivityLog = require('../models/ActivityLog');
const User = require('../models/User');
const { sseEmitter } = require('../utils/activityLogger');

/**
 * Get Paginated, Filtered, and Searchable Activity Logs
 */
exports.getActivityLogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      startDate,
      endDate,
      hotelId,
      userId,
      role,
      moduleName,
      action,
      status,
      device,
      browser,
      ipAddress,
      sortBy = 'id',
      sortOrder = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;

    // Scope criteria depending on User Role
    const whereClause = {};

    if (req.user.role === 'superadmin') {
      if (hotelId) {
        whereClause.hotelId = hotelId;
      }
    } else if (req.user.role === 'admin') {
      whereClause.hotelId = req.user.hotelId;
    } else {
      // Normal staff roles (receptionist, housekeepers, etc.) can only view their own logs
      whereClause.hotelId = req.user.hotelId;
      whereClause.performedByUserId = req.user.id;
    }

    // Date filters
    if (startDate && endDate) {
      whereClause.date = {
        [Op.between]: [startDate, endDate]
      };
    } else if (startDate) {
      whereClause.date = {
        [Op.gte]: startDate
      };
    } else if (endDate) {
      whereClause.date = {
        [Op.lte]: endDate
      };
    }

    // Direct match filters
    if (userId) whereClause.performedByUserId = userId;
    if (role) whereClause.performedByRole = role;
    if (moduleName) whereClause.moduleName = moduleName;
    if (action) whereClause.action = action;
    if (status) whereClause.status = status;
    if (device) whereClause.device = device;
    if (browser) whereClause.browser = browser;
    if (ipAddress) whereClause.ipAddress = ipAddress;

    // Search query
    if (search) {
      whereClause[Op.or] = [
        { performedByName: { [Op.like]: `%${search}%` } },
        { performedByRole: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } },
        { moduleName: { [Op.like]: `%${search}%` } },
        { action: { [Op.like]: `%${search}%` } },
        { entityName: { [Op.like]: `%${search}%` } },
        { entityId: { [Op.like]: `%${search}%` } },
        { ipAddress: { [Op.like]: `%${search}%` } }
      ];
    }

    const { count, rows } = await ActivityLog.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [[sortBy, sortOrder]]
    });

    res.json({
      success: true,
      data: rows,
      meta: {
        totalItems: count,
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / limit),
        limit: parseInt(limit)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Get Activity Logs dashboard metrics and charts
 */
exports.getActivitySummary = async (req, res) => {
  try {
    const whereClause = {};

    if (req.user.role === 'superadmin') {
      if (req.query.hotelId) {
        whereClause.hotelId = req.query.hotelId;
      }
    } else if (req.user.role === 'admin') {
      whereClause.hotelId = req.user.hotelId;
    } else {
      whereClause.hotelId = req.user.hotelId;
      whereClause.performedByUserId = req.user.id;
    }

    const today = new Date().toLocaleDateString('en-GB').split('/').reverse().join('-'); // YYYY-MM-DD

    // 1. Total count
    const totalLogs = await ActivityLog.count({ where: whereClause });

    // 2. Today's count
    const todayLogs = await ActivityLog.count({
      where: { ...whereClause, date: today }
    });

    // 3. Successful actions
    const successLogs = await ActivityLog.count({
      where: { ...whereClause, success: true }
    });

    // 4. Failed actions
    const failedLogs = await ActivityLog.count({
      where: { ...whereClause, success: false }
    });

    // 5. Most Active User
    const mostActiveUserResult = await ActivityLog.findAll({
      where: whereClause,
      attributes: ['performedByUserId', 'performedByName', 'performedByRole', [fn('COUNT', col('id')), 'logCount']],
      group: ['performedByUserId', 'performedByName', 'performedByRole'],
      order: [[col('logCount'), 'DESC']],
      limit: 1,
      raw: true
    });
    const mostActiveUser = mostActiveUserResult[0] || null;

    // 6. Most Active Module
    const mostActiveModuleResult = await ActivityLog.findAll({
      where: whereClause,
      attributes: ['moduleName', [fn('COUNT', col('id')), 'logCount']],
      group: ['moduleName'],
      order: [[col('logCount'), 'DESC']],
      limit: 1,
      raw: true
    });
    const mostActiveModule = mostActiveModuleResult[0] || null;

    // 7. Recharts Timeline: Log counts by date for the last 14 days
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const dateLimitStr = fourteenDaysAgo.toLocaleDateString('en-GB').split('/').reverse().join('-');

    const timelineRaw = await ActivityLog.findAll({
      where: {
        ...whereClause,
        date: { [Op.gte]: dateLimitStr }
      },
      attributes: ['date', [fn('COUNT', col('id')), 'count']],
      group: ['date'],
      order: [['date', 'ASC']],
      raw: true
    });

    res.json({
      success: true,
      data: {
        stats: {
          totalLogs,
          todayLogs,
          successLogs,
          failedLogs,
          mostActiveUser,
          mostActiveModule
        },
        timeline: timelineRaw
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Server-Sent Events (SSE) stream endpoint for live logs
 */
exports.streamActivityLogs = (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders(); // Establish connection immediately

  const listener = (log) => {
    // Check scoping: Superadmin gets all logs, otherwise check matching hotelId
    if (req.user.role === 'superadmin' || String(log.hotelId) === String(req.user.hotelId)) {
      res.write(`data: ${JSON.stringify(log)}\n\n`);
    }
  };

  // Register listener to the logger emitter
  sseEmitter.on('new-log', listener);

  // Close connections cleanly when user leaves page
  req.on('close', () => {
    sseEmitter.off('new-log', listener);
    res.end();
  });
};

/**
 * Data retention cleanup of logs
 */
exports.cleanupLogs = async (req, res) => {
  try {
    const { retentionDays } = req.body;

    if (!retentionDays || isNaN(retentionDays)) {
      return res.status(400).json({ success: false, message: 'Please provide valid retentionDays' });
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(retentionDays));
    const cutoffStr = cutoffDate.toLocaleDateString('en-GB').split('/').reverse().join('-');

    const whereClause = {
      date: { [Op.lt]: cutoffStr }
    };

    // Scoping deletion permissions
    if (req.user.role !== 'superadmin') {
      whereClause.hotelId = req.user.hotelId;
    }

    const deletedCount = await ActivityLog.destroy({ where: whereClause });

    res.json({
      success: true,
      message: `Successfully purged ${deletedCount} legacy logs older than ${retentionDays} days.`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
