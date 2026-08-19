const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const FoodItem = sequelize.define('FoodItem', {
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
    unique: 'fooditem_hotel_unique'
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: 'fooditem_hotel_unique'
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  category: {
    type: DataTypes.STRING,
    allowNull: false
  },
  isAvailable: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },

}, {
  timestamps: true
});

module.exports = FoodItem;
