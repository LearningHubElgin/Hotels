const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ExtraCharge = sequelize.define('ExtraCharge', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  hotelId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Hotels',
      key: 'id'
    }
  },
  bookingId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Bookings',
      key: 'id'
    }
  },
  roomNumber: {
    type: DataTypes.STRING,
    allowNull: false
  },
  guestName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  serviceName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  qty: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  subtotal: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  gstOption: {
    type: DataTypes.STRING,
    defaultValue: 'none' // 'none', 'inclusive', 'exclusive'
  },
  gstRate: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  gstAmount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  grandTotal: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  timestamps: true
});

module.exports = ExtraCharge;
