const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Room = sequelize.define('Room', {
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
    unique: 'room_hotel_unique'
  },
  roomNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: 'room_hotel_unique'
  },
  type: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'Deluxe Room'
  },
  floor: {
    type: DataTypes.STRING,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('available', 'occupied', 'maintenance', 'cleaning'),
    defaultValue: 'available'
  },
  pricePerNight: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  guestName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  isDeleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false
  }
}, {
  timestamps: true
});

module.exports = Room;
