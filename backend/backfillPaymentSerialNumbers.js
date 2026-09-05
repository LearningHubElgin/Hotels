const { sequelize, connectDB } = require('./config/database');
const Booking = require('./models/Booking');
const Hotel = require('./models/Hotel');
const { Op } = require('sequelize');

/**
 * Script to backfill and permanently assign pure numeric Payment Serial Numbers (1, 2, 3...)
 * in the database for all payment entries in paymentHistory across all bookings.
 * Scoped independently per hotel (hotelId).
 */
const runBackfill = async () => {
  try {
    console.log('Connecting to database...');
    await connectDB();

    // 1. Fetch all hotels
    const hotels = await Hotel.findAll({ attributes: ['id', 'name'] });
    console.log(`Found ${hotels.length} hotel(s) to process.`);

    let totalUpdatedBookings = 0;
    let totalPaymentsAssigned = 0;

    for (const hotel of hotels) {
      console.log(`\n----------------------------------------------`);
      console.log(`Processing Hotel ID: ${hotel.id} (${hotel.name || 'Unnamed'})...`);

      // Fetch all bookings for this specific hotel, chronologically by createdAt ASC, id ASC
      const bookings = await Booking.findAll({
        where: { hotelId: hotel.id, status: { [Op.ne]: 'Cancelled' } },
        order: [['createdAt', 'ASC'], ['id', 'ASC']]
      });

      console.log(`  Found ${bookings.length} booking(s) for Hotel ID ${hotel.id}.`);

      // Group bookings by groupBookingId or single booking ID
      const groupMap = new Map();
      const uniqueGroups = [];

      for (const b of bookings) {
        const groupKey = b.groupBookingId || `single-${b.id}`;
        if (!groupMap.has(groupKey)) {
          groupMap.set(groupKey, []);
          uniqueGroups.push(groupKey);
        }
        groupMap.get(groupKey).push(b);
      }

      let serialCounter = 0;
      let hotelUpdatedCount = 0;

      for (const groupKey of uniqueGroups) {
        const groupBookings = groupMap.get(groupKey);
        const primaryB = groupBookings[0];

        let history = [];
        try {
          if (primaryB.paymentHistory) {
            history = typeof primaryB.paymentHistory === 'string'
              ? JSON.parse(primaryB.paymentHistory)
              : primaryB.paymentHistory;
          }
        } catch (e) {
          history = [];
        }

        // If no payment history exists but amountPaid > 0, create the check-in payment entry
        if ((!Array.isArray(history) || history.length === 0) && Number(primaryB.amountPaid) > 0) {
          const checkInDateStr = primaryB.checkInDate
            ? (primaryB.checkInDate.includes('T') ? primaryB.checkInDate.split('T')[0] : primaryB.checkInDate)
            : primaryB.createdAt.toISOString().split('T')[0];

          history = [{
            amount: Number(primaryB.amountPaid),
            date: checkInDateStr.split('-').reverse().join('-'), // convert YYYY-MM-DD to DD-MM-YYYY
            time: '12:00 PM',
            paymentMode: primaryB.paymentMode || 'Cash',
            paymentBank: primaryB.paymentBank || null
          }];
        }

        if (Array.isArray(history) && history.length > 0) {
          let historyChanged = false;

          history.forEach(item => {
            serialCounter++;
            const targetSerial = String(serialCounter);
            if (item.serialNumber !== targetSerial) {
              item.serialNumber = targetSerial;
              historyChanged = true;
            }
            totalPaymentsAssigned++;
          });

          if (historyChanged || !primaryB.paymentHistory) {
            const updatedHistoryJson = JSON.stringify(history);

            // Update all bookings in this group
            for (const b of groupBookings) {
              await b.update({ paymentHistory: updatedHistoryJson });
              hotelUpdatedCount++;
              totalUpdatedBookings++;
            }
          }
        }
      }

      console.log(`  Assigned ${serialCounter} sequential payment serial number(s) across ${hotelUpdatedCount} booking record(s) for Hotel ID ${hotel.id}.`);
    }

    console.log(`\n==============================================`);
    console.log(`Payment Serial Number backfill completed successfully!`);
    console.log(`Total Payments Numbered: ${totalPaymentsAssigned}`);
    console.log(`Total Booking Records Updated: ${totalUpdatedBookings}`);
    console.log(`==============================================\n`);

    process.exit(0);
  } catch (error) {
    console.error('Error during payment serial number backfill:', error);
    process.exit(1);
  }
};

runBackfill();
