import autoTable from "jspdf-autotable";

// Helper to convert 24hr time to 12hr time format
const formatTime12hr = (timeStr) => {
  if (!timeStr) return '';
  if (timeStr.toUpperCase().includes('AM') || timeStr.toUpperCase().includes('PM')) {
    return timeStr;
  }
  try {
    const [hour, minute] = timeStr.split(':');
    const h = parseInt(hour, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHour = h % 12 || 12;
    return `${displayHour.toString().padStart(2, '0')}:${minute.substring(0, 2)} ${ampm}`;
  } catch (e) {
    return timeStr;
  }
};

const splitRupeesPaise = (amount) => {
  const rounded = Math.round(Number(amount || 0) * 100) / 100;
  const rupees = Math.floor(rounded);
  const paise = Math.round((rounded - rupees) * 100);
  if (paise >= 100) {
    return { rupees: rupees + 1, paise: 0 };
  }
  return { rupees, paise };
};

export const renderTemplate4 = (doc, bill, hotelData, numberToWords) => {
  const pageWidth = doc.internal.pageSize.getWidth();   // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
  const margin = 12;

  // Color palette matching the Mala Hotel screenshot
  const deepBlue = [26, 35, 126];    // #1a237e - Hotel name
  const redAccent = [211, 47, 47];    // #d32f2f - TAX INVOICE, table header, footer
  const darkText = [30, 30, 30];      // Body text
  const grayText = [100, 100, 100];
  const creamBg = [255, 248, 220];    // #FFF8DC - Page background
  const pinkRow = [255, 200, 200];    // Light pink for table header row
  const fontName = "helvetica";
  const hotelName = hotelData.name || "MALA HOTEL";

  let initials = "MH";
  const nameLower = hotelName.toLowerCase();
  if (nameLower.includes("mala")) {
    initials = "ML";
  } else {
    const words = hotelName.split(' ').filter(Boolean);
    if (words.length >= 2) {
      initials = (words[0][0] + words[words.length - 1][0]).toUpperCase();
    } else if (words.length === 1) {
      initials = words[0].substring(0, 2).toUpperCase();
    }
  }

  // ============================================================
  // 1. FULL PAGE CREAM BACKGROUND
  // ============================================================
  doc.setFillColor(...creamBg);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  // ============================================================
  // 2. VERTICAL WATERMARK PATTERN (Repeated Logo or initials in columns)
  // ============================================================
  if (hotelData.logoBase64) {
    try {
      const logoW = 10;
      const logoH = 10;
      const spacingX = 18; // 11 columns across 210mm page width
      const spacingY = 15; // Balanced vertical spacing for logo watermark

      if (typeof doc.GState === 'function') {
        const gState = new doc.GState({ opacity: 0.07 }); // Extremely soft opacity for background watermark
        doc.saveGraphicsState();
        doc.setGState(gState);
        for (let row = 0; row < 20; row++) {
          for (let col = 0; col < 11; col++) {
            const x = col * spacingX + 12;
            const y = row * spacingY + 10;
            if (x < pageWidth - 5 && y < pageHeight - 5) {
              doc.addImage(hotelData.logoBase64, 'PNG', x, y, logoW, logoH);
            }
          }
        }
        doc.restoreGraphicsState();
      } else {
        for (let row = 0; row < 20; row++) {
          for (let col = 0; col < 11; col++) {
            const x = col * spacingX + 12;
            const y = row * spacingY + 10;
            if (x < pageWidth - 5 && y < pageHeight - 5) {
              doc.addImage(hotelData.logoBase64, 'PNG', x, y, logoW, logoH);
            }
          }
        }
      }
    } catch (e) {
      console.error("Error drawing background logo watermark:", e);
      // Fallback: draw initials pattern
      doc.setFont(fontName, "bold");
      doc.setFontSize(12);
      doc.setTextColor(242, 232, 195);
      const wmText = initials;
      const spacingX = 18;
      const spacingY = 5.5;
      for (let row = 0; row < 60; row++) {
        for (let col = 0; col < 11; col++) {
          const x = col * spacingX + 12;
          const y = row * spacingY + 12;
          if (x < pageWidth + 5 && y < pageHeight + 5) {
            doc.text(wmText, x, y);
          }
        }
      }
    }
  } else {
    // Fallback: draw initials pattern
    doc.setFont(fontName, "bold");
    doc.setFontSize(12);
    doc.setTextColor(242, 232, 195);
    const wmText = initials;
    const spacingX = 18;
    const spacingY = 5.5;
    for (let row = 0; row < 60; row++) {
      for (let col = 0; col < 11; col++) {
        const x = col * spacingX + 12;
        const y = row * spacingY + 12;
        if (x < pageWidth + 5 && y < pageHeight + 5) {
          doc.text(wmText, x, y);
        }
      }
    }
  }

  // Reset text color
  doc.setTextColor(...darkText);

  // ============================================================
  // 3. BLESSING HEADER
  // ============================================================
  doc.setFont(fontName, "italic");
  doc.setFontSize(7);
  doc.setTextColor(...grayText);
  doc.text("Om Shree Kamakhya Namaha", pageWidth / 2, 12, { align: "center" });

  // ============================================================
  // 4. "TAX INVOICE" TITLE IN RED
  // ============================================================
  doc.setFont(fontName, "bold");
  doc.setFontSize(11);
  doc.setTextColor(...redAccent);
  doc.text("TAX INVOICE", pageWidth / 2, 18, { align: "center" });

  // ============================================================
  // 5. HOTEL MONOGRAM + NAME (Centered Group with Stylized Logo)
  // ============================================================
  const upperHotelName = hotelName.toUpperCase();

  // Calculate text width of hotel name to center the entire group (monogram + name)
  doc.setFont(fontName, "bold");
  doc.setFontSize(26);
  const nameWidth = doc.getTextWidth(upperHotelName);

  const textX = pageWidth / 2;
  const logoWidth = 16;
  const spacing = 4.5;
  const logoX = textX - (nameWidth / 2) - logoWidth - spacing;
  const monogramY = 20.2;

  // Draw circular emblem/logo image or initials fallback
  if (hotelData.logoBase64) {
    try {
      doc.addImage(hotelData.logoBase64, 'PNG', logoX, monogramY + 1.0, 16, 16);
    } catch (e) {
      console.error("Error rendering logo image on template 4:", e);
      // Fallback: Draw Stylized Monogram
      doc.setFont(fontName, "bold");
      doc.setFontSize(18);
      doc.setTextColor(26, 35, 126);
      doc.setDrawColor(26, 35, 126);
      doc.setLineWidth(0.35);
      doc.text(initials, logoX + 8, monogramY + 9.5, { align: "center", renderingMode: "fillThenStroke" });
      doc.setLineWidth(1.0);
      const centerX = logoX + 8;
      const centerY = monogramY + 13.0;
      doc.line(centerX - 9.5, centerY - 2.0, centerX, centerY);
      doc.line(centerX, centerY, centerX + 9.5, centerY - 2.0);
    }
  } else {
    // Draw Stylized Monogram (No box, larger bold letters with bottom chevron)
    doc.setFont(fontName, "bold");
    doc.setFontSize(18);
    doc.setTextColor(26, 35, 126); // Deep blue matching original logo
    doc.setDrawColor(26, 35, 126);
    doc.setLineWidth(0.35); // Outline thickness for extra boldness

    // Render initials extra bold
    doc.text(initials, logoX + 8, monogramY + 9.5, { align: "center", renderingMode: "fillThenStroke" });

    // Draw the bottom chevron shape (thicker and perfectly aligned)
    doc.setLineWidth(1.0); // Bolder chevron line
    const centerX = logoX + 8;
    const centerY = monogramY + 13.0;
    doc.line(centerX - 9.5, centerY - 2.0, centerX, centerY);
    doc.line(centerX, centerY, centerX + 9.5, centerY - 2.0);
  }

  // Hotel Name large (Centered)
  doc.setTextColor(...deepBlue);
  doc.setFontSize(26);
  doc.setFont(fontName, "bold");
  doc.setLineWidth(0.3);
  doc.text(upperHotelName, textX, 32.2, { align: "center", renderingMode: "fillThenStroke" });

  // ============================================================
  // 6. HOTEL ADDRESS, PHONE, GSTIN
  // ============================================================
  let infoY = 38.5;
  if (hotelData.since) {
    doc.setFont(fontName, "italic");
    doc.setFontSize(7);
    doc.setTextColor(...grayText);
    doc.text(`Estd. ${hotelData.since}`, pageWidth / 2, infoY, { align: "center" });
    infoY += 3.5;
  }

  doc.setFont(fontName, "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...darkText);

  if (hotelData.address) {
    doc.text(hotelData.address, pageWidth / 2, infoY, { align: "center" });
    infoY += 4;
  }

  const contactParts = [];
  if (hotelData.phone) contactParts.push(`Contact : ${hotelData.phone}`);
  if (hotelData.email) contactParts.push(hotelData.email);
  if (contactParts.length > 0) {
    doc.text(contactParts.join(' / '), pageWidth / 2, infoY, { align: "center" });
    infoY += 4;
  }

  if (hotelData.gstin) {
    doc.setFont(fontName, "bold");
    doc.text(`GSTIN: ${hotelData.gstin}`, pageWidth / 2, infoY, { align: "center" });
    infoY += 4;
  }

  // ============================================================
  // 7. INVOICE NO. & DATE (Right-aligned)
  // ============================================================
  doc.setFont(fontName, "bold");
  doc.setFontSize(9);
  doc.setTextColor(...darkText);

  const currentPrefix = hotelData.invoicePrefix || '';
  let invoiceNo = '';
  if (bill.invoiceNumber) {
    const rawNumber = currentPrefix ? bill.invoiceNumber.replace(currentPrefix, '') : bill.invoiceNumber;
    invoiceNo = `${currentPrefix}${rawNumber}`;
  } else {
    invoiceNo = bill.id ? `${currentPrefix}${String(bill.id).substring(0, 8).toUpperCase()}` : 'Auto';
  }

  // Invoice number with box — placed BELOW the header block
  const invLabelX = pageWidth - margin - 70;
  doc.text("INVOICE NO. :", invLabelX, infoY + 2);
  doc.setFont(fontName, "normal");
  // Draw a small box around the invoice number
  const invNumX = invLabelX + 28;
  doc.setDrawColor(...darkText);
  doc.setLineWidth(0.3);
  doc.rect(invNumX, infoY - 2, 40, 5.5);
  doc.setFontSize(8.5);
  doc.text(invoiceNo, invNumX + 2.5, infoY + 2);

  // Date (shifted down below invoice no.)
  doc.setFont(fontName, "bold");
  doc.setFontSize(9);
  doc.text("DATE :", invLabelX + 13.5, infoY + 8.5);
  doc.setFont(fontName, "normal");
  const dateStr = new Date().toLocaleDateString('en-GB');
  doc.text(dateStr, invLabelX + 28, infoY + 8.5);

  // ============================================================
  // 8. GUEST DETAILS SECTION (dotted underlines)
  // ============================================================
  let guestY = infoY + 16;
  doc.setFontSize(9);
  doc.setTextColor(...darkText);

  const drawFieldRow = (label, value, y, fullWidth = true) => {
    doc.setFont(fontName, "bold");
    doc.text(label, margin, y);
    doc.setFont(fontName, "normal");
    const labelW = doc.getTextWidth(label);
    const valueX = margin + labelW + 1;
    doc.text(value || "", valueX, y);

    // Dotted underline
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.2);
    doc.setLineDashPattern([0.5, 1], 0);
    const lineEnd = fullWidth ? (pageWidth - margin) : (pageWidth / 2 - 5);
    doc.line(valueX, y + 1, lineEnd, y + 1);
    doc.setLineDashPattern([], 0); // Reset dash
  };

  const drawDualFieldRow = (label1, value1, label2, value2, y) => {
    // Left field
    doc.setFont(fontName, "bold");
    doc.text(label1, margin, y);
    doc.setFont(fontName, "normal");
    const l1w = doc.getTextWidth(label1);
    doc.text(value1 || "", margin + l1w + 1, y);
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.2);
    doc.setLineDashPattern([0.5, 1], 0);
    doc.line(margin + l1w + 1, y + 1, pageWidth / 2 - 5, y + 1);
    doc.setLineDashPattern([], 0);

    // Right field
    doc.setFont(fontName, "bold");
    doc.text(label2, pageWidth / 2 + 10, y);
    doc.setFont(fontName, "normal");
    const l2w = doc.getTextWidth(label2);
    doc.text(value2 || "", pageWidth / 2 + 10 + l2w + 1, y);
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.2);
    doc.setLineDashPattern([0.5, 1], 0);
    doc.line(pageWidth / 2 + 10 + l2w + 1, y + 1, pageWidth - margin, y + 1);
    doc.setLineDashPattern([], 0);
  };

  const cleanRm = (val) => val ? String(val).replace(/^[rR][- ]?/, '') : '';

  const formatShiftChain = (prevRm, currRm) => {
    if (!prevRm) return cleanRm(currRm);
    const parts = String(prevRm)
      .split(/\s*(?:→|->|─>|&rarr;|[,\->→])\s*/)
      .map(s => cleanRm(s))
      .filter(Boolean);
    const target = cleanRm(currRm);
    if (target && (parts.length === 0 || parts[parts.length - 1] !== target)) {
      parts.push(target);
    }
    return parts.join(" -> ");
  };

  const drawShiftedRoomValue = (prevRm, currRm, startX, y) => {
    const parts = String(prevRm || '')
      .split(/\s*(?:→|->|─>|&rarr;|[,\->→])\s*/)
      .map(s => cleanRm(s))
      .filter(Boolean);

    const targetRm = cleanRm(currRm);
    if (targetRm && (parts.length === 0 || parts[parts.length - 1] !== targetRm)) {
      parts.push(targetRm);
    }

    let curX = startX;
    parts.forEach((rm, idx) => {
      const isLast = idx === parts.length - 1;
      doc.setFont(fontName, "bold");
      if (isLast) {
        doc.setTextColor(20, 30, 15);
      } else {
        doc.setTextColor(217, 119, 6);
      }
      doc.text(rm, curX, y);
      curX += doc.getTextWidth(rm);

      if (!isLast) {
        const arrowText = " -> ";
        doc.setFont(fontName, "bold");
        doc.setTextColor(217, 119, 6);
        doc.text(arrowText, curX, y);
        curX += doc.getTextWidth(arrowText);
      }
    });

    return curX - startX;
  };

  const primaryPrevRoom = bill.previousRoomNumber || (Array.isArray(bill.groupBookings) && bill.groupBookings.find(b => b.previousRoomNumber)?.previousRoomNumber);
  const shiftPrev = cleanRm(primaryPrevRoom);
  const shiftCurr = cleanRm(bill.Room?.roomNumber || bill.roomNumber || bill.groupBookings?.[0]?.Room?.roomNumber || bill.groupBookings?.[0]?.roomNumber || '101');
  const isShifted = Boolean(shiftPrev);

  drawFieldRow("GUEST NAME :", bill.guestName || "N/A", guestY);
  guestY += 7;
  drawFieldRow("ADDRESS :", bill.address || "", guestY);
  guestY += 7;

  if (isShifted) {
    const label1 = "CONTACT NO. :";
    const label2 = "ROOM NO. :";

    doc.setFont(fontName, "bold");
    doc.setTextColor(...darkText);
    doc.text(label1, margin, guestY);
    doc.setFont(fontName, "normal");
    const l1w = doc.getTextWidth(label1);
    doc.text(bill.phone || "", margin + l1w + 1, guestY);
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.2);
    doc.setLineDashPattern([0.5, 1], 0);
    doc.line(margin + l1w + 1, guestY + 1, pageWidth / 2 - 5, guestY + 1);

    doc.setFont(fontName, "bold");
    doc.text(label2, pageWidth / 2 + 10, guestY);
    doc.setFont(fontName, "normal");
    const l2w = doc.getTextWidth(label2);
    const roomStartX = pageWidth / 2 + 10 + l2w + 1;

    let drawnWidth = 0;
    if (Array.isArray(bill.groupBookings) && bill.groupBookings.length > 1) {
      let curX = roomStartX;
      bill.groupBookings.forEach((b, i) => {
        const pRm = cleanRm(b.previousRoomNumber);
        const cRm = cleanRm(b.Room?.roomNumber || b.roomNumber || b.roomId || '101');
        if (pRm) {
          const w = drawShiftedRoomValue(pRm, cRm, curX, guestY);
          curX += w;
        } else {
          doc.setFont(fontName, "bold");
          doc.setTextColor(20, 30, 15);
          doc.text(cRm, curX, guestY);
          curX += doc.getTextWidth(cRm);
        }
        if (i < bill.groupBookings.length - 1) {
          doc.setFont(fontName, "bold");
          doc.setTextColor(20, 30, 15);
          doc.text(", ", curX, guestY);
          curX += doc.getTextWidth(", ");
        }
      });
      drawnWidth = curX - roomStartX;
    } else {
      drawnWidth = drawShiftedRoomValue(shiftPrev, shiftCurr, roomStartX, guestY);
    }

    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.2);
    doc.setLineDashPattern([0.5, 1], 0);
    doc.line(roomStartX + drawnWidth + 1, guestY + 1, pageWidth - margin, guestY + 1);
    doc.setLineDashPattern([], 0);
  } else {
    let roomNoStr = '';
    if (Array.isArray(bill.groupBookings) && bill.groupBookings.length > 0) {
      roomNoStr = bill.groupBookings.map(b => cleanRm(b.Room?.roomNumber || b.roomNumber || b.roomId)).join(', ');
    } else {
      roomNoStr = shiftCurr;
    }
    drawDualFieldRow("CONTACT NO. :", bill.phone || "", "ROOM NO. :", roomNoStr, guestY);
  }

  guestY += 7;
  drawFieldRow("GSTIN :", bill.guestGst || "", guestY);
  guestY += 5;

  // ============================================================
  // 9. PARTICULARS TABLE (MANUALLY DRAWN FOR ACCURATE LOOK)
  // ============================================================
  const tableStartY = guestY + 2;
  const tableHeight = 85; // Fixed height like the original screenshot

  // Calculation values
  const baseBookings = Array.isArray(bill.groupBookings) && bill.groupBookings.length > 0
    ? bill.groupBookings
    : [bill];
  const extraChargesList = (bill.extraChargesList || []).map(charge => ({
    ...charge,
    isExtraCharge: true
  }));
  const roomsList = [...baseBookings, ...extraChargesList];

  const gstRate = parseFloat(bill.gstRate !== undefined ? bill.gstRate : 5);
  let grossBaseAmount = 0;
  let totalBaseAmount = 0;
  let totalDiscount = 0;
  let totalCgstAmount = 0;
  let totalSgstAmount = 0;

  const gstOption = bill.gstOption || 'exclusive';
  const rawEarlyAmt = parseFloat(bill.earlyCheckInCharge || 0);

  let eSub = rawEarlyAmt;
  let eGst = 0;
  let earlyDeductionForBase = rawEarlyAmt;

  if (rawEarlyAmt > 0) {
    if (gstOption === 'inclusive') {
      eSub = Math.round((rawEarlyAmt / (1 + gstRate / 100)) * 100) / 100;
      eGst = Math.round((rawEarlyAmt - eSub) * 100) / 100;
      earlyDeductionForBase = eSub;
    } else if (gstOption === 'none') {
      eSub = rawEarlyAmt;
      eGst = 0;
      earlyDeductionForBase = rawEarlyAmt;
    } else {
      // exclusive
      eSub = rawEarlyAmt;
      eGst = Math.round(eSub * (gstRate / 100) * 100) / 100;
      earlyDeductionForBase = rawEarlyAmt;
    }
  }

  roomsList.forEach((rb, idx) => {
    if (rb.isExtraCharge) {
      const extraSub = parseFloat(rb.subtotal || 0);
      grossBaseAmount += extraSub;
      totalBaseAmount += extraSub;
      totalCgstAmount += parseFloat(rb.gstAmount || 0) / 2;
      totalSgstAmount += parseFloat(rb.gstAmount || 0) / 2;
    } else {
      // Subtract early check-in charge base from primary room to avoid double-counting
      const earlyDeduction = (idx === 0 && rawEarlyAmt > 0) ? earlyDeductionForBase : 0;
      const rbAmount = parseFloat(rb.totalAmount || 0) - earlyDeduction;
      const rbDisc = parseFloat(rb.discount || 0);
      totalDiscount += rbDisc;

      let rGross = rbAmount;
      if (gstOption === 'inclusive' && gstRate > 0) {
        rGross = Math.round((rbAmount / (1 + gstRate / 100)) * 100) / 100;
      }
      grossBaseAmount += rGross;

      let rGrand = Math.max(0, rbAmount - rbDisc);
      let rBase = rGrand;
      let rGst = 0;

      if (gstOption === 'exclusive') {
        rBase = rGrand;
        rGst = gstRate > 0 ? Math.round(rBase * (gstRate / 100) * 100) / 100 : 0;
      } else if (gstOption === 'inclusive' && gstRate > 0) {
        rBase = Math.round((rGrand / (1 + gstRate / 100)) * 100) / 100;
        rGst = Math.round((rGrand - rBase) * 100) / 100;
      } else {
        rBase = rGrand;
        rGst = 0;
      }

      totalBaseAmount += rBase;
      totalCgstAmount += rGst / 2;
      totalSgstAmount += rGst / 2;
    }
  });

  // Add early check-in charge to totals
  if (rawEarlyAmt > 0) {
    grossBaseAmount += eSub;
    totalBaseAmount += eSub;
    totalCgstAmount += eGst / 2;
    totalSgstAmount += eGst / 2;
  }

  const subTotal = totalBaseAmount;
  const cgstRate = gstRate / 2;
  const sgstRate = gstRate / 2;
  const cgstAmount = totalCgstAmount;
  const sgstAmount = totalSgstAmount;
  const grandTotal = subTotal + cgstAmount + sgstAmount;

  let effectiveHeaderCheckoutDate = bill.checkOutDate;
  let effectiveHeaderCheckoutTime = bill.checkOutTime;
  if (Array.isArray(bill.groupBookings) && bill.groupBookings.length > 0) {
    const activeGbs = bill.groupBookings.filter(b => b.status !== 'Completed');
    if (activeGbs.length > 0) {
      const maxGb = activeGbs.reduce((max, b) => {
        const bOut = b.checkOutDate ? b.checkOutDate.split('T')[0] : '';
        const maxOut = max.checkOutDate ? max.checkOutDate.split('T')[0] : '';
        return bOut > maxOut ? b : max;
      }, activeGbs[0]);
      effectiveHeaderCheckoutDate = maxGb.checkOutDate || bill.checkOutDate;
      effectiveHeaderCheckoutTime = maxGb.checkOutTime || bill.checkOutTime;
    }
  }

  const checkinDate = bill.checkInDate ? new Date(bill.checkInDate.split('T')[0]).toLocaleDateString('en-GB') : "N/A";
  const checkoutDate = effectiveHeaderCheckoutDate ? new Date(effectiveHeaderCheckoutDate.split('T')[0]).toLocaleDateString('en-GB') : "N/A";
  const checkinTime = bill.checkInTime ? formatTime12hr(bill.checkInTime).toUpperCase() : "12:00 PM";
  const checkoutTime = effectiveHeaderCheckoutTime ? formatTime12hr(effectiveHeaderCheckoutTime).toUpperCase() : (hotelData.checkoutTime ? formatTime12hr(hotelData.checkoutTime).toUpperCase() : "11:00 AM");

  // Calculate nights
  let nights = 1;
  if (bill.checkInDate && effectiveHeaderCheckoutDate) {
    const d1 = new Date(bill.checkInDate.split('T')[0]);
    const d2 = new Date(effectiveHeaderCheckoutDate.split('T')[0]);
    nights = Math.max(1, Math.ceil(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24)));
  }
  const isEarlyFullDay = !!(bill.chargePreviousDay && (bill.earlyCheckInType === 'full_day' || !bill.earlyCheckInCharge || Number(bill.earlyCheckInCharge) === 0));
  if (isEarlyFullDay) {
    nights += 1;
  }

  // Draw solid red header background
  doc.setFillColor(...redAccent);
  doc.rect(margin, tableStartY, pageWidth - 2 * margin, 7, 'F');

  // Draw header texts in white
  doc.setFont(fontName, "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text("Sl. No.", margin + 6, tableStartY + 4.8, { align: "center" });
  doc.text("PARTICULARS", margin + 12 + 62, tableStartY + 4.8, { align: "center" });
  doc.text("Rs.", margin + 136 + 16, tableStartY + 4.8, { align: "center" });
  doc.text("P.", margin + 168 + 9, tableStartY + 4.8, { align: "center" });

  // Draw table grid in red Accent
  doc.setDrawColor(...redAccent);
  doc.setLineWidth(0.45);

  // Outer rectangle
  doc.rect(margin, tableStartY, pageWidth - 2 * margin, tableHeight);

  // Vertical column dividers running through the entire table height
  doc.line(margin + 12, tableStartY, margin + 12, tableStartY + tableHeight);
  doc.line(margin + 136, tableStartY, margin + 136, tableStartY + tableHeight);
  doc.line(margin + 168, tableStartY, margin + 168, tableStartY + tableHeight);

  // Draw Particulars section fields
  doc.setFont(fontName, "bold");
  doc.setFontSize(8);
  doc.setTextColor(...redAccent);

  // Row 1: Arrival Time & Date
  doc.text("Arrival Time", margin + 15, tableStartY + 13);
  doc.line(margin + 34, tableStartY + 13.5, margin + 68, tableStartY + 13.5);
  doc.text("Date", margin + 71, tableStartY + 13);
  doc.line(margin + 79, tableStartY + 13.5, margin + 115, tableStartY + 13.5);

  doc.setFont(fontName, "bold");
  doc.setTextColor(...darkText);
  doc.text(checkinTime, margin + 35, tableStartY + 13);
  doc.text(checkinDate, margin + 80, tableStartY + 13);

  // Row 2: Departure Time & Date
  doc.setFont(fontName, "bold");
  doc.setTextColor(...redAccent);
  doc.text("Departure Time", margin + 15, tableStartY + 19);
  doc.line(margin + 39, tableStartY + 19.5, margin + 68, tableStartY + 19.5);
  doc.text("Date", margin + 71, tableStartY + 19);
  doc.line(margin + 79, tableStartY + 19.5, margin + 115, tableStartY + 19.5);

  doc.setFont(fontName, "bold");
  doc.setTextColor(...darkText);
  doc.text(checkoutTime, margin + 40, tableStartY + 19);
  doc.text(checkoutDate, margin + 80, tableStartY + 19);

  // Row 3: Nights
  doc.setFont(fontName, "bold");
  doc.setTextColor(...redAccent);
  doc.text("Nights", margin + 15, tableStartY + 25);
  doc.line(margin + 25, tableStartY + 25.5, margin + 115, tableStartY + 25.5);

  doc.setFont(fontName, "bold");
  doc.setTextColor(...darkText);
  doc.text(nights.toString(), margin + 27, tableStartY + 25);

  // Row 4: Description / SAC Header
  doc.setFont(fontName, "bold");
  doc.setTextColor(...redAccent);
  doc.text("Description", margin + 15, tableStartY + 33);
  doc.line(margin + 15, tableStartY + 34, margin + 32, tableStartY + 34); // Underline Description
  doc.text("SAC", margin + 98, tableStartY + 33);
  doc.line(margin + 98, tableStartY + 34, margin + 105, tableStartY + 34); // Underline SAC

  // Row 5: Lodging Service without Food / 9963
  doc.setFont(fontName, "normal");
  doc.setTextColor(...darkText);
  doc.text("Lodging Service without Food", margin + 15, tableStartY + 39);
  doc.text("9963", margin + 98, tableStartY + 39);

  // Draw Giant Monogram watermark or Logo in the bottom-left corner of the page
  if (hotelData.logoBase64) {
    try {
      if (typeof doc.GState === 'function') {
        const gState = new doc.GState({ opacity: 0.15 });
        doc.saveGraphicsState();
        doc.setGState(gState);
        doc.addImage(hotelData.logoBase64, 'PNG', margin, pageHeight - 45, 25, 25);
        doc.restoreGraphicsState();
      } else {
        doc.addImage(hotelData.logoBase64, 'PNG', margin, pageHeight - 45, 25, 25);
      }
    } catch (e) {
      console.error("Error drawing bottom watermark logo:", e);
      // Fallback: draw initials if logo rendering fails
      doc.setFont(fontName, "bold");
      doc.setFontSize(85);
      doc.setTextColor(255, 235, 175);
      doc.text(initials, margin, pageHeight - 30, { angle: 0, align: "left" });
    }
  } else {
    doc.setFont(fontName, "bold");
    doc.setFontSize(85);
    doc.setTextColor(255, 235, 175); // Very soft faint watermark color
    doc.text(initials, margin, pageHeight - 30, { angle: 0, align: "left" });
  }

  // Row 6+: Room billing items & extra services
  let itemY = tableStartY + 47;
  roomsList.forEach((rb, idx) => {
    let description = '';
    let rSub = 0;

    if (rb.isExtraCharge) {
      description = `${rb.serviceName} (Qty: ${rb.qty})`;
      rSub = parseFloat(rb.subtotal || 0);
    } else {
      // Subtract early check-in charge base from primary room to avoid double-counting
      const earlyDeduction = (idx === 0 && rawEarlyAmt > 0) ? earlyDeductionForBase : 0;
      const rBaseRaw = parseFloat(rb.totalAmount || 0) - earlyDeduction;
      let rGross = rBaseRaw;
      if (gstOption === 'inclusive' && gstRate > 0) {
        rGross = Math.round((rBaseRaw / (1 + gstRate / 100)) * 100) / 100;
      }
      rSub = rGross;
      let roomNights = nights;
      let isSameDayStay = false;
      if (rb.checkInDate && rb.checkOutDate) {
        const d1Str = String(rb.checkInDate).split('T')[0];
        const d2Str = String(rb.checkOutDate).split('T')[0];
        if (d1Str === d2Str) {
          isSameDayStay = true;
          roomNights = 1;
        } else {
          const d1 = new Date(d1Str);
          const d2 = new Date(d2Str);
          const nDiff = Math.max(1, Math.ceil(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24)));
          if (!isNaN(nDiff)) {
            roomNights = nDiff;
          }
        }
      }
      const curRmNum = cleanRm(rb.Room?.roomNumber || rb.roomNumber || '101');
      const roomNum = rb.previousRoomNumber ? formatShiftChain(rb.previousRoomNumber, curRmNum) : curRmNum;

      let catalogRate = Number(rb.Room?.pricePerNight || rb.pricePerNight || bill.Room?.pricePerNight || bill.pricePerNight || 0);
      if (gstOption === 'exclusive' && gstRate > 0 && catalogRate > 0 && Math.abs((catalogRate / (1 + gstRate / 100)) - Math.round(catalogRate / (1 + gstRate / 100))) < 0.05) {
        catalogRate = Math.round(catalogRate / (1 + gstRate / 100));
      }
      if (catalogRate === 0) {
        const possibleRates = [1000, 1200, 1500, 2000, 2500, 3000, 500, 800];
        const found = possibleRates.find(pr => rSub > (roomNights * pr) - 0.5 && (rSub % pr === 0 || Math.abs((rSub / pr) - Math.round(rSub / pr)) < 0.05));
        if (found) catalogRate = found;
      }
      let stayLabel = isSameDayStay ? `1 Day(s)` : `${roomNights} Night(s)`;
      let effectiveRate = roomNights > 0 ? Math.round((rSub / roomNights) * 100) / 100 : rSub;

      if (!isSameDayStay && catalogRate > 0 && rSub > (roomNights * catalogRate) - 0.5) {
        const totalDays = Math.round(rSub / catalogRate);
        const extraDays = totalDays - roomNights;
        if (extraDays > 0) {
          stayLabel = `${roomNights} Night(s) + ${extraDays} ${extraDays === 1 ? 'Day' : 'Days'}`;
          effectiveRate = Math.round((rSub / totalDays) * 100) / 100;
        }
      }

      const formattedRate = effectiveRate % 1 === 0
        ? effectiveRate.toLocaleString('en-IN')
        : effectiveRate.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      description = `Room ${roomNum} - ${stayLabel} @ Rs. ${formattedRate}/night`;
    }

    const { rupees, paise } = splitRupeesPaise(rSub);

    doc.setFont(fontName, "bold");
    doc.setTextColor(...darkText);
    doc.setFontSize(8.5);

    // Sl No.
    doc.text((idx + 1).toString(), margin + 6, itemY, { align: "center" });
    // Particulars
    if (!rb.isExtraCharge && rb.previousRoomNumber) {
      const curRmNum = cleanRm(rb.Room?.roomNumber || rb.roomNumber || '101');
      doc.setFont(fontName, "bold");
      doc.setTextColor(...darkText);
      doc.text("Room ", margin + 15, itemY);
      let curX = margin + 15 + doc.getTextWidth("Room ");
      const drawnW = drawShiftedRoomValue(cleanRm(rb.previousRoomNumber), curRmNum, curX, itemY);
      curX += drawnW;
      doc.setFont(fontName, "bold");
      doc.setTextColor(...darkText);
      let roomNights = nights;
      let isSameDayStay = false;
      if (rb.checkInDate && rb.checkOutDate) {
        const d1Str = String(rb.checkInDate).split('T')[0];
        const d2Str = String(rb.checkOutDate).split('T')[0];
        if (d1Str === d2Str) {
          isSameDayStay = true;
          roomNights = 1;
        } else {
          const d1 = new Date(d1Str);
          const d2 = new Date(d2Str);
          const nDiff = Math.max(1, Math.ceil(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24)));
          if (!isNaN(nDiff)) {
            roomNights = nDiff;
          }
        }
      }
      let catalogRate = Number(rb.Room?.pricePerNight || rb.pricePerNight || bill.Room?.pricePerNight || bill.pricePerNight || 0);
      if (gstOption === 'exclusive' && gstRate > 0 && catalogRate > 0 && Math.abs((catalogRate / (1 + gstRate / 100)) - Math.round(catalogRate / (1 + gstRate / 100))) < 0.05) {
        catalogRate = Math.round(catalogRate / (1 + gstRate / 100));
      }
      if (catalogRate === 0) {
        const possibleRates = [1000, 1200, 1500, 2000, 2500, 3000, 500, 800];
        const found = possibleRates.find(pr => rSub > (roomNights * pr) - 0.5 && (rSub % pr === 0 || Math.abs((rSub / pr) - Math.round(rSub / pr)) < 0.05));
        if (found) catalogRate = found;
      }
      let stayLabel = isSameDayStay ? `1 Day(s)` : `${roomNights} Night(s)`;
      let effectiveRate = roomNights > 0 ? Math.round((rSub / roomNights) * 100) / 100 : rSub;

      if (!isSameDayStay && catalogRate > 0 && rSub > (roomNights * catalogRate) - 0.5) {
        const totalDays = Math.round(rSub / catalogRate);
        const extraDays = totalDays - roomNights;
        if (extraDays > 0) {
          stayLabel = `${roomNights} Night(s) + ${extraDays} ${extraDays === 1 ? 'Day' : 'Days'}`;
          effectiveRate = Math.round((rSub / totalDays) * 100) / 100;
        }
      }

      const formattedRate = effectiveRate % 1 === 0
        ? effectiveRate.toLocaleString('en-IN')
        : effectiveRate.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      doc.text(` - ${stayLabel} @ Rs. ${formattedRate}/night`, curX, itemY);
    } else {
      doc.text(description, margin + 15, itemY);
    }
    // Rs and P
    doc.text(rupees.toString(), margin + 166, itemY, { align: "right" });
    doc.text(paise.toString().padStart(2, '0'), pageWidth - margin - 2, itemY, { align: "right" });

    itemY += 5.5;
  });

  // Early Check-in Charge as separate row
  if (rawEarlyAmt > 0) {
    const { rupees, paise } = splitRupeesPaise(eSub);

    doc.setFont(fontName, "bold");
    doc.setTextColor(...darkText);
    doc.setFontSize(8.5);

    doc.text((roomsList.length + 1).toString(), margin + 6, itemY, { align: "center" });
    doc.text('Early Check-in Charge', margin + 15, itemY);
    doc.text(rupees.toString(), margin + 166, itemY, { align: "right" });
    doc.text(paise.toString().padStart(2, '0'), pageWidth - margin - 2, itemY, { align: "right" });

    itemY += 5.5;
  }

  // Calculate paid & pending values
  const totalPaid = baseBookings.reduce((sum, rb) => sum + parseFloat(rb.amountPaid || 0), 0);
  const pendingDue = grandTotal - totalPaid;

  // Draw the totals box at the bottom right
  const totalsBoxLeft = margin + 112;
  const hasDiscount = totalDiscount > 0;
  const rowCount = hasDiscount ? 5 : 4;
  const rowHeight = 5.5;
  const totalsBoxHeight = rowCount * rowHeight;
  const totalsBoxStartY = tableStartY + tableHeight - totalsBoxHeight;

  // Horizontal border lines for the totals box
  doc.setDrawColor(...redAccent);
  doc.setLineWidth(0.45);
  doc.line(totalsBoxLeft, totalsBoxStartY, pageWidth - margin, totalsBoxStartY);
  for (let i = 1; i <= rowCount; i++) {
    doc.line(totalsBoxLeft, totalsBoxStartY + (i * rowHeight), pageWidth - margin, totalsBoxStartY + (i * rowHeight));
  }
  // Left border of totals box
  doc.line(totalsBoxLeft, totalsBoxStartY, totalsBoxLeft, tableStartY + tableHeight);

  // Fill in the totals data
  const grossRP = splitRupeesPaise(grossBaseAmount);
  const discRP = splitRupeesPaise(totalDiscount);
  const subTotalRP = splitRupeesPaise(subTotal);
  const cgstRP = splitRupeesPaise(cgstAmount);
  const sgstRP = splitRupeesPaise(sgstAmount);
  const grandRP = splitRupeesPaise(grandTotal);

  doc.setFont(fontName, "bold");
  doc.setFontSize(8);

  let tRowY = totalsBoxStartY + 4.2;

  if (hasDiscount) {
    // 1. Total Amount Row (Gross before discount)
    doc.setTextColor(...redAccent);
    doc.text("Total Amount", totalsBoxLeft + 2, tRowY);
    doc.setTextColor(...darkText);
    doc.text(grossRP.rupees.toString(), margin + 166, tRowY, { align: "right" });
    doc.text(grossRP.paise.toString().padStart(2, '0'), pageWidth - margin - 2, tRowY, { align: "right" });

    // 2. Discount Row
    tRowY += rowHeight;
    doc.setTextColor(...redAccent);
    const discLabel = bill.discountReason ? `Discount (${bill.discountReason})` : "Discount";
    doc.text(discLabel, totalsBoxLeft + 2, tRowY);
    doc.setTextColor(...darkText);
    doc.text(discRP.rupees.toString(), margin + 166, tRowY, { align: "right" });
    doc.text(discRP.paise.toString().padStart(2, '0'), pageWidth - margin - 2, tRowY, { align: "right" });
  } else {
    // Total Amount Row (no discount)
    doc.setTextColor(...redAccent);
    doc.text("Total Amount", totalsBoxLeft + 2, tRowY);
    doc.setTextColor(...darkText);
    doc.text(subTotalRP.rupees.toString(), margin + 166, tRowY, { align: "right" });
    doc.text(subTotalRP.paise.toString().padStart(2, '0'), pageWidth - margin - 2, tRowY, { align: "right" });
  }

  // CGST Row
  tRowY += rowHeight;
  doc.setTextColor(...redAccent);
  doc.text(`CGST......${cgstRate.toFixed(1)}%`, totalsBoxLeft + 2, tRowY);
  doc.setTextColor(...darkText);
  doc.text(cgstRP.rupees.toString(), margin + 166, tRowY, { align: "right" });
  doc.text(cgstRP.paise.toString().padStart(2, '0'), pageWidth - margin - 2, tRowY, { align: "right" });

  // SGST Row
  tRowY += rowHeight;
  doc.setTextColor(...redAccent);
  doc.text(`SGST......${sgstRate.toFixed(1)}%`, totalsBoxLeft + 2, tRowY);
  doc.setTextColor(...darkText);
  doc.text(sgstRP.rupees.toString(), margin + 166, tRowY, { align: "right" });
  doc.text(sgstRP.paise.toString().padStart(2, '0'), pageWidth - margin - 2, tRowY, { align: "right" });

  // GRAND TOTAL Row
  tRowY += rowHeight;
  doc.setTextColor(...redAccent);
  doc.text("GRAND TOTAL", totalsBoxLeft + 2, tRowY);
  doc.setTextColor(...darkText);
  doc.text(grandRP.rupees.toString(), margin + 166, tRowY, { align: "right" });
  doc.text(grandRP.paise.toString().padStart(2, '0'), pageWidth - margin - 2, tRowY, { align: "right" });

  // ============================================================
  // 10. RUPEES IN WORDS + E. & O. E. (Bottom of Table)
  // ============================================================
  const wordsY = tableStartY + tableHeight + 6;
  doc.setFont(fontName, "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...redAccent);
  doc.text("Rupees in Words", margin, wordsY);

  // Red underline for Rupees in Words
  doc.setDrawColor(...redAccent);
  doc.setLineWidth(0.45);
  doc.line(margin + 26, wordsY + 0.5, margin + 110, wordsY + 0.5);

  // Words value
  doc.setFont(fontName, "bold");
  doc.setTextColor(...darkText);
  const amtWords = numberToWords(Math.round(grandTotal));
  doc.text(amtWords || "Zero", margin + 27, wordsY);

  // E. & O. E.
  doc.setFont(fontName, "bold");
  doc.setTextColor(...redAccent);
  doc.text("E. & O. E.", pageWidth - margin, wordsY, { align: "right" });

  // ============================================================
  // 11. CHECKOUT TIME NOTICE (Bold Red)
  // ============================================================
  const footerY = tableStartY + tableHeight + 17;
  doc.setFont(fontName, "bold");
  doc.setFontSize(11);
  doc.setTextColor(...redAccent);
  const formattedFooterCheckoutTime = hotelData.checkoutTime ? formatTime12hr(hotelData.checkoutTime).toUpperCase() : '11:00 AM';
  doc.text(`CHECK OUT TIME ${formattedFooterCheckoutTime}`, margin, footerY);

  // ============================================================
  // 12. MANAGER SIGNATURE
  // ============================================================
  doc.setFont(fontName, "bold");
  doc.setFontSize(9);
  doc.setTextColor(...redAccent);
  doc.text("Manager Signature", pageWidth - margin, footerY, { align: "right" });

  // Red Signature line
  doc.setDrawColor(...redAccent);
  doc.setLineWidth(0.45);
  doc.line(pageWidth - margin - 40, footerY - 5, pageWidth - margin, footerY - 5);

  // ============================================================
  // 13. "THANKS FOR STAYING WITH US" FOOTER
  // ============================================================
  const thanksY = footerY + 13;
  const thanksText = "THANKS FOR STAYING WITH US";

  doc.setFont(fontName, "bold");
  doc.setFontSize(10);
  doc.setTextColor(26, 35, 126); // Deep blue matching original logo/name
  doc.text(thanksText, pageWidth / 2, thanksY, { align: "center" });

  // Helper to draw Namaste (folded hands) icon in red using the exact uploaded image
  const drawFoldedHands = (x, y) => {
    if (hotelData.namasteBase64) {
      try {
        doc.addImage(hotelData.namasteBase64, 'PNG', x - 3.5, y - 4, 7, 7);
      } catch (e) {
        console.error("Error drawing namaste icon:", e);
      }
    }
  };

  const thanksWidth = doc.getTextWidth(thanksText);
  const leftHandsX = (pageWidth / 2) - (thanksWidth / 2) - 8;
  const rightHandsX = (pageWidth / 2) + (thanksWidth / 2) + 8;

  // Draw folded hands on both sides of the text
  drawFoldedHands(leftHandsX, thanksY - 1);
  drawFoldedHands(rightHandsX, thanksY - 1);

  // ============================================================
  // 14. OUTER BORDER (thin decorative)
  // ============================================================
  doc.setDrawColor(200, 190, 160);
  doc.setLineWidth(0.5);
  doc.rect(5, 5, pageWidth - 10, pageHeight - 10);
};
