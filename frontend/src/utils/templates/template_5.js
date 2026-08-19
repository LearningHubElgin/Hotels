import autoTable from "jspdf-autotable";
import { formatTime12hr } from "../roomHelper";

export const renderTemplate5 = (doc, bill, hotelData, numberToWords) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;

  const fontName = "courier";
  const primaryColor = [13, 71, 161]; // Homelyraj Blue (#0D47A1)
  const darkText = [17, 17, 17];
  const grayText = [100, 100, 100];

  const hotelName = hotelData.name || "HOMELYRAJ";
  const hotelAddress = hotelData.address || "";
  const hotelEmail = hotelData.email || "";
  const hotelPhone = hotelData.phone || "";
  const hotelGstin = hotelData.gstin || "";

  // Get initials for monogram (e.g. "Homelyraj" -> "HR")
  const initials = hotelName
    .split(' ')
    .filter(Boolean)
    .map(word => word[0])
    .join('')
    .substring(0, 2)
    .toUpperCase() || "HR";

  // ============================================================
  // 1. BRANDING HEADER (Centered with custom double circle emblem)
  // ============================================================
  
  // Calculate text width of hotel name to center the entire group (emblem + name)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(23);
  const nameWidth = doc.getTextWidth(hotelName.toUpperCase());
  
  // Combined group width: 14 (circle logo) + 4 (spacing) + nameWidth
  const totalGroupWidth = 14 + 4 + nameWidth;
  const startX = (pageWidth - totalGroupWidth) / 2;
  const logoCenterY = 22;

  // Draw circular emblem with logo image or initials fallback
  if (hotelData.logoBase64) {
    try {
      doc.addImage(hotelData.logoBase64, 'PNG', startX, logoCenterY - 7, 14, 14);
    } catch (e) {
      console.error("Error rendering logo image:", e);
      // Fallback: double circle with initials
      doc.setDrawColor(...primaryColor);
      doc.setLineWidth(0.4);
      doc.circle(startX + 7, logoCenterY, 7, 'S');
      doc.circle(startX + 7, logoCenterY, 6.2, 'S');
      doc.setFont("times", "italic");
      doc.setFontSize(11);
      doc.setTextColor(...primaryColor);
      doc.text(initials, startX + 7, logoCenterY + 1.2, { align: "center" });
    }
  } else {
    // Default circular initials monogram
    doc.setDrawColor(...primaryColor);
    doc.setLineWidth(0.4);
    doc.circle(startX + 7, logoCenterY, 7, 'S');
    doc.circle(startX + 7, logoCenterY, 6.2, 'S');
    doc.setFont("times", "italic");
    doc.setFontSize(11);
    doc.setTextColor(...primaryColor);
    doc.text(initials, startX + 7, logoCenterY + 1.2, { align: "center" });
  }

  // Draw "H O T E L" above the hotel name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...darkText);
  // Center "H O T E L" relative to the large text "HOMELYRAJ"
  const textCenterX = startX + 18 + (nameWidth / 2);
  doc.text("H O T E L", textCenterX, 15, { align: "center" });

  // Draw Hotel Name large
  doc.setFont("helvetica", "bold");
  doc.setFontSize(23);
  doc.setTextColor(...primaryColor);
  doc.text(hotelName.toUpperCase(), startX + 18, 25.5);

  // Draw Subtitle: "Since [Year]" centered relative to the hotel name (larger and italic)
  const sinceText = `Since ${hotelData.since || '1965'}`;
  doc.setFont("times", "italic");
  doc.setFontSize(15);
  doc.setTextColor(...primaryColor);
  
  const sinceWidth = doc.getTextWidth(sinceText);
  const lineY = 32.2;
  
  // Draw the since text centered under the hotel name
  doc.text(sinceText, textCenterX, 33.2, { align: "center" });
  
  // Draw horizontal lines on left and right centered around the since text
  doc.setLineWidth(0.35);
  doc.line(textCenterX - sinceWidth / 2 - 14, lineY, textCenterX - sinceWidth / 2 - 3, lineY);
  doc.line(textCenterX + sinceWidth / 2 + 3, lineY, textCenterX + sinceWidth / 2 + 14, lineY);

  // ============================================================
  // 2. GUEST & BILL METADATA (Two-column layout)
  // ============================================================
  const metadataStartY = 38;
  doc.setFont(fontName, "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...darkText);

  // Helper values mapping
  const checkinDate = bill.checkInDate ? new Date(bill.checkInDate).toLocaleDateString('en-GB') : "";
  const checkinTime = bill.checkInTime ? formatTime12hr(bill.checkInTime).toUpperCase() : "";
  const checkoutDate = bill.checkOutDate ? new Date(bill.checkOutDate).toLocaleDateString('en-GB') : "";
  const checkoutTime = bill.checkOutTime ? formatTime12hr(bill.checkOutTime).toUpperCase() : "";
  const billDate = new Date().toLocaleDateString('en-GB');
  const billNo = bill.invoiceNumber || "Auto-generated";
  const regNo = bill.id ? bill.id.substring(0, 5).toUpperCase() : "";
  const curRm5 = String(bill.Room?.roomNumber || bill.roomNumber || "").replace(/^[rR][- ]?/, '');
  const roomNo = bill.previousRoomNumber ? `${String(bill.previousRoomNumber).replace(/^[rR][- ]?/, '').replace(/→/g, '->')} -> ${curRm5}` : curRm5;
  const roomType = bill.Room?.type || "DLX";
  const plan = bill.plan || "EP";
  const pax = bill.pax || "1";
  const rackRate = bill.Room?.pricePerNight || "";

  // Left Column fields
  const leftFields = [
    { label: "Guest Name", val: `: ${bill.guestName}` },
    { label: "Company Name", val: `: ${bill.companyName || ""}` },
    { label: "Address", val: `: ${bill.address || ""}` },
    { label: "City", val: `: ${bill.city || ""}` },
    { label: "Room Type", val: `: ${roomType}` },
    { label: "Plan", val: `: ${plan}` },
    { label: "Arr Date", val: `: ${checkinDate}` },
    { label: "Arr Time", val: `: ${checkinTime}` }
  ];

  // Right Column fields
  const rightFields = [
    { label: "Bill Date", val: `: ${billDate}` },
    { label: "BILL No", val: `: ${billNo}` },
    { label: "Reg.No", val: `: ${regNo}` },
    { label: "", val: "" }, // Spacing row
    { label: "Room No", val: `: ${roomNo}` },
    { label: "Rack Rate", val: `: ${rackRate}` },
    { label: "Pax", val: `: ${pax}` },
    { label: "Dep Date", val: `: ${checkoutDate}` },
    { label: "Dep Time", val: `: ${checkoutTime}` }
  ];

  // Draw Left Column
  leftFields.forEach((field, idx) => {
    const y = metadataStartY + (idx * 4.2);
    doc.setFont(fontName, "bold");
    doc.text(field.label, margin, y);
    doc.setFont(fontName, "normal");
    doc.text(field.val, margin + 22, y);
  });

  // Draw vertical pipeline separator in the center
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(pageWidth / 2 + 5, metadataStartY - 1, pageWidth / 2 + 5, metadataStartY + 32);

  // Draw Right Column
  rightFields.forEach((field, idx) => {
    const y = metadataStartY + (idx * 4.2);
    if (field.label) {
      doc.setFont(fontName, "bold");
      doc.text(field.label, pageWidth / 2 + 15, y);
      doc.setFont(fontName, "normal");
      doc.text(field.val, pageWidth / 2 + 37, y);
    }
  });

  // ============================================================
  // 3. STATEMENT TABLE
  // ============================================================
  const tableStartY = metadataStartY + 36;
  
  // Calculation parameters
  const roomsList = Array.isArray(bill.groupBookings) && bill.groupBookings.length > 0
    ? bill.groupBookings
    : [bill];

  const fallbackGst = hotelData.defaultGstRate !== undefined ? Number(hotelData.defaultGstRate) : 12;
  const gstRate = (bill.gstRate !== undefined && bill.gstRate !== null) ? parseFloat(bill.gstRate) : fallbackGst;
  let totalBaseAmount = 0;
  let totalDiscount = 0;

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

  let totalRoomGrand = 0;
  roomsList.forEach((rb, idx) => {
    // Subtract early check-in charge base from primary room to avoid double-counting
    const earlyDeduction = (idx === 0 && rawEarlyAmt > 0) ? earlyDeductionForBase : 0;
    const rbAmount = parseFloat(rb.totalAmount || 0) - earlyDeduction;
    const rbDisc = parseFloat(rb.discount || 0);
    totalDiscount += rbDisc;
    totalRoomGrand += Math.max(0, rbAmount - rbDisc);
  });

  if (gstOption === 'exclusive') {
    totalBaseAmount = totalRoomGrand;
  } else if (gstOption === 'inclusive' && gstRate > 0) {
    totalBaseAmount = Math.round((totalRoomGrand / (1 + gstRate / 100)) * 100) / 100;
  } else {
    totalBaseAmount = totalRoomGrand;
  }

  const subTotal = totalBaseAmount;
  const cgstRate = gstRate / 2;
  const sgstRate = gstRate / 2;

  // Calculate room GST on subTotal (without early check-in)
  const roomGstTotal = gstOption === 'exclusive' ? Math.round(totalBaseAmount * (gstRate / 100) * 100) / 100 : Math.round((totalRoomGrand - totalBaseAmount) * 100) / 100;
  const roomCgst = Math.round((roomGstTotal / 2) * 100) / 100;
  const roomSgst = Math.round((roomGstTotal / 2) * 100) / 100;

  // Calculate early check-in GST separately
  const earlyCgst = rawEarlyAmt > 0 ? eGst / 2 : 0;
  const earlySgst = rawEarlyAmt > 0 ? eGst / 2 : 0;

  const cgstAmount = roomCgst + (rawEarlyAmt > 0 ? eGst / 2 : 0);
  const sgstAmount = roomSgst + (rawEarlyAmt > 0 ? eGst / 2 : 0);
  const extraCharges = Number(bill.extraCharges || 0);
  const grandTotal = totalRoomGrand + eSub + (rawEarlyAmt > 0 ? eGst : 0) + extraCharges;

  // Draw horizontal lines for headers
  doc.setDrawColor(...darkText);
  doc.setLineWidth(0.4);
  doc.line(margin, tableStartY, pageWidth - margin, tableStartY);       // Above headers
  doc.line(margin, tableStartY + 7, pageWidth - margin, tableStartY + 7);   // Below headers

  // Render headers
  doc.setFont(fontName, "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...darkText);
  
  doc.text("Date", margin, tableStartY + 4.8);
  doc.text("Ref", margin + 22, tableStartY + 4.8);
  doc.text("SAC", margin + 39, tableStartY + 4.8);
  doc.text("Particulars", margin + 56, tableStartY + 4.8);
  doc.text("Debit", margin + 122, tableStartY + 4.8);
  doc.text("Credit", margin + 148, tableStartY + 4.8);
  doc.text("Balance", pageWidth - margin, tableStartY + 4.8, { align: "right" });

  // Generate statement rows
  let rowY = tableStartY + 12;
  let runningBalance = 0;

  doc.setFont(fontName, "normal");
  doc.setFontSize(8.5);

  // Row 1: Room Tariff
  runningBalance += subTotal;
  doc.text(checkinDate, margin, rowY);
  doc.text(bill.hsnCode || "996311", margin + 39, rowY);
  doc.text(`TARIFF  ${roomNo}`, margin + 56, rowY);
  doc.text(subTotal.toFixed(2), margin + 122, rowY);
  doc.text(runningBalance.toFixed(2), pageWidth - margin, rowY, { align: "right" });

  // Early Check-in Charge row
  if (rawEarlyAmt > 0) {
    rowY += 5;
    runningBalance += eSub;
    doc.text(checkinDate, margin, rowY);
    doc.text(bill.hsnCode || "996311", margin + 39, rowY);
    doc.text("EARLY CHECK-IN CHARGE", margin + 56, rowY);
    doc.text(eSub.toFixed(2), margin + 122, rowY);
    doc.text(runningBalance.toFixed(2), pageWidth - margin, rowY, { align: "right" });
  }

  // Row 2: Central GST
  rowY += 5;
  runningBalance += cgstAmount;
  doc.text(checkinDate, margin, rowY);
  doc.text(`Central GST ${cgstRate.toFixed(2)} %`, margin + 56, rowY);
  doc.text(cgstAmount.toFixed(2), margin + 122, rowY);
  doc.text(runningBalance.toFixed(2), pageWidth - margin, rowY, { align: "right" });

  // Row 3: State GST
  rowY += 5;
  runningBalance += sgstAmount;
  doc.text(checkinDate, margin, rowY);
  doc.text(`State GST ${sgstRate.toFixed(2)} %`, margin + 56, rowY);
  doc.text(sgstAmount.toFixed(2), margin + 122, rowY);
  doc.text(runningBalance.toFixed(2), pageWidth - margin, rowY, { align: "right" });

  // Rows 3+: Extra Service Orders
  if (bill.extraChargesList && bill.extraChargesList.length > 0) {
    bill.extraChargesList.forEach(charge => {
      rowY += 5;
      runningBalance += Number(charge.grandTotal || 0);
      const chargeDate = charge.createdAt ? new Date(charge.createdAt).toLocaleDateString('en-GB') : checkinDate;
      doc.text(chargeDate, margin, rowY);
      doc.text("996311", margin + 39, rowY);
      doc.text(`${charge.serviceName.toUpperCase()} (Qty: ${charge.qty})`, margin + 56, rowY);
      doc.text(Number(charge.grandTotal || 0).toFixed(2), margin + 122, rowY);
      doc.text(runningBalance.toFixed(2), pageWidth - margin, rowY, { align: "right" });
    });
  }

  // Row 4: Credit Payment if any
  const totalPaid = parseFloat(bill.amountPaid || 0);
  if (totalPaid > 0) {
    rowY += 5;
    runningBalance -= totalPaid;
    doc.text(checkoutDate || checkinDate, margin, rowY);
    doc.text(`${bill.paymentMode || 'Cash'} Payment`, margin + 56, rowY);
    doc.text(totalPaid.toFixed(2), margin + 148, rowY);
    doc.text(runningBalance.toFixed(2), pageWidth - margin, rowY, { align: "right" });
  }

  // Draw separator line below statement items
  rowY += 5;
  doc.setLineWidth(0.3);
  doc.line(margin, rowY, pageWidth - margin, rowY);

  // ============================================================
  // 4. STATEMENT TOTALS (Aligned)
  // ============================================================
  rowY += 5;
  doc.setFont(fontName, "bold");
  doc.text("Day Total", margin + 30, rowY);
  doc.text(grandTotal.toFixed(2), margin + 122, rowY);
  if (totalPaid > 0) {
    doc.text(totalPaid.toFixed(2), margin + 148, rowY);
  }

  rowY += 5.5;
  doc.text("Grand Total", margin + 30, rowY);
  doc.text(grandTotal.toFixed(2), margin + 122, rowY);
  if (totalPaid > 0) {
    doc.text(totalPaid.toFixed(2), margin + 148, rowY);
  }

  // Draw separator line below Grand Total
  rowY += 4.5;
  doc.line(margin, rowY, pageWidth - margin, rowY);

  // Net Amount Row
  rowY += 6;
  doc.text("Net Amount", margin + 30, rowY);
  doc.text(grandTotal.toFixed(2), margin + 122, rowY);

  // ============================================================
  // 5. FOOTER DECLARATIONS & SIGNATURES (Anchored to bottom)
  // ============================================================
  const footerStartY = 215;
  doc.setLineWidth(0.4);
  doc.line(margin, footerStartY, pageWidth - margin, footerStartY);

  // Liability Notice
  doc.setFont(fontName, "normal");
  doc.setFontSize(7.5);
  const liabilityText = "I agree that I am liable for the above statement. In case of the person/company or association indicated by me does not settle it I shall be made jointly responsible for the payment.";
  const wrappedLiability = doc.splitTextToSize(liabilityText, pageWidth - 2 * margin);
  doc.text(wrappedLiability, margin, footerStartY + 4);

  // Tax Identifiers
  doc.setFont(fontName, "bold");
  const panNo = hotelGstin ? hotelGstin.substring(2, 12) : "AACFH1080M";
  const gstNo = hotelGstin || "19AACFH1080M1Z9";
  doc.text(`PAN No:${panNo}      GST No :-${gstNo}      Com.GSTIN :`, margin, footerStartY + 14);

  // Signature fields
  doc.text("GUEST SIGNATURE _____________________", margin, footerStartY + 23);
  doc.text("CASHIER SIGNATURE _____________________", pageWidth / 2 + 10, footerStartY + 23);

  // Policy Notice
  doc.setFont(fontName, "normal");
  doc.setFontSize(7.5);
  doc.text("Please deposit your room key card and safe deposit locker keys. Check out time is 12 noon.", margin, footerYCheck(footerStartY + 30, pageWidth, margin, doc));
  
  // Hotel Contact Info
  doc.setFont(fontName, "normal");
  doc.text(hotelAddress, margin, footerStartY + 34);
  doc.text(`Tel No.: ${hotelPhone};   Email: ${hotelEmail};   web: www.hotelhomelyraj.com`, margin, footerStartY + 38);
};

// Simple utility to ensure checkout notice handles layout cleanly
const footerYCheck = (targetY, pageWidth, margin, doc) => {
  return targetY;
};
