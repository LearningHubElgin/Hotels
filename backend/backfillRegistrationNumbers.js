const { sequelize, connectDB } = require('./config/database');
const Booking = require('./models/Booking');
const Hotel = require('./models/Hotel');
const { Op } = require('sequelize');

/**
 * Script to backfill and update Registration Numbers permanently in the database.
 * Scoped SEPARATELY per hotel (hotelId).
 */
const runBackfill = async () => {
  try {
    console.log('Connecting to database...');
    await connectDB();

    // 1. Fetch all hotels
    const hotels = await Hotel.findAll({ attributes: ['id', 'name'] });
    console.log(`Found ${hotels.length} hotel(s) to process.`);

    let totalUpdated = 0;

    for (const hotel of hotels) {
      console.log(`\nProcessing Hotel ID: ${hotel.id} (${hotel.name || 'Unnamed'})...`);

      // Fetch all bookings for this specific hotel, chronologically by createdAt ASC, id ASC
      const bookings = await Booking.findAll({
        where: { hotelId: hotel.id, status: { [Op.ne]: 'Cancelled' } },
        order: [['createdAt', 'ASC'], ['id', 'ASC']]
      });

      console.log(`  Found ${bookings.length} booking(s) for Hotel ID ${hotel.id}.`);

      // Group bookings by unique group (groupBookingId or single-id)
      const uniqueGroups = [];
      const groupMap = new Map();

      for (const b of bookings) {
        const groupKey = b.groupBookingId || `single-${b.id}`;
        if (!groupMap.has(groupKey)) {
          groupMap.set(groupKey, []);
          uniqueGroups.push({ groupKey, bookings: [] });
        }
        groupMap.get(groupKey).push(b);
      }

      // Populate bookings in uniqueGroups
      for (const item of uniqueGroups) {
        item.bookings = groupMap.get(item.groupKey);
      }

      let hotelUpdatedCount = 0;

      // Assign registration numbers starting from REG-001 per hotel
      for (let idx = 0; idx < uniqueGroups.length; idx++) {
        const item = uniqueGroups[idx];
        const primaryB = item.bookings[0];

        // Use existing registrationNumber if already present on primary booking, else auto-generate REG-001, REG-002...
        const targetRegNo = (primaryB.registrationNumber && String(primaryB.registrationNumber).trim())
          ? String(primaryB.registrationNumber).trim()
          : `REG-${String(idx + 1).padStart(3, '0')}`;

        // Update all sub-bookings in this group to have targetRegNo
        for (const b of item.bookings) {
          if (b.registrationNumber !== targetRegNo) {
            await b.update({ registrationNumber: targetRegNo });
            hotelUpdatedCount++;
            totalUpdated++;
          }
        }
      }

      console.log(`  Updated ${hotelUpdatedCount} booking(s) with registration numbers for Hotel ID ${hotel.id}.`);
    }

    console.log(`\n==============================================`);
    console.log(`Registration number backfill completed successfully!`);
    console.log(`Total Bookings Updated Across All Hotels: ${totalUpdated}`);
    console.log(`==============================================\n`);

    process.exit(0);
  } catch (error) {
    console.error('Error during registration number backfill:', error);
    process.exit(1);
  }
};

runBackfill();
