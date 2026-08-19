import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { cleanRoomNumber } from "./roomHelper";
import { getUploadUrl } from "../services/api";

const getBase64FromUrl = async (url) => {
  if (!url) return '';
  if (url.startsWith('data:')) return url; // Already base64
  
  const absoluteUrl = getUploadUrl(url);

  try {
    const response = await fetch(absoluteUrl);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result || '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Failed to convert image URL to base64', error);
    return '';
  }
};

const formatTime12hr = (timeStr) => {
  if (!timeStr) return '';
  try {
    const [hour, minute] = timeStr.split(':');
    const h = parseInt(hour, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHour = h % 12 || 12;
    return `${displayHour}:${minute} ${ampm}`;
  } catch (e) {
    return timeStr;
  }
};

const checkPageBreak = (doc, currentY, neededHeight = 35) => {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (currentY + neededHeight > pageHeight - 15) {
    doc.addPage();
    return 20;
  }
  return currentY;
};

export const generateCheckInVoucher = async (guest, outputType = 'save') => {
  // 1. Resolve base64 images for Primary Guest
  const guestPhotoResolved = guest.guestPhoto ? await getBase64FromUrl(guest.guestPhoto) : null;
  const aadhaarFrontResolved = (guest.aadhaarFront || guest.idFront) ? await getBase64FromUrl(guest.aadhaarFront || guest.idFront) : null;
  const aadhaarBackResolved = (guest.aadhaarBack || guest.idBack) ? await getBase64FromUrl(guest.aadhaarBack || guest.idBack) : null;
  const signatureResolved = guest.signature ? await getBase64FromUrl(guest.signature) : null;

  // 2. Parse Extra Guests
  let extraGuestsList = [];
  try {
    if (guest.extraGuests) {
      extraGuestsList = typeof guest.extraGuests === 'string' ? JSON.parse(guest.extraGuests) : guest.extraGuests;
    }
  } catch (e) {
    console.error("Error parsing extraGuests", e);
  }

  // 3. Resolve base64 images for Extra Guests (checking both idFront/aadhaarFront and idBack/aadhaarBack)
  const resolvedExtraDocs = [];
  if (Array.isArray(extraGuestsList)) {
    for (const eg of extraGuestsList) {
      const frontUrl = eg.idFront || eg.aadhaarFront || eg.idProofFront;
      const backUrl = eg.idBack || eg.aadhaarBack || eg.idProofBack;
      const front = frontUrl ? await getBase64FromUrl(frontUrl) : null;
      const back = backUrl ? await getBase64FromUrl(backUrl) : null;
      if (front || back) {
        resolvedExtraDocs.push({
          name: eg.name || 'Extra Guest',
          front,
          back
        });
      }
    }
  }

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Active Hotel Metadata
  const storedHotel = localStorage.getItem('activeHotel');
  const activeHotel = storedHotel ? JSON.parse(storedHotel) : null;
  const hotelName = activeHotel?.name || "HOTEL MANAGEMENT SYSTEM";
  const hotelAddress = activeHotel?.address || "";
  const hotelPhone = activeHotel?.phone ? `Tel: ${activeHotel.phone}` : "";
  const hotelEmail = activeHotel?.email ? `Email: ${activeHotel.email}` : "";
  const hotelGst = activeHotel?.gstin ? `GSTIN: ${activeHotel.gstin}` : "";
  const contactLine = [hotelPhone, hotelEmail, hotelGst].filter(Boolean).join(" | ");

  let yPos = 18;

  // ============================================================
  // EXECUTIVE HEADER & STYLING
  // ============================================================
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(28, 43, 18); // #1C2B12
  doc.text(hotelName, pageWidth / 2, yPos, { align: "center" });
  yPos += 5;

  if (hotelAddress) {
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(122, 138, 106); // #7A8A6A
    doc.text(hotelAddress, pageWidth / 2, yPos, { align: "center" });
    yPos += 4;
  }

  if (contactLine) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(74, 94, 56);
    doc.text(contactLine, pageWidth / 2, yPos, { align: "center" });
    yPos += 5;
  } else {
    yPos += 2;
  }

  // Header separator bar
  doc.setDrawColor(132, 166, 60); // #84A63C
  doc.setLineWidth(1.2);
  doc.line(15, yPos, pageWidth - 15, yPos);
  yPos += 7;

  // Document Title Banner
  doc.setFillColor(28, 43, 18);
  doc.roundedRect(15, yPos, pageWidth - 30, 9, 2, 2, "F");
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("GUEST REGISTRATION CARD (GRC)", pageWidth / 2, yPos + 6, { align: "center" });
  yPos += 13;

  // ============================================================
  // STAY & ROOM ALLOCATION BANNER CARD
  // ============================================================
  const stayBoxY = yPos;
  const stayBoxHeight = 24;
  doc.setDrawColor(221, 229, 208);
  doc.setFillColor(245, 247, 240); // #F5F7F0
  doc.roundedRect(15, stayBoxY, pageWidth - 30, stayBoxHeight, 2, 2, "FD");

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(122, 138, 106);
  doc.text("CHECK-IN DATE & TIME", 20, stayBoxY + 6);
  doc.text("CHECK-OUT DATE & TIME", pageWidth - 20, stayBoxY + 6, { align: "right" });

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(28, 43, 18);
  
  const checkInDateStr = guest.checkInDate ? new Date(guest.checkInDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';
  const checkInTimeStr = guest.checkInTime ? formatTime12hr(guest.checkInTime) : "12:00 PM";
  doc.text(`${checkInDateStr} at ${checkInTimeStr}`, 20, stayBoxY + 14);

  const checkOutDateStr = guest.checkOutDate ? new Date(guest.checkOutDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';
  const checkOutTimeStr = guest.checkOutTime ? formatTime12hr(guest.checkOutTime) : "11:00 AM";
  doc.text(`${checkOutDateStr} at ${checkOutTimeStr}`, pageWidth - 20, stayBoxY + 14, { align: "right" });

  // Calculate Nights
  const start = new Date(guest.checkInDate || Date.now());
  const end = new Date(guest.checkOutDate || Date.now());
  let diffDays = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)) || 1;
  const isEarlyFullDay = !!(guest.chargePreviousDay && (guest.earlyCheckInType === 'full_day' || !guest.earlyCheckInCharge || Number(guest.earlyCheckInCharge) === 0));
  if (isEarlyFullDay) diffDays += 1;

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(132, 166, 60);
  doc.text(`STAY DURATION: ${diffDays} NIGHT(S)`, pageWidth / 2, stayBoxY + 16, { align: "center" });

  yPos = stayBoxY + stayBoxHeight + 8;

  // ============================================================
  // PRIMARY GUEST DETAILS CARD
  // ============================================================
  const roomsList = guest.groupBookings && guest.groupBookings.length > 0 ? guest.groupBookings : [guest];
  const roomNumbersStr = guest.roomNumbers ? guest.roomNumbers.join(', ') : roomsList.map(r => cleanRoomNumber(r.Room?.roomNumber || r.roomNumber || r.previousRoomNumber)).filter(Boolean).join(', ');
  const roomTypesStr = guest.roomTypes ? [...new Set(guest.roomTypes)].join(', ') : roomsList.map(r => r.Room?.type || r.roomType).filter(Boolean).join(', ') || 'Standard';

  const primaryAssignedRoom = guest.assignedRoomNumber || guest.assignedRoomId
    ? `Room ${guest.assignedRoomNumber || guest.assignedRoomId}`
    : (roomsList.length > 1 ? `Room ${cleanRoomNumber(roomsList[0].Room?.roomNumber || roomsList[0].roomNumber)} (Primary)` : `Room ${roomNumbersStr}`);

  let childCount = guest.isChild ? 1 : 0;
  extraGuestsList.forEach(g => { if (g.isChild) childCount += 1; });
  const totalGuestNum = (guest.numberOfGuests || (1 + extraGuestsList.length));
  const adultCount = Math.max(1, totalGuestNum - childCount);

  const guestInfo = [
    ["Primary Guest Name", guest.guestName || "N/A"],
    ["Father / Guardian Name", guest.fatherName || "N/A"],
    ["Phone Number", guest.phone || "N/A"],
    ["Email Address", guest.email || "N/A"],
    ["Allocated Room(s)", `Room ${roomNumbersStr || 'N/A'} (${roomTypesStr})`],
    ["Primary Guest Room", primaryAssignedRoom],
    ["Total Occupants", `${totalGuestNum} Person(s) (${adultCount} Adult, ${childCount} Child)`],
    ["Gender / Age", `${guest.gender || "N/A"} / ${guest.age ? `${guest.age} yrs` : "N/A"}`],
    ["Nationality", guest.nationality || "Indian"],
    ["ID Verification", `${guest.idType || "Aadhaar"}: ${guest.idProof || guest.aadhaarNumber || guest.idNumber || "N/A"}`],
    ["Physical Address", guest.address || "N/A"]
  ];

  if (guest.nationality === 'Foreign') {
    guestInfo.push(["Passport Number", guest.passportNumber || "N/A"]);
    guestInfo.push(["Visa Information", `No: ${guest.visaNumber || "N/A"} (Type: ${guest.visaType || "N/A"})`]);
  }

  // Draw Primary Guest Photo frame if present
  const hasPhoto = !!guestPhotoResolved;
  if (hasPhoto) {
    try {
      doc.addImage(guestPhotoResolved, 'JPEG', pageWidth - 55, yPos, 40, 48);
      doc.setDrawColor(221, 229, 208);
      doc.rect(pageWidth - 55, yPos, 40, 48);
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(122, 138, 106);
      doc.text("GUEST PHOTO", pageWidth - 35, yPos + 52, { align: "center" });
    } catch (e) {
      console.error("Error drawing guest photo in PDF", e);
    }
  }

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(28, 43, 18);
  doc.text("PRIMARY GUEST INFORMATION", 15, yPos - 2);

  autoTable(doc, {
    startY: yPos,
    margin: { left: 15, right: hasPhoto ? 60 : 15 },
    body: guestInfo,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2, fontStyle: 'bold', textColor: [28, 43, 18], lineColor: [221, 229, 208], lineWidth: 0.5 },
    columnStyles: {
      0: { cellWidth: 38, textColor: [122, 138, 106], fontStyle: 'normal' }
    }
  });

  yPos = doc.lastAutoTable.finalY + 7;

  // ============================================================
  // ADDITIONAL REGISTERED GUESTS SECTION (CARDS & TABLE)
  // ============================================================
  if (extraGuestsList.length > 0) {
    yPos = checkPageBreak(doc, yPos, 45);

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(28, 43, 18);
    doc.text(`ADDITIONAL REGISTERED GUESTS DETAILS (${extraGuestsList.length})`, 15, yPos);
    yPos += 3;

    const extraGuestRows = extraGuestsList.map((g, idx) => [
      `#${idx + 1}`,
      g.name || 'N/A',
      g.isChild ? 'Child' : 'Adult',
      `${g.gender || 'N/A'} ${g.age ? `(${g.age} yrs)` : ''}`,
      g.phone || 'N/A',
      `${g.idType || 'Aadhaar'}: ${g.idNumber || g.aadhaarNumber || 'N/A'}`,
      (g.assignedRoomNumber || g.assignedRoomId) ? `Room ${g.assignedRoomNumber || g.assignedRoomId}` : primaryAssignedRoom
    ]);

    autoTable(doc, {
      startY: yPos,
      margin: { left: 15, right: 15 },
      head: [["#", "Guest Name", "Type", "Gender / Age", "Phone Number", "ID Proof", "Assigned Room"]],
      body: extraGuestRows,
      theme: 'grid',
      headStyles: { fillColor: [132, 166, 60], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 2.5, fontStyle: 'bold', textColor: [28, 43, 18], lineColor: [221, 229, 208], lineWidth: 0.5 },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        2: { cellWidth: 16, halign: 'center' }
      }
    });

    yPos = doc.lastAutoTable.finalY + 7;
  }

  // ============================================================
  // BILLING & FINANCIAL SUMMARY CARD
  // ============================================================
  yPos = checkPageBreak(doc, yPos, 45);

  const baseAmount = roomsList.reduce((sum, r) => sum + parseFloat(r.totalAmount || 0), 0);
  const discount = roomsList.reduce((sum, r) => sum + parseFloat(r.discount || 0), 0);
  const amountPaid = roomsList.reduce((sum, r) => sum + parseFloat(r.amountPaid || 0), 0);
  const gstOption = guest.gstOption || 'none';
  const gstRate = parseFloat(guest.gstRate !== undefined ? guest.gstRate : 0);

  let subTotal = 0;
  let gstAmount = 0;
  let grandTotal = 0;

  const netTotal = Math.max(0, baseAmount - discount);

  if (gstOption === 'inclusive') {
    grandTotal = netTotal;
    subTotal = Number((netTotal / (1 + gstRate / 100)).toFixed(2));
    gstAmount = Number((netTotal - subTotal).toFixed(2));
  } else if (gstOption === 'exclusive') {
    subTotal = netTotal;
    gstAmount = Number((subTotal * (gstRate / 100)).toFixed(2));
    grandTotal = Number((subTotal + gstAmount).toFixed(2));
  } else {
    subTotal = netTotal;
    gstAmount = 0;
    grandTotal = netTotal;
  }

  const balance = Math.max(0, grandTotal - amountPaid);

  let paymentStatusStr = guest.paymentStatus || 'Pending';
  if (amountPaid >= grandTotal && grandTotal > 0) {
    paymentStatusStr = 'Paid';
  } else if (amountPaid > 0) {
    paymentStatusStr = 'Partial';
  }

  const billingInfo = [
    ["Total Room Charge (Base)", `Rs ${baseAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`],
    ["Discount Applied", `- Rs ${discount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`],
    [`GST Tax Amount (${gstRate}%)`, `Rs ${gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`],
    ["Grand Total Amount", `Rs ${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`],
    ["Total Amount Paid", `Rs ${amountPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`],
    ["Outstanding Balance Due", `Rs ${balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`],
    ["Payment Mode / Status", `${guest.paymentMode || 'Cash'}${guest.paymentBank ? ` (${guest.paymentBank})` : ''} - [${paymentStatusStr}]`]
  ];

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(28, 43, 18);
  doc.text("BILLING & FINANCIAL SUMMARY", 15, yPos);
  yPos += 3;

  autoTable(doc, {
    startY: yPos,
    margin: { left: 15, right: 15 },
    body: billingInfo,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2, fontStyle: 'bold', textColor: [28, 43, 18], lineColor: [221, 229, 208], lineWidth: 0.5 },
    columnStyles: {
      0: { cellWidth: 50, textColor: [122, 138, 106], fontStyle: 'normal' }
    }
  });

  yPos = doc.lastAutoTable.finalY + 7;

  // ============================================================
  // PAYMENT TRANSACTION LEDGER LOG
  // ============================================================
  let allLogs = [];
  try {
    if (guest.paymentHistory) {
      allLogs = typeof guest.paymentHistory === 'string' ? JSON.parse(guest.paymentHistory) : guest.paymentHistory;
    }
  } catch (e) {}

  if (!Array.isArray(allLogs) || allLogs.length === 0) {
    const uniqueLogsMap = new Map();
    roomsList.forEach(r => {
      let rLogs = [];
      try {
        if (r.paymentHistory) {
          rLogs = typeof r.paymentHistory === 'string' ? JSON.parse(r.paymentHistory) : r.paymentHistory;
        }
      } catch (e) {}

      if (Array.isArray(rLogs) && rLogs.length > 0) {
        rLogs.forEach(log => {
          const key = `${log.date}_${log.time}_${log.amount}_${log.paymentMode}`;
          if (!uniqueLogsMap.has(key)) {
            uniqueLogsMap.set(key, log);
          }
        });
      } else if (parseFloat(r.amountPaid || 0) > 0) {
        const rDate = r.checkInDate ? r.checkInDate.split('T')[0].split('-').reverse().join('-') : 'N/A';
        const rTime = r.checkInTime ? formatTime12hr(r.checkInTime) : '';
        const key = `${rDate}_${rTime}_${r.amountPaid}_${r.paymentMode}`;
        if (!uniqueLogsMap.has(key)) {
          uniqueLogsMap.set(key, { amount: parseFloat(r.amountPaid), date: rDate, time: rTime, paymentMode: r.paymentMode || 'Cash', paymentBank: r.paymentBank || null });
        }
      }
    });
    allLogs = Array.from(uniqueLogsMap.values());
  }

  if (allLogs.length > 0) {
    yPos = checkPageBreak(doc, yPos, 40);

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(28, 43, 18);
    doc.text("PAYMENT TRANSACTION LEDGER LOG", 15, yPos);
    yPos += 3;

    const ledgerRows = allLogs.map(log => [
      `${log.date || 'N/A'} ${log.time ? `at ${log.time}` : ''}`,
      log.paymentMode || 'Cash',
      log.paymentBank || '—',
      `Rs ${parseFloat(log.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
    ]);

    autoTable(doc, {
      startY: yPos,
      margin: { left: 15, right: 15 },
      head: [["Date & Time", "Payment Mode", "Bank / Wallet", "Amount Received"]],
      body: ledgerRows,
      theme: 'grid',
      headStyles: { fillColor: [132, 166, 60], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 2, fontStyle: 'bold', textColor: [28, 43, 18], lineColor: [221, 229, 208], lineWidth: 0.5 },
      columnStyles: {
        3: { halign: 'right', textColor: [16, 185, 129] }
      }
    });

    yPos = doc.lastAutoTable.finalY + 7;
  }

  // ============================================================
  // VERIFICATION DOCUMENTS & SIGNATURE PAGE (PAGE 2 / PAGE 3)
  // ============================================================
  const hasPrimaryDocs = aadhaarFrontResolved || aadhaarBackResolved || signatureResolved;
  const hasExtraDocs = resolvedExtraDocs.length > 0;

  if (hasPrimaryDocs || hasExtraDocs) {
    doc.addPage();
    let yPosPage2 = 20;

    // Header on Page 2
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(28, 43, 18);
    doc.text(hotelName, pageWidth / 2, yPosPage2, { align: "center" });
    
    yPosPage2 += 4;
    doc.setDrawColor(132, 166, 60);
    doc.setLineWidth(0.8);
    doc.line(15, yPosPage2, pageWidth - 15, yPosPage2);
    
    yPosPage2 += 9;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("ID DOCUMENTS & SIGNATURE VERIFICATION", pageWidth / 2, yPosPage2, { align: "center" });
    
    yPosPage2 += 12;
    const imgWidth = (pageWidth - 40) / 2;
    const imgHeight = 52;

    // 1. Primary Guest ID Images
    if (aadhaarFrontResolved || aadhaarBackResolved) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(28, 43, 18);
      doc.text(`PRIMARY GUEST ID PROOF (${guest.guestName || 'Primary Guest'})`, 15, yPosPage2);
      yPosPage2 += 5;

      if (aadhaarFrontResolved) {
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(122, 138, 106);
        doc.text("ID Front Side Image", 15, yPosPage2);
        try {
          doc.addImage(aadhaarFrontResolved, 'JPEG', 15, yPosPage2 + 2, imgWidth, imgHeight);
          doc.setDrawColor(221, 229, 208);
          doc.rect(15, yPosPage2 + 2, imgWidth, imgHeight);
        } catch (e) {
          console.error("Error embedding front ID image", e);
        }
      }

      if (aadhaarBackResolved) {
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(122, 138, 106);
        doc.text("ID Back Side Image", 15 + imgWidth + 10, yPosPage2);
        try {
          doc.addImage(aadhaarBackResolved, 'JPEG', 15 + imgWidth + 10, yPosPage2 + 2, imgWidth, imgHeight);
          doc.setDrawColor(221, 229, 208);
          doc.rect(15 + imgWidth + 10, yPosPage2 + 2, imgWidth, imgHeight);
        } catch (e) {
          console.error("Error embedding back ID image", e);
        }
      }

      yPosPage2 += imgHeight + 14;
    }

    // 2. Extra Guests' ID Images (For EVERY extra guest who uploaded an ID proof!)
    if (hasExtraDocs) {
      for (const ed of resolvedExtraDocs) {
        yPosPage2 = checkPageBreak(doc, yPosPage2, imgHeight + 20);

        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(28, 43, 18);
        doc.text(`ADDITIONAL GUEST ID PROOF: ${ed.name.toUpperCase()}`, 15, yPosPage2);
        yPosPage2 += 5;

        if (ed.front) {
          doc.setFontSize(8);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(122, 138, 106);
          doc.text("ID Front Side Image", 15, yPosPage2);
          try {
            doc.addImage(ed.front, 'JPEG', 15, yPosPage2 + 2, imgWidth, imgHeight);
            doc.setDrawColor(221, 229, 208);
            doc.rect(15, yPosPage2 + 2, imgWidth, imgHeight);
          } catch (e) {}
        }

        if (ed.back) {
          doc.setFontSize(8);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(122, 138, 106);
          doc.text("ID Back Side Image", 15 + imgWidth + 10, yPosPage2);
          try {
            doc.addImage(ed.back, 'JPEG', 15 + imgWidth + 10, yPosPage2 + 2, imgWidth, imgHeight);
            doc.setDrawColor(221, 229, 208);
            doc.rect(15 + imgWidth + 10, yPosPage2 + 2, imgWidth, imgHeight);
          } catch (e) {}
        }

        yPosPage2 += imgHeight + 14;
      }
    }

    // 3. Guest Signature
    if (signatureResolved) {
      yPosPage2 = checkPageBreak(doc, yPosPage2, 35);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(28, 43, 18);
      doc.text("GUEST CHECK-IN SIGNATURE", 15, yPosPage2);
      yPosPage2 += 4;

      try {
        doc.addImage(signatureResolved, 'PNG', 15, yPosPage2, 60, 22);
        doc.setDrawColor(221, 229, 208);
        doc.rect(15, yPosPage2, 60, 22);
      } catch (e) {
        console.error("Error embedding signature", e);
      }

      yPosPage2 += 28;
    }

    // Declaration Footer Note
    yPosPage2 = checkPageBreak(doc, yPosPage2, 20);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(122, 138, 106);
    doc.text("Declaration: I hereby confirm that the information provided above is true and accurate. I agree to abide by the hotel policies and rules.", 15, yPosPage2, { maxWidth: pageWidth - 30 });
  }

  if (outputType === 'blob') {
    return doc.output('blob');
  }

  doc.save(`GRC_Voucher_${(guest.guestName || 'Guest').replace(/\s/g, '_')}.pdf`);
};
