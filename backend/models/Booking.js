const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Booking = sequelize.define('Booking', {
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
  guestName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  fatherName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: false
  },
  gender: {
    type: DataTypes.STRING,
    allowNull: true
  },
  age: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  nationality: {
    type: DataTypes.ENUM('Indian', 'Foreign'),
    defaultValue: 'Indian'
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  bookingType: {
    type: DataTypes.STRING,
    defaultValue: 'Walk-in'
  },
  numberOfGuests: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  idType: {
    type: DataTypes.STRING,
    defaultValue: 'Aadhar Card'
  },
  idProof: {
    type: DataTypes.STRING,
    allowNull: false
  },
  aadhaarFront: {
    type: DataTypes.TEXT('long'),
    allowNull: true
  },
  aadhaarBack: {
    type: DataTypes.TEXT('long'),
    allowNull: true
  },
  originalAadhaarFront: {
    type: DataTypes.TEXT('long'),
    allowNull: true
  },
  originalAadhaarBack: {
    type: DataTypes.TEXT('long'),
    allowNull: true
  },
  signature: {
    type: DataTypes.TEXT('long'),
    allowNull: true
  },
  guestPhoto: {
    type: DataTypes.TEXT('long'),
    allowNull: true
  },
  originalGuestPhoto: {
    type: DataTypes.TEXT('long'),
    allowNull: true
  },
  passportNumber: {
    type: DataTypes.STRING,
    allowNull: true
  },
  passportExpiry: {
    type: DataTypes.STRING,
    allowNull: true
  },
  visaNumber: {
    type: DataTypes.STRING,
    allowNull: true
  },
  visaType: {
    type: DataTypes.STRING,
    allowNull: true
  },
  visaExpiry: {
    type: DataTypes.STRING,
    allowNull: true
  },
  country: {
    type: DataTypes.STRING,
    allowNull: true
  },
  arrivalFrom: {
    type: DataTypes.STRING,
    allowNull: true
  },
  nextDestination: {
    type: DataTypes.STRING,
    allowNull: true
  },
  purposeOfVisit: {
    type: DataTypes.STRING,
    allowNull: true
  },
  checkInDate: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  checkOutDate: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  totalAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  amountPaid: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  paymentStatus: {
    type: DataTypes.ENUM('Pending', 'Partial', 'Paid'),
    defaultValue: 'Pending'
  },
  status: {
    type: DataTypes.ENUM('Active', 'Confirmed', 'Completed', 'Cancelled'),
    defaultValue: 'Active'
  },
  roomId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Rooms',
      key: 'id'
    }
  },
  groupBookingId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  guestGst: {
    type: DataTypes.STRING,
    allowNull: true
  },
  companyName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  companyAddress: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  hsnCode: {
    type: DataTypes.STRING,
    defaultValue: '996311'
  },
  gstRate: {
    type: DataTypes.INTEGER,
    defaultValue: 12
  },
  gstOption: {
    type: DataTypes.STRING,
    defaultValue: 'exclusive'
  },
  discount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  discountReason: {
    type: DataTypes.STRING,
    allowNull: true
  },
  paymentMode: {
    type: DataTypes.STRING,
    defaultValue: 'Cash'
  },
  paymentBank: {
    type: DataTypes.STRING,
    allowNull: true
  },
  invoiceNumber: {
    type: DataTypes.STRING,
    allowNull: true
  },
  registrationNumber: {
    type: DataTypes.STRING,
    allowNull: true
  },
  checkInTime: {
    type: DataTypes.STRING,
    allowNull: true
  },
  bookingDate: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  bookingTime: {
    type: DataTypes.STRING,
    allowNull: true
  },
  checkOutTime: {
    type: DataTypes.STRING,
    allowNull: true
  },
  previousRoomId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'Rooms',
      key: 'id'
    }
  },
  previousRoomNumber: {
    type: DataTypes.STRING,
    allowNull: true
  },
  previousRoomRate: {
    type: DataTypes.STRING,
    allowNull: true
  },
  previousRoomType: {
    type: DataTypes.STRING,
    allowNull: true
  },
  shiftDate: {
    type: DataTypes.STRING,
    allowNull: true
  },
  shiftTime: {
    type: DataTypes.STRING,
    allowNull: true
  },
  sameDayChargeOption: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'no_charge'
  },
  paymentHistory: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  extraGuests: {
    type: DataTypes.TEXT('long'),
    allowNull: true
  },
  isChild: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  earlyCheckInCharge: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  chargePreviousDay: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  earlyCheckInType: {
    type: DataTypes.STRING,
    defaultValue: 'full_day'
  },
  pricePerNight: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  }
}, {
  timestamps: true,
  indexes: [
    { fields: ['hotelId', 'status', 'createdAt'] },
    { fields: ['hotelId', 'checkInDate'] },
    { fields: ['hotelId', 'checkOutDate'] },
    { fields: ['groupBookingId'] },
    { fields: ['guestName'] },
    { fields: ['phone'] }
  ]
});

module.exports = Booking;
