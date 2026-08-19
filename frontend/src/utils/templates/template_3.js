import autoTable from "jspdf-autotable";
import { formatTime12hr } from "../roomHelper";

export const renderTemplate3 = (doc, bill, hotelData, numberToWords) => {
  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
  
  const primaryColor = [13, 110, 253]; // Royal Blue (#0d6efd)
  const fontName = "helvetica";

  // 1. Draw solid blue border around the whole A4 page
  doc.setDrawColor(...primaryColor);
  doc.setLineWidth(1.0);
  doc.rect(10, 10, 190, 277);

  // 2. Centered Header Titles
  doc.setFont(fontName, "bold");
  doc.setTextColor(...primaryColor);
  
  // CASH/CREDIT MEMO
  doc.setFontSize(9);
  doc.text("CASH/CREDIT MEMO", pageWidth / 2, 17, { align: "center" });

  // HOTEL NAME
  doc.setFontSize(22);
  const hotelName = hotelData.name || "XYZ HOTEL";
  doc.text(hotelName.toUpperCase(), pageWidth / 2, 26, { align: "center" });

  // ADDRESS & TEL
  doc.setFontSize(8.5);
  const addressParts = [];
  if (hotelData.address) addressParts.push(hotelData.address);
  if (hotelData.phone) addressParts.push(`TEL: ${hotelData.phone}`);
  const addressText = addressParts.join(', ').toUpperCase();
  doc.text(addressText, pageWidth / 2, 32, { align: "center" });

  // Horizontal divider line
  doc.setLineWidth(0.4);
  doc.line(10, 36, 200, 36);

  // 3. Guest details with dotted lines
  doc.setFontSize(9.5);
  
  const dateVal = bill.checkInDate ? new Date(bill.checkInDate).toLocaleDateString('en-GB') : "N/A";
  const nameVal = bill.guestName || "N/A";
  const checkinTimeVal = bill.checkInTime ? formatTime12hr(bill.checkInTime).toUpperCase() : "12:00 PM";
  
  let checkoutDateVal = "N/A";
  let checkoutTimeVal = hotelData.checkoutTime ? formatTime12hr(hotelData.checkoutTime).toUpperCase() : "11:00 AM";
  if (bill.checkOutDate) {
    checkoutDateVal = new Date(bill.checkOutDate).toLocaleDateString('en-GB');
    checkoutTimeVal = bill.checkOutTime ? formatTime12hr(bill.checkOutTime).toUpperCase() : (hotelData.checkoutTime ? formatTime12hr(hotelData.checkoutTime).toUpperCase() : "11:00 AM");
  }

  // Row 1: Date
  doc.setFont(fontName, "bold");
  doc.text("Date", 15, 44);
  doc.setFont(fontName, "normal");
  doc.text(`: ${dateVal}.............................................................................`, 25, 44);

  // Row 2: Name
  doc.setFont(fontName, "bold");
  doc.text("Name", 15, 51);
  doc.setFont(fontName, "normal");
  doc.text(`: ${nameVal}........................................................................................................................................................`, 25, 51);

  // Row 3: Arrival Date & Time
  doc.setFont(fontName, "bold");
  doc.text("Date of Arrival", 15, 58);
  doc.setFont(fontName, "normal");
  doc.text(`: ${dateVal}........................................................`, 39, 58);
  doc.setFont(fontName, "bold");
  doc.text("Time", 116, 58);
  doc.setFont(fontName, "normal");
  doc.text(`: ${checkinTimeVal}............................................`, 125, 58);

  // Row 4: Departure Date & Time
  doc.setFont(fontName, "bold");
  doc.text("Departure", 15, 65);
  doc.setFont(fontName, "normal");
  doc.text(`: ${checkoutDateVal}...............................................................`, 32, 65);
  doc.setFont(fontName, "bold");
  doc.text("Time", 116, 65);
  doc.setFont(fontName, "normal");
  doc.text(`: ${checkoutTimeVal}............................................`, 125, 65);

  // 4. Particulars Table Body
  const roomsList = Array.isArray(bill.groupBookings) && bill.groupBookings.length > 0
    ? bill.groupBookings
    : [bill];

  const gstOption = bill.gstOption || 'exclusive';
  const rawEarlyAmt = parseFloat(bill.earlyCheckInCharge || 0);

  let eSub = rawEarlyAmt;
  let eGst = 0;
  let eGrand = rawEarlyAmt;
  let earlyDeductionForBase = rawEarlyAmt;

  if (rawEarlyAmt > 0) {
    const gstRateForEarly = (bill.gstRate !== undefined && bill.gstRate !== null) ? parseFloat(bill.gstRate) : fallbackGst;
    if (gstOption === 'inclusive') {
      eSub = Math.round((rawEarlyAmt / (1 + gstRateForEarly / 100)) * 100) / 100;
      eGst = Math.round((rawEarlyAmt - eSub) * 100) / 100;
      eGrand = rawEarlyAmt;
      earlyDeductionForBase = eSub;
    } else if (gstOption === 'none') {
      eSub = rawEarlyAmt;
      eGst = 0;
      eGrand = rawEarlyAmt;
      earlyDeductionForBase = rawEarlyAmt;
    } else {
      // exclusive
      eSub = rawEarlyAmt;
      eGst = Math.round(eSub * (gstRateForEarly / 100) * 100) / 100;
      eGrand = Math.round((eSub + eGst) * 100) / 100;
      earlyDeductionForBase = rawEarlyAmt;
    }
  }

  const tableBody = roomsList.map((roomBooking, idx) => {
    // Subtract early check-in charge base from primary room to avoid double-counting
    const earlyDeduction = (idx === 0 && rawEarlyAmt > 0) ? earlyDeductionForBase : 0;
    let rRawBase = parseFloat(roomBooking.totalAmount || 0) - earlyDeduction;
    const rDiscount = parseFloat(roomBooking.discount || 0);
    const rGstRate = (roomBooking.gstRate !== undefined && roomBooking.gstRate !== null) ? parseFloat(roomBooking.gstRate) : fallbackGst;
    
    let rBase = 0;
    let rGst = 0;
    let rGrand = 0;

    if (gstOption === 'exclusive') {
      rBase = Math.max(0, rRawBase - rDiscount);
      rGst = rGstRate > 0 ? Math.round(rBase * (rGstRate / 100) * 100) / 100 : 0;
      rGrand = Math.round((rBase + rGst) * 100) / 100;
    } else if (gstOption === 'inclusive') {
      rGrand = Math.max(0, rRawBase - rDiscount);
      rBase = rGstRate > 0 ? Math.round((rGrand / (1 + rGstRate / 100)) * 100) / 100 : rGrand;
      rGst = Math.round((rGrand - rBase) * 100) / 100;
    } else {
      rBase = Math.max(0, rRawBase - rDiscount);
      rGst = 0;
      rGrand = rBase;
    }

    const rSub = rBase;

    totalBaseAmount += rBase;
    totalGstAmount += rGst;
    totalGrandTotal += rGrand;

    const curRm3 = String(roomBooking.Room?.roomNumber || '101').replace(/^[rR][- ]?/, '');
    const roomNum = roomBooking.previousRoomNumber ? `${String(roomBooking.previousRoomNumber).replace(/^[rR][- ]?/, '').replace(/→/g, '->')} -> ${curRm3}` : curRm3;
    const roomType = roomBooking.Room?.roomType || 'Standard';

    return [
      (idx + 1).toString(),
      `Room Booking - Room No. ${roomNum} (${roomType})`,
      (rBase / (roomBooking.numberOfDays || 1)).toFixed(2),
      rBase.toFixed(2)
    ];
  });

  if (bill.extraChargesList && bill.extraChargesList.length > 0) {
    bill.extraChargesList.forEach((charge, idx) => {
      const cBase = parseFloat(charge.subtotal || 0);
      const cGst = parseFloat(charge.gstAmount || 0);
      const cGrand = parseFloat(charge.grandTotal || 0);

      totalBaseAmount += cBase;
      totalGstAmount += cGst;
      totalGrandTotal += cGrand;

      tableBody.push([
        (roomsList.length + idx + 1).toString(),
        `${charge.serviceName} (Qty: ${charge.qty})`,
        parseFloat(charge.price).toFixed(2),
        cGrand.toFixed(2)
      ]);
    });
  }

  // Early Check-in Charge as separate line item
  if (rawEarlyAmt > 0) {
    totalBaseAmount += eSub;
    totalGstAmount += eGst;
    totalGrandTotal += eGrand;

    tableBody.push([
      (tableBody.length + 1).toString(),
      'Early Check-in Charge',
      eSub.toFixed(2),
      eSub.toFixed(2)
    ]);
  }

  const grandInt = Math.round(totalGrandTotal);
  if (Math.abs(totalGrandTotal - grandInt) < 0.03 && totalGrandTotal !== grandInt) {
    totalGrandTotal = grandInt;
  }

  // Pad the table body with empty rows to simulate the large blank box layout in the screenshot
  const emptyRowsCount = Math.max(8 - tableBody.length, 4);
  for (let i = 0; i < emptyRowsCount; i++) {
    tableBody.push(['', '', '', '']);
  }

  // Draw Main Particulars Grid
  autoTable(doc, {
    startY: 72,
    margin: { left: 10, right: 10 },
    head: [[
      { content: 'S.NO', styles: { halign: 'center' } },
      { content: 'PARTICULARS', styles: { halign: 'left' } },
      { content: 'RATE', styles: { halign: 'right' } },
      { content: 'TOTAL AMOUNT', styles: { halign: 'right' } }
    ]],
    body: tableBody,
    theme: 'grid',
    styles: {
      fontSize: 9,
      font: fontName,
      fontStyle: 'bold',
      textColor: primaryColor,
      lineColor: primaryColor,
      lineWidth: 0.5,
      fillColor: [255, 255, 255]
    },
    headStyles: {
      textColor: primaryColor,
      fillColor: [255, 255, 255],
      lineWidth: 0.5,
      lineColor: primaryColor,
      fontStyle: 'bold'
    },
    columnStyles: {
      0: { cellWidth: 15, halign: 'center' },
      1: { cellWidth: 110, halign: 'left' },
      2: { cellWidth: 25, halign: 'right' },
      3: { cellWidth: 40, halign: 'right' }
    }
  });

  const tableBottomY = doc.lastAutoTable.finalY;

  // 5. Totals & Tax summary block
  autoTable(doc, {
    startY: tableBottomY,
    margin: { left: 10, right: 10 },
    body: [
      [
        { content: `AMOUNT IN WORD\n\nRupees ${numberToWords(Math.round(totalGrandTotal))}`, rowSpan: 3, styles: { valign: 'top' } },
        'TOTAL',
        `Rs. ${totalBaseAmount.toFixed(2)}`
      ],
      [
        'L TAX',
        `Rs. ${totalGstAmount.toFixed(2)}`
      ],
      [
        'GRAND TOTAL',
        `Rs. ${totalGrandTotal.toFixed(2)}`
      ]
    ],
    theme: 'grid',
    styles: {
      fontSize: 8.5,
      font: fontName,
      fontStyle: 'bold',
      textColor: primaryColor,
      lineColor: primaryColor,
      lineWidth: 0.5,
      fillColor: [255, 255, 255]
    },
    columnStyles: {
      0: { cellWidth: 125 },
      1: { cellWidth: 25 },
      2: { cellWidth: 40, halign: 'right' }
    }
  });

  const sumBottomY = doc.lastAutoTable.finalY;

  // 6. Signatures block aligned inside the blue borders
  autoTable(doc, {
    startY: sumBottomY,
    margin: { left: 10, right: 10 },
    body: [
      [
        { content: 'CUSTOMER SIGNATURE', styles: { halign: 'left' } },
        { content: 'CHECKED BY', styles: { halign: 'center' } },
        { content: 'MANAGER', styles: { halign: 'right' } }
      ]
    ],
    theme: 'grid',
    styles: {
      fontSize: 8.5,
      font: fontName,
      fontStyle: 'bold',
      textColor: primaryColor,
      lineColor: primaryColor,
      lineWidth: 0.5,
      fillColor: [255, 255, 255],
      cellPadding: 4
    },
    columnStyles: {
      0: { cellWidth: 63, halign: 'left' },
      1: { cellWidth: 64, halign: 'center' },
      2: { cellWidth: 63, halign: 'right' }
    }
  });

  const finalBottomY = doc.lastAutoTable.finalY;

  // 7. Text block outside the border (centered, black)
  doc.setFont(fontName, "bold");
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0); // Solid black text
  doc.text("THANKS", pageWidth / 2, finalBottomY + 9, { align: "center" });
};
