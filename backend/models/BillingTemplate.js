const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const BillingTemplate = sequelize.define('BillingTemplate', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  layout: {
    type: DataTypes.TEXT, // Will store JSON array e.g. ["HEADER", "HOTEL_INFO", "GUEST_INFO", "ROOM_DETAILS", "GST_BREAKUP", "TOTAL_PAYMENT", "FOOTER"]
    allowNull: false
  },
  style: {
    type: DataTypes.TEXT, // Will store JSON styling objects
    allowNull: false
  }
}, {
  timestamps: true
});

module.exports = BillingTemplate;
