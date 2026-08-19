const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Kot = sequelize.define('Kot', {
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
    },
    unique: 'kot_hotel_unique'
  },
  kotNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: 'kot_hotel_unique'
  },
  bookingId: {
    type: DataTypes.INTEGER,
    allowNull: true,
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
  items: {
    type: DataTypes.JSON,
    allowNull: false
  },
  subtotal: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  cgst: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  sgst: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  serviceCharge: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  grandTotal: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('Pending', 'In Progress', 'Served', 'Cancelled'),
    defaultValue: 'Pending'
  },
  billingStatus: {
    type: DataTypes.ENUM('Unbilled', 'Billed'),
    defaultValue: 'Unbilled'
  },
  paymentMode: {
    type: DataTypes.ENUM('Room Charge', 'Cash', 'UPI', 'Card'),
    defaultValue: 'Room Charge'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },

}, {
  timestamps: true
});

module.exports = Kot;
