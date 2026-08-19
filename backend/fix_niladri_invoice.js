const { sequelize } = require('./config/database');
const Booking = require('./models/Booking');

async function fixInvoices() {
  try {
    await sequelize.authenticate();
    console.log('Database connected.');

    const bookings = await Booking.findAll({
      order: [['createdAt', 'DESC']]
    });

    console.log(`Found ${bookings.length} bookings.`);
    for (const b of bookings) {
      console.log(`ID: ${b.id}, Guest: ${b.guestName}, Room: ${b.roomId}, Invoice: ${b.invoiceNumber}, Status: ${b.status}`);
      if (b.invoiceNumber && (b.invoiceNumber.includes('009') || b.invoiceNumber.includes('09'))) {
        const newInvoice = b.invoiceNumber.replace('009', '1009').replace('09', '1009');
        console.log(`Updating Booking ID ${b.id} (${b.guestName}) from '${b.invoiceNumber}' to '${newInvoice}'...`);
        await b.update({ invoiceNumber: newInvoice });
      }
    }
    console.log('Fix script completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Error running fix script:', err);
    process.exit(1);
  }
}

fixInvoices();
