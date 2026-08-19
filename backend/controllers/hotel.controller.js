const Hotel = require('../models/Hotel');
const User = require('../models/User');
const { logActivity } = require('../utils/activityLogger');

// @desc    Get all hotels
// @route   GET /api/hotels
// @access  Private (SuperAdmin)
exports.getHotels = async (req, res, next) => {
  try {
    const RoomType = require('../models/RoomType');
    const hotels = await Hotel.findAll({
      include: [{ model: RoomType, as: 'roomTypes' }],
      order: [['name', 'ASC']]
    });
    res.status(200).json({
      success: true,
      count: hotels.length,
      data: hotels
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create a new hotel
// @route   POST /api/hotels
// @access  Private (SuperAdmin)
exports.createHotel = async (req, res, next) => {
  try {
    const { name, address, phone, email, logoUrl, gstin, city, state, hotelType, hasKot, hasAccounts, hasAssets, hasActivityLogs, hasOpeningBalance, openingCashBalance, openingBankBalance, lockOpeningBalance, hasRoomType, allowRoomAdd, allowRoomDelete, defaultGstRate, defaultGstOption, defaultHsnCode, billingTemplateId, allowHotelEdit, allowBillingEdit, allowPaymentEdit, checkoutTime, invoicePrefix, since, bookingPlatforms, onlinePaymentBanks, roomTypes } = req.body;

    if (!name) {
      res.status(400);
      throw new Error('Please provide a hotel name');
    }

    const hotel = await Hotel.create({
      name,
      address,
      phone,
      email,
      logoUrl,
      gstin,
      city,
      state,
      hotelType,
      hasKot,
      hasAccounts: hasAccounts !== undefined ? hasAccounts : true,
      hasAssets: hasAssets !== undefined ? hasAssets : true,
      hasActivityLogs: hasActivityLogs !== undefined ? hasActivityLogs : true,
      hasOpeningBalance: hasOpeningBalance !== undefined ? hasOpeningBalance : true,
      openingCashBalance: openingCashBalance !== undefined ? Number(openingCashBalance) : 0,
      openingBankBalance: openingBankBalance !== undefined ? Number(openingBankBalance) : 0,
      lockOpeningBalance: lockOpeningBalance || false,
      hasRoomType: hasRoomType !== undefined ? hasRoomType : true,
      allowRoomAdd: allowRoomAdd !== undefined ? allowRoomAdd : true,
      allowRoomDelete: allowRoomDelete !== undefined ? allowRoomDelete : true,
      defaultGstRate: defaultGstRate !== undefined ? parseInt(defaultGstRate) : 12,
      defaultGstOption: defaultGstOption || 'none',
      defaultHsnCode: defaultHsnCode || '996311',
      billingTemplateId: billingTemplateId || 'template_1',
      allowHotelEdit: allowHotelEdit || false,
      allowBillingEdit: allowBillingEdit !== undefined ? allowBillingEdit : true,
      allowPaymentEdit: allowPaymentEdit !== undefined ? allowPaymentEdit : true,
      checkoutTime: checkoutTime || '11:00 AM',
      invoicePrefix: (invoicePrefix !== undefined && invoicePrefix !== null) ? invoicePrefix : 'INV-',
      since,
      bookingPlatforms: bookingPlatforms || null,
      onlinePaymentBanks: onlinePaymentBanks || null,
      enablePerGuestRoomAssignment: req.body.enablePerGuestRoomAssignment === true,
      enableAutoExtendCheckout: req.body.enableAutoExtendCheckout === true,
      autoExtendCutoffTime: req.body.autoExtendCutoffTime || '11:30 AM',
      lockPastStayCharges: req.body.lockPastStayCharges === true,
      roomCardColors: req.body.roomCardColors || null
    });

    if (roomTypes) {
      const RoomType = require('../models/RoomType');
      const typesArray = roomTypes.split(',').map(t => t.trim()).filter(Boolean);
      const roomTypeData = typesArray.map(t => ({ name: t, hotelId: hotel.id }));
      await RoomType.bulkCreate(roomTypeData);
    }

    await logActivity({
      req,
      hotelId: hotel.id,
      moduleName: 'Hotel',
      action: 'Hotel Created',
      entityType: 'Hotel',
      entityId: hotel.id,
      entityName: hotel.name,
      description: `New hotel ${hotel.name} was created by ${req.user.username}.`
    });

    res.status(201).json({
      success: true,
      data: hotel
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update hotel details
// @route   PUT /api/hotels/:id
// @access  Private (SuperAdmin or Hotel Admin)
exports.updateHotel = async (req, res, next) => {
  try {
    const hotel = await Hotel.findByPk(req.params.id);

    if (!hotel) {
      res.status(404);
      throw new Error('Hotel not found');
    }

    // Verify access
    if (req.user.role !== 'superadmin') {
      if (req.user.hotelId !== hotel.id) {
        res.status(403);
        throw new Error('Not authorized to modify this hotel profile');
      }
      const isUpdatingOpeningBalance = req.body.openingCashBalance !== undefined || req.body.openingBankBalance !== undefined;
      if (isUpdatingOpeningBalance && hotel.lockOpeningBalance) {
        res.status(403);
        throw new Error('Opening balances are locked by SuperAdmin and cannot be modified.');
      }
      const isOnlyOpeningBalanceUpdate = Object.keys(req.body).every(key => ['openingCashBalance', 'openingBankBalance'].includes(key));
      if (!hotel.allowHotelEdit && !isOnlyOpeningBalanceUpdate) {
        res.status(403);
        throw new Error('Hotel profile editing is disabled by the SuperAdmin. Please contact support.');
      }
    }

    const isTruthy = (v) => v === true || v === 1 || v === '1' || v === 'true';

    const oldHotelData = hotel.toJSON();
    const hotelData = { ...req.body };
    delete hotelData.roomTypes;

    if (hotelData.enableAutoExtendCheckout !== undefined) {
      hotelData.enableAutoExtendCheckout = isTruthy(hotelData.enableAutoExtendCheckout);
    }
    if (hotelData.enablePerGuestRoomAssignment !== undefined) {
      hotelData.enablePerGuestRoomAssignment = isTruthy(hotelData.enablePerGuestRoomAssignment);
    }
    if (hotelData.restrictBackDates !== undefined) {
      hotelData.restrictBackDates = isTruthy(hotelData.restrictBackDates);
    }
    if (hotelData.resetInvoiceYearly !== undefined) {
      hotelData.resetInvoiceYearly = isTruthy(hotelData.resetInvoiceYearly);
    }
    if (hotelData.lockPastStayCharges !== undefined) {
      hotelData.lockPastStayCharges = isTruthy(hotelData.lockPastStayCharges);
    }
    if (hotelData.allowHotelEdit !== undefined) {
      hotelData.allowHotelEdit = isTruthy(hotelData.allowHotelEdit);
    }
    if (hotelData.allowBillingEdit !== undefined) {
      hotelData.allowBillingEdit = isTruthy(hotelData.allowBillingEdit);
    }
    if (hotelData.allowPaymentEdit !== undefined) {
      hotelData.allowPaymentEdit = isTruthy(hotelData.allowPaymentEdit);
    }
    if (hotelData.allowEditOldPayments !== undefined) {
      hotelData.allowEditOldPayments = isTruthy(hotelData.allowEditOldPayments);
    }
    if (hotelData.enableRegistrationNumber !== undefined) {
      hotelData.enableRegistrationNumber = isTruthy(hotelData.enableRegistrationNumber);
    }

    Object.assign(hotel, hotelData);
    await hotel.save();
    const updatedHotel = hotel;
    console.log('[backend] Hotel updated successfully:', {
      id: updatedHotel.id,
      enableAutoExtendCheckout: updatedHotel.enableAutoExtendCheckout,
      autoExtendCutoffTime: updatedHotel.autoExtendCutoffTime
    });

    try {
      if (isTruthy(updatedHotel.enableAutoExtendCheckout)) {
        const { processAutoExtendOverdueCheckouts } = require('../services/autoExtendService');
        processAutoExtendOverdueCheckouts();
      }
    } catch (e) {
      console.error('Error triggering auto-extend check:', e.message);
    }

    if (req.body.roomTypes !== undefined) {
      const RoomType = require('../models/RoomType');
      const typesArray = (req.body.roomTypes || '').split(',').map(t => t.trim()).filter(Boolean);

      // Delete existing
      await RoomType.destroy({ where: { hotelId: hotel.id } });

      // Insert new
      if (typesArray.length > 0) {
        const roomTypeData = typesArray.map(t => ({ name: t, hotelId: hotel.id }));
        await RoomType.bulkCreate(roomTypeData);
      }
    }

    await logActivity({
      req,
      hotelId: hotel.id,
      moduleName: 'Hotel',
      action: 'Hotel Updated',
      entityType: 'Hotel',
      entityId: hotel.id,
      entityName: hotel.name,
      description: `Hotel profile for ${hotel.name} updated by ${req.user.username}`,
      oldValue: oldHotelData,
      newValue: updatedHotel
    });

    res.status(200).json({
      success: true,
      data: updatedHotel
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create/provision a user for a hotel
// @route   POST /api/hotels/:id/users
// @access  Private (SuperAdmin)
exports.createUserForHotel = async (req, res, next) => {
  try {
    const { username, password, role } = req.body;
    const hotelId = req.params.id;

    if (!username || !password) {
      res.status(400);
      throw new Error('Please provide username and password');
    }

    // Check if hotel exists
    const hotel = await Hotel.findByPk(hotelId);
    if (!hotel) {
      res.status(404);
      throw new Error('Hotel not found');
    }

    // Check if user already exists
    const existingUser = await User.findOne({ where: { username } });
    if (existingUser) {
      res.status(400);
      throw new Error('Username already exists');
    }

    const user = await User.create({
      username,
      password, // plain text comparison
      role: role || 'admin',
      hotelId
    });

    await logActivity({
      req,
      hotelId,
      moduleName: 'Users',
      action: 'User Created',
      entityType: 'User',
      entityId: user.id,
      entityName: user.username,
      description: `User ${user.username} was created with role ${user.role} for hotel ${hotel.name}.`,
      newValue: { id: user.id, username: user.username, role: user.role }
    });

    res.status(201).json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        role: user.role,
        hotelId: user.hotelId
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all users for a hotel
// @route   GET /api/hotels/:id/users
// @access  Private (SuperAdmin or Hotel Admin)
exports.getHotelUsers = async (req, res, next) => {
  try {
    const hotelId = req.params.id;

    // Verify access
    if (req.user.role !== 'superadmin' && req.user.hotelId !== hotelId) {
      res.status(403);
      throw new Error('Not authorized to view users for this hotel');
    }

    const users = await User.findAll({
      where: { hotelId },
      attributes: ['id', 'username', 'password', 'role', 'createdAt', 'updatedAt'],
      order: [['createdAt', 'DESC']]
    });

    const staffUsers = users.filter(u => u.role !== 'superadmin');

    res.status(200).json({
      success: true,
      count: staffUsers.length,
      data: staffUsers
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single hotel details
// @route   GET /api/hotels/:id
// @access  Private
exports.getHotelById = async (req, res, next) => {
  try {
    const RoomType = require('../models/RoomType');
    const hotel = await Hotel.findByPk(req.params.id, {
      include: [{ model: RoomType, as: 'roomTypes' }]
    });
    if (!hotel) {
      res.status(404);
      throw new Error('Hotel not found');
    }
    // Verify access
    if (req.user.role !== 'superadmin' && req.user.hotelId !== hotel.id) {
      res.status(403);
      throw new Error('Not authorized to view this hotel profile');
    }
    res.status(200).json({
      success: true,
      data: hotel
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update a hotel user login
// @route   PUT /api/hotels/:id/users/:userId
// @access  Private (SuperAdmin)
exports.updateHotelUser = async (req, res, next) => {
  try {
    const { id: hotelId, userId } = req.params;
    const { username, password, role } = req.body;

    // Verify user is superadmin
    if (req.user.role !== 'superadmin') {
      res.status(403);
      throw new Error('Not authorized to manage hotel users');
    }

    const User = require('../models/User');
    const user = await User.findOne({ where: { id: userId, hotelId } });
    if (!user) {
      res.status(404);
      throw new Error('User not found for this hotel');
    }

    const oldUserData = { id: user.id, username: user.username, role: user.role };

    // Check if new username is already taken by another user
    if (username && username !== user.username) {
      const usernameExists = await User.findOne({ where: { username } });
      if (usernameExists) {
        res.status(400);
        throw new Error('Username already exists');
      }
      user.username = username;
    }

    if (password) {
      user.password = password;
    }

    if (role) {
      user.role = role;
    }

    await user.save();

    await logActivity({
      req,
      hotelId,
      moduleName: 'Users',
      action: 'User Updated',
      entityType: 'User',
      entityId: user.id,
      entityName: user.username,
      description: `User account ${user.username} was updated by ${req.user.username}.`,
      oldValue: oldUserData,
      newValue: { id: user.id, username: user.username, role: user.role }
    });

    res.status(200).json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        role: user.role,
        hotelId: user.hotelId
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a hotel user login
// @route   DELETE /api/hotels/:id/users/:userId
// @access  Private (SuperAdmin)
exports.deleteHotelUser = async (req, res, next) => {
  try {
    const { id: hotelId, userId } = req.params;

    // Verify user is superadmin
    if (req.user.role !== 'superadmin') {
      res.status(403);
      throw new Error('Not authorized to delete hotel users');
    }

    const User = require('../models/User');
    const user = await User.findOne({ where: { id: userId, hotelId } });
    if (!user) {
      res.status(404);
      throw new Error('User not found for this hotel');
    }

    // Prevent deleting the currently logged-in superadmin
    if (user.id === req.user.id) {
      res.status(400);
      throw new Error('Cannot delete your own superadmin account');
    }

    const deletedUserData = { id: user.id, username: user.username, role: user.role };

    await user.destroy();

    await logActivity({
      req,
      hotelId,
      moduleName: 'Users',
      action: 'User Deleted',
      entityType: 'User',
      entityId: userId,
      entityName: deletedUserData.username,
      description: `User ${deletedUserData.username} was deleted by ${req.user.username}.`,
      oldValue: deletedUserData
    });

    res.status(200).json({
      success: true,
      message: 'User account deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};
