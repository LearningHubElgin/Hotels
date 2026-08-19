const Kot = require('../models/Kot');
const Booking = require('../models/Booking');
const Room = require('../models/Room');
const { Op } = require('sequelize');
const { logActivity } = require('../utils/activityLogger');

// @desc    Create new KOT
// @route   POST /api/kots
// @access  Private
exports.createKot = async (req, res, next) => {
  try {
    const { roomNumber, guestName, bookingId, items, notes, paymentMode } = req.body;

    if (!roomNumber || !guestName || !items || !Array.isArray(items) || items.length === 0) {
      res.status(400);
      throw new Error('Please provide room number, guest name, and at least one food item');
    }

    // 1. Calculate totals
    let subtotal = 0;
    items.forEach(item => {
      const price = parseFloat(item.price) || 0;
      const qty = parseInt(item.quantity) || 1;
      item.amount = parseFloat((price * qty).toFixed(2));
      subtotal += item.amount;
    });

    // Food tax rates: CGST 2.5%, SGST 2.5%
    const cgst = parseFloat((subtotal * 0.025).toFixed(2));
    const sgst = parseFloat((subtotal * 0.025).toFixed(2));
    const serviceCharge = parseFloat((subtotal * 0.05).toFixed(2)); // 5% Service charge
    const grandTotal = parseFloat((subtotal + cgst + sgst + serviceCharge).toFixed(2));

    // 2. Resolve bookingId if not provided
    let resolvedBookingId = bookingId;
    if (!resolvedBookingId) {
      // Find active booking for this roomNumber
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

    // 3. Generate KOT number (e.g. KOT-0001)
    const lastKot = await Kot.findOne({
      where: { hotelId: req.user.hotelId },
      order: [['createdAt', 'DESC']]
    });

    let nextNum = 1;
    if (lastKot && lastKot.kotNumber) {
      const matches = lastKot.kotNumber.match(/KOT-(\d+)/);
      if (matches && matches[1]) {
        nextNum = parseInt(matches[1], 10) + 1;
      }
    }
    const kotNumber = `KOT-${String(nextNum).padStart(4, '0')}`;

    // 4. Create Kot record
    const newKot = await Kot.create({
      kotNumber,
      bookingId: resolvedBookingId || null,
      roomNumber,
      guestName,
      items,
      subtotal,
      cgst,
      sgst,
      serviceCharge,
      grandTotal,
      status: 'Pending',
      billingStatus: 'Unbilled',
      paymentMode: paymentMode || 'Room Charge',
      notes: notes || '',
      hotelId: req.user.hotelId
    });

    await logActivity({
      req,
      hotelId: req.user.hotelId,
      moduleName: 'Restaurant',
      action: 'Order Created',
      entityType: 'Kot',
      entityId: newKot.id,
      entityName: newKot.kotNumber,
      description: `KOT order ${newKot.kotNumber} was created for guest ${guestName} in Room ${roomNumber}. Total: ₹${grandTotal}.`,
      newValue: newKot
    });

    res.status(201).json({
      success: true,
      data: newKot
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all KOTs with filters, search, and pagination
// @route   GET /api/kots
// @access  Private
exports.getAllKots = async (req, res, next) => {
  try {
    const { page, limit, search, status, billingStatus } = req.query;

    let whereClause = { hotelId: req.user.hotelId };

    if (status) {
      whereClause.status = status;
    }

    if (billingStatus) {
      whereClause.billingStatus = billingStatus;
    }

    if (search) {
      whereClause[Op.or] = [
        { guestName: { [Op.like]: `%${search}%` } },
        { roomNumber: { [Op.like]: `%${search}%` } },
        { kotNumber: { [Op.like]: `%${search}%` } }
      ];
    }

    let kots;
    let totalPages = 1;
    let totalRecords = 0;

    if (page && limit) {
      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 10;
      const offsetNum = (pageNum - 1) * limitNum;

      const { count, rows } = await Kot.findAndCountAll({
        where: whereClause,
        order: [['createdAt', 'DESC']],
        limit: limitNum,
        offset: offsetNum
      });

      kots = rows;
      totalPages = Math.ceil(count / limitNum);
      totalRecords = count;
    } else {
      kots = await Kot.findAll({
        where: whereClause,
        order: [['createdAt', 'DESC']]
      });
      totalRecords = kots.length;
    }

    res.status(200).json({
      success: true,
      data: kots,
      totalPages,
      totalRecords
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single KOT details
// @route   GET /api/kots/:id
// @access  Private
exports.getKotById = async (req, res, next) => {
  try {
    const kot = await Kot.findOne({
      where: { id: req.params.id, hotelId: req.user.hotelId },
      include: [{ model: Booking, include: [Room] }]
    });

    if (!kot) {
      res.status(404);
      throw new Error('KOT not found in this hotel');
    }

    res.status(200).json({
      success: true,
      data: kot
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update KOT details
// @route   PUT /api/kots/:id
// @access  Private
exports.updateKot = async (req, res, next) => {
  try {
    const kot = await Kot.findOne({
      where: { id: req.params.id, hotelId: req.user.hotelId }
    });

    if (!kot) {
      res.status(404);
      throw new Error('KOT not found in this hotel');
    }

    if (kot.billingStatus === 'Billed') {
      res.status(400);
      throw new Error('Billed KOTs cannot be modified');
    }

    const { items, notes, paymentMode, roomNumber, guestName } = req.body;

    let updateData = { notes, paymentMode, roomNumber, guestName };

    if (items && Array.isArray(items) && items.length > 0) {
      let subtotal = 0;
      items.forEach(item => {
        const price = parseFloat(item.price) || 0;
        const qty = parseInt(item.quantity) || 1;
        item.amount = parseFloat((price * qty).toFixed(2));
        subtotal += item.amount;
      });

      const cgst = parseFloat((subtotal * 0.025).toFixed(2));
      const sgst = parseFloat((subtotal * 0.025).toFixed(2));
      const serviceCharge = parseFloat((subtotal * 0.05).toFixed(2));
      const grandTotal = parseFloat((subtotal + cgst + sgst + serviceCharge).toFixed(2));

      updateData.items = items;
      updateData.subtotal = subtotal;
      updateData.cgst = cgst;
      updateData.sgst = sgst;
      updateData.serviceCharge = serviceCharge;
      updateData.grandTotal = grandTotal;
    }

    const oldKotData = kot.toJSON();
    await kot.update(updateData);

    await logActivity({
      req,
      hotelId: req.user.hotelId,
      moduleName: 'Restaurant',
      action: 'Order Updated',
      entityType: 'Kot',
      entityId: kot.id,
      entityName: kot.kotNumber,
      description: `KOT order ${kot.kotNumber} items or details were updated.`,
      oldValue: oldKotData,
      newValue: kot
    });

    res.status(200).json({
      success: true,
      data: kot
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update KOT status (preparation status)
// @route   PUT /api/kots/:id/status
// @access  Private
exports.updateKotStatus = async (req, res, next) => {
  try {
    const kot = await Kot.findOne({
      where: { id: req.params.id, hotelId: req.user.hotelId }
    });

    if (!kot) {
      res.status(404);
      throw new Error('KOT not found in this hotel');
    }

    const { status } = req.body;

    if (!status || !['Pending', 'In Progress', 'Served', 'Cancelled'].includes(status)) {
      res.status(400);
      throw new Error('Please provide a valid preparation status');
    }

    const oldKotData = kot.toJSON();
    await kot.update({ status });

    await logActivity({
      req,
      hotelId: req.user.hotelId,
      moduleName: 'Restaurant',
      action: 'Order Updated',
      entityType: 'Kot',
      entityId: kot.id,
      entityName: kot.kotNumber,
      description: `KOT order ${kot.kotNumber} status updated to '${status}'.`,
      oldValue: oldKotData,
      newValue: kot
    });

    res.status(200).json({
      success: true,
      data: kot
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update KOT billing status (Unbilled / Billed)
// @route   PUT /api/kots/:id/billing
// @access  Private
exports.updateKotBilling = async (req, res, next) => {
  try {
    const kot = await Kot.findOne({
      where: { id: req.params.id, hotelId: req.user.hotelId }
    });

    if (!kot) {
      res.status(404);
      throw new Error('KOT not found in this hotel');
    }

    const { billingStatus } = req.body;

    if (!billingStatus || !['Unbilled', 'Billed'].includes(billingStatus)) {
      res.status(400);
      throw new Error('Please provide a valid billing status');
    }

    const oldKotData = kot.toJSON();
    await kot.update({ billingStatus });

    await logActivity({
      req,
      hotelId: req.user.hotelId,
      moduleName: 'Restaurant',
      action: billingStatus === 'Billed' ? 'Bill Generated' : 'Order Updated',
      entityType: 'Kot',
      entityId: kot.id,
      entityName: kot.kotNumber,
      description: billingStatus === 'Billed' 
        ? `Bill generated for KOT order ${kot.kotNumber} (Guest: ${kot.guestName}).`
        : `Billing status of KOT ${kot.kotNumber} updated to Unbilled.`,
      oldValue: oldKotData,
      newValue: kot
    });

    res.status(200).json({
      success: true,
      data: kot
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete KOT (only if Unbilled)
// @route   DELETE /api/kots/:id
// @access  Private
exports.deleteKot = async (req, res, next) => {
  try {
    const kot = await Kot.findOne({
      where: { id: req.params.id, hotelId: req.user.hotelId }
    });

    if (!kot) {
      res.status(404);
      throw new Error('KOT not found in this hotel');
    }

    if (kot.billingStatus === 'Billed') {
      res.status(400);
      throw new Error('Billed KOTs cannot be deleted');
    }

    const deletedKotData = kot.toJSON();
    await kot.destroy();

    await logActivity({
      req,
      hotelId: req.user.hotelId,
      moduleName: 'Restaurant',
      action: 'Order Deleted',
      entityType: 'Kot',
      entityId: kot.id,
      entityName: kot.kotNumber,
      description: `KOT order ${kot.kotNumber} was deleted by ${req.user.username}.`,
      oldValue: deletedKotData
    });

    res.status(200).json({
      success: true,
      message: 'KOT deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get KOTs for a specific booking
// @route   GET /api/kots/booking/:bookingId
// @access  Private
exports.getKotsByBooking = async (req, res, next) => {
  try {
    const kots = await Kot.findAll({
      where: { bookingId: req.params.bookingId, hotelId: req.user.hotelId },
      order: [['createdAt', 'ASC']]
    });

    res.status(200).json({
      success: true,
      data: kots
    });
  } catch (error) {
    next(error);
  }
};
