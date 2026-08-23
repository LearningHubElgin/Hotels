  const Booking = require('../models/Booking');
const Room = require('../models/Room');
const Kot = require('../models/Kot');
const ExtraCharge = require('../models/ExtraCharge');
const { Op } = require('sequelize');

// @desc    Get dashboard summary (KPIs, Charts, Recent Activity)
// @route   GET /api/analytics/dashboard
// @access  Private (Admin/Staff)
exports.getDashboardStats = async (req, res, next) => {
  try {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // 1. KPI Counts (Case-corrected to 'occupied')
    const totalBookings = await Booking.count({ where: { hotelId: req.user.hotelId } });
    const totalRooms = await Room.count({ where: { hotelId: req.user.hotelId, isDeleted: false } });
    const occupiedRooms = await Room.count({ where: { status: 'occupied', hotelId: req.user.hotelId, isDeleted: false } });
    const availableRooms = await Room.count({ where: { status: 'available', hotelId: req.user.hotelId, isDeleted: false } });
    const activeGuests = await Booking.count({ where: { status: 'Active', hotelId: req.user.hotelId } });

    // 2. Revenue Calculation
    const allBookings = await Booking.findAll({
      where: { status: { [Op.in]: ['Active', 'Completed'] }, hotelId: req.user.hotelId }
    });

    const monthlyRevenue = allBookings
      .filter(b => {
        const d = new Date(b.createdAt);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      })
      .reduce((acc, curr) => acc + (parseFloat(curr.amountPaid) || 0), 0);

    // Calculate dynamic WoW / MoM trend percentage changes
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    // Bookings WoW Change
    const bookingsThisWeek = await Booking.count({
      where: { createdAt: { [Op.gte]: sevenDaysAgo }, hotelId: req.user.hotelId }
    });
    const bookingsLastWeek = await Booking.count({
      where: {
        createdAt: {
          [Op.gte]: fourteenDaysAgo,
          [Op.lt]: sevenDaysAgo
        },
        hotelId: req.user.hotelId
      }
    });
    let bookingsChangePercent = 0;
    if (bookingsLastWeek > 0) {
      bookingsChangePercent = Math.round(((bookingsThisWeek - bookingsLastWeek) / bookingsLastWeek) * 100);
    } else if (bookingsThisWeek > 0) {
      bookingsChangePercent = 100;
    }
    const totalBookingsChange = bookingsChangePercent >= 0 ? `+${bookingsChangePercent}%` : `${bookingsChangePercent}%`;
    const totalBookingsPositive = bookingsChangePercent >= 0;

    // Available Rooms trend (e.g. check-ins comparison today vs yesterday)
    const todayString = new Date().toISOString().split('T')[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayString = yesterday.toISOString().split('T')[0];
    const checkinsToday = await Booking.count({
      where: { checkInDate: todayString, status: { [Op.in]: ['Active', 'Completed'] }, hotelId: req.user.hotelId }
    });
    const checkinsYesterday = await Booking.count({
      where: { checkInDate: yesterdayString, status: { [Op.in]: ['Active', 'Completed'] }, hotelId: req.user.hotelId }
    });
    let roomsChangePercent = 0;
    if (checkinsYesterday > 0) {
      roomsChangePercent = Math.round(((checkinsToday - checkinsYesterday) / checkinsYesterday) * 100);
    } else if (checkinsToday > 0) {
      roomsChangePercent = 100;
    }
    // Available rooms increase when there are fewer check-ins, so invert for available rooms display
    const roomsChangeValue = -roomsChangePercent;
    const availableRoomsChange = roomsChangeValue >= 0 ? `+${roomsChangeValue}%` : `${roomsChangeValue}%`;
    const availableRoomsPositive = roomsChangeValue >= 0;

    // Active Guests change (comparing active guests created this week vs prior week)
    const activeGuestsThisWeek = await Booking.count({
      where: { status: 'Active', createdAt: { [Op.gte]: sevenDaysAgo }, hotelId: req.user.hotelId }
    });
    const activeGuestsLastWeek = await Booking.count({
      where: {
        status: 'Active',
        createdAt: {
          [Op.gte]: fourteenDaysAgo,
          [Op.lt]: sevenDaysAgo
        },
        hotelId: req.user.hotelId
      }
    });
    let guestsChangePercent = 0;
    if (activeGuestsLastWeek > 0) {
      guestsChangePercent = Math.round(((activeGuestsThisWeek - activeGuestsLastWeek) / activeGuestsLastWeek) * 100);
    } else if (activeGuestsThisWeek > 0) {
      guestsChangePercent = 100;
    }
    const activeGuestsChange = guestsChangePercent >= 0 ? `+${guestsChangePercent}%` : `${guestsChangePercent}%`;
    const activeGuestsPositive = guestsChangePercent >= 0;

    // Revenue MTD change compared to last month
    const lastMonthStart = new Date(currentYear, currentMonth - 1, 1);
    const lastMonthEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);
    const lastMonthRevenue = allBookings
      .filter(b => {
        const d = new Date(b.createdAt);
        return d >= lastMonthStart && d <= lastMonthEnd;
      })
      .reduce((acc, curr) => acc + (parseFloat(curr.amountPaid) || 0), 0);
    let revenueChangePercent = 0;
    if (lastMonthRevenue > 0) {
      revenueChangePercent = Math.round(((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue) * 100);
    } else if (monthlyRevenue > 0) {
      revenueChangePercent = 100;
    }
    const revenueChange = revenueChangePercent >= 0 ? `+${revenueChangePercent}%` : `${revenueChangePercent}%`;
    const revenuePositive = revenueChangePercent >= 0;

    // 3. Daily Chart Data (Last 7 Days)
    const dailyData = [];
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateString = date.toISOString().split('T')[0];
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });

      // Revenue from bookings created on this day
      const dayRevenue = allBookings
        .filter(b => {
          const createdAt = new Date(b.createdAt).toISOString().split('T')[0];
          return createdAt === dateString;
        })
        .reduce((acc, curr) => acc + (parseFloat(curr.amountPaid) || 0), 0);

      // Occupancy: count bookings that are active on this specific date
      const occupiedOnDay = allBookings.filter(b => {
        return b.status !== 'Cancelled' &&
          b.checkInDate <= dateString &&
          b.checkOutDate >= dateString;
      }).length;

      const occupancyPercent = totalRooms > 0 ? Math.round((occupiedOnDay / totalRooms) * 100) : 0;

      dailyData.push({
        name: dayName,
        revenue: dayRevenue,
        occupancy: occupancyPercent
      });
    }

    // 4. Monthly Chart Data (Last 6 Months)
    const monthlyData = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const monthLabel = d.toLocaleDateString('en-US', { month: 'short' });
      const year = d.getFullYear();
      const month = d.getMonth();

      // Total revenue for that month
      const monthRevenue = allBookings
        .filter(b => {
          const bd = new Date(b.createdAt);
          return bd.getMonth() === month && bd.getFullYear() === year;
        })
        .reduce((acc, curr) => acc + (parseFloat(curr.amountPaid) || 0), 0);

      // Monthly average occupancy (using middle of month as proxy)
      const midMonthDate = new Date(year, month, 15).toISOString().split('T')[0];
      const occupiedMidMonth = allBookings.filter(b => {
        return b.status !== 'Cancelled' &&
          b.checkInDate <= midMonthDate &&
          b.checkOutDate >= midMonthDate;
      }).length;

      const occupancyPercent = totalRooms > 0 ? Math.round((occupiedMidMonth / totalRooms) * 100) : 0;

      monthlyData.push({
        name: monthLabel,
        revenue: monthRevenue,
        occupancy: occupancyPercent
      });
    }

    // 5. Recent Activity
    const recentActivity = await Booking.findAll({
      where: { hotelId: req.user.hotelId },
      limit: 5,
      order: [['updatedAt', 'DESC']],
      include: [{ model: Room, attributes: ['roomNumber', 'type', 'pricePerNight'] }]
    });

    res.status(200).json({
      success: true,
      data: {
        kpi: {
          totalBookings,
          totalBookingsChange,
          totalBookingsPositive,
          availableRooms: `${availableRooms} / ${totalRooms}`,
          availableRoomsChange,
          availableRoomsPositive,
          activeGuests,
          activeGuestsChange,
          activeGuestsPositive,
          revenue: `₹${(monthlyRevenue / 1000).toFixed(1)}k`,
          revenueChange,
          revenuePositive
        },
        dailyData,
        monthlyData,
        recentActivity: recentActivity.map(b => ({
          user: b.guestName,
          room: `${b.Room?.type} ${b.Room?.roomNumber}`,
          roomNumber: b.Room?.roomNumber,
          roomType: b.Room?.type,
          status: b.status,
          time: new Date(b.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          active: b.status === 'Active'
        }))
      }
    });
  } catch (error) {
    console.error('SERVER ERROR - getDashboardStats:', error);
    next(error);
  }
};

const getBookingEffectiveTotalAmount = (b) => {
  if (b?.totalAmount && parseFloat(b.totalAmount) > 0) {
    return parseFloat(b.totalAmount);
  }

  if (!b || !b.previousRoomNumber) return parseFloat(b?.totalAmount) || 0;

  const checkInYMD = b.checkInDate ? b.checkInDate.split('T')[0] : '';
  const checkOutYMD = b.checkOutDate ? b.checkOutDate.split('T')[0] : '';
  let totalStayDays = 1;
  if (checkInYMD && checkOutYMD) {
    totalStayDays = Math.max(1, Math.ceil(Math.abs(new Date(checkOutYMD) - new Date(checkInYMD)) / (1000 * 60 * 60 * 24)));
  }
  const updatedAtStr = b.updatedAt ? (typeof b.updatedAt === 'string' ? b.updatedAt : b.updatedAt.toISOString()) : '';
  const shiftYMD = b.shiftDate || (updatedAtStr ? updatedAtStr.split('T')[0] : checkInYMD);
  let prevDays = 0;
  if (shiftYMD > checkInYMD) {
    prevDays = Math.min(totalStayDays - 1, Math.ceil(Math.abs(new Date(shiftYMD) - new Date(checkInYMD)) / (1000 * 60 * 60 * 24)));
  }
  const curDays = Math.max(1, totalStayDays - prevDays);
  const pRatesList = String(b.previousRoomRate || '').split(/→|->|,|>/).map(s => Number(s.trim())).filter(n => !isNaN(n));
  let prevTotalSum = 0;
  if (pRatesList.length > 0) {
    pRatesList.forEach((rVal, rIdx) => {
      const dForRm = rIdx === 0 ? prevDays : 0;
      prevTotalSum += rVal * dForRm;
    });
  } else {
    prevTotalSum = Number(b.previousRoomRate || 0) * prevDays;
  }
  const curRate = Number(b.Room?.pricePerNight || 0);
  const correctedTotal = prevTotalSum + (curDays * curRate);
  return correctedTotal > 0 ? correctedTotal : (parseFloat(b.totalAmount) || 0);
};

// @desc    Get billing and revenue summary
// @route   GET /api/analytics/billing
// @access  Private (Admin/Staff)
exports.getBillingSummary = async (req, res, next) => {
  try {
    const { page, limit, search, yearEnding, startDate: reqStartDate, endDate: reqEndDate, paymentStatus, gstFilter } = req.query;

    if (!Booking.associations || !Booking.associations.Room) {
      Booking.belongsTo(Room, { foreignKey: 'roomId' });
    }

    const Hotel = require('../models/Hotel');
    const hotel = await Hotel.findByPk(req.user.hotelId);
    const prefix = hotel?.invoicePrefix || 'INV-';

    let dateWhereClause = null;
    let extraDateWhere = null;

    if (reqStartDate && reqEndDate) {
      const moment = require('moment-timezone');
      const startDateTime = moment.tz(`${reqStartDate} 00:00:00`, 'YYYY-MM-DD HH:mm:ss', 'Asia/Kolkata').toDate();
      const endDateTime = moment.tz(`${reqEndDate} 23:59:59`, 'YYYY-MM-DD HH:mm:ss', 'Asia/Kolkata').toDate();

      dateWhereClause = {
        [Op.or]: [
          { createdAt: { [Op.between]: [startDateTime, endDateTime] } },
          { checkInDate: { [Op.between]: [reqStartDate, reqEndDate] } },
          { bookingDate: { [Op.between]: [reqStartDate, reqEndDate] } },
          {
            [Op.and]: [
              { checkInDate: { [Op.lte]: reqEndDate } },
              { checkOutDate: { [Op.gte]: reqStartDate } }
            ]
          }
        ]
      };

      extraDateWhere = {
        createdAt: { [Op.between]: [startDateTime, endDateTime] }
      };
    } else if (yearEnding && hotel.yearEndingDate) {
      const yearVal = parseInt(yearEnding, 10);
      const [mStr, dStr] = hotel.yearEndingDate.split('-');
      const moment = require('moment-timezone');
      const endDateObj = moment.tz(`${yearVal}-${mStr}-${dStr} 23:59:59`, 'YYYY-MM-DD HH:mm:ss', 'Asia/Kolkata').toDate();
      const startDateObj = moment(endDateObj).subtract(1, 'year').add(1, 'second').toDate();
      dateWhereClause = {
        createdAt: { [Op.between]: [startDateObj, endDateObj] }
      };
      extraDateWhere = {
        createdAt: { [Op.between]: [startDateObj, endDateObj] }
      };
    }

    const statsWhere = { status: { [Op.in]: ['Active', 'Completed', 'Confirmed'] }, hotelId: req.user.hotelId };
    if (dateWhereClause) {
      Object.assign(statsWhere, dateWhereClause);
    }

    // Fetch all bookings for overall stats calculation (selecting necessary fields for high speed)
    const allBookingsForStats = await Booking.findAll({
      where: statsWhere,
      attributes: [
        'id', 'hotelId', 'groupBookingId', 'status', 'createdAt', 'checkInDate',
        'checkOutDate', 'amountPaid', 'totalAmount', 'discount', 'gstOption',
        'gstRate', 'bookingType', 'previousRoomNumber', 'registrationNumber', 'roomId'
      ],
      order: [['createdAt', 'DESC']]
    });

    let totalRevenue = 0;
    let pendingDues = 0;
    let totalPayCustomer = 0;
    let otaRevenue = 0;
    let directRevenue = 0;
    let monthlyRevenue = 0;
    let lastMonthRevenue = 0;
    let totalGst = 0;
    let monthlyGst = 0;
    let extraMonthlyGst = 0;
    let taxableAmount = 0;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    // Fetch extra charges for stats calculation (apply extraDateWhere if provided)
    const extraChargesWhere = { hotelId: req.user.hotelId };
    if (extraDateWhere) {
      Object.assign(extraChargesWhere, extraDateWhere);
    }
    const allExtraChargesForStats = await ExtraCharge.findAll({
      where: extraChargesWhere,
      attributes: ['id', 'bookingId', 'hotelId', 'grandTotal', 'subtotal', 'gstAmount', 'createdAt']
    });

    let checkoutRoomGst = 0;
    let notCheckoutRoomGst = 0;
    let checkoutExtraGst = 0;
    let notCheckoutExtraGst = 0;

    allExtraChargesForStats.forEach(ec => {
      const ecDate = new Date(ec.createdAt);
      if (extraDateWhere || (ecDate.getMonth() === currentMonth && ecDate.getFullYear() === currentYear)) {
        const ecGst = parseFloat(ec.gstAmount || 0);
        extraMonthlyGst += ecGst;
        if (ec.bookingId) {
          const assocBooking = allBookingsForStats.find(b => b.id === ec.bookingId);
          if (assocBooking && assocBooking.status === 'Completed') {
            checkoutExtraGst += ecGst;
          } else {
            notCheckoutExtraGst += ecGst;
          }
        } else {
          checkoutExtraGst += ecGst;
        }
      }
    });

    const defaultGstRate = hotel?.defaultGstRate !== undefined && hotel?.defaultGstRate !== null ? Number(hotel.defaultGstRate) : 12;

    // Filter allBookingsForStats to unique bookings (pick primary booking for group bookings)
    const uniqueBookingsForStats = [];
    const seenStatsGroupIds = new Set();
    allBookingsForStats.forEach(b => {
      if (b.groupBookingId) {
        if (!seenStatsGroupIds.has(b.groupBookingId)) {
          seenStatsGroupIds.add(b.groupBookingId);
          uniqueBookingsForStats.push(b);
        }
      } else {
        uniqueBookingsForStats.push(b);
      }
    });

    uniqueBookingsForStats.forEach(b => {
      const bDate = new Date(b.createdAt);
      let amount = parseFloat(b.amountPaid) || 0;
      let totalAmount = getBookingEffectiveTotalAmount(b);
      let discount = parseFloat(b.discount) || 0;

      if (b.groupBookingId) {
        const groupItems = allBookingsForStats.filter(gb => gb.groupBookingId === b.groupBookingId);
        amount = groupItems.reduce((sum, item) => sum + (parseFloat(item.amountPaid) || 0), 0);
        totalAmount = groupItems.reduce((sum, item) => sum + (parseFloat(item.totalAmount) || 0), 0);
        discount = groupItems.reduce((sum, item) => sum + (parseFloat(item.discount) || 0), 0);
      }

      const gstRate = Number(b.gstRate !== undefined && b.gstRate !== null ? b.gstRate : defaultGstRate);
      const gstOption = b.gstOption || 'none';

      totalRevenue += amount;

      const groupBookingIds = b.groupBookingId 
        ? allBookingsForStats.filter(gb => gb.groupBookingId === b.groupBookingId).map(gb => gb.id)
        : [b.id];
      const assocExtra = allExtraChargesForStats.filter(ec => groupBookingIds.includes(ec.bookingId));
      const extraChargesTotal = assocExtra.reduce((s, ec) => s + parseFloat(ec.grandTotal || 0), 0);

      let bookingSubTotal = 0;
      let bookingGst = 0;
      let grandTotal = 0;

      if (b.groupBookingId) {
        const groupItems = allBookingsForStats.filter(gb => gb.groupBookingId === b.groupBookingId);
        let groupGrandRooms = 0;
        let groupSubRooms = 0;
        let groupGstRooms = 0;

        groupItems.forEach(item => {
          const itemAmt = parseFloat(item.amountPaid) || 0;
          const itemTot = parseFloat(item.totalAmount) || 0;
          const itemDisc = parseFloat(item.discount) || 0;
          const itemBase = Math.max(0, itemTot - itemDisc);

          if (gstOption === 'exclusive') {
            const rGst = gstRate > 0 ? Math.round((itemBase * (gstRate / 100)) * 100) / 100 : 0;
            groupSubRooms += itemBase;
            groupGstRooms += rGst;
            groupGrandRooms += (itemBase + rGst);
          } else if (gstOption === 'inclusive') {
            let rGrand = itemBase;
            if (itemAmt > rGrand && Math.abs(itemAmt - Math.round(rGrand * (1 + gstRate / 100))) < 1.5) {
              rGrand = itemAmt;
            }
            const rSub = gstRate > 0 ? Math.round((rGrand / (1 + gstRate / 100)) * 100) / 100 : rGrand;
            const rGst = Math.round((rGrand - rSub) * 100) / 100;
            groupSubRooms += rSub;
            groupGstRooms += rGst;
            groupGrandRooms += rGrand;
          } else {
            groupSubRooms += itemBase;
            groupGrandRooms += itemBase;
          }
        });

        bookingSubTotal = groupSubRooms;
        bookingGst = groupGstRooms;
        grandTotal = groupGrandRooms + extraChargesTotal;
      } else {
        const roomBase = Math.max(0, totalAmount - discount);
        if (gstOption === 'exclusive') {
          bookingSubTotal = roomBase;
          bookingGst = gstRate > 0 ? Math.round((bookingSubTotal * (gstRate / 100)) * 100) / 100 : 0;
          grandTotal = bookingSubTotal + bookingGst + extraChargesTotal;
        } else if (gstOption === 'inclusive') {
          let roomGrand = roomBase;
          if (amount > roomGrand && Math.abs(amount - Math.round(roomGrand * (1 + gstRate / 100))) < 1.5) {
            roomGrand = amount;
          }
          grandTotal = roomGrand + extraChargesTotal;
          bookingSubTotal = gstRate > 0 ? Math.round((roomGrand / (1 + gstRate / 100)) * 100) / 100 : roomGrand;
          bookingGst = Math.round((roomGrand - bookingSubTotal) * 100) / 100;
        } else {
          bookingSubTotal = roomBase;
          bookingGst = 0;
          grandTotal = roomBase + extraChargesTotal;
        }
      }

      if (amount > grandTotal + 0.1) {
        totalPayCustomer += (amount - grandTotal);
      }
      const bookingPending = Math.max(0, grandTotal - amount);
      pendingDues += bookingPending;

      taxableAmount += bookingSubTotal;
      totalGst += bookingGst;
      monthlyGst += bookingGst;

      if (b.status === 'Completed') {
        checkoutRoomGst += bookingGst;
      } else {
        notCheckoutRoomGst += bookingGst;
      }

      if (bDate.getMonth() === currentMonth && bDate.getFullYear() === currentYear) {
        monthlyRevenue += amount;
      } else if (bDate.getMonth() === lastMonth && bDate.getFullYear() === lastMonthYear) {
        lastMonthRevenue += amount;
      }

      if (b.bookingType === 'OTA' || b.bookingType === 'Online') {
        otaRevenue += totalAmount;
      } else {
        directRevenue += totalAmount;
      }
    });

    const totalRoomGst = checkoutRoomGst + notCheckoutRoomGst;
    const totalExtraGst = checkoutExtraGst + notCheckoutExtraGst;
    const totalCheckoutGst = checkoutRoomGst + checkoutExtraGst;
    const totalNotCheckoutGst = notCheckoutRoomGst + notCheckoutExtraGst;
    const calcTotalGst = totalCheckoutGst + totalNotCheckoutGst;

    const revenueTrend = lastMonthRevenue > 0 ? Math.round(((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue) * 100) : 0;

    const cgst = totalGst / 2;
    const sgst = totalGst / 2;

    const otaTotal = otaRevenue + directRevenue;
    const revenueBreakdown = [
      { channel: 'OTA / Online', amount: otaRevenue, percentage: otaTotal ? Math.round((otaRevenue / otaTotal) * 100) : 0 },
      { channel: 'Direct / Walk-in', amount: directRevenue, percentage: otaTotal ? Math.round((directRevenue / otaTotal) * 100) : 0 }
    ];

    const totalCount = allBookingsForStats.length;

    // Set up where clause for search & date filter
    let paginatedWhere = {
      status: { [Op.in]: ['Active', 'Completed', 'Confirmed'] },
      hotelId: req.user.hotelId
    };

    if (gstFilter === 'checkout') {
      paginatedWhere.status = 'Completed';
    } else if (gstFilter === 'not_checkout') {
      paginatedWhere.status = { [Op.in]: ['Active', 'Confirmed'] };
    }

    if (dateWhereClause) {
      Object.assign(paginatedWhere, dateWhereClause);
    }

    if (search) {
      const cleanSearch = search.replace(/^[rR][- ]?/, '');
      paginatedWhere[Op.or] = [
        { guestName: { [Op.like]: `%${search}%` } },
        { phone: { [Op.like]: `%${search}%` } },
        { registrationNumber: { [Op.like]: `%${search}%` } },
        { previousRoomNumber: { [Op.like]: `%${cleanSearch}%` } },
        { '$Room.roomNumber$': { [Op.like]: `%${cleanSearch}%` } }
      ];
    }

    let recentBillsMapped = [];
    let totalPages = 1;
    let totalRecords = totalCount;

    // Calculate global registration numbers by unique booking group chronologically
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

    if (page && limit) {
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 10;
      const offsetNum = (pageNum - 1) * limitNum;

      let rows = [];

      if (paymentStatus === 'paid' || paymentStatus === 'pending' || paymentStatus === 'pay_customer') {
        const allCandidates = await Booking.findAll({
          where: paginatedWhere,
          include: [{ model: Room, attributes: ['roomNumber', 'type', 'pricePerNight'] }],
          order: [['createdAt', 'DESC']]
        });

        const uniqueCandidates = [];
        const seenCandidateGroups = new Set();
        allCandidates.forEach(b => {
          if (b.groupBookingId) {
            if (!seenCandidateGroups.has(b.groupBookingId)) {
              seenCandidateGroups.add(b.groupBookingId);
              uniqueCandidates.push(b);
            }
          } else {
            uniqueCandidates.push(b);
          }
        });

        const evaluatedCandidates = await Promise.all(uniqueCandidates.map(async (b) => {
          const gstRate = Number(b.gstRate !== undefined && b.gstRate !== null ? b.gstRate : defaultGstRate);
          const gstOption = b.gstOption || 'none';
          const groupBookingIds = b.groupBookingId 
            ? allBookingsForStats.filter(gb => gb.groupBookingId === b.groupBookingId).map(gb => gb.id)
            : [b.id];
          const assocExtra = allExtraChargesForStats.filter(ec => groupBookingIds.includes(ec.bookingId));
          const extraChargesTotal = assocExtra.reduce((s, ec) => s + parseFloat(ec.grandTotal || 0), 0);

          let grandTotal = 0;
          let amountPaid = 0;

          if (b.groupBookingId) {
            const gbs = await Booking.findAll({ where: { groupBookingId: b.groupBookingId, hotelId: req.user.hotelId } });
            amountPaid = gbs.reduce((sum, gb) => sum + Number(gb.amountPaid || 0), 0);
            let groupGrandRooms = 0;

            gbs.forEach(item => {
              const itemAmt = parseFloat(item.amountPaid) || 0;
              const itemTot = parseFloat(item.totalAmount) || 0;
              const itemDisc = parseFloat(item.discount) || 0;
              const itemBase = Math.max(0, itemTot - itemDisc);

              if (gstOption === 'exclusive') {
                const rGst = gstRate > 0 ? Math.round((itemBase * (gstRate / 100)) * 100) / 100 : 0;
                groupGrandRooms += (itemBase + rGst);
              } else if (gstOption === 'inclusive') {
                let rGrand = itemBase;
                if (itemAmt > rGrand && Math.abs(itemAmt - Math.round(rGrand * (1 + gstRate / 100))) < 1.5) {
                  rGrand = itemAmt;
                }
                groupGrandRooms += rGrand;
              } else {
                groupGrandRooms += itemBase;
              }
            });

            grandTotal = groupGrandRooms + extraChargesTotal;
          } else {
            amountPaid = Number(b.amountPaid || 0);
            const baseAmount = Number(b.totalAmount || 0);
            const discount = Number(b.discount || 0);
            const roomBase = Math.max(0, baseAmount - discount);

            if (gstOption === 'exclusive') {
              const rGst = gstRate > 0 ? Math.round((roomBase * (gstRate / 100)) * 100) / 100 : 0;
              grandTotal = roomBase + rGst + extraChargesTotal;
            } else if (gstOption === 'inclusive') {
              let roomGrand = roomBase;
              if (amountPaid > roomGrand && Math.abs(amountPaid - Math.round(roomGrand * (1 + gstRate / 100))) < 1.5) {
                roomGrand = amountPaid;
              }
              grandTotal = roomGrand + extraChargesTotal;
            } else {
              grandTotal = roomBase + extraChargesTotal;
            }
          }

          const pending = grandTotal - amountPaid;
          const isPayCustomer = pending < -0.1;
          const isPaid = !isPayCustomer && pending <= 0.1;
          const isPending = !isPayCustomer && pending > 0.1;
          return { booking: b, isPaid, isPending, isPayCustomer };
        }));

        let filteredCandidates = [];
        if (paymentStatus === 'paid') {
          filteredCandidates = evaluatedCandidates.filter(x => x.isPaid).map(x => x.booking);
        } else if (paymentStatus === 'pending') {
          filteredCandidates = evaluatedCandidates.filter(x => x.isPending).map(x => x.booking);
        } else if (paymentStatus === 'pay_customer') {
          filteredCandidates = evaluatedCandidates.filter(x => x.isPayCustomer).map(x => x.booking);
        }

        totalRecords = filteredCandidates.length;
        totalPages = Math.ceil(totalRecords / limitNum) || 1;
        rows = filteredCandidates.slice(offsetNum, offsetNum + limitNum);
      } else {
        const allCandidates = await Booking.findAll({
          where: paginatedWhere,
          include: [{ model: Room, attributes: ['roomNumber', 'type', 'pricePerNight'] }],
          order: [['createdAt', 'DESC']]
        });

        const uniqueCandidates = [];
        const seenCandidateGroups = new Set();
        allCandidates.forEach(b => {
          if (b.groupBookingId) {
            if (!seenCandidateGroups.has(b.groupBookingId)) {
              seenCandidateGroups.add(b.groupBookingId);
              uniqueCandidates.push(b);
            }
          } else {
            uniqueCandidates.push(b);
          }
        });

        totalRecords = uniqueCandidates.length;
        totalPages = Math.ceil(totalRecords / limitNum) || 1;
        rows = uniqueCandidates.slice(offsetNum, offsetNum + limitNum);
      }

      // Batch fetch groupBookings, KOTs, and ExtraCharges for all page rows in 3 fast queries
      const rowIds = rows.map(b => b.id);
      const rowGroupIds = rows.map(b => b.groupBookingId).filter(Boolean);

      const [batchGroupBookings, batchKots, batchExtraCharges] = await Promise.all([
        rowGroupIds.length > 0
          ? Booking.findAll({
              where: { groupBookingId: { [Op.in]: rowGroupIds }, hotelId: req.user.hotelId },
              include: [{ model: Room, attributes: ['roomNumber', 'type', 'pricePerNight'] }]
            })
          : [],
        Kot.findAll({
          where: { bookingId: { [Op.in]: rowIds }, paymentMode: 'Room Charge', status: { [Op.ne]: 'Cancelled' }, hotelId: req.user.hotelId }
        }),
        ExtraCharge.findAll({
          where: { hotelId: req.user.hotelId }
        })
      ]);

      const { getBookingSerialNumber } = require('../utils/invoiceHelper');

      recentBillsMapped = await Promise.all(rows.map(async (b) => {
        const serialNumber = await getBookingSerialNumber(b, hotel);
        const defaultInvoiceNumber = `${prefix}${serialNumber}`;

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
        const extraGstTotal = extraCharges.reduce((sum, ec) => sum + parseFloat(ec.gstAmount || 0), 0);
        const extraSubTotal = extraCharges.reduce((sum, ec) => sum + parseFloat(ec.subtotal || 0), 0);

        const plain = b.toJSON ? b.toJSON() : b;
        const defaultRegNo = globalRegMap.get(b.id) || `REG-${String(b.id || 1).padStart(3, '0')}`;
        return {
          ...plain,
          registrationNumber: b.registrationNumber || defaultRegNo,
          invoiceNumber: b.invoiceNumber || defaultInvoiceNumber,
          groupBookings,
          kots,
          foodCharges: foodTotal,
          extraCharges: extraTotal,
          extraChargesList: extraCharges,
          extraServiceGst: extraGstTotal,
          extraServiceSubTotal: extraSubTotal
        };
      }));
    } else {
      const bookingsForList = await Booking.findAll({
        where: paginatedWhere,
        include: [{ model: Room, attributes: ['roomNumber', 'type', 'pricePerNight'] }],
        order: [['createdAt', 'DESC']]
      });

      recentBillsMapped = await Promise.all(bookingsForList.map(async (b) => {
        const { getBookingSerialNumber } = require('../utils/invoiceHelper');
        const serialNumber = await getBookingSerialNumber(b, hotel);
        const defaultInvoiceNumber = `${prefix}${serialNumber}`;

        let groupBookings = [];
        if (b.groupBookingId) {
          groupBookings = await Booking.findAll({
            where: { groupBookingId: b.groupBookingId, hotelId: req.user.hotelId },
            include: [{ model: Room, attributes: ['roomNumber', 'type', 'pricePerNight'] }]
          });
        }

        const kots = await Kot.findAll({
          where: { bookingId: b.id, paymentMode: 'Room Charge', status: { [Op.ne]: 'Cancelled' }, hotelId: req.user.hotelId }
        });
        const foodTotal = kots.reduce((sum, k) => sum + parseFloat(k.grandTotal || 0), 0);

        // Fetch extra charges / service orders
        let bookingIds = [b.id];
        if (b.groupBookingId && groupBookings.length > 0) {
          bookingIds = groupBookings.map(gb => gb.id);
        }
        const extraCharges = await ExtraCharge.findAll({
          where: { bookingId: { [Op.in]: bookingIds }, hotelId: req.user.hotelId }
        });
        const extraTotal = extraCharges.reduce((sum, ec) => sum + parseFloat(ec.grandTotal || 0), 0);
        const extraGstTotal = extraCharges.reduce((sum, ec) => sum + parseFloat(ec.gstAmount || 0), 0);
        const extraSubTotal = extraCharges.reduce((sum, ec) => sum + parseFloat(ec.subtotal || 0), 0);

        const plain = b.toJSON ? b.toJSON() : b;
        return {
          ...plain,
          invoiceNumber: b.invoiceNumber || defaultInvoiceNumber,
          groupBookings,
          kots,
          foodCharges: foodTotal,
          extraCharges: extraTotal,
          extraChargesList: extraCharges,
          extraServiceGst: extraGstTotal,
          extraServiceSubTotal: extraSubTotal
        };
      }));

      totalPages = 1;
      totalRecords = bookingsForList.length;
    }

    res.status(200).json({
      success: true,
      data: {
        stats: {
          totalRevenue, monthlyRevenue, otaRevenue, pendingDues,
          totalPayCustomer: Math.round(totalPayCustomer * 100) / 100,
          totalGst: calcTotalGst, monthlyGst, extraMonthlyGst, revenueTrend,
          checkoutRoomGst, notCheckoutRoomGst, checkoutExtraGst, notCheckoutExtraGst,
          totalRoomGst, totalExtraGst, totalCheckoutGst, totalNotCheckoutGst
        },
        gstSummary: { taxable: taxableAmount, cgst, sgst, total: totalGst },
        revenueBreakdown,
        recentBills: recentBillsMapped,
        totalPages,
        totalRecords
      }
    });
  } catch (error) {
    console.error('SERVER ERROR - getBillingSummary:', error);
    next(error);
  }
};

// @desc    Get room availability and calendar data
// @route   GET /api/analytics/availability
// @access  Private (Admin/Staff)
exports.getAvailabilityData = async (req, res, next) => {
  try {
    const { startDate: qStart, endDate: qEnd } = req.query;
    const rooms = await Room.findAll({
      where: { isDeleted: false, hotelId: req.user.hotelId },
      order: [['roomNumber', 'ASC']]
    });

    let startDate;
    let endDate;

    if (qStart && qEnd) {
      startDate = new Date(qStart);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(qEnd);
      endDate.setHours(23, 59, 59, 999);
    } else {
      // Default fallback to 30 days
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date();
      endDate.setDate(endDate.getDate() + 30);
      endDate.setHours(23, 59, 59, 999);
    }

    const bookings = await Booking.findAll({
      where: {
        [Op.or]: [
          { checkInDate: { [Op.between]: [startDate, endDate] } },
          { checkOutDate: { [Op.between]: [startDate, endDate] } },
          {
            [Op.and]: [
              { checkInDate: { [Op.lte]: startDate } },
              { checkOutDate: { [Op.gte]: endDate } }
            ]
          }
        ],
        status: { [Op.ne]: 'Cancelled' },
        hotelId: req.user.hotelId
      }
    });

    res.status(200).json({
      success: true,
      data: {
        rooms,
        bookings: bookings.map(b => {
          const base = parseFloat(b.totalAmount) || 0;
          const discount = parseFloat(b.discount) || 0;
          const gstRate = parseFloat(b.gstRate) || 0;
          const gstOption = b.gstOption || 'none';
          const subTotal = Math.max(0, base - discount);
          let grandTotal = subTotal;
          if (gstOption === 'exclusive') {
            grandTotal = subTotal + (subTotal * (gstRate / 100));
          }
          return {
            id: b.id,
            guestName: b.guestName,
            roomId: b.roomId,
            checkIn: b.checkInDate,
            checkOut: b.checkOutDate,
            checkInTime: b.checkInTime || "12:00",
            checkOutTime: b.checkOutTime || "11:00",
            totalAmount: Math.round(grandTotal * 100) / 100,
            amountPaid: b.amountPaid,
            numberOfGuests: b.numberOfGuests || 1,
            status: b.status,
            isChild: b.isChild,
            extraGuests: b.extraGuests,
            groupBookingId: b.groupBookingId,
            gstOption: b.gstOption,
            gstRate: b.gstRate,
            previousRoomNumber: b.previousRoomNumber,
            previousRoomType: b.previousRoomType,
            shiftDate: b.shiftDate,
            shiftTime: b.shiftTime
          };
        })
      }
    });
  } catch (error) {
    console.error('SERVER ERROR - getAvailabilityData:', error);
    next(error);
  }
};

// @desc    Get global statistics for SuperAdmin dashboard
// @route   GET /api/analytics/superadmin/dashboard
// @access  Private (SuperAdmin)
exports.getSuperAdminDashboardStats = async (req, res, next) => {
  try {
    const Hotel = require('../models/Hotel');

    // Verify user is superadmin
    if (req.user.role !== 'superadmin') {
      res.status(403);
      throw new Error('Not authorized to access global statistics');
    }

    const totalHotels = await Hotel.count();
    const activeHotels = await Hotel.count({ where: { status: 'Active' } });
    const inactiveHotels = await Hotel.count({ where: { status: 'Inactive' } });

    // Get all hotels to display status groups on dashboard
    const hotels = await Hotel.findAll({
      order: [['name', 'ASC']]
    });

    res.status(200).json({
      success: true,
      data: {
        totalHotels,
        activeHotels,
        inactiveHotels,
        hotels
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get combined transaction history (booking payments, direct KOTs, expenses)
// @route   GET /api/analytics/transactions
// @access  Private (Hotel User)
exports.getTransactions = async (req, res, next) => {
  try {
    const Expense = require('../models/Expense');
    const { startDate, endDate } = req.query;

    // Fetch Bookings with Room association to get room number
    const bookings = await Booking.findAll({
      where: { hotelId: req.user.hotelId },
      include: [{ model: Room, attributes: ['roomNumber'] }]
    });

    const transactions = [];

    // Group bookings by groupBookingId (for multiple rooms checkin) or single booking ID
    const bookingGroups = {};
    bookings.forEach(b => {
      const groupKey = b.groupBookingId || `single-${b.id}`;
      if (!bookingGroups[groupKey]) {
        bookingGroups[groupKey] = [];
      }
      bookingGroups[groupKey].push(b);
    });

    // 1. Process Booking Payments
    Object.keys(bookingGroups).forEach(groupKey => {
      const groupBookings = bookingGroups[groupKey];
      const repBooking = groupBookings[0];

      // Collect all room numbers for this group
      const roomNumbers = groupBookings
        .map(gb => gb.Room?.roomNumber)
        .filter(Boolean);
      const roomsStr = roomNumbers.length > 0 ? roomNumbers.join(', ') : 'N/A';
      const roomsLabel = roomNumbers.length > 1 ? `Rooms ${roomsStr}` : `Room ${roomsStr}`;

      let history = [];
      try {
        if (repBooking.paymentHistory) {
          history = JSON.parse(repBooking.paymentHistory);
        }
      } catch (e) {
        console.error("Failed parsing payment history for booking group", groupKey, e);
      }

      // If amountPaid > 0 but no history recorded, create fallback check-in payment
      if (history.length === 0 && Number(repBooking.amountPaid) > 0) {
        const checkInDateStr = repBooking.checkInDate ? repBooking.checkInDate : repBooking.createdAt.toISOString().split('T')[0];
        history.push({
          amount: Number(repBooking.amountPaid),
          date: checkInDateStr.split('-').reverse().join('-'), // convert YYYY-MM-DD to DD-MM-YYYY
          time: '12:00 PM',
          paymentMode: repBooking.paymentMode || 'Cash',
          paymentBank: repBooking.paymentBank || null
        });
      }

      history.forEach((item, idx) => {
        // Normalize date from DD-MM-YYYY to YYYY-MM-DD for standard sorting/filtering
        let normDate = '';
        if (item.date) {
          const parts = item.date.split('-');
          if (parts.length === 3) {
            // Check if it's already YYYY-MM-DD or DD-MM-YYYY
            if (parts[0].length === 4) {
              normDate = item.date;
            } else {
              normDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
            }
          }
        }
        if (!normDate) normDate = repBooking.createdAt.toISOString().split('T')[0];

        const isRefund = Number(item.amount) < 0;
        transactions.push({
          id: `booking-payment-${repBooking.id}-${groupKey}-${idx}`,
          type: isRefund ? 'Expense' : 'Income',
          source: 'Booking Payment',
          description: isRefund
            ? `Refund to ${repBooking.guestName} (${roomsLabel})`
            : `Payment from ${repBooking.guestName} (${roomsLabel})`,
          amount: Math.abs(Number(item.amount)),
          paymentMode: item.paymentMode || repBooking.paymentMode || 'Cash',
          paymentBank: item.paymentBank || repBooking.paymentBank || null,
          date: normDate,
          time: item.time || new Date(repBooking.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
          timestamp: new Date(normDate + 'T12:00:00'),
          createdAt: repBooking.createdAt,
          invoiceNumber: repBooking.invoiceNumber || null
        });
      });
    });

    // 2. Process Direct Food Sales (KOTs)
    const directKots = await Kot.findAll({
      where: {
        hotelId: req.user.hotelId,
        paymentMode: { [Op.ne]: 'Room Charge' },
        status: 'Served'
      }
    });

    directKots.forEach(kot => {
      const dateStr = new Date(kot.createdAt).toISOString().split('T')[0];
      transactions.push({
        id: `kot-sale-${kot.id}`,
        type: 'Income',
        source: 'Food Sale',
        description: `KOT #${kot.kotNumber} (Guest: ${kot.guestName})`,
        amount: Number(kot.grandTotal),
        paymentMode: kot.paymentMode || 'Cash',
        date: dateStr,
        time: new Date(kot.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
        timestamp: new Date(kot.createdAt),
        createdAt: kot.createdAt
      });
    });

    // 3. Process Hotel Expenses
    const expenses = await Expense.findAll({
      where: { hotelId: req.user.hotelId }
    });

    expenses.forEach(exp => {
      transactions.push({
        id: `expense-${exp.id}`,
        type: 'Expense',
        source: 'Hotel Expense',
        description: `${exp.title} (${exp.category})`,
        amount: Number(exp.amount),
        paymentMode: exp.paymentMode || 'Cash',
        paymentBank: exp.paymentBank || null,
        date: exp.date,
        time: new Date(exp.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
        timestamp: new Date(exp.date + 'T12:00:00'),
        createdAt: exp.createdAt
      });
    });

    // Filter by date range if provided
    let filteredTransactions = transactions;
    if (startDate && endDate) {
      filteredTransactions = transactions.filter(t => t.date >= startDate && t.date <= endDate);
    } else if (startDate) {
      filteredTransactions = transactions.filter(t => t.date >= startDate);
    } else if (endDate) {
      filteredTransactions = transactions.filter(t => t.date <= endDate);
    }

    // Helper to get exact timestamp ms from transaction date and time
    const getTxMs = (tx) => {
      let dateStr = tx.date || '';
      if (dateStr.includes('-') && dateStr.split('-')[0].length === 2) {
        const [d, m, y] = dateStr.split('-');
        dateStr = `${y}-${m}-${d}`;
      }
      let timeStr = tx.time || '00:00';
      let h = 0, min = 0;
      if (timeStr.toUpperCase().includes('AM') || timeStr.toUpperCase().includes('PM')) {
        const parts = timeStr.trim().split(/\s+/);
        const timeParts = (parts[0] || '0:0').split(':');
        h = parseInt(timeParts[0], 10) || 0;
        min = parseInt(timeParts[1], 10) || 0;
        const ampm = (parts[1] || '').toUpperCase();
        if (ampm === 'PM' && h < 12) h += 12;
        if (ampm === 'AM' && h === 12) h = 0;
      } else if (timeStr.includes(':')) {
        const parts = timeStr.split(':');
        h = parseInt(parts[0], 10) || 0;
        min = parseInt(parts[1], 10) || 0;
      }
      const pad = (n) => String(n).padStart(2, '0');
      const parsed = new Date(`${dateStr}T${pad(h)}:${pad(min)}:00`).getTime();
      if (!isNaN(parsed)) return parsed;
      return new Date(tx.createdAt || tx.date).getTime() || 0;
    };

    // Sort by exact transaction Date & Time descending (most recent first)
    filteredTransactions.sort((a, b) => getTxMs(b) - getTxMs(a));

    res.status(200).json({
      success: true,
      count: filteredTransactions.length,
      data: filteredTransactions
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get balance sheet data grouped by payment mode / category with filters
// @route   GET /api/analytics/balance-sheet
// @access  Private (Hotel User)
exports.getBalanceSheet = async (req, res, next) => {
  try {
    const Expense = require('../models/Expense');
    const { period, startDate, endDate } = req.query;

    const bookings = await Booking.findAll({
      where: { hotelId: req.user.hotelId }
    });

    const directKots = await Kot.findAll({
      where: {
        hotelId: req.user.hotelId,
        paymentMode: { [Op.ne]: 'Room Charge' },
        status: 'Served'
      }
    });

    const expenses = await Expense.findAll({
      where: { hotelId: req.user.hotelId }
    });

    // Determine Date Filter Bounds based on requested period
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    let startFilter = '';
    let endFilter = todayStr;

    if (period === 'daily') {
      startFilter = todayStr;
    } else if (period === 'weekly') {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      startFilter = oneWeekAgo.toISOString().split('T')[0];
    } else if (period === 'monthly') {
      const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      startFilter = firstOfMonth.toISOString().split('T')[0];
    } else if (period === 'yearly') {
      const firstOfYear = new Date(today.getFullYear(), 0, 1);
      startFilter = firstOfYear.toISOString().split('T')[0];
    } else if (period === 'custom') {
      startFilter = startDate || '';
      endFilter = endDate || todayStr;
    }

    // Filter Helper function
    const isWithinBounds = (dateStr) => {
      if (!dateStr) return false;
      if (startFilter && dateStr < startFilter) return false;
      if (endFilter && dateStr > endFilter) return false;
      return true;
    };

    // Calculate Incomes
    let cashIncome = 0;
    let onlineIncome = 0;
    let otherIncome = 0;
    let totalIncome = 0;

    // 1. Process Booking Payments
    bookings.forEach(b => {
      let history = [];
      try {
        if (b.paymentHistory) {
          history = JSON.parse(b.paymentHistory);
        }
      } catch (e) { }

      if (history.length === 0 && Number(b.amountPaid) > 0) {
        const checkInDateStr = b.checkInDate ? b.checkInDate : b.createdAt.toISOString().split('T')[0];
        history.push({
          amount: Number(b.amountPaid),
          date: checkInDateStr.split('-').reverse().join('-'),
          paymentMode: b.paymentMode || 'Cash'
        });
      }

      history.forEach(item => {
        let normDate = '';
        if (item.date) {
          const parts = item.date.split('-');
          if (parts.length === 3) {
            normDate = parts[0].length === 4 ? item.date : `${parts[2]}-${parts[1]}-${parts[0]}`;
          }
        }

        if (isWithinBounds(normDate)) {
          const amt = Number(item.amount) || 0;
          const mode = (item.paymentMode || b.paymentMode || 'Cash').toLowerCase();

          if (mode === 'cash') {
            cashIncome += amt;
          } else if (mode === 'online' || mode === 'upi' || mode === 'card') {
            onlineIncome += amt;
          } else {
            otherIncome += amt;
          }
          totalIncome += amt;
        }
      });
    });

    // 2. Process Direct Food Sales (KOTs)
    directKots.forEach(kot => {
      const dateStr = new Date(kot.createdAt).toISOString().split('T')[0];
      if (isWithinBounds(dateStr)) {
        const amt = Number(kot.grandTotal) || 0;
        const mode = (kot.paymentMode || 'Cash').toLowerCase();

        if (mode === 'cash') {
          cashIncome += amt;
        } else if (mode === 'online' || mode === 'upi' || mode === 'card') {
          onlineIncome += amt;
        } else {
          otherIncome += amt;
        }
        totalIncome += amt;
      }
    });

    // 3. Process Expenses (group by Category)
    const expenseBreakdown = {};
    let totalExpenses = 0;

    expenses.forEach(exp => {
      if (isWithinBounds(exp.date)) {
        const amt = Number(exp.amount) || 0;
        const cat = exp.category || 'Other';
        expenseBreakdown[cat] = (expenseBreakdown[cat] || 0) + amt;
        totalExpenses += amt;
      }
    });

    const netBalance = totalIncome - totalExpenses;

    res.status(200).json({
      success: true,
      data: {
        totalIncome: Number(totalIncome.toFixed(2)),
        totalExpenses: Number(totalExpenses.toFixed(2)),
        netBalance: Number(netBalance.toFixed(2)),
        incomeBreakdown: {
          cash: Number(cashIncome.toFixed(2)),
          online: Number(onlineIncome.toFixed(2)),
          other: Number(otherIncome.toFixed(2))
        },
        expenseBreakdown
      }
    });
  } catch (error) {
    next(error);
  }
};