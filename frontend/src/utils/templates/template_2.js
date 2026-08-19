import autoTable from "jspdf-autotable";
import { formatTime12hr } from "../roomHelper";

export const renderTemplate2 = (doc, bill, hotelData, numberToWords) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const darkGray = [60, 60, 60];
  const primaryColor = [67, 56, 202]; // Indigo (#4338CA)
  const fontName = "times";

  const hotelName = hotelData.name;
  const hotelAddress = hotelData.address;
  const hotelEmail = hotelData.email;
  const hotelPhone = hotelData.phone;
  const hotelGstin = hotelData.gstin;

  // Top Bill Number (Header metadata)
  doc.setFont(fontName, "bold");
  doc.setFontSize(8);
  doc.setTextColor(...darkGray);
  const currentPrefix = hotelData.invoicePrefix || '';
  let billNum = '';
  if (bill.invoiceNumber) {
    const rawNumber = currentPrefix ? bill.invoiceNumber.replace(currentPrefix, '') : bill.invoiceNumber;
    billNum = `${currentPrefix}${rawNumber}`;
  } else {
    billNum = bill.id ? `${currentPrefix}${String(bill.id).substring(0, 5).toUpperCase()}` : 'Auto-generated';
  }
  doc.text(`Bill Number : ${billNum}`, pageWidth - margin, 15, { align: "right" });

  // Main Header Title Banner (Hotel Bill)
  doc.setFillColor(...primaryColor);
  doc.rect(margin, 18, pageWidth - (2 * margin), 11, 'F');
  
  doc.setFont(fontName, "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text("Hotel Bill", pageWidth / 2, 25, { align: "center" });

  // Hotel info (Left aligned) & Logo box (Right aligned)
  doc.setTextColor(...darkGray);
  doc.setFont(fontName, "bold");
  doc.setFontSize(8.5);
  doc.text(`Name Of The Hotel : ${hotelName}${hotelData.since ? ` (Estd. ${hotelData.since})` : ''}`, margin, 38);
  
  doc.setFont(fontName, "normal");
  const addressLineText = `Address : ${hotelAddress || 'N/A'}`;
  const wrappedAddr = doc.splitTextToSize(addressLineText, 110);
  wrappedAddr.forEach((line, idx) => {
    doc.text(line, margin, 42 + (idx * 3.5));
  });

  const contactY = 42 + (wrappedAddr.length * 3.5) + 0.5;
  doc.text(`Hotel Phone No : ${hotelPhone || 'N/A'}`, margin, contactY);
  doc.text(`Email Id : ${hotelEmail || 'N/A'}`, margin + 55, contactY);

  // Simulated Logo Box
  doc.setDrawColor(...primaryColor);
  doc.setLineWidth(0.3);
  doc.rect(pageWidth - margin - 35, 34, 35, 18);
  doc.setFont(fontName, "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...primaryColor);
  doc.text("myBillBook", pageWidth - margin - 17.5, 42, { align: "center" });
  doc.setFont(fontName, "normal");
  doc.setFontSize(5);
  doc.text("Logo Area", pageWidth - margin - 17.5, 46, { align: "center" });

  // "Billing To" strip
  doc.setFillColor(...primaryColor);
  doc.rect(margin, 58, pageWidth - (2 * margin), 6.5, 'F');
  doc.setFont(fontName, "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text("Billing To", pageWidth / 2, 62.5, { align: "center" });

  // Customer & Stay info
  const guestY = 71;
  doc.setFont(fontName, "bold");
  doc.setFontSize(8);
  doc.setTextColor(...darkGray);
  doc.text("Customer Name :", margin, guestY);
  doc.setFont(fontName, "normal");
  doc.text(bill.guestName || "N/A", margin + 26, guestY);

  doc.setFont(fontName, "bold");
  doc.text("Address :", margin, guestY + 4.5);
  doc.setFont(fontName, "normal");
  const custAddr = bill.address || "N/A";
  const wrappedCustAddr = doc.splitTextToSize(custAddr, 80);
  wrappedCustAddr.forEach((l, i) => {
    doc.text(l, margin + 26, guestY + 4.5 + (i * 3.5));
  });

  const phoneY = guestY + 4.5 + (wrappedCustAddr.length * 3.5) + 0.5;
  doc.setFont(fontName, "bold");
  doc.text("Phone No :", margin, phoneY);
  doc.setFont(fontName, "normal");
  doc.text(bill.phone || "N/A", margin + 26, phoneY);

  // Right Column stay info
  const rightColX = pageWidth / 2 + 10;
  doc.setFont(fontName, "bold");
  doc.text("Checkin Date :", rightColX, guestY);
  doc.setFont(fontName, "normal");
  const checkInDate = bill.checkInDate ? new Date(bill.checkInDate).toLocaleDateString('en-GB') : "N/A";
  doc.text(checkInDate, rightColX + 22, guestY);

  doc.setFont(fontName, "bold");
  doc.text("Check in Time :", rightColX, guestY + 4.5);
  doc.setFont(fontName, "normal");
  doc.text(bill.checkInTime ? formatTime12hr(bill.checkInTime).toUpperCase() : "12:00 PM", rightColX + 22, guestY + 4.5);

  doc.setFont(fontName, "bold");
  doc.text("Aadar No :", rightColX, guestY + 9);
  doc.setFont(fontName, "normal");
  doc.text("Approved Proof ID", rightColX + 22, guestY + 9);

  doc.setFont(fontName, "bold");
  doc.text("Pancard Number :", rightColX, guestY + 13.5);
  doc.setFont(fontName, "normal");
  doc.text(bill.guestGst || "N/A", rightColX + 26, guestY + 13.5);

  // Room Particulars Table
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

  let historyList = [];
  try {
    if (bill.paymentHistory) {
      historyList = typeof bill.paymentHistory === 'string' ? JSON.parse(bill.paymentHistory) : bill.paymentHistory;
    }
  } catch (e) {}

  const totalPaidForStay = (historyList && historyList.length > 0)
    ? historyList.reduce((sum, h) => (h.paidFor !== 'Food' && h.paidFor !== 'Extras') ? sum + parseFloat(h.amount || 0) : sum, 0)
    : parseFloat(bill.amountPaid || 0);

  const tableBody = roomsList.map((roomBooking, index) => {
    // Subtract early check-in charge base from primary room to avoid double-counting
    const earlyDeduction = (index === 0 && rawEarlyAmt > 0) ? earlyDeductionForBase : 0;
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
      if (totalPaidForStay > rGrand && Math.abs(totalPaidForStay - Math.round(rGrand * (1 + rGstRate / 100))) < 1.5) {
        rGrand = totalPaidForStay;
      }
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

    const curRm2 = String(roomBooking.Room?.roomNumber || '102').replace(/^[rR][- ]?/, '');
    const rmDisplay2 = roomBooking.previousRoomNumber ? `${String(roomBooking.previousRoomNumber).replace(/^[rR][- ]?/, '').replace(/→/g, '->')} -> ${curRm2}` : curRm2;
    return [
      rmDisplay2,
      `Room Booking - Deluxe Room`,
      '2',
      (rBase / 2).toFixed(2),
      rBase.toFixed(2)
    ];
  });

  if (bill.extraChargesList && bill.extraChargesList.length > 0) {
    bill.extraChargesList.forEach((charge) => {
      const cBase = parseFloat(charge.subtotal || 0);
      const cGst = parseFloat(charge.gstAmount || 0);
      const cGrand = parseFloat(charge.grandTotal || 0);

      totalBaseAmount += cBase;
      totalGstAmount += cGst;
      totalGrandTotal += cGrand;

      tableBody.push([
        charge.roomNumber || 'N/A',
        `${charge.serviceName} (GST ${charge.gstOption})`,
        String(charge.qty),
        parseFloat(charge.price).toFixed(2),
        cBase.toFixed(2)
      ]);
    });
  }

  // Early Check-in Charge as separate line item
  if (rawEarlyAmt > 0) {
    totalBaseAmount += eSub;
    totalGstAmount += eGst;
    totalGrandTotal += eGrand;

    tableBody.push([
      '',
      'Early Check-in Charge',
      '1',
      eSub.toFixed(2),
      eSub.toFixed(2)
    ]);
  }

  const grandInt = Math.round(totalGrandTotal);
  if (Math.abs(totalGrandTotal - grandInt) < 0.03 && totalGrandTotal !== grandInt) {
    totalGrandTotal = grandInt;
  }

  autoTable(doc, {
    startY: 96,
    margin: { left: margin, right: margin },
    head: [[
      { content: 'Room No', styles: { halign: 'left' } },
      { content: 'Particulars', styles: { halign: 'left' } },
      { content: 'No. Of Days', styles: { halign: 'center' } },
      { content: 'Price Per Day', styles: { halign: 'right' } },
      { content: 'Amount', styles: { halign: 'right' } }
    ]],
    body: tableBody,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 3, font: fontName, fontStyle: 'bold' },
    headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 80 },
      2: { cellWidth: 22, halign: 'center' },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 30, halign: 'right' }
    }
  });

  // Totals Grid segment
  const tableBottomY = doc.lastAutoTable.finalY;
  
  // Summary table with Amount in Words on the left & Totals on the right
  autoTable(doc, {
    startY: tableBottomY,
    margin: { left: margin, right: margin },
    body: [
      [
        `Amount in Words : \nRupees ${numberToWords(Math.round(totalGrandTotal))} Only`,
        `Total :\n\nGST :\n\nGrand Total :`,
        `Rs. ${totalBaseAmount.toFixed(2)}\n\nRs. ${totalGstAmount.toFixed(2)}\n\nRs. ${totalGrandTotal.toFixed(2)}`
      ]
    ],
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 3, font: fontName, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 100 },
      1: { cellWidth: 50 },
      2: { cellWidth: 30, halign: 'right' }
    }
  });

  const sumBottomY = doc.lastAutoTable.finalY;

  // Note section
  doc.setFont(fontName, "bold");
  doc.setFontSize(8.5);
  doc.text("Note :", margin, sumBottomY + 7);
  doc.setFont(fontName, "normal");
  doc.text("This bill layout is formatted dynamically under the Indigo Classic layout architecture.", margin + 10, sumBottomY + 7);

  // Signatures
  const signY = sumBottomY + 20;
  
  // Box 1: Customer Signature
  doc.rect(margin + 5, signY, 40, 10);
  doc.text("Customer Signature", margin + 25, signY + 14, { align: "center" });

  // Box 2: Checked By
  doc.rect(pageWidth / 2 - 20, signY, 40, 10);
  doc.text("Checked By", pageWidth / 2, signY + 14, { align: "center" });

  // Box 3: Manager Signature
  doc.rect(pageWidth - margin - 45, signY, 40, 10);
  doc.text("Manager", pageWidth - margin - 25, signY + 14, { align: "center" });
};
