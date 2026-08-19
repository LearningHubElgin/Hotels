const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ActivityLog = sequelize.define('ActivityLog', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  hotelId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'Hotels',
      key: 'id'
    }
  },
  branchId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  moduleName: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  action: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  entityType: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  entityId: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  entityName: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  oldValue: {
    type: DataTypes.JSON,
    allowNull: true
  },
  newValue: {
    type: DataTypes.JSON,
    allowNull: true
  },
  changedFields: {
    type: DataTypes.JSON,
    allowNull: true
  },
  performedByUserId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  performedByName: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  performedByRole: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  time: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  timezone: {
    type: DataTypes.STRING(50),
    defaultValue: 'Asia/Kolkata'
  },
  ipAddress: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  device: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  browser: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  operatingSystem: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  requestMethod: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  requestURL: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  status: {
    type: DataTypes.STRING(50),
    defaultValue: 'success'
  },
  success: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  failureReason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  sessionId: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  latitude: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  longitude: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  city: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  country: {
    type: DataTypes.STRING(100),
    allowNull: true
  }
}, {
  timestamps: true,
  indexes: [
    { fields: ['date'] },
    { fields: ['hotelId'] },
    { fields: ['performedByUserId'] },
    { fields: ['moduleName'] },
    { fields: ['action'] }
  ]
});

module.exports = ActivityLog;
