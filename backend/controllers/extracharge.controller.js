const ExtraCharge = require('../models/ExtraCharge');
const Booking = require('../models/Booking');
const Room = require('../models/Room');
const { Op } = require('sequelize');

// @desc    Create new extra service charge
// @route   POST /api/extra-charges
// @access  Private
exports.createExtraCharge = async (req, res, next) => {
  try {
    const { roomNumber, guestName, bookingId, serviceName, qty, price, gstOption, gstRate, notes } = req.body;

    if (!roomNumber || !guestName || !serviceName || !price) {
      res.status(400);
      throw new Error('Please provide room number, guest name, service/item name, and price');
    }

    const itemQty = parseInt(qty) || 1;
    const itemPrice = parseFloat(price) || 0;
    const subtotal = parseFloat((itemQty * itemPrice).toFixed(2));
    const targetGstOption = gstOption || 'none'; // 'none', 'inclusive', 'exclusive'
    const targetGstRate = gstRate !== undefined ? parseFloat(gstRate) : 0;

    let gstAmount = 0;
    let grandTotal = 0;

    if (targetGstOption === 'none') {
      gstAmount = 0;
      grandTotal = subtotal;
    } else if (targetGstOption === 'inclusive') {
      const basePrice = subtotal / (1 + (targetGstRate / 100));
      gstAmount = parseFloat((subtotal - basePrice).toFixed(2));
      grandTotal = subtotal;
    } else { // 'exclusive'
      gstAmount = parseFloat((subtotal * (targetGstRate / 100)).toFixed(2));
      grandTotal = parseFloat((subtotal + gstAmount).toFixed(2));
    }

    // Resolve bookingId if not provided
    let resolvedBookingId = bookingId;
    if (!resolvedBookingId) {
      const activeBooking = await Booking.findOne({
        where: { status: 'Active', hotelId: req.user.hotelId },
        include: [{
          model: Room,
          where: { roomNumber: roomNumber, hotelId: req.user.hotelId }
        }]
      });
      if (activeBooking) {
        resolvedBookingId = activeBooking.id;
      }
    }

    if (!resolvedBookingId) {
      res.status(400);
      throw new Error(`No active booking found for Room ${roomNumber}`);
    }

    const newCharge = await ExtraCharge.create({
      hotelId: req.user.hotelId,
      bookingId: resolvedBookingId,
      roomNumber,
      guestName,
      serviceName,
      qty: itemQty,
      price: itemPrice,
      subtotal,
      gstOption: targetGstOption,
      gstRate: targetGstRate,
      gstAmount,
      grandTotal,
      notes: notes || ''
    });

    res.status(201).json({
      success: true,
      data: newCharge
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all extra charges for the hotel
// @route   GET /api/extra-charges
// @access  Private
exports.getAllExtraCharges = async (req, res, next) => {
  try {
    const charges = await ExtraCharge.findAll({
      where: { hotelId: req.user.hotelId },
      include: [{ model: Booking, attributes: ['status'] }],
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({
      success: true,
      data: charges
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all extra charges for a specific booking
// @route   GET /api/extra-charges/booking/:bookingId
// @access  Private
exports.getExtraChargesByBooking = async (req, res, next) => {
  try {
    const charges = await ExtraCharge.findAll({
      where: { bookingId: req.params.bookingId, hotelId: req.user.hotelId },
      order: [['createdAt', 'ASC']]
    });

    res.status(200).json({
      success: true,
      data: charges
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete extra charge
// @route   DELETE /api/extra-charges/:id
// @access  Private
exports.deleteExtraCharge = async (req, res, next) => {
  try {
    const charge = await ExtraCharge.findOne({
      where: { id: req.params.id, hotelId: req.user.hotelId }
    });

    if (!charge) {
      res.status(404);
      throw new Error('Service charge record not found');
    }

    // Check if booking is checked out
    const booking = await Booking.findOne({
      where: { id: charge.bookingId, hotelId: req.user.hotelId }
    });

    if (booking && booking.status === 'Completed') {
      res.status(400);
      throw new Error('Cannot delete service charge for a checked-out stay');
    }

    await charge.destroy();

    res.status(200).json({
      success: true,
      message: 'Service charge deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update extra charge
// @route   PUT /api/extra-charges/:id
// @access  Private
exports.updateExtraCharge = async (req, res, next) => {
  try {
    const { roomNumber, guestName, bookingId, serviceName, qty, price, gstOption, gstRate, notes } = req.body;

    const charge = await ExtraCharge.findOne({
      where: { id: req.params.id, hotelId: req.user.hotelId }
    });

    if (!charge) {
      res.status(404);
      throw new Error('Service charge record not found');
    }

    // Check if booking is checked out
    const booking = await Booking.findOne({
      where: { id: charge.bookingId, hotelId: req.user.hotelId }
    });

    if (booking && booking.status === 'Completed') {
      res.status(400);
      throw new Error('Cannot edit service charge for a checked-out stay');
    }

    const itemQty = parseInt(qty) || 1;
    const itemPrice = parseFloat(price) || 0;
    const subtotal = parseFloat((itemQty * itemPrice).toFixed(2));
    const targetGstOption = gstOption || 'none';
    const targetGstRate = gstRate !== undefined ? parseFloat(gstRate) : 0;

    let gstAmount = 0;
    let grandTotal = 0;

    if (targetGstOption === 'none') {
      gstAmount = 0;
      grandTotal = subtotal;
    } else if (targetGstOption === 'inclusive') {
      const basePrice = subtotal / (1 + (targetGstRate / 100));
      gstAmount = parseFloat((subtotal - basePrice).toFixed(2));
      grandTotal = subtotal;
    } else { // 'exclusive'
      gstAmount = parseFloat((subtotal * (targetGstRate / 100)).toFixed(2));
      grandTotal = parseFloat((subtotal + gstAmount).toFixed(2));
    }

    charge.roomNumber = roomNumber || charge.roomNumber;
    charge.guestName = guestName || charge.guestName;
    charge.serviceName = serviceName || charge.serviceName;
    charge.qty = itemQty;
    charge.price = itemPrice;
    charge.subtotal = subtotal;
    charge.gstOption = targetGstOption;
    charge.gstRate = targetGstRate;
    charge.gstAmount = gstAmount;
    charge.grandTotal = grandTotal;
    charge.notes = notes || '';

    // If bookingId changed, update it too
    if (bookingId) {
      charge.bookingId = bookingId;
    }

    await charge.save();

    res.status(200).json({
      success: true,
      data: charge
    });
  } catch (error) {
    next(error);
  }
};
