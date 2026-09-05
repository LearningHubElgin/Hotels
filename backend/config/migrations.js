const { Op } = require('sequelize');

const executeAlterQuery = async (sequelize, query, description) => {
  try {
    await sequelize.query(query);
    console.log(description.green);
  } catch (e) {
    const isDuplicate = e.message.toLowerCase().includes('duplicate') ||
      e.message.toLowerCase().includes('already exists') ||
      e.code === 'ER_DUP_FIELDNAME' ||
      e.code === 'ER_DUP_KEYNAME';
    if (!isDuplicate) {
      console.error(`Migration error during: "${query}" -`, e.message);
    }
  }
};

const cleanLegacyIndexes = async (sequelize, tableName, columnName, preserveIndexes = []) => {
  try {
    const [indexes] = await sequelize.query(`SHOW INDEX FROM \`${tableName}\`;`);
    const indexesToDrop = new Set();

    for (const index of indexes) {
      const keyName = index.Key_name;
      if (
        keyName &&
        keyName !== 'PRIMARY' &&
        !preserveIndexes.includes(keyName) &&
        (keyName === columnName || keyName.startsWith(`${columnName}_`))
      ) {
        indexesToDrop.add(keyName);
      }
    }

    for (const indexName of indexesToDrop) {
      try {
        await sequelize.query(`ALTER TABLE \`${tableName}\` DROP INDEX \`${indexName}\`;`);
        console.log(`Dropped legacy index: ${indexName} from ${tableName}`.green);
      } catch (err) {
        // Gracefully ignore drop failures
      }
    }
  } catch (err) {
    console.error(`Error cleaning up legacy indexes for ${tableName}:`, err.message);
  }
};

const runMigrations = async (sequelize) => {
  // 1. Clean legacy indexes
  await cleanLegacyIndexes(sequelize, 'Rooms', 'roomNumber', ['room_hotel_unique']);
  await cleanLegacyIndexes(sequelize, 'Kots', 'kotNumber');
  await cleanLegacyIndexes(sequelize, 'FoodItems', 'name');

  // 2. Room composite index & ENUM updates
  try {
    await sequelize.query('ALTER TABLE Rooms ADD UNIQUE KEY `room_hotel_unique` (`roomNumber`, `hotelId`);');
    console.log('Migration completed: Created composite unique index room_hotel_unique on Rooms.'.green);
  } catch (err) {
    if (!err.message.toLowerCase().includes('duplicate') && !err.message.toLowerCase().includes('already exists') && err.code !== 'ER_DUP_KEYNAME') {
      console.error('Migration error creating composite unique index:', err.message);
    }
  }

  try {
    await sequelize.query("ALTER TABLE Users MODIFY COLUMN role ENUM('superadmin', 'admin', 'guest') DEFAULT 'guest';");
    console.log('Migration: updated Users.role ENUM values.'.green);
  } catch (e) {
    console.error('Migration error updating Users.role:', e.message);
  }

  try {
    await sequelize.query("ALTER TABLE Rooms MODIFY COLUMN status ENUM('available', 'occupied', 'maintenance', 'cleaning') DEFAULT 'available';");
    console.log('Migration: updated Rooms.status ENUM values to include cleaning.'.green);
  } catch (e) {
    console.error('Migration error updating Rooms.status:', e.message);
  }

  // 3. Bookings Column Migrations
  await executeAlterQuery(sequelize, "ALTER TABLE Bookings ADD COLUMN earlyCheckInCharge DECIMAL(10,2) DEFAULT 0.00;", "Migration: added earlyCheckInCharge to Bookings table.");
  await executeAlterQuery(sequelize, "ALTER TABLE Bookings ADD COLUMN chargePreviousDay TINYINT(1) DEFAULT 0;", "Migration: added chargePreviousDay to Bookings table.");
  await executeAlterQuery(sequelize, "ALTER TABLE Bookings ADD COLUMN earlyCheckInType VARCHAR(50) DEFAULT 'full_day';", "Migration: added earlyCheckInType to Bookings table.");
  await executeAlterQuery(sequelize, "ALTER TABLE Bookings ADD COLUMN gstOption VARCHAR(50) DEFAULT 'exclusive';", "Migration: Added gstOption column to Bookings table");
  await executeAlterQuery(sequelize, "ALTER TABLE Bookings ADD COLUMN companyName VARCHAR(255) NULL;", "Migration: Added companyName column to Bookings table");
  await executeAlterQuery(sequelize, "ALTER TABLE Bookings ADD COLUMN companyAddress TEXT NULL;", "Migration: Added companyAddress column to Bookings table");
  await executeAlterQuery(sequelize, "ALTER TABLE Bookings ADD COLUMN isChild BOOLEAN DEFAULT false;", "Migration: Added isChild column to Bookings table");
  await executeAlterQuery(sequelize, "ALTER TABLE Bookings ADD COLUMN bookingDate DATE NULL;", "Migration: Added bookingDate column to Bookings table");
  await executeAlterQuery(sequelize, "ALTER TABLE Bookings ADD COLUMN bookingTime VARCHAR(50) NULL;", "Migration: Added bookingTime column to Bookings table");
  await executeAlterQuery(sequelize, "ALTER TABLE Bookings ADD COLUMN previousRoomRate VARCHAR(255) NULL;", "Migration: Added previousRoomRate column to Bookings table");
  await executeAlterQuery(sequelize, "ALTER TABLE Bookings MODIFY COLUMN previousRoomRate VARCHAR(255) NULL;", "Migration: Modified previousRoomRate column to VARCHAR(255) in Bookings table.");
  await executeAlterQuery(sequelize, "ALTER TABLE Bookings ADD COLUMN previousRoomType VARCHAR(100) NULL;", "Migration: Added previousRoomType column to Bookings table");
  await executeAlterQuery(sequelize, "ALTER TABLE Bookings ADD COLUMN shiftDate VARCHAR(255) NULL;", "Migration: Added shiftDate column to Bookings table");
  await executeAlterQuery(sequelize, "ALTER TABLE Bookings MODIFY COLUMN shiftDate VARCHAR(255) NULL;", "Migration: Modified shiftDate column to VARCHAR(255) in Bookings table.");
  await executeAlterQuery(sequelize, "ALTER TABLE Bookings ADD COLUMN shiftTime VARCHAR(255) NULL;", "Migration: Added shiftTime column to Bookings table");
  await executeAlterQuery(sequelize, "ALTER TABLE Bookings ADD COLUMN sameDayChargeOption VARCHAR(50) DEFAULT 'charge_previous';", "Migration: Added sameDayChargeOption column to Bookings table");
  await executeAlterQuery(sequelize, "ALTER TABLE Bookings ADD COLUMN registrationNumber VARCHAR(255) NULL;", "Migration: Added registrationNumber column to Bookings table");
  await executeAlterQuery(sequelize, "ALTER TABLE Bookings ADD COLUMN pricePerNight DECIMAL(10,2) NULL;", "Migration: Added pricePerNight column to Bookings table");

  // 4. Hotels Column Migrations
  await executeAlterQuery(sequelize, "ALTER TABLE Hotels ADD COLUMN hasActivityLogs TINYINT(1) DEFAULT 1;", "Migration: added hasActivityLogs to Hotels table.");
  await executeAlterQuery(sequelize, "ALTER TABLE Hotels ADD COLUMN hasOpeningBalance TINYINT(1) DEFAULT 1;", "Migration: added hasOpeningBalance to Hotels table.");
  await executeAlterQuery(sequelize, "ALTER TABLE Hotels ADD COLUMN openingCashBalance DECIMAL(10,2) DEFAULT 0.00;", "Migration: added openingCashBalance to Hotels table.");
  await executeAlterQuery(sequelize, "ALTER TABLE Hotels ADD COLUMN openingBankBalance DECIMAL(10,2) DEFAULT 0.00;", "Migration: added openingBankBalance to Hotels table.");
  await executeAlterQuery(sequelize, "ALTER TABLE Hotels ADD COLUMN bankOpeningBalances TEXT NULL;", "Migration: added bankOpeningBalances to Hotels table.");
  await executeAlterQuery(sequelize, "ALTER TABLE Hotels ADD COLUMN lockOpeningBalance TINYINT(1) DEFAULT 0;", "Migration: added lockOpeningBalance to Hotels table.");
  await executeAlterQuery(sequelize, "ALTER TABLE Hotels ADD COLUMN defaultGstOption VARCHAR(50) DEFAULT 'none';", "Migration: Added defaultGstOption column to Hotels table");
  await executeAlterQuery(sequelize, "ALTER TABLE Hotels ADD COLUMN hasRoomType BOOLEAN DEFAULT true;", "Migration: Added hasRoomType column to Hotels table");
  await executeAlterQuery(sequelize, "ALTER TABLE Hotels ADD COLUMN allowRoomAdd BOOLEAN DEFAULT true;", "Migration: Added allowRoomAdd column to Hotels table");
  await executeAlterQuery(sequelize, "ALTER TABLE Hotels ADD COLUMN allowRoomDelete BOOLEAN DEFAULT true;", "Migration: Added allowRoomDelete column to Hotels table");
  await executeAlterQuery(sequelize, "ALTER TABLE Hotels ADD COLUMN allowBillingEdit BOOLEAN DEFAULT true;", "Migration: Added allowBillingEdit column to Hotels table");
  await executeAlterQuery(sequelize, "ALTER TABLE Hotels ADD COLUMN allowPaymentEdit BOOLEAN DEFAULT true;", "Migration: Added allowPaymentEdit column to Hotels table");
  await executeAlterQuery(sequelize, "ALTER TABLE Hotels ADD COLUMN restrictBackDates BOOLEAN DEFAULT false;", "Migration: Added restrictBackDates column to Hotels table");
  await executeAlterQuery(sequelize, "ALTER TABLE Hotels ADD COLUMN resetInvoiceYearly BOOLEAN DEFAULT false;", "Migration: Added resetInvoiceYearly column to Hotels table");
  await executeAlterQuery(sequelize, "ALTER TABLE Hotels ADD COLUMN yearEndingDate VARCHAR(50) DEFAULT '03-31';", "Migration: Added yearEndingDate column to Hotels table");
  await executeAlterQuery(sequelize, "ALTER TABLE Hotels ADD COLUMN enablePerGuestRoomAssignment BOOLEAN DEFAULT false;", "Migration: Added enablePerGuestRoomAssignment column to Hotels table");
  await executeAlterQuery(sequelize, "ALTER TABLE Hotels ADD COLUMN enableAutoExtendCheckout BOOLEAN DEFAULT false;", "Migration: Added enableAutoExtendCheckout column to Hotels table");
  await executeAlterQuery(sequelize, "UPDATE Hotels SET enableAutoExtendCheckout = false;", "Migration: Set enableAutoExtendCheckout to false by default for all hotels");
  await executeAlterQuery(sequelize, "ALTER TABLE Hotels ADD COLUMN autoExtendCutoffTime VARCHAR(50) DEFAULT '11:30 AM';", "Migration: Added autoExtendCutoffTime column to Hotels table");
  await executeAlterQuery(sequelize, "ALTER TABLE Hotels ADD COLUMN lockPastStayCharges BOOLEAN DEFAULT false;", "Migration: Added lockPastStayCharges column to Hotels table");
  await executeAlterQuery(sequelize, "ALTER TABLE Hotels ADD COLUMN roomCardColors TEXT NULL;", "Migration: Added roomCardColors column to Hotels table");
  await executeAlterQuery(sequelize, "ALTER TABLE Bookings ADD COLUMN discountReason VARCHAR(255) NULL;", "Migration: Added discountReason column to Bookings table");
  await executeAlterQuery(sequelize, "ALTER TABLE Bookings ADD COLUMN fatherName VARCHAR(255) NULL;", "Migration: Added fatherName column to Bookings table");

  // 5. Rooms & ActivityLogs Column Modifications
  await executeAlterQuery(sequelize, "ALTER TABLE Rooms MODIFY COLUMN type VARCHAR(255) DEFAULT 'Deluxe Room';", "Migration: Modified Rooms.type column to VARCHAR to support custom room types");
  await executeAlterQuery(sequelize, "ALTER TABLE ActivityLogs MODIFY COLUMN sessionId TEXT NULL;", "Migration: Modified ActivityLogs.sessionId column to TEXT");

  // 6. Triggers
  try {
    await sequelize.query('DROP TRIGGER IF EXISTS after_booking_delete;');
    await sequelize.query(`
      CREATE TRIGGER after_booking_delete 
      AFTER DELETE ON Bookings
      FOR EACH ROW 
      BEGIN
        IF OLD.status = 'Active' THEN
          IF (SELECT COUNT(*) FROM Bookings WHERE roomId = OLD.roomId AND status = 'Active') = 0 THEN
            UPDATE Rooms 
            SET status = 'available', guestName = NULL 
            WHERE id = OLD.roomId;
          ELSE
            UPDATE Rooms 
            SET guestName = (SELECT guestName FROM Bookings WHERE roomId = OLD.roomId AND status = 'Active' LIMIT 1) 
            WHERE id = OLD.roomId;
          END IF;
        END IF;
      END;
    `);
    console.log('Migration completed: Booking delete trigger configured.'.green);
  } catch (err) {
    console.error('Migration error configuring Booking delete trigger:', err.message);
  }

  // 7. One-time Cleanup Sync Query
  try {
    await sequelize.query(`
      UPDATE Rooms r
      LEFT JOIN Bookings b ON r.id = b.roomId AND b.status = 'Active'
      SET r.status = 'available', r.guestName = NULL
      WHERE r.status = 'occupied' AND b.id IS NULL;
    `);
    console.log('Database sync: Reset any mismatched occupied rooms to available.'.green);
  } catch (err) {
    console.error('Database sync error resetting mismatched occupied rooms:', err.message);
  }

  // 8. Migration for allowEditOldPayments
  await executeAlterQuery(
    sequelize,
    `ALTER TABLE Hotels ADD COLUMN allowEditOldPayments TINYINT(1) DEFAULT 0;`,
    `Migration: Added allowEditOldPayments column to Hotels table.`
  );

  // 9. Migration for enableRegistrationNumber
  await executeAlterQuery(
    sequelize,
    `ALTER TABLE Hotels ADD COLUMN enableRegistrationNumber TINYINT(1) DEFAULT 0;`,
    `Migration: Added enableRegistrationNumber column to Hotels table.`
  );

  // 10. Migration for enablePaymentSerialNumber
  await executeAlterQuery(
    sequelize,
    `ALTER TABLE Hotels ADD COLUMN enablePaymentSerialNumber TINYINT(1) DEFAULT 0;`,
    `Migration: Added enablePaymentSerialNumber column to Hotels table.`
  );

  // 11. Migration for Expenses serialNumber
  await executeAlterQuery(
    sequelize,
    `ALTER TABLE Expenses ADD COLUMN serialNumber VARCHAR(255) NULL;`,
    `Migration: Added serialNumber column to Expenses table.`
  );

  // Backfill serialNumber for any existing expenses in database
  try {
    const Expense = require('../models/Expense');
    const expensesWithoutSerial = await Expense.findAll({
      where: {
        [Op.or]: [
          { serialNumber: null },
          { serialNumber: '' }
        ]
      },
      order: [['hotelId', 'ASC'], ['date', 'ASC'], ['createdAt', 'ASC'], ['id', 'ASC']]
    });

    if (expensesWithoutSerial.length > 0) {
      const hotelSerialMap = new Map();
      for (const exp of expensesWithoutSerial) {
        const hId = exp.hotelId || 0;
        if (!hotelSerialMap.has(hId)) {
          const hotelExps = await Expense.findAll({
            where: { hotelId: exp.hotelId },
            attributes: ['id', 'serialNumber']
          });
          let maxSeq = 0;
          hotelExps.forEach(e => {
            if (e.serialNumber) {
              const match = String(e.serialNumber).match(/(\d+)$/);
              if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxSeq) maxSeq = num;
              }
            }
          });
          hotelSerialMap.set(hId, maxSeq);
        }
        const nextNum = hotelSerialMap.get(hId) + 1;
        hotelSerialMap.set(hId, nextNum);
        await exp.update({ serialNumber: String(nextNum) });
      }
      console.log(`[Migration] Backfilled serialNumber for ${expensesWithoutSerial.length} existing expenses.`.green);
    }
  } catch (err) {
    console.error('[Migration] Error backfilling expenses serialNumber:', err.message);
  }
};

module.exports = runMigrations;
