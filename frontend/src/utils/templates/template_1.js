import autoTable from "jspdf-autotable";
import { greatVibesFontBase64 } from "../greatVibesFont";
import { formatTime12hr } from "../roomHelper";

export const renderTemplate1 = (doc, bill, hotelData, numberToWords) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const darkGray = [60, 60, 60];
  const fontName = "helvetica";

  const hotelName = hotelData.name;
  const hotelAddress = hotelData.address;
  const hotelEmail = hotelData.email;
  const hotelPhone = hotelData.phone;
  const hotelGstin = hotelData.gstin;

  // Left Branding
  let nameX = margin;
  if (hotelData.logoBase64) {
    try {
      doc.addImage(hotelData.logoBase64, 'PNG', margin, 11, 22, 22);
      nameX = margin + 24;
    } catch (e) {
      console.error("Error drawing logo in template 1:", e);
    }
  }

  doc.setFont(fontName, "bold");
  doc.setFontSize(16);
  doc.setTextColor(30, 30, 30);
  doc.text(hotelName.toUpperCase(), nameX, 22);

  // Center alignment for Since text under the Hotel Name title
  const titleWidth = doc.getTextWidth(hotelName.toUpperCase());
  const titleCenterX = nameX + (titleWidth / 2);

  if (hotelData.since) {
    try {
      doc.addFileToVFS("GreatVibes-Regular.ttf", greatVibesFontBase64);
      doc.addFont("GreatVibes-Regular.ttf", "GreatVibes", "normal");
      doc.setFont("GreatVibes", "normal");
      doc.setFontSize(12);
      doc.setTextColor(60, 60, 60);

      const sinceText = `Since ${hotelData.since}`;
      doc.text(sinceText, titleCenterX, 27, { align: "center" });

      // Calculate coordinates to draw longer clean vector lines on sides
      const textWidth = doc.getTextWidth(sinceText);
      const lineY = 25.0; // Vertically centered with Great Vibes text
      const lineLength = 12; // 12mm long lines
      const spacing = 3.5; // Gap from text

      doc.setDrawColor(140, 140, 140);
      doc.setLineWidth(0.25);
      doc.line(titleCenterX - textWidth / 2 - spacing - lineLength, lineY, titleCenterX - textWidth / 2 - spacing, lineY);
      doc.line(titleCenterX + textWidth / 2 + spacing, lineY, titleCenterX + textWidth / 2 + spacing + lineLength, lineY);

      doc.setFont(fontName, "normal");
    } catch (e) {
      console.error("Error setting custom font:", e);
      doc.setFont(fontName, "italic");
      doc.setFontSize(8);
      doc.setTextColor(60, 60, 60);

      const sinceText = `Since ${hotelData.since}`;
      doc.text(sinceText, titleCenterX, 27, { align: "center" });

      const textWidth = doc.getTextWidth(sinceText);
      const lineY = 25.8;
      const lineLength = 12;
      const spacing = 3.5;

      doc.setDrawColor(140, 140, 140);
      doc.setLineWidth(0.25);
      doc.line(titleCenterX - textWidth / 2 - spacing - lineLength, lineY, titleCenterX - textWidth / 2 - spacing, lineY);
      doc.line(titleCenterX + textWidth / 2 + spacing, lineY, titleCenterX + textWidth / 2 + spacing + lineLength, lineY);

      doc.setFont(fontName, "normal");
    }
  }

  // Right Hotel details
  doc.setFontSize(8);
  doc.setTextColor(...darkGray);
  const hotelAddressLines = hotelAddress ? doc.splitTextToSize(hotelAddress, 75) : [];

  const hotelDetails = [
    ...hotelAddressLines
  ];
  if (hotelEmail) {
    hotelDetails.push(`Email: ${hotelEmail}`);
  }
  if (hotelPhone) {
    hotelDetails.push(`Tel: ${hotelPhone}`);
  }
  if (hotelGstin) {
    hotelDetails.push(`GSTIN: ${hotelGstin}`);
  }

  hotelDetails.forEach((line, i) => {
    doc.text(line, pageWidth - margin, 15 + (i * 3.5), { align: "right" });
  });

  doc.setDrawColor(200, 200, 200);
  doc.line(margin, 48, pageWidth - margin, 48);

  // Banner title
  doc.setFont(fontName, "bold");
  doc.setFontSize(10);
  doc.text("Tax Invoice", pageWidth / 2, 53, { align: "center" });
  doc.line(margin, 55, pageWidth - margin, 55);

  const infoY = 60;
  doc.setFontSize(8);

  // Extract all guest names (Primary + Extra Registered Guests + Group Guests)
  const getAllGuestNamesList = () => {
    const names = [];
    const addName = (n) => {
      if (!n || typeof n !== 'string') return;
      const trimmed = n.trim();
      if (trimmed && !names.some(existing => existing.toLowerCase() === trimmed.toLowerCase())) {
        names.push(trimmed);
      }
    };

    addName(bill.guestName);

    if (bill.extraGuests) {
      try {
        const parsed = typeof bill.extraGuests === 'string' ? JSON.parse(bill.extraGuests) : bill.extraGuests;
        if (Array.isArray(parsed)) {
          parsed.forEach(eg => addName(eg.guestName || eg.name || eg.fullName));
        }
      } catch (e) {}
    }

    if (Array.isArray(bill.groupBookings) && bill.groupBookings.length > 0) {
      bill.groupBookings.forEach(b => {
        addName(b.guestName);
        if (b.extraGuests) {
          try {
            const parsed = typeof b.extraGuests === 'string' ? JSON.parse(b.extraGuests) : b.extraGuests;
            if (Array.isArray(parsed)) {
              parsed.forEach(eg => addName(eg.guestName || eg.name || eg.fullName));
            }
          } catch (e) {}
        }
      });
    }

    return names;
  };

  const allGuestNames = getAllGuestNamesList();
  const guestNamesStr = allGuestNames.length > 0 ? allGuestNames.join(', ') : (bill.guestName || "N/A");
  const guestLabel = allGuestNames.length > 1 ? "Guest Names:" : "Guest Name:";

  // Left info
  doc.setFont(fontName, "bold");
  doc.text("To Pay:", margin, infoY);
  doc.setFont(fontName, "normal");
  doc.text(bill.guestName || "N/A", margin, infoY + 4);

  const addressText = `address - ${bill.address || ""}`;
  const addressLines = doc.splitTextToSize(addressText, pageWidth / 2 - margin - 5);
  doc.text(addressLines, margin, infoY + 8);

  const guestY = Math.max(infoY + 25, infoY + 8 + (addressLines.length * 4) + 3);
  doc.setFont(fontName, "normal");
  const guestText = `${guestLabel} ${guestNamesStr}`;
  const guestLines = doc.splitTextToSize(guestText, pageWidth / 2 - margin - 5);
  doc.text(guestLines, margin, guestY);
  const endGuestY = guestY + (guestLines.length * 3.5);

  // Right info columns
  const rightColX = pageWidth - 80;
  const labelWidth = 30;

  const roomsList = Array.isArray(bill.groupBookings) && bill.groupBookings.length > 0
    ? bill.groupBookings
    : [bill];

  const currentPrefix = hotelData.invoicePrefix || '';
  let invoiceNo = '';
  if (bill.invoiceNumber) {
    const rawNumber = currentPrefix ? bill.invoiceNumber.replace(currentPrefix, '') : bill.invoiceNumber;
    invoiceNo = `${currentPrefix}${rawNumber}`;
  } else {
    invoiceNo = bill.id ? `${currentPrefix}${String(bill.id).substring(0, 5).toUpperCase()}` : 'Auto-generated';
  }

  const formatDateDMY = (dateVal) => {
    if (!dateVal) return '';
    let dStr = dateVal;
    if (typeof dStr === 'string' && dStr.includes('T')) {
      dStr = dStr.split('T')[0];
    }
    if (typeof dStr === 'string' && dStr.includes('/')) {
      const parts = dStr.split('/');
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
        }
        return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
      }
    }
    if (typeof dStr === 'string' && dStr.includes('-')) {
      const parts = dStr.split('-');
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
        }
        return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
      }
    }
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const getBookingDateTimeFormatted = (b) => {
    const dStr = formatDateDMY(b.bookingDate || b.checkInDate || b.createdAt);
    let tStr = '';
    if (b.bookingTime) {
      tStr = formatTime12hr(b.bookingTime);
    } else if (b.checkInTime) {
      tStr = formatTime12hr(b.checkInTime);
    } else if (b.createdAt) {
      const d = new Date(b.createdAt);
      if (!isNaN(d.getTime())) {
        tStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
      }
    }
    if (!tStr) tStr = '12:00 PM';
    return `${dStr} ${tStr.toUpperCase()}`;
  };

  const getArriveDateTimeFormatted = (b) => {
    if (!b.checkInDate && !b.createdAt) return 'N/A';
    const dStr = formatDateDMY(b.checkInDate || b.createdAt);
    let tStr = '';
    if (b.checkInTime) {
      tStr = formatTime12hr(b.checkInTime);
    } else if (b.createdAt) {
      const d = new Date(b.createdAt);
      if (!isNaN(d.getTime())) {
        tStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
      }
    }
    if (!tStr) tStr = '12:00 PM';
    return `${dStr} ${tStr.toUpperCase()}`;
  };

  const getDepartDateTimeFormatted = (b) => {
    if (!b.checkOutDate) return 'N/A';
    const dStr = formatDateDMY(b.checkOutDate);
    const tStr = b.checkOutTime ? formatTime12hr(b.checkOutTime) : '11:00 AM';
    return `${dStr} ${tStr.toUpperCase()}`;
  };

  const invoiceData = [
    ["Invoice number:", invoiceNo],
    ["Invoice date:", new Date().toLocaleDateString('en-GB')],
    ["Booking date:", getBookingDateTimeFormatted(bill)],
    ["Arrive:", getArriveDateTimeFormatted(bill)],
    ["Depart:", getDepartDateTimeFormatted(bill)],
    ["No. of rooms:", String(roomsList.length)]
  ];

  invoiceData.forEach((item, i) => {
    doc.setFont(fontName, "normal");
    doc.text(item[0], rightColX, infoY + (i * 4));
    doc.setFont(fontName, "normal");
    doc.text(item[1], rightColX + labelWidth, infoY + (i * 4));
  });

  // Particulars Table
  const fallbackGst = hotelData.defaultGstRate !== undefined ? Number(hotelData.defaultGstRate) : 12;
  const gstRate = (bill.gstRate !== undefined && bill.gstRate !== null) ? parseFloat(bill.gstRate) : fallbackGst;
  let totalBaseAmount = 0;
  let totalAmountPaid = 0;
  let totalDiscount = 0;
  let totalSubTotal = 0;
  let totalGstAmount = 0;
  let totalGrandTotal = 0;

  let historyList = [];
  try {
    if (bill.paymentHistory) {
      historyList = typeof bill.paymentHistory === 'string' ? JSON.parse(bill.paymentHistory) : bill.paymentHistory;
    }
  } catch (e) {
    console.error("Failed to parse payment history in template_1", e);
  }

  let totalPaidForStay = 0;
  if (historyList && historyList.length > 0) {
    totalPaidForStay = historyList.reduce((sum, h) => {
      const isExtra = h.paidFor === 'Food' || h.paidFor === 'Extras';
      return !isExtra ? sum + parseFloat(h.amount || 0) : sum;
    }, 0);
  } else {
    totalPaidForStay = parseFloat(bill.amountPaid || 0);
  }

  let remainingPaidStay = totalPaidForStay;

  const gstOption = bill.gstOption || 'exclusive';
  const rawEarlyAmt = parseFloat(bill.earlyCheckInCharge || 0);

  let eSub = rawEarlyAmt;
  let eGst = 0;
  let eGrand = rawEarlyAmt;
  let earlyDeductionForBase = rawEarlyAmt;

  if (rawEarlyAmt > 0) {
    if (gstOption === 'inclusive') {
      eSub = Math.round((rawEarlyAmt / (1 + gstRate / 100)) * 100) / 100;
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
      eGst = Math.round(eSub * (gstRate / 100) * 100) / 100;
      eGrand = Math.round((eSub + eGst) * 100) / 100;
      earlyDeductionForBase = rawEarlyAmt;
    }
  }

  const tableBody = roomsList.map((roomBooking, index) => {
    // Subtract early check-in charge base from the primary room's totalAmount to avoid double-counting
    const earlyDeduction = (index === 0 && rawEarlyAmt > 0) ? earlyDeductionForBase : 0;
    let rBase = parseFloat(roomBooking.totalAmount || 0) - earlyDeduction;
    if (roomBooking.previousRoomNumber) {
      const checkInStr = roomBooking.checkInDate ? roomBooking.checkInDate.split('T')[0] : (bill.checkInDate ? bill.checkInDate.split('T')[0] : '');
      const checkOutStr = roomBooking.checkOutDate ? roomBooking.checkOutDate.split('T')[0] : (bill.checkOutDate ? bill.checkOutDate.split('T')[0] : '');
      if (checkInStr && checkOutStr) {
        const cIn = new Date(checkInStr);
        const cOut = new Date(checkOutStr);
        const totalStayDays = Math.max(1, Math.ceil(Math.abs(cOut - cIn) / (1000 * 60 * 60 * 24)));
        let shiftDateStr = roomBooking.shiftDate || (roomBooking.updatedAt ? roomBooking.updatedAt.split('T')[0] : '');
        const todayStr = new Date().toISOString().split('T')[0];

        if (!shiftDateStr || shiftDateStr < checkInStr || shiftDateStr > checkOutStr) {
          if (todayStr > checkInStr && todayStr <= checkOutStr) shiftDateStr = todayStr;
          else shiftDateStr = new Date(cIn.getTime() + Math.max(1, Math.floor(totalStayDays / 2)) * 86400000).toISOString().split('T')[0];
        }

        let prevDays = Math.max(1, Math.ceil(Math.abs(new Date(shiftDateStr) - cIn) / (1000 * 60 * 60 * 24)));
        if (prevDays >= totalStayDays) prevDays = Math.max(1, totalStayDays - 1);
        const curDays = Math.max(1, totalStayDays - prevDays);

        const prevRateVal = roomBooking.previousRoomRate !== undefined && roomBooking.previousRoomRate !== null
          ? roomBooking.previousRoomRate
          : bill.previousRoomRate;
        const prevRatesList = String(prevRateVal || '').split(/→|->|,|>/).map(s => Number(s.trim())).filter(n => !isNaN(n));
        const defaultPrevRate = prevRatesList.length > 0
          ? prevRatesList[0]
          : (roomBooking.Room?.pricePerNight ? Number(roomBooking.Room.pricePerNight) : (bill.Room?.pricePerNight ? Number(bill.Room.pricePerNight) : 0));
        const curRate = roomBooking.Room?.pricePerNight ? Number(roomBooking.Room.pricePerNight) : defaultPrevRate;

        if (roomBooking.totalAmount && !isNaN(Number(roomBooking.totalAmount)) && Number(roomBooking.totalAmount) > 0) {
          rBase = Number(roomBooking.totalAmount) - earlyDeduction;
        } else {
          const calcBase = (prevDays * defaultPrevRate) + (curDays * curRate) - earlyDeduction;
          if (!isNaN(calcBase) && calcBase > 0) {
            rBase = calcBase;
          }
        }
      }
    }
    if (isNaN(rBase) || rBase < 0) rBase = 0;
    const rDiscount = parseFloat(roomBooking.discount || 0);
    const rGstRate = (roomBooking.gstRate !== undefined && roomBooking.gstRate !== null) ? parseFloat(roomBooking.gstRate) : fallbackGst;

    let rBaseAmt = 0;
    let rGst = 0;
    let rGrand = 0;

    if (gstOption === 'exclusive') {
      rBaseAmt = Math.max(0, rBase - rDiscount);
      rGst = rGstRate > 0 ? Math.round(rBaseAmt * (rGstRate / 100) * 100) / 100 : 0;
      rGrand = Math.round((rBaseAmt + rGst) * 100) / 100;
    } else if (gstOption === 'inclusive') {
      rGrand = Math.max(0, rBase - rDiscount);
      if (totalPaidForStay > rGrand && Math.abs(totalPaidForStay - Math.round(rGrand * (1 + rGstRate / 100))) < 1.5) {
        rGrand = totalPaidForStay;
      }
      rBaseAmt = rGstRate > 0 ? Math.round((rGrand / (1 + rGstRate / 100)) * 100) / 100 : rGrand;
      rGst = Math.round((rGrand - rBaseAmt) * 100) / 100;
    } else {
      rBaseAmt = Math.max(0, rBase - rDiscount);
      rGst = 0;
      rGrand = rBaseAmt;
    }

    const rSub = rBaseAmt;
    rBase = rBaseAmt;

    let rPaid = 0;
    if (index === roomsList.length - 1) {
      rPaid = remainingPaidStay;
    } else {
      rPaid = Math.min(remainingPaidStay, rGrand);
      remainingPaidStay -= rPaid;
    }

    totalBaseAmount += rBase;
    totalAmountPaid += rPaid;
    totalDiscount += rDiscount;
    totalSubTotal += rSub;
    totalGstAmount += rGst;
    totalGrandTotal += rGrand;

    const cgst = rGst / 2;
    const sgst = rGst / 2;

    const rBalance = Math.max(0, rGrand - rPaid);

    return [
      `${index + 1}.`,
      roomBooking.previousRoomNumber
        ? `R-${String(roomBooking.previousRoomNumber).replace(/^[rR][- ]?/, '').replace(/→/g, '->')} -> ${String(roomBooking.Room?.roomNumber || 'N/A').replace(/^[rR][- ]?/, '')}`
        : `R-${String(roomBooking.Room?.roomNumber || 'N/A').replace(/^[rR][- ]?/, '')}`,
      new Date(roomBooking.checkInDate).toLocaleDateString('en-GB'),
      rBase.toFixed(2),
      rDiscount.toFixed(2),
      rSub.toFixed(2),
      cgst.toFixed(3),
      sgst.toFixed(3),
      rGrand.toFixed(2),
      rPaid.toFixed(2),
      rBalance.toFixed(2)
    ];
  });

  // Fix overall rounding drift (e.g. 14800.01 -> 14800.00)
  const grandInt = Math.round(totalGrandTotal);
  if (Math.abs(totalGrandTotal - grandInt) < 0.03 && totalGrandTotal !== grandInt) {
    const diff = grandInt - totalGrandTotal;
    totalGrandTotal = grandInt;
    if (tableBody.length > 0) {
      const lastRow = tableBody[tableBody.length - 1];
      const currentVal = parseFloat(lastRow[lastRow.length - 3]); // Total column index
      if (!isNaN(currentVal)) {
        lastRow[lastRow.length - 3] = (currentVal + diff).toFixed(2);
      }
    }
  }

  try {
    if (bill.paymentHistory) {
      historyList = typeof bill.paymentHistory === 'string' ? JSON.parse(bill.paymentHistory) : bill.paymentHistory;
    }
  } catch (e) {
    console.error("Failed to parse payment history in template_1", e);
  }
  let remainingPaidExtras = historyList.reduce((sum, h) => {
    return (h.paidFor === 'Food' || h.paidFor === 'Extras') ? sum + parseFloat(h.amount || 0) : sum;
  }, 0);

  if (bill.extraChargesList && bill.extraChargesList.length > 0) {
    bill.extraChargesList.forEach((charge, idx) => {
      const cSub = parseFloat(charge.subtotal || 0);
      const cGst = parseFloat(charge.gstAmount || 0);
      const cGrand = parseFloat(charge.grandTotal || 0);

      let allocatedPaid = 0;
      if (remainingPaidExtras >= cGrand) {
        allocatedPaid = cGrand;
        remainingPaidExtras -= cGrand;
      } else {
        allocatedPaid = remainingPaidExtras;
        remainingPaidExtras = 0;
      }

      totalBaseAmount += cSub;
      totalAmountPaid += allocatedPaid;
      totalSubTotal += cSub;
      totalGstAmount += cGst;
      totalGrandTotal += cGrand;

      const cgst = cGst / 2;
      const sgst = cGst / 2;
      const chargeDate = charge.createdAt ? new Date(charge.createdAt).toLocaleDateString('en-GB') : '';
      const cBalance = Math.max(0, cGrand - allocatedPaid);

      tableBody.push([
        `${roomsList.length + idx + 1}.`,
        `${charge.serviceName} (Qty: ${charge.qty})`,
        chargeDate,
        cSub.toFixed(2),
        '0.00',
        cSub.toFixed(2),
        cgst.toFixed(3),
        sgst.toFixed(3),
        cGrand.toFixed(2),
        allocatedPaid.toFixed(2),
        cBalance.toFixed(2)
      ]);
    });
  }

  if (rawEarlyAmt > 0) {
    totalBaseAmount += eSub;
    totalSubTotal += eSub;
    totalGstAmount += eGst;
    totalGrandTotal += eGrand;

    const cgst = eGst / 2;
    const sgst = eGst / 2;

    tableBody.push([
      `${tableBody.length + 1}.`,
      `Early Check-in Charge`,
      bill.checkInDate ? new Date(bill.checkInDate).toLocaleDateString('en-GB') : '',
      eSub.toFixed(2),
      '0.00',
      eSub.toFixed(2),
      cgst.toFixed(3),
      sgst.toFixed(3),
      eGrand.toFixed(2),
      '0.00',
      eGrand.toFixed(2)
    ]);
  }

  autoTable(doc, {
    startY: Math.max(95, endGuestY + 4),
    margin: { left: margin, right: margin },
    head: [[
      { content: 'S.No.', styles: { halign: 'left' } },
      { content: 'Particulars', styles: { halign: 'left' } },
      { content: 'Stay Date', styles: { halign: 'left' } },
      { content: 'Room Charges', styles: { halign: 'right' } },
      { content: 'Discount', styles: { halign: 'right' } },
      { content: 'Sub Total', styles: { halign: 'right' } },
      { content: `${(gstRate / 2).toFixed(1).replace(/\.0$/, '')}% CGST`, styles: { halign: 'right' } },
      { content: `${(gstRate / 2).toFixed(1).replace(/\.0$/, '')}% SGST`, styles: { halign: 'right' } },
      { content: 'Total', styles: { halign: 'right' } },
      { content: 'Amount Paid', styles: { halign: 'right' } },
      { content: 'Balance', styles: { halign: 'right' } }
    ]],
    body: tableBody,
    theme: 'plain',
    styles: { fontSize: 6.8, cellPadding: 2, font: fontName },
    headStyles: { fontStyle: 'bold', borderBottom: { lineWidth: 0.1, color: [200, 200, 200] } },
    columnStyles: {
      0: { cellWidth: 10, halign: 'left' },
      1: { cellWidth: 27, halign: 'left' },
      2: { cellWidth: 16, halign: 'left' },
      3: { cellWidth: 18, halign: 'right' },
      4: { cellWidth: 15, halign: 'right' },
      5: { cellWidth: 18, halign: 'right' },
      6: { cellWidth: 15, halign: 'right' },
      7: { cellWidth: 15, halign: 'right' },
      8: { cellWidth: 16, halign: 'right', fontStyle: 'bold' },
      9: { cellWidth: 16, halign: 'right' },
      10: { cellWidth: 14, halign: 'right', fontStyle: 'bold' }
    }
  });

  const tableBottomY = doc.lastAutoTable.finalY;
  doc.line(margin, tableBottomY, pageWidth - margin, tableBottomY);

  const totalBalance = Math.max(0, totalGrandTotal - totalAmountPaid);

  autoTable(doc, {
    startY: tableBottomY,
    margin: { left: margin, right: margin },
    body: [
      [
        '',
        '',
        '',
        totalBaseAmount.toFixed(2),
        totalDiscount.toFixed(2),
        totalSubTotal.toFixed(2),
        (totalGstAmount / 2).toFixed(3),
        (totalGstAmount / 2).toFixed(3),
        totalGrandTotal.toFixed(2),
        totalAmountPaid.toFixed(2),
        totalBalance.toFixed(2)
      ]
    ],
    theme: 'plain',
    styles: { fontSize: 6.8, cellPadding: 2, fontStyle: 'bold', font: fontName },
    columnStyles: {
      0: { cellWidth: 10, halign: 'left' },
      1: { cellWidth: 27, halign: 'left' },
      2: { cellWidth: 16, halign: 'left' },
      3: { cellWidth: 18, halign: 'right' },
      4: { cellWidth: 15, halign: 'right' },
      5: { cellWidth: 18, halign: 'right' },
      6: { cellWidth: 15, halign: 'right' },
      7: { cellWidth: 15, halign: 'right' },
      8: { cellWidth: 16, halign: 'right' },
      9: { cellWidth: 16, halign: 'right' },
      10: { cellWidth: 14, halign: 'right' }
    }
  });

  const totalsBottomY = doc.lastAutoTable.finalY;
  doc.line(margin, totalsBottomY, pageWidth - margin, totalsBottomY);

  doc.setFontSize(8);
  doc.setFont(fontName, "normal");
  doc.text(`TOTAL: Rupees ${numberToWords(Math.round(totalGrandTotal))} Only, and zero Paise Only`, margin, totalsBottomY + 5);
  doc.text("E&O.E", pageWidth - margin, totalsBottomY + 5, { align: 'right' });

  // Payment details
  const paymentY = totalsBottomY + 15;
  const remainingDue = totalGrandTotal - totalAmountPaid;
  doc.text(`Payment Status: ${totalAmountPaid >= totalGrandTotal - 0.1 ? 'PAID IN FULL' : 'PENDING BALANCE'}`, margin, paymentY);
  doc.setFont(fontName, "bold");
  doc.text(`Total Bill Amount (with GST): Rs. ${totalGrandTotal.toFixed(2)}`, margin, paymentY + 5);
  doc.text(`Total Payment Received: Rs. ${totalAmountPaid.toFixed(2)}`, margin, paymentY + 10);
  if (remainingDue > 0.1) {
    doc.setTextColor(200, 50, 50);
    doc.text(`Pending Due Balance: Rs. ${remainingDue.toFixed(2)}`, margin, paymentY + 15);
    doc.setTextColor(...darkGray);
  } else if (remainingDue < -0.1) {
    doc.setTextColor(50, 50, 200);
    doc.text(`Advance Overpaid Credit: Rs. ${Math.abs(remainingDue).toFixed(2)}`, margin, paymentY + 15);
    doc.setTextColor(...darkGray);
  } else {
    doc.setTextColor(50, 150, 50);
    doc.text(`Pending Due Balance: Rs. 0.00 (Completed)`, margin, paymentY + 15);
    doc.setTextColor(...darkGray);
  }
  // Render detailed payment transaction history (Date, Time, Payment Mode / Bank, Amount)
  let transactionLogs = [];
  let parsedHistory = [];
  try {
    if (bill.paymentHistory) {
      parsedHistory = typeof bill.paymentHistory === 'string' ? JSON.parse(bill.paymentHistory) : bill.paymentHistory;
    }
  } catch (e) {
    console.error("Failed to parse paymentHistory for transaction logs", e);
  }

  if (Array.isArray(parsedHistory) && parsedHistory.length > 0) {
    parsedHistory.forEach((item) => {
      const amt = Number(item.amount) || 0;
      if (amt <= 0) return;

      let dateStr = '';
      if (item.date) {
        dateStr = formatDateDMY(item.date);
      } else {
        dateStr = formatDateDMY(bill.checkInDate || bill.createdAt || new Date());
      }

      let timeStr = '';
      if (item.time) {
        timeStr = formatTime12hr(item.time);
      } else if (bill.checkInTime) {
        timeStr = formatTime12hr(bill.checkInTime);
      } else {
        timeStr = '12:00 PM';
      }

      const rawMode = (item.paymentMode || bill.paymentMode || 'Cash').trim().toUpperCase();
      const bank = item.paymentBank ? ` (${item.paymentBank.trim().toUpperCase()})` : '';

      transactionLogs.push({
        dateStr,
        timeStr,
        modeText: `${rawMode}${bank}`,
        amount: amt
      });
    });
  }

  if (transactionLogs.length === 0 && totalAmountPaid > 0) {
    const dateStr = formatDateDMY(bill.checkInDate || bill.createdAt || new Date());
    const timeStr = bill.checkInTime ? formatTime12hr(bill.checkInTime) : '12:00 PM';
    const rawMode = (bill.paymentMode || 'Cash').trim().toUpperCase();
    const bank = bill.paymentBank ? ` (${bill.paymentBank.trim().toUpperCase()})` : '';

    transactionLogs.push({
      dateStr,
      timeStr,
      modeText: `${rawMode}${bank}`,
      amount: totalAmountPaid
    });
  }

  doc.setFont(fontName, "normal");
  let breakdownY = paymentY + 22;
  if (transactionLogs.length > 0) {
    transactionLogs.forEach((item) => {
      doc.text(`- ${item.dateStr} ${item.timeStr} - ${item.modeText}: Rs. ${item.amount.toFixed(2)}`, margin + 2, breakdownY);
      breakdownY += 5;
    });
  }

  // Tax details
  const taxY = breakdownY + 3;
  doc.setFont(fontName, "normal");

  let currentTaxY = taxY;
  if (bill.guestGst) {
    doc.text(`Customer GST Number: ${bill.guestGst}`, margin, currentTaxY);
    currentTaxY += 5;
  }
  if (bill.companyName) {
    doc.text(`Company Name: ${bill.companyName}`, margin, currentTaxY);
    currentTaxY += 5;
  }
  if (bill.companyAddress) {
    doc.text(`Company Address: ${bill.companyAddress}`, margin, currentTaxY);
    currentTaxY += 5;
  }

  // Footer
  const footerOffset = (currentTaxY - taxY) + 10;
  doc.setFont(fontName, "bold");
  doc.text("* This is computer generated invoice signature and stamp not required", pageWidth / 2, taxY + footerOffset, { align: 'center' });
  doc.line(margin, taxY + footerOffset + 3, pageWidth - margin, taxY + footerOffset + 3);
};
