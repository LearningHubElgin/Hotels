const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Hotel = sequelize.define('Hotel', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true
  },
  logoUrl: {
    type: DataTypes.TEXT('long'), // Allow base64 or long image strings
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('Active', 'Inactive'),
    defaultValue: 'Active'
  },
  gstin: {
    type: DataTypes.STRING,
    allowNull: true
  },
  city: {
    type: DataTypes.STRING,
    allowNull: true
  },
  state: {
    type: DataTypes.STRING,
    allowNull: true
  },
  hotelType: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'Hotel'
  },
  hasKot: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  hasAccounts: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  hasAssets: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  hasActivityLogs: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  hasOpeningBalance: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  openingCashBalance: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  openingBankBalance: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  bankOpeningBalances: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  lockOpeningBalance: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  hasRoomType: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  allowRoomAdd: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  allowRoomDelete: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  defaultGstRate: {
    type: DataTypes.INTEGER,
    defaultValue: 12,
    allowNull: false
  },
  defaultGstOption: {
    type: DataTypes.STRING,
    defaultValue: 'none',
    allowNull: false
  },
  defaultHsnCode: {
    type: DataTypes.STRING,
    defaultValue: '996311',
    allowNull: false
  },
  billingTemplateId: {
    type: DataTypes.STRING,
    defaultValue: 'template_1',
    allowNull: true
  },
  allowHotelEdit: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  allowBillingEdit: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  allowPaymentEdit: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  allowEditOldPayments: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  enableRegistrationNumber: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  enablePaymentSerialNumber: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  checkoutTime: {
    type: DataTypes.STRING,
    defaultValue: '11:00 AM',
    allowNull: false
  },
  invoicePrefix: {
    type: DataTypes.STRING,
    defaultValue: 'INV-',
    allowNull: true
  },
  since: {
    type: DataTypes.STRING,
    allowNull: true
  },
  bookingPlatforms: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  onlinePaymentBanks: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  restrictBackDates: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  resetInvoiceYearly: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  yearEndingDate: {
    type: DataTypes.STRING,
    defaultValue: '03-31'
  },
  enablePerGuestRoomAssignment: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  enableAutoExtendCheckout: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  autoExtendCutoffTime: {
    type: DataTypes.STRING,
    defaultValue: '11:30 AM',
    allowNull: true
  },
  lockPastStayCharges: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  roomCardColors: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  timestamps: true
});

module.exports = Hotel;
