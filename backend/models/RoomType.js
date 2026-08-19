const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const RoomType = sequelize.define('RoomType', {
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
    },
    unique: 'roomtype_hotel_unique'
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: 'roomtype_hotel_unique'
  }
  
}, {
  timestamps: true
});

module.exports = RoomType;
