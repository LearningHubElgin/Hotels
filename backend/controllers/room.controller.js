const Room = require('../models/Room');
const { logActivity } = require('../utils/activityLogger');

// @desc    Get all rooms
// @route   GET /api/rooms
// @access  Private (Admin/Staff)
exports.getRooms = async (req, res, next) => {
  try {
    try {
      const { processAutoExtendOverdueCheckouts } = require('../services/autoExtendService');
      await processAutoExtendOverdueCheckouts();
    } catch (e) {
      console.error('Auto-extend check error in getRooms:', e.message);
    }

    try {
      const Booking = require('../models/Booking');
      const activeBookings = await Booking.findAll({
        where: { hotelId: req.user.hotelId, status: 'Active' }
      });
      for (const b of activeBookings) {
        if (b.roomId) {
          await Room.update(
            { status: 'occupied', guestName: b.guestName },
            { where: { id: b.roomId, hotelId: req.user.hotelId, status: 'available' } }
          );
        }
      }
    } catch (e) {
      console.error('Error syncing room status in getRooms:', e.message);
    }

    const rooms = await Room.findAll({
      where: { isDeleted: false, hotelId: req.user.hotelId },
      order: [['floor', 'ASC'], ['roomNumber', 'ASC']]
    });
    res.status(200).json({
      success: true,
      count: rooms.length,
      data: rooms
    });
  } catch (error) {
    console.error('SERVER ERROR - getRooms:', error);
    next(error);
  }
};

// @desc    Add new room
// @route   POST /api/rooms
// @access  Private (Admin)
exports.addRoom = async (req, res, next) => {
  try {
    const { roomNumber, type, floor, pricePerNight } = req.body;
    const cleanRoomNum = String(roomNumber || '').trim();

    const existingRoom = await Room.findOne({
      where: {
        hotelId: req.user.hotelId,
        roomNumber: cleanRoomNum
      }
    });

    if (existingRoom) {
      if (existingRoom.isDeleted) {
        // Restore soft-deleted room with updated details
        await existingRoom.update({
          type,
          floor,
          pricePerNight: pricePerNight || 0,
          status: 'available',
          isDeleted: false
        });

        await logActivity({
          req,
          hotelId: req.user.hotelId,
          moduleName: 'Rooms',
          action: 'Room Restored',
          entityType: 'Room',
          entityId: existingRoom.id,
          entityName: `Room ${existingRoom.roomNumber}`,
          description: `Room ${existingRoom.roomNumber} (${existingRoom.type}) was restored on floor ${existingRoom.floor} by ${req.user.username}.`,
          newValue: existingRoom
        });

        return res.status(201).json({
          success: true,
          data: existingRoom
        });
      } else {
        res.status(400);
        return next(new Error(`Room number '${cleanRoomNum}' already exists in this hotel.`));
      }
    }

    const room = await Room.create({
      roomNumber: cleanRoomNum,
      type,
      floor,
      pricePerNight: pricePerNight || 0,
      status: 'available',
      hotelId: req.user.hotelId
    });

    await logActivity({
      req,
      hotelId: req.user.hotelId,
      moduleName: 'Rooms',
      action: 'Room Added',
      entityType: 'Room',
      entityId: room.id,
      entityName: `Room ${room.roomNumber}`,
      description: `Room ${room.roomNumber} (${room.type}) was added on floor ${room.floor} by ${req.user.username}.`,
      newValue: room
    });

    res.status(201).json({
      success: true,
      data: room
    });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      res.status(400);
      return next(new Error('Room number already exists in this hotel'));
    }
    console.error('SERVER ERROR - addRoom:', error);
    next(error);
  }
};

exports.updateRoom = async (req, res, next) => {
  try {
    let room = await Room.findOne({
      where: { id: req.params.id, hotelId: req.user.hotelId }
    });

    if (!room) {
      res.status(404);
      throw new Error('Room not found in this hotel');
    }

    const oldRoomData = room.toJSON();
    const oldPrice = parseFloat(room.pricePerNight);
    const newPrice = req.body.pricePerNight !== undefined ? parseFloat(req.body.pricePerNight) : undefined;

    room = await room.update(req.body);

    // Dynamic action description for room updates
    let action = 'Room Updated';
    let description = `Room ${room.roomNumber} details updated by ${req.user.username}.`;

    if (req.body.status && oldRoomData.status !== req.body.status) {
      action = 'Room Status Changed';
      description = `Room ${room.roomNumber} status changed from '${oldRoomData.status}' to '${req.body.status}' by ${req.user.username}.`;
      
      // Cleaned / Maintenance specific log actions
      if (req.body.status === 'available' && oldRoomData.status === 'cleaning') {
        action = 'Room Cleaned';
        description = `Room ${room.roomNumber} was cleaned and is now available.`;
      } else if (req.body.status === 'maintenance') {
        action = 'Room Maintenance';
        description = `Room ${room.roomNumber} set to maintenance status.`;
      }
    }

    await logActivity({
      req,
      hotelId: req.user.hotelId,
      moduleName: 'Rooms',
      action,
      entityType: 'Room',
      entityId: room.id,
      entityName: `Room ${room.roomNumber}`,
      description,
      oldValue: oldRoomData,
      newValue: room
    });

    // If pricePerNight changed and is valid, update the active booking for this room
    if (newPrice !== undefined && oldPrice !== newPrice) {
      const Booking = require('../models/Booking');
      const activeBooking = await Booking.findOne({
        where: { roomId: room.id, status: 'Active' }
      });

      if (activeBooking) {
        // Calculate number of nights
        const start = new Date(activeBooking.checkInDate);
        const end = new Date(activeBooking.checkOutDate);
        const diffDays = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)) || 1;
        
        // Calculate new total amount
        const newTotalAmount = diffDays * newPrice;
        
        // Calculate new payment status dynamically based on amountPaid
        const amountPaid = parseFloat(activeBooking.amountPaid) || 0;
        let newPaymentStatus = activeBooking.paymentStatus;
        if (amountPaid >= newTotalAmount) {
          newPaymentStatus = 'Paid';
        } else if (amountPaid > 0) {
          newPaymentStatus = 'Partial';
        } else {
          newPaymentStatus = 'Pending';
        }

        // Update the active booking
        await activeBooking.update({
          totalAmount: newTotalAmount,
          paymentStatus: newPaymentStatus
        });
      }
    }

    res.status(200).json({
      success: true,
      data: room
    });
  } catch (error) {
    console.error('SERVER ERROR - updateRoom:', error);
    next(error);
  }
};

// @desc    Delete room
// @route   DELETE /api/rooms/:id
// @access  Private (Admin)
exports.deleteRoom = async (req, res, next) => {
  try {
    const room = await Room.findOne({
      where: { id: req.params.id, hotelId: req.user.hotelId }
    });

    if (!room) {
      res.status(404);
      throw new Error('Room not found in this hotel');
    }

    if (room.status === 'occupied') {
      res.status(400);
      throw new Error('Cannot delete room because it is currently occupied');
    }

    const deletedRoomData = room.toJSON();
    const originalRoomNumber = room.roomNumber;

    // Soft delete: flag as deleted and rename room number to release unique constraint
    room.isDeleted = true;
    room.roomNumber = `${room.roomNumber}_deleted_${Date.now()}`;
    await room.save();

    await logActivity({
      req,
      hotelId: req.user.hotelId,
      moduleName: 'Rooms',
      action: 'Room Deleted',
      entityType: 'Room',
      entityId: room.id,
      entityName: `Room ${originalRoomNumber}`,
      description: `Room ${originalRoomNumber} was deleted by ${req.user.username}.`,
      oldValue: deletedRoomData
    });

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    console.error('SERVER ERROR - deleteRoom:', error);
    next(error);
  }
};
