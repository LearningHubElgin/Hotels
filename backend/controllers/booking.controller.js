const Booking = require('../models/Booking');
const Room = require('../models/Room');
const { Op } = require('sequelize');
const { processGuestDocuments } = require('../utils/fileHelper');
const { logActivity } = require('../utils/activityLogger');

// @desc    Create new booking
// @route   POST /api/bookings
// exports.createBooking = async (req, res, next) => {
exports.createBooking = async (req, res, next) => {
  try {
    const Hotel = require('../models/Hotel');
    const hotel = await Hotel.findByPk(req.user.hotelId);

    // Verify restrictBackDates configuration
    if (hotel?.restrictBackDates) {
      const moment = require('moment-timezone');
      const todayYMD = moment().tz('Asia/Kolkata').format('YYYY-MM-DD');

      const inputCheckInYMD = req.body.checkInDate ? req.body.checkInDate.split('T')[0] : '';
      const inputCheckOutYMD = req.body.checkOutDate ? req.body.checkOutDate.split('T')[0] : '';

      if (inputCheckInYMD < todayYMD) {
        res.status(400);
        throw new Error('Check-in date cannot be set to a past date.');
      }
      if (inputCheckOutYMD < todayYMD) {
        res.status(400);
        throw new Error('Check-out date cannot be set to a past date (before today).');
      }
    }

    processGuestDocuments(req.body, req.user.hotelId);

    const {
      roomId, selectedRoomIds, guestName, fatherName, email, phone, nationality, gender, age,
      address, bookingType, numberOfGuests, idProof, idType,
      aadhaarFront, aadhaarBack, signature,
      originalAadhaarFront, originalAadhaarBack,
      guestPhoto, originalGuestPhoto,
      checkInDate, checkOutDate, totalAmount, checkInTime, checkOutTime, bookingDate, bookingTime,
      amountPaid, paymentStatus, guestGst, hsnCode, gstRate, gstOption, discount, discountReason, paymentMode, paymentBank, registrationNumber,
      passportNumber, passportExpiry, visaNumber, visaType, visaExpiry, country,
      arrivalFrom, nextDestination, purposeOfVisit, extraGuests, companyName, companyAddress, isChild,
      earlyCheckInCharge, chargePreviousDay, earlyCheckInType
    } = req.body;

    const bookingGstRate = gstRate !== undefined && gstRate !== null ? Number(gstRate) : (hotel?.defaultGstRate !== undefined ? Number(hotel.defaultGstRate) : 12);
    const bookingHsnCode = hsnCode || hotel?.defaultHsnCode || '996311';

    const roomIdsToBook = Array.isArray(selectedRoomIds) && selectedRoomIds.length > 0
      ? selectedRoomIds
      : [roomId];

    const rooms = await Room.findAll({
      where: {
        id: { [Op.in]: roomIdsToBook },
        hotelId: req.user.hotelId
      }
    });

    if (rooms.length !== roomIdsToBook.length) {
      res.status(404);
      throw new Error('One or more selected rooms not found');
    }

    // Check for date overlaps/conflicts across all selected rooms
    const conflictingBookings = await Booking.findAll({
      where: {
        roomId: { [Op.in]: roomIdsToBook },
        status: { [Op.in]: ['Active', 'Confirmed'] },
        hotelId: req.user.hotelId,
        [Op.or]: [
          {
            checkInDate: { [Op.lt]: checkOutDate },
            checkOutDate: { [Op.gt]: checkInDate }
          }
        ]
      },
      include: [{ model: Room, attributes: ['roomNumber'] }]
    });

    if (conflictingBookings.length > 0) {
      const conflictList = conflictingBookings.map(cb => `Room ${cb.Room?.roomNumber || cb.roomId} is booked by ${cb.guestName} (${cb.checkInDate} to ${cb.checkOutDate})`).join(', ');
      return res.status(409).json({
        success: false,
        message: `Reservation conflict: ${conflictList}`,
        conflict: {
          guestName: conflictingBookings[0].guestName,
          dates: `${conflictingBookings[0].checkInDate} to ${conflictingBookings[0].checkOutDate}`,
          phone: conflictingBookings[0].phone
        }
      });
    }

    const moment = require('moment-timezone');
    const todayYMD = moment().tz('Asia/Kolkata').format('YYYY-MM-DD');
    const inputCheckInYMD = checkInDate ? checkInDate.split('T')[0] : todayYMD;

    let initialStatus = req.body.status || (inputCheckInYMD === todayYMD ? 'Active' : 'Confirmed');
    if (req.body.status !== 'Active' && inputCheckInYMD > todayYMD) {
      initialStatus = 'Confirmed';
    }

    // Generate a groupBookingId to link multiple rooms booked together
    const groupBookingId = roomIdsToBook.length > 1
      ? `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      : null;

    const customRates = req.body.customRates || {};
    let sumOfAllRoomPrices = 0;
    rooms.forEach(r => {
      const rate = (customRates[r.id] !== undefined && customRates[r.id] !== '')
        ? parseFloat(customRates[r.id])
        : (parseFloat(r.pricePerNight) || 0);
      sumOfAllRoomPrices += rate;
    });
    if (!sumOfAllRoomPrices) sumOfAllRoomPrices = 1;

    const prefix = hotel?.invoicePrefix || 'INV-';
    const { getBookingSerialNumber } = require('../utils/invoiceHelper');

    let generatedInvoiceNumber = req.body.invoiceNumber || null;
    if (!generatedInvoiceNumber) {
      const serialNumber = await getBookingSerialNumber({ groupBookingId, createdAt: new Date() }, hotel);
      generatedInvoiceNumber = `${prefix}${serialNumber}`;
    }

    const bookingsCreated = [];

    let accumulatedTotalAmount = 0;
    let accumulatedAmountPaid = 0;
    let accumulatedDiscount = 0;

    let initialPaymentHistory = req.body.paymentHistory || null;
    if (!initialPaymentHistory && Number(amountPaid) > 0) {
      let serialNumber = null;
      if (hotel?.enablePaymentSerialNumber) {
        const allBookings = await Booking.findAll({
          where: { hotelId: req.user.hotelId },
          attributes: ['id', 'amountPaid', 'paymentHistory']
        });
        let maxSeq = 0;
        let totalCount = 0;
        allBookings.forEach(b => {
          let hist = [];
          try {
            if (b.paymentHistory) hist = JSON.parse(b.paymentHistory);
          } catch (e) { }
          if (Array.isArray(hist) && hist.length > 0) {
            hist.forEach(h => {
              totalCount++;
              if (h.serialNumber) {
                const num = parseInt(String(h.serialNumber).match(/(\d+)$/)?.[1] || '0', 10);
                if (num > maxSeq) maxSeq = num;
              }
            });
          } else if (Number(b.amountPaid || 0) > 0) {
            totalCount++;
          }
        });
        serialNumber = String(Math.max(maxSeq, totalCount) + 1);
      }

      const checkInDateFormatted = checkInDate ? checkInDate.split('T')[0].split('-').reverse().join('-') : new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
      const timeFormatted = checkInTime || '12:00 PM';
      initialPaymentHistory = JSON.stringify([{
        amount: Number(amountPaid),
        date: checkInDateFormatted,
        time: timeFormatted,
        paymentMode: paymentMode || 'Cash',
        paymentBank: paymentBank || null,
        serialNumber: serialNumber || undefined
      }]);
    }

    let finalRegNo = req.body.registrationNumber || null;
    if (!finalRegNo && hotel?.enableRegistrationNumber) {
      const lastBookingWithReg = await Booking.findOne({
        where: {
          hotelId: req.user.hotelId,
          registrationNumber: { [Op.ne]: null },
          status: { [Op.ne]: 'Cancelled' }
        },
        order: [['createdAt', 'DESC'], ['id', 'DESC']]
      });
      let nextRegIdx = 1;
      if (lastBookingWithReg?.registrationNumber) {
        const match = String(lastBookingWithReg.registrationNumber).match(/(\d+)$/);
        if (match) nextRegIdx = parseInt(match[1], 10) + 1;
      }
      finalRegNo = `REG-${String(nextRegIdx).padStart(3, '0')}`;
    }

    for (let i = 0; i < rooms.length; i++) {
      const room = rooms[i];
      const roomPrice = (customRates[room.id] !== undefined && customRates[room.id] !== '')
        ? parseFloat(customRates[room.id])
        : (parseFloat(room.pricePerNight) || 0);
      const proportion = roomPrice / sumOfAllRoomPrices;

      let roomTotalAmount, roomAmountPaid, roomDiscount;

      if (i === rooms.length - 1) {
        // Last room takes the remainder to prevent rounding errors
        roomTotalAmount = parseFloat((parseFloat(totalAmount) - accumulatedTotalAmount).toFixed(2));
        roomAmountPaid = parseFloat((parseFloat(amountPaid) - accumulatedAmountPaid).toFixed(2));
        roomDiscount = parseFloat((parseFloat(discount) - accumulatedDiscount).toFixed(2));
      } else {
        roomTotalAmount = roomIdsToBook.length > 1
          ? parseFloat((parseFloat(totalAmount) * proportion).toFixed(2))
          : parseFloat(totalAmount);

        roomAmountPaid = roomIdsToBook.length > 1
          ? parseFloat((parseFloat(amountPaid) * proportion).toFixed(2))
          : parseFloat(amountPaid);

        roomDiscount = roomIdsToBook.length > 1
          ? parseFloat((parseFloat(discount) * proportion).toFixed(2))
          : parseFloat(discount);

        accumulatedTotalAmount += roomTotalAmount;
        accumulatedAmountPaid += roomAmountPaid;
        accumulatedDiscount += roomDiscount;
      }

      const booking = await Booking.create({
        roomId: room.id,
        groupBookingId,
        invoiceNumber: generatedInvoiceNumber,
        registrationNumber: finalRegNo,
        guestName, fatherName, email, phone, nationality, gender, age,
        address, bookingType, numberOfGuests, idProof, idType,
        aadhaarFront, aadhaarBack, signature,
        originalAadhaarFront, originalAadhaarBack,
        guestPhoto, originalGuestPhoto,
        checkInDate, checkOutDate, checkInTime, checkOutTime,
        bookingDate: bookingDate || checkInDate,
        bookingTime: bookingTime || checkInTime,
        totalAmount: roomTotalAmount,
        amountPaid: roomAmountPaid,
        discount: roomDiscount,
        discountReason: discountReason || null,
        paymentStatus, guestGst, hsnCode: bookingHsnCode, gstRate: bookingGstRate, gstOption: gstOption || 'exclusive', paymentMode,
        paymentBank: paymentBank || null,
        status: initialStatus,
        paymentHistory: initialPaymentHistory,
        hotelId: req.user.hotelId,
        passportNumber, passportExpiry, visaNumber, visaType, visaExpiry, country,
        arrivalFrom, nextDestination, purposeOfVisit, extraGuests,
        companyName, companyAddress, isChild,
        earlyCheckInCharge: chargePreviousDay ? (Number(earlyCheckInCharge) || 0) : 0,
        chargePreviousDay: chargePreviousDay ? 1 : 0,
        earlyCheckInType: earlyCheckInType || 'full_day'
      });

      if (initialStatus === 'Active') {
        await room.update({ status: 'occupied', guestName: guestName });
      }

      bookingsCreated.push(booking);
    }

    await logActivity({
      req,
      hotelId: req.user.hotelId,
      moduleName: 'Reservations',
      action: 'Reservation Created',
      entityType: 'Booking',
      entityId: bookingsCreated[0].id,
      entityName: guestName,
      description: `New reservation created for guest ${guestName} (Rooms: ${rooms.map(r => r.roomNumber).join(', ')}) from ${checkInDate} to ${checkOutDate}.`,
      newValue: bookingsCreated[0]
    });

    res.status(201).json({ success: true, data: bookingsCreated[0], allData: bookingsCreated });
  } catch (error) {
    next(error);
  }
};

// @desc    Get guest by phone (for auto-fill)
// @route   GET /api/bookings/guest/:phone
exports.getGuestByPhone = async (req, res, next) => {
  try {
    const booking = await Booking.findOne({
      where: { phone: req.params.phone, hotelId: req.user.hotelId },
      order: [['createdAt', 'DESC']]
    });
    res.status(200).json({ success: true, data: booking });
  } catch (error) {
    next(error);
  }
};

// @desc    Get active booking for a room
exports.getRoomBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findOne({
      where: { roomId: req.params.roomId, status: 'Active', hotelId: req.user.hotelId },
      include: [{ model: Room, attributes: ['roomNumber', 'type', 'pricePerNight'] }],
      order: [['id', 'DESC']]
    });
    if (!booking) {
      return res.status(200).json({ success: true, data: null });
    }

    let plainBooking = booking.get({ plain: true });
    let groupBookings = [];
    if (booking.groupBookingId) {
      const gbs = await Booking.findAll({
        where: { groupBookingId: booking.groupBookingId, hotelId: req.user.hotelId },
        include: [{ model: Room, attributes: ['roomNumber', 'type', 'pricePerNight'] }]
      });
      groupBookings = gbs.map(gb => gb.get({ plain: true }));
      plainBooking.groupBookings = groupBookings;
    }

    const Kot = require('../models/Kot');
    const ExtraCharge = require('../models/ExtraCharge');
    let bookingIds = [booking.id];
    if (booking.groupBookingId && groupBookings.length > 0) {
      bookingIds = groupBookings.map(gb => gb.id);
    }

    const kots = await Kot.findAll({
      where: { bookingId: { [Op.in]: bookingIds }, paymentMode: 'Room Charge', status: { [Op.ne]: 'Cancelled' }, hotelId: req.user.hotelId }
    });
    const foodTotal = kots.reduce((sum, k) => sum + parseFloat(k.grandTotal || 0), 0);

    const extraCharges = await ExtraCharge.findAll({
      where: { bookingId: { [Op.in]: bookingIds }, hotelId: req.user.hotelId }
    });
    const extraTotal = extraCharges.reduce((sum, ec) => sum + parseFloat(ec.grandTotal || 0), 0);

    plainBooking.foodCharges = foodTotal;
    plainBooking.extraCharges = extraTotal;

    res.status(200).json({ success: true, data: plainBooking });
  } catch (error) {
    next(error);
  }
};

// @desc    Guest Check-out
exports.checkOut = async (req, res, next) => {
  try {
    const booking = await Booking.findOne({
      where: { id: req.params.id, hotelId: req.user.hotelId }
    });
    if (!booking) { res.status(404); throw new Error('Booking not found in this hotel'); }

    const { checkOutDate, checkOutTime, singleRoomId } = req.body;
    const updateData = { status: 'Completed' };
    if (checkOutDate) updateData.checkOutDate = checkOutDate;
    if (checkOutTime) updateData.checkOutTime = checkOutTime;

    const Hotel = require('../models/Hotel');
    const hotel = await Hotel.findByPk(req.user.hotelId);
    const prefix = hotel?.invoicePrefix || 'INV-';
    const { getBookingSerialNumber } = require('../utils/invoiceHelper');

    // Partial Checkout: Single Room checkout from a Group Booking
    if (singleRoomId && booking.groupBookingId) {
      const targetBooking = await Booking.findOne({
        where: {
          groupBookingId: booking.groupBookingId,
          roomId: singleRoomId,
          hotelId: req.user.hotelId
        }
      }) || booking;

      if (checkOutDate && targetBooking.checkInDate) {
        const inDate = targetBooking.checkInDate.split('T')[0];
        const outDate = checkOutDate.split('T')[0];
        const completedNights = Math.max(1, Math.ceil(Math.abs(new Date(outDate) - new Date(inDate)) / (1000 * 60 * 60 * 24)));
        const roomObj = await Room.findOne({ where: { id: targetBooking.roomId, hotelId: req.user.hotelId } });
        const nightlyPrice = roomObj?.pricePerNight ? Number(roomObj.pricePerNight) : 0;
        if (nightlyPrice > 0) {
          updateData.totalAmount = completedNights * nightlyPrice;
        }
      }

      const serialNumber = await getBookingSerialNumber(targetBooking, hotel);
      const generatedInvoiceNumber = `${prefix}${serialNumber}`;

      await targetBooking.update({
        ...updateData,
        invoiceNumber: targetBooking.invoiceNumber || generatedInvoiceNumber
      });

      const room = await Room.findOne({ where: { id: targetBooking.roomId, hotelId: req.user.hotelId } });
      if (room) await room.update({ status: 'available', guestName: null });

      await logActivity({
        req,
        hotelId: req.user.hotelId,
        moduleName: 'Guests',
        action: 'Partial Guest Checkout',
        entityType: 'Booking',
        entityId: targetBooking.id,
        entityName: targetBooking.guestName,
        description: `Room ${room ? room.roomNumber : singleRoomId} checked out early from group booking for guest ${targetBooking.guestName}.`
      });

      return res.status(200).json({ success: true, message: `Room ${room ? room.roomNumber : ''} checked out successfully` });
    }

    if (booking.groupBookingId) {
      const groupBookings = await Booking.findAll({ where: { groupBookingId: booking.groupBookingId, hotelId: req.user.hotelId } });
      for (const gb of groupBookings) {
        const serialNumber = await getBookingSerialNumber(gb, hotel);
        const generatedInvoiceNumber = `${prefix}${serialNumber}`;

        await gb.update({
          ...updateData,
          invoiceNumber: gb.invoiceNumber || generatedInvoiceNumber
        });
        const room = await Room.findOne({ where: { id: gb.roomId, hotelId: req.user.hotelId } });
        if (room) await room.update({ status: 'available', guestName: null });
      }
    } else {
      const serialNumber = await getBookingSerialNumber(booking, hotel);
      const generatedInvoiceNumber = `${prefix}${serialNumber}`;

      await booking.update({
        ...updateData,
        invoiceNumber: booking.invoiceNumber || generatedInvoiceNumber
      });
      const room = await Room.findOne({ where: { id: booking.roomId, hotelId: req.user.hotelId } });
      if (room) await room.update({ status: 'available', guestName: null });
    }

    await logActivity({
      req,
      hotelId: req.user.hotelId,
      moduleName: 'Guests',
      action: 'Guest Checkout',
      entityType: 'Booking',
      entityId: booking.id,
      entityName: booking.guestName,
      description: `Guest ${booking.guestName} checked out successfully.`
    });

    res.status(200).json({ success: true, message: 'Guest(s) checked out successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all active/confirmed bookings
exports.getActiveBookings = async (req, res, next) => {
  try {
    const { status, search, page, limit } = req.query;
    const moment = require('moment-timezone');
    const todayYMD = moment().tz('Asia/Kolkata').format('YYYY-MM-DD');

    // Auto-fix misclassified bookings: if checkInDate is in the future, it cannot be Active today!
    const activeBookingsList = await Booking.findAll({
      where: {
        hotelId: req.user.hotelId,
        status: 'Active'
      }
    });

    for (const mb of activeBookingsList) {
      const inYMD = mb.checkInDate ? mb.checkInDate.split('T')[0] : '';
      if (inYMD && inYMD > todayYMD) {
        await mb.update({ status: 'Confirmed' });
        const otherActive = await Booking.findOne({
          where: {
            roomId: mb.roomId,
            hotelId: req.user.hotelId,
            status: 'Active'
          }
        });
        if (!otherActive) {
          await Room.update(
            { status: 'available', guestName: null },
            { where: { id: mb.roomId, hotelId: req.user.hotelId } }
          );
        }
      }
    }

    let whereClause = {
      status: status ? status : { [Op.in]: ['Active', 'Confirmed'] },
      hotelId: req.user.hotelId
    };

    if (search) {
      const cleanSearch = search.replace(/^[rR][- ]?/, '');
      whereClause[Op.or] = [
        { guestName: { [Op.like]: `%${search}%` } },
        { phone: { [Op.like]: `%${search}%` } },
        { registrationNumber: { [Op.like]: `%${search}%` } },
        { previousRoomNumber: { [Op.like]: `%${cleanSearch}%` } },
        { '$Room.roomNumber$': { [Op.like]: `%${cleanSearch}%` } }
      ];
    }

    // Lazy fallback generator for registration numbers if any booking lacks one
    let globalRegMap = null;
    const computeGlobalRegMap = async () => {
      if (globalRegMap) return globalRegMap;
      const globalBookingsAll = await Booking.findAll({
        where: { hotelId: req.user.hotelId, status: { [Op.ne]: 'Cancelled' } },
        attributes: ['id', 'groupBookingId', 'registrationNumber', 'createdAt'],
        order: [['createdAt', 'ASC'], ['id', 'ASC']]
      });

      const uniqueGroups = [];
      const groupMap = new Map();

      for (const b of globalBookingsAll) {
        const groupKey = b.groupBookingId || `single-${b.id}`;
        if (!groupMap.has(groupKey)) {
          groupMap.set(groupKey, b);
          uniqueGroups.push({ groupKey, primaryBooking: b });
        }
      }

      globalRegMap = new Map();
      uniqueGroups.forEach((g, idx) => {
        const b = g.primaryBooking;
        const reg = (b.registrationNumber && String(b.registrationNumber).trim())
          ? String(b.registrationNumber).trim()
          : `REG-${String(idx + 1).padStart(3, '0')}`;

        if (b.groupBookingId) {
          globalBookingsAll.forEach(gb => {
            if (gb.groupBookingId === b.groupBookingId) {
              globalRegMap.set(gb.id, reg);
            }
          });
        } else {
          globalRegMap.set(b.id, reg);
        }
      });
      return globalRegMap;
    };

    if (page && limit) {
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 10;
      const offsetNum = (pageNum - 1) * limitNum;

      const { count, rows } = await Booking.findAndCountAll({
        where: whereClause,
        include: [{ model: Room, attributes: ['id', 'roomNumber', 'type', 'pricePerNight'] }],
        order: [['createdAt', 'DESC']],
        limit: limitNum,
        offset: offsetNum,
        subQuery: false
      });

      const Kot = require('../models/Kot');
      const ExtraCharge = require('../models/ExtraCharge');

      const pageIds = rows.map(b => b.id);
      const pageGroupIds = rows.map(b => b.groupBookingId).filter(Boolean);

      const [batchGroupBookings, batchKots, batchExtraCharges] = await Promise.all([
        pageGroupIds.length > 0
          ? Booking.findAll({
            where: { groupBookingId: { [Op.in]: pageGroupIds }, hotelId: req.user.hotelId },
            include: [{ model: Room, attributes: ['roomNumber', 'type', 'pricePerNight'] }]
          })
          : [],
        pageIds.length > 0
          ? Kot.findAll({
            where: { bookingId: { [Op.in]: pageIds }, paymentMode: 'Room Charge', status: { [Op.ne]: 'Cancelled' }, hotelId: req.user.hotelId }
          })
          : [],
        pageIds.length > 0
          ? ExtraCharge.findAll({
            where: { bookingId: { [Op.in]: pageIds }, hotelId: req.user.hotelId }
          })
          : []
      ]);

      const needsFallbackReg = rows.some(b => !b.registrationNumber || !String(b.registrationNumber).trim());
      if (needsFallbackReg) {
        await computeGlobalRegMap();
      }

      const mappedData = rows.map((b) => {
        const groupBookings = b.groupBookingId
          ? batchGroupBookings.filter(gb => gb.groupBookingId === b.groupBookingId)
          : [];

        const kots = batchKots.filter(k => k.bookingId === b.id);
        const foodTotal = kots.reduce((sum, k) => sum + parseFloat(k.grandTotal || 0), 0);

        let bookingIds = [b.id];
        if (b.groupBookingId && groupBookings.length > 0) {
          bookingIds = groupBookings.map(gb => gb.id);
        }

        const extraCharges = batchExtraCharges.filter(ec => bookingIds.includes(ec.bookingId));
        const extraTotal = extraCharges.reduce((sum, ec) => sum + parseFloat(ec.grandTotal || 0), 0);

        const defaultRegNo = b.status === 'Cancelled' ? null : ((globalRegMap && (globalRegMap.get(b.id) || (b.groupBookingId ? globalRegMap.get(b.groupBookingId) : null))) || 'REG-001');

        return {
          ...b.toJSON(),
          registrationNumber: b.status === 'Cancelled'
            ? null
            : ((b.registrationNumber && String(b.registrationNumber).trim() && String(b.registrationNumber).trim() !== '-')
              ? String(b.registrationNumber).trim()
              : defaultRegNo),
          groupBookings,
          kots,
          extraChargesList: extraCharges,
          foodCharges: foodTotal,
          extraCharges: extraTotal
        };
      });

      res.status(200).json({
        success: true,
        data: mappedData,
        totalPages: Math.ceil(count / limitNum),
        totalRecords: count
      });
    } else {
      const bookings = await Booking.findAll({
        where: whereClause,
        include: [{ model: Room, attributes: ['id', 'roomNumber', 'type', 'pricePerNight'] }],
        order: [['createdAt', 'DESC']]
      });

      const Kot = require('../models/Kot');
      const ExtraCharge = require('../models/ExtraCharge');

      const bIds = bookings.map(b => b.id);
      const bGroupIds = bookings.map(b => b.groupBookingId).filter(Boolean);

      const [batchGroupBookings, batchKots, batchExtraCharges] = await Promise.all([
        bGroupIds.length > 0
          ? Booking.findAll({
            where: { groupBookingId: { [Op.in]: bGroupIds }, hotelId: req.user.hotelId },
            include: [{ model: Room, attributes: ['roomNumber', 'type', 'pricePerNight'] }]
          })
          : [],
        bIds.length > 0
          ? Kot.findAll({
            where: { bookingId: { [Op.in]: bIds }, paymentMode: 'Room Charge', status: { [Op.ne]: 'Cancelled' }, hotelId: req.user.hotelId }
          })
          : [],
        bIds.length > 0
          ? ExtraCharge.findAll({
            where: { bookingId: { [Op.in]: bIds }, hotelId: req.user.hotelId }
          })
          : []
      ]);

      const needsFallbackReg = bookings.some(b => !b.registrationNumber || !String(b.registrationNumber).trim());
      if (needsFallbackReg) {
        await computeGlobalRegMap();
      }

      const mappedData = bookings.map((b) => {
        const groupBookings = b.groupBookingId
          ? batchGroupBookings.filter(gb => gb.groupBookingId === b.groupBookingId)
          : [];

        const kots = batchKots.filter(k => k.bookingId === b.id);
        const foodTotal = kots.reduce((sum, k) => sum + parseFloat(k.grandTotal || 0), 0);

        let bookingIds = [b.id];
        if (b.groupBookingId && groupBookings.length > 0) {
          bookingIds = groupBookings.map(gb => gb.id);
        }

        const extraCharges = batchExtraCharges.filter(ec => bookingIds.includes(ec.bookingId));
        const extraTotal = extraCharges.reduce((sum, ec) => sum + parseFloat(ec.grandTotal || 0), 0);

        const defaultRegNo = b.status === 'Cancelled' ? null : ((globalRegMap && (globalRegMap.get(b.id) || (b.groupBookingId ? globalRegMap.get(b.groupBookingId) : null))) || 'REG-001');

        return {
          ...b.toJSON(),
          registrationNumber: b.status === 'Cancelled'
            ? null
            : ((b.registrationNumber && String(b.registrationNumber).trim() && String(b.registrationNumber).trim() !== '-')
              ? String(b.registrationNumber).trim()
              : defaultRegNo),
          groupBookings,
          kots,
          extraChargesList: extraCharges,
          foodCharges: foodTotal,
          extraCharges: extraTotal
        };
      });

      res.status(200).json({ success: true, data: mappedData });
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Guest Check-in
exports.checkIn = async (req, res, next) => {
  try {
    const booking = await Booking.findOne({
      where: { id: req.params.id, hotelId: req.user.hotelId }
    });
    const moment = require('moment-timezone');
    const todayYMD = moment().tz('Asia/Kolkata').format('YYYY-MM-DD');
    const checkInYMD = booking.checkInDate ? booking.checkInDate.split('T')[0] : '';

    if (checkInYMD && checkInYMD > todayYMD) {
      const formattedDate = checkInYMD.split('-').reverse().join('-');
      res.status(400);
      throw new Error(`You cannot check-in today! The scheduled check-in date for ${booking.guestName} is ${formattedDate}. Please edit the booking check-in date first if the guest is checking in early.`);
    }

    const { checkInDate, checkInTime } = req.body || {};
    const checkInPayload = { status: 'Active' };
    if (checkInDate) checkInPayload.checkInDate = checkInDate;
    if (checkInTime) checkInPayload.checkInTime = checkInTime;

    if (booking.groupBookingId) {
      const groupBookings = await Booking.findAll({ where: { groupBookingId: booking.groupBookingId, hotelId: req.user.hotelId } });
      for (const gb of groupBookings) {
        await gb.update(checkInPayload);
        const room = await Room.findOne({ where: { id: gb.roomId, hotelId: req.user.hotelId } });
        if (room) await room.update({ status: 'occupied', guestName: gb.guestName });
      }
    } else {
      await booking.update(checkInPayload);
      const room = await Room.findOne({ where: { id: booking.roomId, hotelId: req.user.hotelId } });
      if (room) await room.update({ status: 'occupied', guestName: booking.guestName });
    }

    await logActivity({
      req,
      hotelId: req.user.hotelId,
      moduleName: 'Guests',
      action: 'Guest Registration',
      entityType: 'Booking',
      entityId: booking.id,
      entityName: booking.guestName,
      description: `Guest ${booking.guestName} checked in (status: Active).`
    });

    res.status(200).json({ success: true, message: 'Guest(s) checked in successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Update booking
exports.updateBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findOne({
      where: { id: req.params.id, hotelId: req.user.hotelId }
    });
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found in this hotel' });
    }

    const oldBookingData = booking.toJSON();

    // Verify restrictBackDates configuration
    const Hotel = require('../models/Hotel');
    const hotel = await Hotel.findByPk(req.user.hotelId);

    if (hotel?.restrictBackDates) {
      const moment = require('moment-timezone');
      const todayYMD = moment().tz('Asia/Kolkata').format('YYYY-MM-DD');

      if (req.body.checkInDate && booking.status === 'Active') {
        const origCheckInYMD = booking.checkInDate;
        const inputCheckInYMD = req.body.checkInDate.split('T')[0];

        if (origCheckInYMD < todayYMD && inputCheckInYMD !== origCheckInYMD) {
          res.status(400);
          throw new Error(`You cannot change a past check-in date (${origCheckInYMD}) for an active stay.`);
        }
      }

      if (req.body.checkOutDate) {
        const inputCheckOutYMD = req.body.checkOutDate.split('T')[0];
        const origCheckOutYMD = booking.checkOutDate ? booking.checkOutDate.split('T')[0] : null;
        const checkInYMD = req.body.checkInDate ? req.body.checkInDate.split('T')[0] : booking.checkInDate;

        const minValidCheckout = origCheckOutYMD
          ? (origCheckOutYMD < todayYMD ? origCheckOutYMD : todayYMD)
          : (checkInYMD > todayYMD ? checkInYMD : todayYMD);

        if (inputCheckOutYMD < minValidCheckout) {
          res.status(400);
          throw new Error(`Check-out date cannot be set earlier than ${minValidCheckout}.`);
        }
      }
    }

    // Verify invoice number uniqueness across the hotel (excluding cancelled bookings)
    if (req.body.invoiceNumber && typeof req.body.invoiceNumber === 'string' && req.body.invoiceNumber.trim() !== '') {
      const targetInvoiceNo = req.body.invoiceNumber.trim();
      const duplicateWhere = {
        hotelId: req.user.hotelId,
        invoiceNumber: targetInvoiceNo,
        id: { [Op.ne]: booking.id },
        status: { [Op.ne]: 'Cancelled' }
      };

      if (booking.groupBookingId) {
        duplicateWhere.groupBookingId = { [Op.ne]: booking.groupBookingId };
      }

      const existingInvoice = await Booking.findOne({ where: duplicateWhere });
      if (existingInvoice) {
        return res.status(400).json({
          success: false,
          message: `Invoice number '${targetInvoiceNo}' already exists for another active booking.`
        });
      }
    }

    // Dynamically handle room additions and removals for the booking group
    const { selectedRoomIds } = req.body;
    if (selectedRoomIds && Array.isArray(selectedRoomIds) && selectedRoomIds.length > 0) {
      let existingBookings = [booking];
      if (booking.groupBookingId) {
        existingBookings = await Booking.findAll({
          where: { groupBookingId: booking.groupBookingId, hotelId: req.user.hotelId }
        });
      }

      const currentRoomIds = existingBookings.map(b => b.roomId);
      const roomsToAdd = selectedRoomIds.filter(id => !currentRoomIds.includes(id));
      const roomsToRemove = existingBookings.filter(b => !selectedRoomIds.includes(b.roomId));

      if (roomsToAdd.length > 0 || roomsToRemove.length > 0) {
        // Generate or resolve groupBookingId
        let groupBookingId = booking.groupBookingId;
        if (!groupBookingId && selectedRoomIds.length > 1) {
          groupBookingId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          await booking.update({ groupBookingId });
        }

        // If the current booking room is being removed, reassign it to one of the new rooms instead of deleting it
        const isCurrentRoomRemoved = roomsToRemove.some(b => b.id === booking.id);
        if (isCurrentRoomRemoved && roomsToAdd.length > 0) {
          const nextRoomId = roomsToAdd.pop();
          const oldRoom = await Room.findOne({ where: { id: booking.roomId, hotelId: req.user.hotelId } });
          if (oldRoom) {
            await oldRoom.update({ status: 'available', guestName: null });
          }

          await booking.update({ roomId: nextRoomId });

          const newRoom = await Room.findOne({ where: { id: nextRoomId, hotelId: req.user.hotelId } });
          if (newRoom && booking.status === 'Active') {
            await newRoom.update({ status: 'occupied', guestName: booking.guestName });
          }

          const index = roomsToRemove.findIndex(b => b.id === booking.id);
          if (index > -1) roomsToRemove.splice(index, 1);
        }

        // Add new bookings
        for (const newRoomId of roomsToAdd) {
          const rawBooking = booking.toJSON();
          delete rawBooking.id;
          delete rawBooking.createdAt;
          delete rawBooking.updatedAt;

          await Booking.create({
            ...rawBooking,
            roomId: newRoomId,
            groupBookingId: groupBookingId || null
          });

          const newRoom = await Room.findOne({ where: { id: newRoomId, hotelId: req.user.hotelId } });
          if (newRoom && booking.status === 'Active') {
            await newRoom.update({ status: 'occupied', guestName: booking.guestName });
          }
        }

        // Remove deleted bookings
        for (const bToRemove of roomsToRemove) {
          const room = await Room.findOne({ where: { id: bToRemove.roomId, hotelId: req.user.hotelId } });
          if (room) {
            await room.update({ status: 'available', guestName: null });
          }
          await bToRemove.destroy();
        }

        // Re-evaluate if still a group or converted to single
        const remainingCount = selectedRoomIds.length;
        if (remainingCount <= 1) {
          await booking.update({ groupBookingId: null });
        } else if (groupBookingId) {
          await Booking.update(
            { groupBookingId },
            { where: { roomId: { [Op.in]: selectedRoomIds }, hotelId: req.user.hotelId, status: { [Op.in]: ['Active', 'Confirmed'] } } }
          );
        }
      }
    }

    processGuestDocuments(req.body, req.user.hotelId, booking);

    // Update with optimized data handling
    if (req.body.amountPaid !== undefined) {
      req.body.amountPaid = parseFloat(req.body.amountPaid) || 0;
    }

    const sanitizeDateVal = (val) => {
      if (!val || val === '' || val === 'Invalid date' || val === 'null' || val === 'undefined') return null;
      if (val instanceof Date && !isNaN(val.getTime())) {
        return val.toISOString().split('T')[0];
      }
      if (typeof val === 'string') {
        let clean = val.split('T')[0].trim();
        if (clean === '' || clean === 'Invalid date' || clean === 'null' || clean === 'undefined') return null;
        if (/^\d{2}-\d{2}-\d{4}$/.test(clean)) {
          const [d, m, y] = clean.split('-');
          clean = `${y}-${m}-${d}`;
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
          return clean;
        }
        const d = new Date(clean);
        return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
      }
      return null;
    };

    const sanitizeShiftDateVal = (val) => {
      if (!val || val === '' || val === 'Invalid date' || val === 'null' || val === 'undefined') return null;
      if (typeof val === 'string') {
        if (val.includes('→') || val.includes('->') || val.includes(',') || val.includes('>')) {
          const parts = val.split(/→|->|,|>/).map(s => sanitizeDateVal(s.trim())).filter(Boolean);
          return parts.length > 0 ? parts.join(' → ') : null;
        }
        return sanitizeDateVal(val);
      }
      return sanitizeDateVal(val);
    };

    if (req.body.shiftDate !== undefined) {
      req.body.shiftDate = sanitizeShiftDateVal(req.body.shiftDate);
    }

    // Sanitize all date fields in req.body
    ['bookingDate', 'passportExpiry', 'visaExpiry'].forEach(field => {
      if (req.body[field] !== undefined) {
        req.body[field] = sanitizeDateVal(req.body[field]);
      }
    });

    ['checkInDate', 'checkOutDate'].forEach(field => {
      if (req.body[field] !== undefined) {
        const sanitized = sanitizeDateVal(req.body[field]);
        if (sanitized) {
          req.body[field] = sanitized;
        } else {
          delete req.body[field];
        }
      }
    });

    const sharedFields = [
      'guestName', 'fatherName', 'phone', 'email', 'nationality', 'gender', 'age', 'address',
      'idType', 'idProof', 'aadhaarFront', 'aadhaarBack', 'signature',
      'guestPhoto', 'originalGuestPhoto',
      'guestGst', 'companyName', 'companyAddress', 'paymentStatus', 'paymentMode', 'paymentBank',
      'gstRate', 'gstOption', 'hsnCode', 'paymentHistory', 'bookingDate', 'bookingTime',
      'passportNumber', 'passportExpiry', 'visaNumber', 'visaType', 'visaExpiry', 'country', 'arrivalFrom', 'nextDestination', 'purposeOfVisit',
      'extraGuests', 'isChild', 'invoiceNumber', 'registrationNumber', 'earlyCheckInCharge', 'chargePreviousDay', 'discountReason'
    ];

    const updateData = { ...req.body };

    // Dedicated handler for per-room date and time updates (from inline editor)
    if (req.body.isSingleRoomDateUpdate) {
      const singleUpdates = {
        checkInDate: sanitizeDateVal(req.body.checkInDate) || booking.checkInDate,
        checkInTime: req.body.checkInTime || booking.checkInTime,
        checkOutDate: sanitizeDateVal(req.body.checkOutDate) || booking.checkOutDate,
        checkOutTime: req.body.checkOutTime || booking.checkOutTime
      };
      if (req.body.shiftDate !== undefined) singleUpdates.shiftDate = sanitizeShiftDateVal(req.body.shiftDate);
      if (req.body.shiftTime !== undefined) singleUpdates.shiftTime = req.body.shiftTime;
      if (req.body.previousRoomNumber !== undefined) singleUpdates.previousRoomNumber = req.body.previousRoomNumber;
      if (req.body.previousRoomType !== undefined) singleUpdates.previousRoomType = req.body.previousRoomType;
      if (req.body.previousRoomRate !== undefined) singleUpdates.previousRoomRate = req.body.previousRoomRate;
      if (req.body.sameDayChargeOption !== undefined) singleUpdates.sameDayChargeOption = req.body.sameDayChargeOption;
      if (req.body.pricePerNight !== undefined) {
        singleUpdates.pricePerNight = (req.body.pricePerNight !== null && req.body.pricePerNight !== '') ? Number(req.body.pricePerNight) : null;
      }
      if (req.body.totalAmount !== undefined) {
        singleUpdates.totalAmount = Number(req.body.totalAmount);
      }
      if (req.body.amountPaid !== undefined) {
        singleUpdates.amountPaid = Number(req.body.amountPaid);
      }
      if (req.body.discount !== undefined) {
        singleUpdates.discount = Number(req.body.discount);
      }
      if (req.body.discountReason !== undefined) {
        singleUpdates.discountReason = req.body.discountReason;
      }
      if (req.body.paymentStatus !== undefined) {
        singleUpdates.paymentStatus = req.body.paymentStatus;
      }
      if (req.body.gstOption !== undefined) {
        singleUpdates.gstOption = req.body.gstOption;
      }
      if (req.body.gstRate !== undefined) {
        singleUpdates.gstRate = Number(req.body.gstRate);
      }
      if (req.body.registrationNumber !== undefined) {
        singleUpdates.registrationNumber = req.body.registrationNumber;
      }

      if (req.body.roomId !== undefined && req.body.roomId !== booking.roomId) {
        const newRoomId = req.body.roomId;
        const oldRoomId = booking.roomId;
        const oldRoom = await Room.findOne({ where: { id: oldRoomId, hotelId: req.user.hotelId } });
        const newRoom = await Room.findOne({ where: { id: newRoomId, hotelId: req.user.hotelId } });
        if (newRoom) {
          singleUpdates.roomId = newRoomId;
          singleUpdates.previousRoomId = oldRoomId;
          singleUpdates.previousRoomNumber = oldRoom ? oldRoom.roomNumber : null;
          if (booking.status === 'Active') {
            if (oldRoom) await oldRoom.update({ status: 'available', guestName: null });
            await newRoom.update({ status: 'occupied', guestName: booking.guestName });
          }
        }
      }

      await booking.update(singleUpdates);
      await logActivity({
        req,
        hotelId: req.user.hotelId,
        moduleName: 'Guests',
        action: 'Room Dates Updated',
        entityType: 'Booking',
        entityId: booking.id,
        entityName: booking.guestName,
        description: `Updated check-in/out dates & time for Room ${booking.roomId}`
      });
      return res.status(200).json({ success: true, data: booking });
    }

    // If the booking is part of a group, bulk update the shared fields for the entire group
    if (booking.groupBookingId) {
      const sharedUpdates = {};
      sharedFields.forEach(field => {
        if (updateData[field] !== undefined) {
          sharedUpdates[field] = updateData[field];
        }
      });

      if (sharedUpdates.invoiceNumber === "") {
        sharedUpdates.invoiceNumber = null;
      }
          if (Object.keys(sharedUpdates).length > 0) {
        await Booking.update(sharedUpdates, {
          where: { groupBookingId: booking.groupBookingId }
        });
      }

      // Keep only individual room-specific fields for the single booking update
      const individualUpdates = {};
      const individualFields = [
        'roomId', 'previousRoomId', 'previousRoomNumber', 'previousRoomRate',
        'previousRoomType', 'shiftDate', 'shiftTime', 'roomShiftTimes', 'sameDayChargeOption',
        'totalAmount', 'amountPaid', 'discount', 'pricePerNight',
        'checkInDate', 'checkInTime', 'checkOutDate', 'checkOutTime'
      ];
      individualFields.forEach(field => {
        if (updateData[field] !== undefined) {
          individualUpdates[field] = updateData[field];
        }
      });

      // Distribute totalAmount, amountPaid, discount, and stay dates/times across the group
      const isShiftWithoutGroupData = (individualUpdates.roomId !== undefined && Number(individualUpdates.roomId) !== Number(booking.roomId)) && !req.body.groupRoomShifts;
      if (!req.body.skipGroupDistribution && !isShiftWithoutGroupData && (updateData.totalAmount !== undefined || updateData.amountPaid !== undefined || updateData.discount !== undefined || req.body.customRates || req.body.groupRoomShifts || req.body.checkOutDate || req.body.checkInDate)) {
        const groupBookings = await Booking.findAll({
          where: { groupBookingId: booking.groupBookingId, hotelId: req.user.hotelId },
          include: [{ model: Room }]
        });

        const customRates = req.body.customRates || {};
        const calcDetails = req.body.roomCalculationDetails || [];

        let sumOfAllRoomTotals = 0;
        const roomTotalsMap = new Map();

        groupBookings.forEach(gb => {
          let itemTotal = 0;
          if (calcDetails && calcDetails.length > 0) {
            if (gb.previousRoomNumber) {
              const matchingItems = calcDetails.filter(item => {
                if (Number(item.roomId) === Number(gb.roomId) || Number(item.roomId) === Number(gb.id) || String(item.roomNumber) === String(gb.Room?.roomNumber)) return true;
                if (item.isShiftedPrevious) return true;
                return false;
              });
              itemTotal = matchingItems.reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0);
            } else {
              const calcItem = calcDetails.find(item => Number(item.roomId) === Number(gb.roomId) || Number(item.roomId) === Number(gb.id) || String(item.roomNumber) === String(gb.Room?.roomNumber));
              if (calcItem && calcItem.total !== undefined && calcItem.total !== null) {
                itemTotal = parseFloat(calcItem.total) || 0;
              }
            }
          }

          if (!itemTotal) {
            let rate = undefined;
            if (customRates[gb.roomId] !== undefined && customRates[gb.roomId] !== '') rate = parseFloat(customRates[gb.roomId]);
            else if (customRates[gb.id] !== undefined && customRates[gb.id] !== '') rate = parseFloat(customRates[gb.id]);
            else if (gb.Room?.roomNumber && customRates[gb.Room.roomNumber] !== undefined && customRates[gb.Room.roomNumber] !== '') rate = parseFloat(customRates[gb.Room.roomNumber]);
            else rate = parseFloat(gb.Room?.pricePerNight) || 0;

            let rNights = 1;
            if (gb.checkInDate && gb.checkOutDate) {
              const d1 = new Date(gb.checkInDate.split('T')[0]);
              const d2 = new Date(gb.checkOutDate.split('T')[0]);
              rNights = Math.max(1, Math.ceil(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24)));
            }
            itemTotal = rate * rNights;
          }

          roomTotalsMap.set(gb.id, itemTotal);
          sumOfAllRoomTotals += itemTotal;
        });

        if (!sumOfAllRoomTotals) sumOfAllRoomTotals = 1;

        let accumulatedTotalAmount = 0;
        let accumulatedAmountPaid = 0;
        let accumulatedDiscount = 0;

        for (let i = 0; i < groupBookings.length; i++) {
          const gb = groupBookings[i];
          const calculatedGbTotal = roomTotalsMap.get(gb.id) || 0;
          const proportion = calculatedGbTotal / sumOfAllRoomTotals;
          let gbUpdates = {};

          // Update room-specific stay dates, times, and shifts from groupRoomShifts
          const shiftItem = Array.isArray(req.body.groupRoomShifts)
            ? req.body.groupRoomShifts.find(s =>
                (s.bookingId && Number(s.bookingId) === Number(gb.id)) ||
                (s.roomId && Number(s.roomId) === Number(gb.roomId))
              )
            : null;

          if (shiftItem) {
            const resolvedCheckIn = shiftItem.checkInDate || req.body.checkInDate;
            const resolvedCheckOut = shiftItem.checkOutDate || req.body.checkOutDate;
            const resolvedCheckInTime = shiftItem.checkInTime || req.body.checkInTime;
            const resolvedCheckOutTime = shiftItem.checkOutTime || req.body.checkOutTime;

            if (resolvedCheckIn) gbUpdates.checkInDate = sanitizeDateVal(resolvedCheckIn);
            if (resolvedCheckInTime) gbUpdates.checkInTime = resolvedCheckInTime;
            if (resolvedCheckOut) gbUpdates.checkOutDate = sanitizeDateVal(resolvedCheckOut);
            if (resolvedCheckOutTime) gbUpdates.checkOutTime = resolvedCheckOutTime;
            if (shiftItem.shiftDate !== undefined) gbUpdates.shiftDate = sanitizeShiftDateVal(shiftItem.shiftDate);
            if (shiftItem.shiftTime !== undefined) gbUpdates.shiftTime = shiftItem.shiftTime;
            if (shiftItem.previousRoomNumber !== undefined) gbUpdates.previousRoomNumber = shiftItem.previousRoomNumber;
            if (shiftItem.previousRoomRate !== undefined) gbUpdates.previousRoomRate = shiftItem.previousRoomRate;
            if (shiftItem.previousRoomType !== undefined) gbUpdates.previousRoomType = shiftItem.previousRoomType;
            if (shiftItem.sameDayChargeOption !== undefined) gbUpdates.sameDayChargeOption = shiftItem.sameDayChargeOption;
            if (shiftItem.pricePerNight !== undefined && shiftItem.pricePerNight !== null && shiftItem.pricePerNight !== '') {
              gbUpdates.pricePerNight = Number(shiftItem.pricePerNight);
            }
          } else {
            if (req.body.checkInDate) gbUpdates.checkInDate = sanitizeDateVal(req.body.checkInDate);
            if (req.body.checkInTime) gbUpdates.checkInTime = req.body.checkInTime;
            if (req.body.checkOutDate) gbUpdates.checkOutDate = sanitizeDateVal(req.body.checkOutDate);
            if (req.body.checkOutTime) gbUpdates.checkOutTime = req.body.checkOutTime;
          }

          if (!gbUpdates.pricePerNight) {
            let customRate = undefined;
            if (customRates[gb.roomId] !== undefined && customRates[gb.roomId] !== '') customRate = parseFloat(customRates[gb.roomId]);
            else if (customRates[gb.id] !== undefined && customRates[gb.id] !== '') customRate = parseFloat(customRates[gb.id]);
            else if (gb.Room?.roomNumber && customRates[gb.Room.roomNumber] !== undefined && customRates[gb.Room.roomNumber] !== '') customRate = parseFloat(customRates[gb.Room.roomNumber]);
            if (customRate !== undefined && !isNaN(customRate) && customRate > 0) {
              gbUpdates.pricePerNight = customRate;
            }
          }

          if (updateData.totalAmount !== undefined) {
            if (i === groupBookings.length - 1) {
              gbUpdates.totalAmount = parseFloat((parseFloat(updateData.totalAmount) - accumulatedTotalAmount).toFixed(2));
            } else {
              gbUpdates.totalAmount = parseFloat((parseFloat(updateData.totalAmount) * proportion).toFixed(2));
              accumulatedTotalAmount += gbUpdates.totalAmount;
            }
          } else if (calculatedGbTotal > 0) {
            gbUpdates.totalAmount = parseFloat(calculatedGbTotal.toFixed(2));
            accumulatedTotalAmount += gbUpdates.totalAmount;
          }

          if (i === groupBookings.length - 1) {
            if (updateData.amountPaid !== undefined) {
              gbUpdates.amountPaid = parseFloat((parseFloat(updateData.amountPaid) - accumulatedAmountPaid).toFixed(2));
            }
            if (updateData.discount !== undefined) {
              gbUpdates.discount = parseFloat((parseFloat(updateData.discount) - accumulatedDiscount).toFixed(2));
            }
          } else {
            if (updateData.amountPaid !== undefined) {
              gbUpdates.amountPaid = parseFloat((parseFloat(updateData.amountPaid) * proportion).toFixed(2));
              accumulatedAmountPaid += gbUpdates.amountPaid;
            }
            if (updateData.discount !== undefined) {
              gbUpdates.discount = parseFloat((parseFloat(updateData.discount) * proportion).toFixed(2));
              accumulatedDiscount += gbUpdates.discount;
            }
          }

          await gb.update(gbUpdates);
        }

        // Distributed across group already — prevent individualUpdates from overwriting primary booking with total group values
        delete individualUpdates.totalAmount;
        delete individualUpdates.amountPaid;
        delete individualUpdates.discount;
      }

      if (Object.keys(individualUpdates).length > 0) {
        // Handle Room Shifting if roomId is changing
        if (individualUpdates.roomId !== undefined && individualUpdates.roomId !== booking.roomId) {
          const newRoomId = individualUpdates.roomId;
          const oldRoomId = booking.roomId;
          const oldRoom = await Room.findOne({ where: { id: oldRoomId, hotelId: req.user.hotelId } });
          const newRoom = await Room.findOne({ where: { id: newRoomId, hotelId: req.user.hotelId } });

          if (newRoom) {
            const oldNumStr = oldRoom ? oldRoom.roomNumber : null;
            let combinedPrevNum = booking.previousRoomNumber || req.body.previousRoomNumber;
            if (combinedPrevNum && oldNumStr) {
              const parts = String(combinedPrevNum).split(/→|->|,|>/).map(p => p.trim()).filter(Boolean);
              if (parts[parts.length - 1] !== String(oldNumStr)) {
                combinedPrevNum = `${combinedPrevNum} → ${oldNumStr}`;
              }
            } else if (oldNumStr) {
              combinedPrevNum = oldNumStr;
            }

            const shiftYMD = sanitizeDateVal(req.body.shiftDate) || new Date().toISOString().split('T')[0];
            const checkInYMD = booking.checkInDate ? booking.checkInDate.split('T')[0] : '';
            const checkOutYMD = booking.checkOutDate ? booking.checkOutDate.split('T')[0] : '';

            let totalStayDays = 1;
            if (checkInYMD && checkOutYMD) {
              totalStayDays = Math.max(1, Math.ceil(Math.abs(new Date(checkOutYMD) - new Date(checkInYMD)) / (1000 * 60 * 60 * 24)));
            }

            let prevDays = 0;
            if (shiftYMD > checkInYMD) {
              prevDays = Math.min(totalStayDays - 1, Math.ceil(Math.abs(new Date(shiftYMD) - new Date(checkInYMD)) / (1000 * 60 * 60 * 24)));
            }
            const curDays = Math.max(1, totalStayDays - prevDays);

            const existingPrevRateList = String(booking.previousRoomRate || '').split(/→|->|,|>/).map(s => Number(s.trim())).filter(n => !isNaN(n));
            const lastSavedPrevRate = existingPrevRateList.length > 0 ? existingPrevRateList[existingPrevRateList.length - 1] : null;

            let actualOldRate = (req.body.previousRoomRate !== undefined && req.body.previousRoomRate !== null && !isNaN(Number(req.body.previousRoomRate)) && Number(req.body.previousRoomRate) >= 0)
              ? Number(req.body.previousRoomRate)
              : (lastSavedPrevRate !== null ? lastSavedPrevRate : Number(oldRoom ? oldRoom.pricePerNight : 0));


            const currentPrevRateStr = booking.previousRoomRate;
            let combinedPrevRate = String(actualOldRate);
            if (currentPrevRateStr) {
              const rateParts = String(currentPrevRateStr).split(/→|->|,|>/).map(s => Number(s.trim())).filter(n => !isNaN(n));
              const reqParts = String(req.body.previousRoomRate || '').split(/→|->|,|>/).map(s => Number(s.trim())).filter(n => !isNaN(n));
              if (reqParts.length > rateParts.length) {
                combinedPrevRate = String(req.body.previousRoomRate);
              } else if (rateParts.length > 0) {
                combinedPrevRate = `${currentPrevRateStr} → ${actualOldRate}`;
              }
            }

            const prevRateVal = combinedPrevRate;
            const curRate = req.body.newRoomPrice !== undefined ? Number(req.body.newRoomPrice) : Number(newRoom ? newRoom.pricePerNight : 0);

            const pRatesList = String(prevRateVal).split(/→|->|,|>/).map(s => Number(s.trim())).filter(n => !isNaN(n));
            let prevTotalSum = 0;
            if (pRatesList.length > 0) {
              pRatesList.forEach((rVal, rIdx) => {
                const dForRm = rIdx === 0 ? prevDays : 0;
                prevTotalSum += rVal * dForRm;
              });
            } else {
              prevTotalSum = Number(prevRateVal || 0) * prevDays;
            }

            if (req.body.sameDayChargeOption === 'charge_previous') {
              prevTotalSum += actualOldRate;
            }

            const nowShiftTime = req.body.shiftTime || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
            const currentShiftTimeStr = booking.shiftTime;
            let combinedShiftTime = nowShiftTime;
            if (currentShiftTimeStr) {
              const timeParts = String(currentShiftTimeStr).split(/→|->|,|>/).map(s => s.trim()).filter(Boolean);
              const reqTimeParts = String(req.body.shiftTime || '').split(/→|->|,|>/).map(s => s.trim()).filter(Boolean);
              if (reqTimeParts.length > timeParts.length) {
                combinedShiftTime = String(req.body.shiftTime);
              } else {
                combinedShiftTime = `${currentShiftTimeStr} → ${nowShiftTime}`;
              }
            }

            let combinedShiftDate = shiftYMD;
            if (booking.shiftDate) {
              const dateParts = String(booking.shiftDate).split(/→|->|,|>/).map(s => s.trim()).filter(Boolean);
              const reqDateParts = String(req.body.shiftDate || '').split(/→|->|,|>/).map(s => s.trim()).filter(Boolean);
              if (reqDateParts.length > dateParts.length) {
                combinedShiftDate = String(req.body.shiftDate);
              } else if (dateParts.length > 0) {
                combinedShiftDate = `${booking.shiftDate} → ${shiftYMD}`;
              }
            }

            individualUpdates.previousRoomId = oldRoomId;
            individualUpdates.previousRoomNumber = combinedPrevNum;
            individualUpdates.previousRoomRate = String(prevRateVal);
            individualUpdates.previousRoomType = req.body.previousRoomType || (oldRoom ? (oldRoom.type || oldRoom.roomType) : null);
            individualUpdates.shiftDate = combinedShiftDate;
            individualUpdates.shiftTime = combinedShiftTime;
            individualUpdates.totalAmount = prevTotalSum + (curDays * curRate);
            individualUpdates.pricePerNight = curRate;

            if (booking.status === 'Active') {
              if (oldRoom) {
                await oldRoom.update({ status: 'available', guestName: null });
              }
              await newRoom.update({ status: 'occupied', guestName: booking.guestName });
            }
          }
        }

        if (individualUpdates.invoiceNumber === "") {
          individualUpdates.invoiceNumber = null;
        }
        if (individualUpdates.shiftDate !== undefined) {
          individualUpdates.shiftDate = sanitizeShiftDateVal(individualUpdates.shiftDate);
        }

        const mainShiftItem = Array.isArray(req.body.groupRoomShifts)
          ? req.body.groupRoomShifts.find(s =>
              (s.bookingId && Number(s.bookingId) === Number(booking.id)) ||
              (s.roomId && Number(s.roomId) === Number(booking.roomId))
            )
          : null;
        if (mainShiftItem) {
          const resIn = mainShiftItem.checkInDate || req.body.checkInDate;
          const resOut = mainShiftItem.checkOutDate || req.body.checkOutDate;
          const resInTime = mainShiftItem.checkInTime || req.body.checkInTime;
          const resOutTime = mainShiftItem.checkOutTime || req.body.checkOutTime;
          if (resIn) individualUpdates.checkInDate = sanitizeDateVal(resIn);
          if (resInTime) individualUpdates.checkInTime = resInTime;
          if (resOut) individualUpdates.checkOutDate = sanitizeDateVal(resOut);
          if (resOutTime) individualUpdates.checkOutTime = resOutTime;
        } else {
          if (req.body.checkInDate) individualUpdates.checkInDate = sanitizeDateVal(req.body.checkInDate);
          if (req.body.checkInTime) individualUpdates.checkInTime = req.body.checkInTime;
          if (req.body.checkOutDate) individualUpdates.checkOutDate = sanitizeDateVal(req.body.checkOutDate);
          if (req.body.checkOutTime) individualUpdates.checkOutTime = req.body.checkOutTime;
        }

        await booking.update(individualUpdates);
      }
    } else {
      // Not a group, update normally
      // Handle Room Shifting if roomId is changing
      if (req.body.roomId !== undefined && req.body.roomId !== booking.roomId) {
        const newRoomId = req.body.roomId;
        const oldRoomId = booking.roomId;
        const oldRoom = await Room.findOne({ where: { id: oldRoomId, hotelId: req.user.hotelId } });
        const newRoom = await Room.findOne({ where: { id: newRoomId, hotelId: req.user.hotelId } });

        if (newRoom) {
          const oldNumStr = oldRoom ? oldRoom.roomNumber : null;
          let combinedPrevNum = booking.previousRoomNumber || req.body.previousRoomNumber;
          if (combinedPrevNum && oldNumStr) {
            const parts = String(combinedPrevNum).split(/→|->|,|>/).map(p => p.trim()).filter(Boolean);
            if (parts[parts.length - 1] !== String(oldNumStr)) {
              combinedPrevNum = `${combinedPrevNum} → ${oldNumStr}`;
            }
          } else if (oldNumStr) {
            combinedPrevNum = oldNumStr;
          }

          const shiftYMD = sanitizeDateVal(req.body.shiftDate) || new Date().toISOString().split('T')[0];
          const checkInYMD = booking.checkInDate ? booking.checkInDate.split('T')[0] : '';
          const checkOutYMD = booking.checkOutDate ? booking.checkOutDate.split('T')[0] : '';

          let totalStayDays = 1;
          if (checkInYMD && checkOutYMD) {
            totalStayDays = Math.max(1, Math.ceil(Math.abs(new Date(checkOutYMD) - new Date(checkInYMD)) / (1000 * 60 * 60 * 24)));
          }

          let prevDays = 0;
          if (shiftYMD > checkInYMD) {
            prevDays = Math.min(totalStayDays - 1, Math.ceil(Math.abs(new Date(shiftYMD) - new Date(checkInYMD)) / (1000 * 60 * 60 * 24)));
          }
          const curDays = Math.max(1, totalStayDays - prevDays);

          const existingPrevRateList = String(booking.previousRoomRate || '').split(/→|->|,|>/).map(s => Number(s.trim())).filter(n => !isNaN(n));
          const lastSavedPrevRate = existingPrevRateList.length > 0 ? existingPrevRateList[existingPrevRateList.length - 1] : null;

          let actualOldRate = (req.body.previousRoomRate !== undefined && req.body.previousRoomRate !== null && !isNaN(Number(req.body.previousRoomRate)) && Number(req.body.previousRoomRate) >= 0)
            ? Number(req.body.previousRoomRate)
            : (lastSavedPrevRate !== null ? lastSavedPrevRate : Number(oldRoom ? oldRoom.pricePerNight : 0));


          const currentPrevRateStr = booking.previousRoomRate;
          let combinedPrevRate = String(actualOldRate);
          if (currentPrevRateStr) {
            const rateParts = String(currentPrevRateStr).split(/→|->|,|>/).map(s => Number(s.trim())).filter(n => !isNaN(n));
            const reqParts = String(req.body.previousRoomRate || '').split(/→|->|,|>/).map(s => Number(s.trim())).filter(n => !isNaN(n));
            if (reqParts.length > rateParts.length) {
              combinedPrevRate = String(req.body.previousRoomRate);
            } else if (rateParts.length > 0) {
              combinedPrevRate = `${currentPrevRateStr} → ${actualOldRate}`;
            }
          }

          const prevRateVal = combinedPrevRate;
          const curRate = req.body.newRoomPrice !== undefined ? Number(req.body.newRoomPrice) : Number(newRoom ? newRoom.pricePerNight : oldRoomRate);

          const pRatesList = String(prevRateVal).split(/→|->|,|>/).map(s => Number(s.trim())).filter(n => !isNaN(n));
          let prevTotalSum = 0;
          if (pRatesList.length > 0) {
            pRatesList.forEach((rVal, rIdx) => {
              const dForRm = rIdx === 0 ? prevDays : 0;
              prevTotalSum += rVal * dForRm;
            });
          } else {
            prevTotalSum = Number(prevRateVal || 0) * prevDays;
          }

          if (req.body.sameDayChargeOption === 'charge_previous') {
            prevTotalSum += actualOldRate;
          }

          const nowShiftTime = req.body.shiftTime || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
          const currentShiftTimeStr = booking.shiftTime;
          let combinedShiftTime = nowShiftTime;
          if (currentShiftTimeStr) {
            const timeParts = String(currentShiftTimeStr).split(/→|->|,|>/).map(s => s.trim()).filter(Boolean);
            const reqTimeParts = String(req.body.shiftTime || '').split(/→|->|,|>/).map(s => s.trim()).filter(Boolean);
            if (reqTimeParts.length > timeParts.length) {
              combinedShiftTime = String(req.body.shiftTime);
            } else {
              combinedShiftTime = `${currentShiftTimeStr} → ${nowShiftTime}`;
            }
          }

          let combinedShiftDate = shiftYMD;
          if (booking.shiftDate) {
            const dateParts = String(booking.shiftDate).split(/→|->|,|>/).map(s => s.trim()).filter(Boolean);
            const reqDateParts = String(req.body.shiftDate || '').split(/→|->|,|>/).map(s => s.trim()).filter(Boolean);
            if (reqDateParts.length > dateParts.length) {
              combinedShiftDate = String(req.body.shiftDate);
            } else if (dateParts.length > 0) {
              combinedShiftDate = `${booking.shiftDate} → ${shiftYMD}`;
            }
          }

          req.body.previousRoomId = oldRoomId;
          req.body.previousRoomNumber = combinedPrevNum;
          req.body.previousRoomRate = String(prevRateVal);
          req.body.previousRoomType = req.body.previousRoomType || (oldRoom ? (oldRoom.type || oldRoom.roomType) : null);
          req.body.shiftDate = combinedShiftDate;
          req.body.shiftTime = combinedShiftTime;
          req.body.totalAmount = prevTotalSum + (curDays * curRate);
          req.body.pricePerNight = curRate;

          if (booking.status === 'Active') {
            if (oldRoom) {
              await oldRoom.update({ status: 'available', guestName: null });
            }
            await newRoom.update({ status: 'occupied', guestName: booking.guestName });
          }
        }
      }

      const allowedKeys = Object.keys(Booking.rawAttributes);
      const safeUpdateData = {};
      allowedKeys.forEach(key => {
        if (req.body[key] !== undefined && key !== 'id' && key !== 'createdAt' && key !== 'updatedAt') {
          safeUpdateData[key] = req.body[key];
        }
      });
      if (safeUpdateData.invoiceNumber === "") {
        safeUpdateData.invoiceNumber = null;
      }
      if (safeUpdateData.shiftDate !== undefined) {
        safeUpdateData.shiftDate = sanitizeShiftDateVal(safeUpdateData.shiftDate);
      }
      if (safeUpdateData.bookingDate !== undefined) {
        safeUpdateData.bookingDate = sanitizeDateVal(safeUpdateData.bookingDate);
      }
      await booking.update(safeUpdateData);
    }

    // Sync updated guestName to occupied Room records
    if (req.body.guestName) {
      let roomIdsToUpdate = [];
      if (booking.groupBookingId) {
        const groupBookings = await Booking.findAll({
          where: { groupBookingId: booking.groupBookingId, hotelId: req.user.hotelId }
        });
        roomIdsToUpdate = groupBookings.map(b => b.roomId).filter(Boolean);
      } else if (booking.roomId) {
        roomIdsToUpdate = [booking.roomId];
      }

      if (roomIdsToUpdate.length > 0) {
        await Room.update(
          { guestName: req.body.guestName },
          { where: { id: { [Op.in]: roomIdsToUpdate }, hotelId: req.user.hotelId } }
        );
      }
    }

    const updatedBooking = await Booking.findByPk(booking.id);
    let action = 'Reservation Updated';
    let moduleName = 'Reservations';
    let description = `Booking details for guest ${booking.guestName} were updated.`;

    if (oldBookingData.invoiceNumber !== updatedBooking.invoiceNumber) {
      moduleName = 'Billing';
      if (!oldBookingData.invoiceNumber && updatedBooking.invoiceNumber) {
        action = 'Invoice Generated';
        description = `Invoice ${updatedBooking.invoiceNumber} generated for guest ${booking.guestName}.`;
      } else if (oldBookingData.invoiceNumber && !updatedBooking.invoiceNumber) {
        action = 'Invoice Deleted';
        description = `Invoice number removed from booking for ${booking.guestName}.`;
      } else {
        action = 'Invoice Edited';
        description = `Invoice number updated from ${oldBookingData.invoiceNumber} to ${updatedBooking.invoiceNumber} for guest ${booking.guestName}.`;
      }
    } else if (oldBookingData.amountPaid !== updatedBooking.amountPaid) {
      moduleName = 'Billing';
      action = 'Payment Received';
      description = `Payment of ₹${Math.abs(updatedBooking.amountPaid - oldBookingData.amountPaid)} recorded for guest ${booking.guestName}.`;
    }

    await logActivity({
      req,
      hotelId: req.user.hotelId,
      moduleName,
      action,
      entityType: 'Booking',
      entityId: booking.id,
      entityName: booking.guestName,
      description,
      oldValue: oldBookingData,
      newValue: updatedBooking
    });

    res.status(200).json({ success: true, data: booking });
  } catch (error) {
    console.error('CRITICAL ERROR during booking update:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update booking.'
    });
  }
};

// @desc    Get guest history
exports.getGuestHistory = async (req, res, next) => {
  try {
    const { search, startDate, endDate, page, limit } = req.query;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const offsetNum = (pageNum - 1) * limitNum;

    const where = {
      status: { [Op.in]: ['Completed', 'Cancelled'] },
      hotelId: req.user.hotelId
    };
    if (search) {
      const cleanSearch = search.replace(/^[rR][- ]?/, '');
      where[Op.or] = [
        { guestName: { [Op.like]: `%${search}%` } },
        { phone: { [Op.like]: `%${search}%` } },
        { registrationNumber: { [Op.like]: `%${search}%` } },
        { previousRoomNumber: { [Op.like]: `%${cleanSearch}%` } },
        { '$Room.roomNumber$': { [Op.like]: `%${cleanSearch}%` } }
      ];
    }
    if (startDate || endDate) {
      where.checkOutDate = {};
      if (startDate) {
        where.checkOutDate[Op.gte] = startDate;
      }
      if (endDate) {
        where.checkOutDate[Op.lte] = endDate;
      }
    }

    const { count, rows: bookings } = await Booking.findAndCountAll({
      where,
      include: [{ model: Room, attributes: ['roomNumber', 'type', 'pricePerNight'] }],
      order: [['checkOutDate', 'DESC'], ['updatedAt', 'DESC']],
      limit: limitNum,
      offset: offsetNum,
      subQuery: false
    });

    const Hotel = require('../models/Hotel');
    const hotel = await Hotel.findByPk(req.user.hotelId);
    const prefix = hotel?.invoicePrefix || 'INV-';

    const globalBookingsAll = await Booking.findAll({
      where: { hotelId: req.user.hotelId, status: { [Op.ne]: 'Cancelled' } },
      attributes: ['id', 'groupBookingId', 'registrationNumber', 'createdAt'],
      order: [['createdAt', 'ASC'], ['id', 'ASC']]
    });

    const uniqueGroups = [];
    const groupMap = new Map();

    for (const b of globalBookingsAll) {
      const groupKey = b.groupBookingId || `single-${b.id}`;
      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, b);
        uniqueGroups.push({ groupKey, primaryBooking: b });
      }
    }

    const globalRegMap = new Map();
    uniqueGroups.forEach((g, idx) => {
      const b = g.primaryBooking;
      const reg = (b.registrationNumber && String(b.registrationNumber).trim())
        ? String(b.registrationNumber).trim()
        : `REG-${String(idx + 1).padStart(3, '0')}`;

      if (b.groupBookingId) {
        globalBookingsAll.forEach(gb => {
          if (gb.groupBookingId === b.groupBookingId) {
            globalRegMap.set(gb.id, reg);
          }
        });
      } else {
        globalRegMap.set(b.id, reg);
      }
    });

    const mappedData = await Promise.all(bookings.map(async (b) => {
      const { getBookingSerialNumber } = require('../utils/invoiceHelper');
      const serialNumber = await getBookingSerialNumber(b, hotel);
      const defaultInvoiceNumber = `${prefix}${serialNumber}`;
      const defaultRegNo = globalRegMap.get(b.id) || `REG-${String(b.id || 1).padStart(3, '0')}`;
      const plain = b.toJSON ? b.toJSON() : b;
      return {
        ...plain,
        registrationNumber: b.registrationNumber || defaultRegNo,
        invoiceNumber: b.invoiceNumber || defaultInvoiceNumber
      };
    }));

    const totalPages = Math.ceil(count / limitNum);

    res.status(200).json({
      success: true,
      data: mappedData,
      totalPages: totalPages || 1,
      totalRecords: count
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete booking (Cancel Check-In)
// @route   DELETE /api/bookings/:id
exports.deleteBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findOne({
      where: { id: req.params.id, hotelId: req.user.hotelId }
    });
    if (!booking) {
      res.status(404);
      throw new Error('Booking not found');
    }

    // Resolve all bookings in the group if groupBookingId exists
    let bookingsToDelete = [booking];
    if (booking.groupBookingId) {
      bookingsToDelete = await Booking.findAll({
        where: { groupBookingId: booking.groupBookingId, hotelId: req.user.hotelId }
      });
    }

    const { deleteOldFile } = require('../utils/fileHelper');
    const Kot = require('../models/Kot');

    const { refundAmount, refundMode, cancellationReason } = req.body || {};
    const moment = require('moment-timezone');

    for (const b of bookingsToDelete) {
      // 1. Revert room status to available
      const room = await Room.findOne({ where: { id: b.roomId, hotelId: req.user.hotelId } });
      if (room) {
        await room.update({ status: 'available', guestName: null });
      }

      // 2. Parse existing payment history and record refund if applicable
      let history = [];
      try {
        history = JSON.parse(b.paymentHistory || '[]');
      } catch (e) {
        history = [];
      }

      const refAmt = parseFloat(refundAmount) || 0;
      if (refAmt > 0) {
        history.push({
          amount: -refAmt,
          date: moment().tz('Asia/Kolkata').format('YYYY-MM-DD'),
          time: moment().tz('Asia/Kolkata').format('hh:mm A'),
          type: 'Refund',
          paymentMode: refundMode || 'Cash',
          paymentBank: req.body.refundBank || null,
          notes: cancellationReason || 'Booking Cancellation Refund'
        });
      }

      const oldBookingData = b.toJSON();

      // 3. Mark status as Cancelled (do NOT hard delete!) and release invoice & registration numbers
      await b.update({
        status: 'Cancelled',
        invoiceNumber: null,
        registrationNumber: null,
        paymentHistory: JSON.stringify(history)
      });

      await logActivity({
        req,
        hotelId: req.user.hotelId,
        moduleName: b.status === 'Active' ? 'Guests' : 'Reservations',
        action: 'Booking Cancelled',
        entityType: 'Booking',
        entityId: b.id,
        entityName: b.guestName,
        description: `Booking for ${b.guestName} (Room ID: ${b.roomId}) was cancelled. Refund: ₹${refAmt} (${refundMode || 'N/A'}). Reason: ${cancellationReason || 'N/A'}.`,
        oldValue: oldBookingData,
        newValue: b
      });
    }

    res.status(200).json({ success: true, message: 'Booking cancelled successfully and moved to Guest History' });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single booking by ID with full details (Room, GroupBookings, Kots, ExtraCharges)
// @route   GET /api/bookings/:id
exports.getBookingById = async (req, res, next) => {
  try {
    if (!Booking.associations || !Booking.associations.Room) {
      Booking.belongsTo(Room, { foreignKey: 'roomId' });
    }

    const booking = await Booking.findOne({
      where: { id: req.params.id, hotelId: req.user.hotelId },
      include: [{ model: Room, attributes: ['id', 'roomNumber', 'type', 'pricePerNight', 'floor'] }]
    });
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    let plainBooking = booking.get({ plain: true });
    let groupBookings = [];
    if (booking.groupBookingId) {
      const gbs = await Booking.findAll({
        where: { groupBookingId: booking.groupBookingId, hotelId: req.user.hotelId },
        include: [{ model: Room, attributes: ['id', 'roomNumber', 'type', 'pricePerNight', 'floor'] }]
      });
      groupBookings = gbs.map(gb => gb.get({ plain: true }));
      plainBooking.groupBookings = groupBookings;
    }

    let bookingIds = [booking.id];
    if (booking.groupBookingId && groupBookings.length > 0) {
      bookingIds = groupBookings.map(gb => gb.id);
    }

    let kots = [];
    try {
      const Kot = require('../models/Kot');
      kots = await Kot.findAll({
        where: { bookingId: { [Op.in]: bookingIds }, status: { [Op.ne]: 'Cancelled' }, hotelId: req.user.hotelId }
      });
    } catch (e) {
      kots = [];
    }

    let extraCharges = [];
    try {
      const ExtraCharge = require('../models/ExtraCharge');
      extraCharges = await ExtraCharge.findAll({
        where: { bookingId: { [Op.in]: bookingIds }, hotelId: req.user.hotelId }
      });
    } catch (e) {
      extraCharges = [];
    }

    plainBooking.kots = kots;
    plainBooking.extraChargesList = extraCharges;

    res.status(200).json({ success: true, data: plainBooking });
  } catch (error) {
    console.error('Error in getBookingById:', error);
    next(error);
  }
};

// @desc    Get next available registration number for hotel
// @route   GET /api/bookings/next-reg-no
// @access  Private
exports.getNextRegistrationNumber = async (req, res, next) => {
  try {
    const allBookingsWithReg = await Booking.findAll({
      where: {
        hotelId: req.user.hotelId,
        registrationNumber: { [Op.ne]: null },
        status: { [Op.ne]: 'Cancelled' }
      },
      attributes: ['id', 'registrationNumber']
    });

    let maxSeq = 0;
    allBookingsWithReg.forEach(b => {
      const reg = b.registrationNumber || '';
      const match = String(reg).match(/(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxSeq) maxSeq = num;
      }
    });

    if (maxSeq === 0) {
      const totalCount = await Booking.count({ where: { hotelId: req.user.hotelId, status: { [Op.ne]: 'Cancelled' } } });
      maxSeq = totalCount;
    }

    const nextRegNo = `REG-${String(maxSeq + 1).padStart(3, '0')}`;
    res.status(200).json({ success: true, nextRegNo });
  } catch (error) {
    next(error);
  }
};

