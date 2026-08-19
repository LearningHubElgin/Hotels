import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { cleanRoomNumber } from "./roomHelper";


export const generateBookingConfirmationVoucher = (guest) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const primaryColor = [26, 46, 5]; // Dark Green

  // Helper to add horizontal line
  const addLine = (y) => {
    doc.setDrawColor(220, 220, 220);
    doc.line(margin, y, pageWidth - margin, y);
  };

  const storedHotel = localStorage.getItem('activeHotel');
  const activeHotel = storedHotel ? JSON.parse(storedHotel) : null;
  const hotelName = activeHotel?.name || "Hotel";

  const addressParts = [
    activeHotel?.address,
    activeHotel?.city,
    activeHotel?.state
  ].filter(Boolean);
  const fullHotelAddress = addressParts.length > 0 ? addressParts.join(', ') : '';

  const hotelEmail = activeHotel?.email || "";
  const hotelPhone = activeHotel?.phone || "";

  // --- PAGE 1: BOOKING DETAILS ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...primaryColor);
  doc.text("Booking Confirmation Voucher", margin, 20);

  doc.setFontSize(14);
  doc.text(hotelName, pageWidth - margin, 20, { align: "right" });
  
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);

  const hotelDetails = [];
  if (fullHotelAddress) {
    const lines = doc.splitTextToSize(fullHotelAddress, 75);
    hotelDetails.push(...lines);
  }
  if (hotelEmail) {
    hotelDetails.push(`Email: ${hotelEmail}`);
  }
  if (hotelPhone) {
    hotelDetails.push(`Tel: ${hotelPhone}`);
  }

  hotelDetails.forEach((line, i) => {
    doc.text(line, pageWidth - margin, 25 + (i * 4), { align: "right" });
  });

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(80, 80, 80);
  doc.text(`Voucher Date:  ${new Date().toLocaleDateString()}`, margin, 30);
 
  addLine(47);

  // Guest Details
  let y = 55;
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text("Guest Name", margin, y);
  doc.text("Email", pageWidth / 2, y);
  y += 5;
  doc.setFontSize(10);
  doc.setTextColor(...primaryColor);
  doc.text(guest.guestName.toUpperCase(), margin, y);
  doc.text(guest.email || "N/A", pageWidth / 2, y);
  
  y += 10;
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text("Phone", margin, y);
  doc.text("Expected Time of Arrival", pageWidth / 2, y);
  y += 5;
  doc.setFontSize(10);
  doc.setTextColor(...primaryColor);
  doc.text(guest.phone || "N/A", margin, y);
  doc.text("12:00 PM", pageWidth / 2, y);

  y += 15;

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Booking Details", margin, y);
  
  y += 8;
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text("Property Name", margin, y);
  doc.text("Check-in Date", pageWidth / 2 + 20, y);
  y += 5;
  doc.setFontSize(10);
  doc.setTextColor(...primaryColor);
  doc.text(hotelName, margin, y);
  doc.text(new Date(guest.checkInDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), pageWidth / 2 + 20, y);

  y += 10;
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text("Property Address", margin, y);
  doc.text("Check-out Date", pageWidth / 2 + 20, y);
  y += 5;
  doc.setFontSize(9);
  doc.setTextColor(...primaryColor);
  const addrLines = doc.splitTextToSize(fullHotelAddress || "No physical address configured", pageWidth / 2);
  doc.text(addrLines, margin, y);
  doc.setFontSize(10);
  doc.text(new Date(guest.checkOutDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), pageWidth / 2 + 20, y);

  y += 15;
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text("Stay Duration", margin, y);
  doc.text("Maximum Occupancy", pageWidth / 2 + 20, y);
  y += 5;
  doc.setFontSize(10);
  doc.setTextColor(...primaryColor);
  let diffDays = Math.ceil(Math.abs(new Date(guest.checkOutDate) - new Date(guest.checkInDate)) / (1000 * 60 * 60 * 24)) || 1;
  const isEarlyFullDay = !!(guest.chargePreviousDay && (guest.earlyCheckInType === 'full_day' || !guest.earlyCheckInCharge || Number(guest.earlyCheckInCharge) === 0));
  if (isEarlyFullDay) {
    diffDays += 1;
  }
  doc.text(`${diffDays} Night${diffDays > 1 ? 's' : ''}`, margin, y);
  doc.text("2 Adults", pageWidth / 2 + 20, y);

  y += 15;
  doc.setFontSize(12);
  doc.text("Room & Meal Plan Breakdown", margin, y);
  let tableBody = [];
  let totalAmount = guest.totalAmount || 0;
  
  if (guest.groupBookings && guest.groupBookings.length > 1) {
    tableBody = guest.groupBookings.map(b => [
      `${b.Room?.type || "Deluxe Room"} (Room ${cleanRoomNumber(b.Room?.roomNumber || b.roomId)})`,
      new Date(b.checkInDate).toLocaleDateString(),
      "Room Only",
      `Rs ${b.totalAmount || 0}`
    ]);
    totalAmount = guest.groupBookings.reduce((sum, b) => sum + Number(b.totalAmount || 0), 0);
  } else {
    tableBody = [
      [`${guest.Room?.type || "Deluxe Room"} (Room ${cleanRoomNumber(guest.Room?.roomNumber || guest.roomId)})`, new Date(guest.checkInDate).toLocaleDateString(), "Room Only", `Rs ${guest.totalAmount || 0}`]
    ];
  }

  autoTable(doc, {
    startY: y + 5,
    head: [['Room Type', 'Date', 'Type', 'Total Amount (Rs)']],
    body: tableBody,
    theme: 'grid',
    headStyles: { fillColor: [245, 245, 245], textColor: [0, 0, 0], fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 3: { halign: 'right' } }
  });

  y = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(12);
  doc.text("Account Summary", margin, y);
  autoTable(doc, {
    startY: y + 5,
    body: [
      ['Total Amount', `Rs ${totalAmount}`],
    ],
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 2 },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } }
  });


  y = doc.lastAutoTable.finalY + 15;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Contact Property", margin, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Email: ommlodge@gmail.com   |   Phone: +91 98754 83606`, margin, y);

  y += 15;
  addLine(y);
  y += 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Thank you for booking!", margin, y);
  


  y += 10;
  doc.setFontSize(7);
  doc.setFont("helvetica", "italic");
  doc.text("This is a computer-generated voucher.", margin, y);
  doc.text(`Generated on: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, margin, y + 4);

  doc.save(`Confirmation_${guest.guestName.replace(/\s/g, '_')}.pdf`);
};
