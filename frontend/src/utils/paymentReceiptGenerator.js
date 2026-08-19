import { jsPDF } from "jspdf";
import { formatTime12hr } from "./roomHelper";

const loadImageBase64 = (url) => {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);

        try {
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imgData.data;
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            if (r > 240 && g > 240 && b > 240) {
              data[i + 3] = 0;
            }
          }
          ctx.putImageData(imgData, 0, 0);
        } catch (canvasErr) {
          console.error("Canvas CORS issue:", canvasErr);
        }

        const dataURL = canvas.toDataURL("image/png");
        resolve(dataURL);
      } catch (err) {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
};

export const generatePaymentReceipt = async (bill, tx, previewOnly = false) => {
  // 80mm width, 210mm height for GUEST & OFFICE dual copies on thermal paper
  const doc = new jsPDF({
    orientation: 'p',
    unit: 'mm',
    format: [80, 210]
  });

  const pageWidth = 80;
  const pageHeight = 210;
  const margin = 5;

  const storedHotel = localStorage.getItem('activeHotel');
  const activeHotel = storedHotel ? JSON.parse(storedHotel) : null;
  const hotelName = activeHotel?.name || "MALA HOTEL";
  const hotelPhone = activeHotel?.phone || "033-2360 7435";
  const checkoutTimeStr = activeHotel?.checkoutTime ? formatTime12hr(activeHotel.checkoutTime) : "11:00 AM";

  const fontName = "helvetica";
  const inkColor = [15, 44, 114]; // Royal blue ink color matching screenshot

  // Number to Words Converter helper
  const numberToWords = (num) => {
    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    if ((num = Math.round(Number(num) || 0).toString()).length > 9) return 'overflow';
    let n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!n) return '';
    let str = '';
    str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Crore ' : '';
    str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
    str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
    str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'Hundred ' : '';
    str += (n[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) : '';
    str = str.trim();
    return str ? `${str} Rupees Only` : 'Zero Rupees Only';
  };

  const cleanRoom = (rNum) => {
    if (!rNum) return 'N/A';
    return String(rNum).replace(/^[rR][- ]?/, '').replace(/→/g, '->');
  };
  const isGroup = bill.groupBookings && bill.groupBookings.length > 1;
  const roomStr = isGroup
    ? bill.groupBookings.map(b => b.previousRoomNumber ? `${cleanRoom(b.previousRoomNumber)} -> ${cleanRoom(b.Room?.roomNumber || b.roomId)}` : cleanRoom(b.Room?.roomNumber || b.roomId)).join(', ')
    : (bill.previousRoomNumber ? `${cleanRoom(bill.previousRoomNumber)} -> ${cleanRoom(bill.Room?.roomNumber)}` : cleanRoom(bill.Room?.roomNumber));

  const guestAddress = bill.address || "";
  const addressLines = doc.splitTextToSize(guestAddress, pageWidth - margin * 2 - 15);

  const amountWords = numberToWords(Math.round(tx.amount));
  const wordsLines = doc.splitTextToSize(amountWords, pageWidth - margin * 2 - 13);

  // Set default drawing and text colors
  doc.setTextColor(...inkColor);
  doc.setDrawColor(...inkColor);

  // Render two identical copies (idx 0 = Customer Copy, idx 1 = Office Copy)
  // Copy 1 (Customer) starts at y=0 with full header (~30mm header + ~95mm body = ~125mm)
  // Copy 2 (Office) starts right after tear line with no header (~10mm top + ~80mm body)
  const copy1Start = 0;
  const tearLineY = 123;
  const copy2Start = tearLineY + 3; // starts just after tear line

  for (let copyIdx = 0; copyIdx < 2; copyIdx++) {
    // Restore ink color
    doc.setTextColor(...inkColor);

    let currentY;

    if (copyIdx === 0) {
      // Customer copy: full header
      doc.setFont(fontName, "bold");
      doc.setFontSize(8);
      doc.text(`Phone : ${hotelPhone}`, pageWidth - margin, copy1Start + 10, { align: "right" });

      doc.setFontSize(16);
      doc.text(hotelName.toUpperCase(), pageWidth / 2, copy1Start + 18, { align: "center" });

      doc.setFont(fontName, "bold");
      doc.setFontSize(10);
      doc.text("Guest House", pageWidth / 2, copy1Start + 23, { align: "center" });

      doc.setLineWidth(0.3);
      doc.line(pageWidth / 2 - 12, copy1Start + 24.5, pageWidth / 2 + 12, copy1Start + 24.5);

      currentY = copy1Start + 30;
    } else {
      // Office copy: no header, start content directly
      currentY = copy2Start + 5;
    }

    // 4. Room No & Date row
    doc.setFont(fontName, "bold");
    doc.setFontSize(8.5);
    doc.text("Room No.", margin, currentY);

    doc.setFont(fontName, "normal");
    doc.text(roomStr, margin + 16, currentY - 0.5);
    // Room No line
    doc.line(margin + 15, currentY + 0.5, margin + 36, currentY + 0.5);

    doc.setFont(fontName, "bold");
    doc.text("Date", margin + 38, currentY);
    doc.setFont(fontName, "normal");
    doc.text(tx.date || new Date().toLocaleDateString('en-GB'), margin + 47, currentY - 0.5);
    // Date line
    doc.line(margin + 46, currentY + 0.5, pageWidth - margin, currentY + 0.5);

    currentY += 10;

    // 5. Received with thanks from Sri / Smt. row
    doc.setFont(fontName, "bold");
    doc.setFontSize(8.5);

    const honorific = (!bill.gender)
      ? 'Sri / Smt.'
      : (String(bill.gender).toLowerCase().includes('female') ? 'Smt.' : 'Sri');
    const prefixText = `Received with thanks from ${honorific}`;

    doc.text(prefixText, margin, currentY);

    const prefixWidth = doc.getTextWidth(prefixText);
    const startX = margin + prefixWidth + 1.5;
    const nameLine1Max = Math.max(15, pageWidth - margin - startX);

    const fullGuestName = (bill.guestName || "").trim();
    const nameLines = doc.splitTextToSize(fullGuestName, nameLine1Max);

    doc.setFont(fontName, "normal");
    if (nameLines.length > 0) {
      doc.text(nameLines[0], startX + 0.5, currentY - 0.5);
    }
    // Line 1 underline
    doc.line(startX, currentY + 0.5, pageWidth - margin, currentY + 0.5);

    currentY += 8;

    // Line 2 for wrapped guest name
    if (nameLines.length > 1) {
      const remainingName = nameLines.slice(1).join(" ");
      const line2Lines = doc.splitTextToSize(remainingName, pageWidth - margin * 2);
      doc.text(line2Lines[0] || "", margin, currentY - 0.5);
    }
    // Line 2 underline
    doc.line(margin, currentY + 0.5, pageWidth - margin, currentY + 0.5);

    currentY += 8;

    // 6. Address row
    doc.setFont(fontName, "bold");
    doc.text("Address", margin, currentY);
    doc.setFont(fontName, "normal");

    if (addressLines[0]) {
      doc.text(addressLines[0], margin + 14, currentY - 0.5);
    }
    // Address line
    doc.line(margin + 13, currentY + 0.5, pageWidth - margin, currentY + 0.5);

    currentY += 8;

    // Second/overflow address line
    if (addressLines[1]) {
      doc.text(addressLines[1], margin, currentY - 0.5);
    }
    doc.line(margin, currentY + 0.5, pageWidth - margin, currentY + 0.5);

    currentY += 8;

    // 7. Rupees row
    doc.setFont(fontName, "bold");
    doc.text("Rupees", margin, currentY);
    doc.setFont(fontName, "normal");

    if (wordsLines[0]) {
      doc.text(wordsLines[0], margin + 15, currentY - 0.5);
    }
    // Rupees line
    doc.line(margin + 14, currentY + 0.5, pageWidth - margin, currentY + 0.5);

    // Only draw 2nd overflow line if amount words wrap
    if (wordsLines.length > 1) {
      currentY += 5;
      doc.text(wordsLines[1] || "", margin, currentY - 0.5);
      doc.line(margin, currentY + 0.5, pageWidth - margin, currentY + 0.5);
    }

    currentY += 4;

    // 8. Purpose note (Customer copy only)
    if (copyIdx === 0) {
      doc.setFont(fontName, "normal");
      doc.setFontSize(7.5);
      doc.text("Towards the deposit against Room Rent, Locker Deposit", margin, currentY);
      currentY += 4;
      doc.text("Please show the Voter Identity Card / Aadhar Card", margin, currentY);
      currentY += 5;
    } else {
      currentY += 2;
    }

    currentY += 4;

    // 9. Rs. [amount] & Payment Mode & Signatures
    doc.setFont(fontName, "bold");
    doc.setFontSize(13);
    doc.text("Rs.", margin, currentY);
    doc.setFontSize(12);
    doc.text(`${Number(tx.amount).toLocaleString('en-IN')}/-`, margin + 8, currentY);

    // Payment Mode
    const rawMode = (tx?.paymentMode || bill?.paymentMode || 'Cash').trim().toUpperCase();
    const bank = (tx?.paymentBank || bill?.paymentBank) ? ` (${(tx.paymentBank || bill.paymentBank).trim().toUpperCase()})` : '';
    doc.setFont(fontName, "bold");
    doc.setFontSize(7.5);
    doc.text(`Payment Mode: ${rawMode}${bank}`, margin, currentY + 4.5);

    // Right Signature Header Block
    doc.setFontSize(8.5);
    doc.setFont(fontName, "bold");
    doc.text(hotelName.toUpperCase(), pageWidth - margin - 15, currentY, { align: "center" });
    doc.setFont(fontName, "normal");
    doc.setFontSize(7.5);
    doc.text("Guest House", pageWidth - margin - 15, currentY + 4, { align: "center" });

    doc.setFont(fontName, "bold");
    doc.setFontSize(8);
    doc.text("Officer-on-Duty", pageWidth - margin - 15, currentY + 10, { align: "center" });

    // 10. Checkout Info aligned on left side of Officer-on-Duty
    doc.setFont(fontName, "bold");
    doc.setFontSize(7.5);
    doc.text(`Check Out Time ${checkoutTimeStr}`, margin, currentY + 10);
  }

  // Draw dashed tear-off line between copies
  doc.setLineWidth(0.3);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(margin, 123, pageWidth - margin, 123);

  // Handle preview or download
  if (previewOnly) {
    try {
      const blobUrl = doc.output('bloburl');
      window.open(blobUrl, '_blank');
    } catch (err) {
      console.error("Failed to open PDF preview:", err);
    }
  } else {
    // Save the receipt PDF
    doc.save(`Receipt_${bill.guestName ? bill.guestName.replace(/\s/g, '_') : 'Guest'}_${tx.amount}.pdf`);
  }
};
