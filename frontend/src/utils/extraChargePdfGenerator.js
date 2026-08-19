import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export const generateExtraChargePdf = async (charge, outputMode = 'save') => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const darkGray = [60, 60, 60];
  const primaryColor = [132, 166, 60]; // Premium green accent matching the app
  const fontName = "helvetica";

  // Load hotel details
  const storedHotel = localStorage.getItem('activeHotel');
  const activeHotel = storedHotel ? JSON.parse(storedHotel) : null;
  const hotelName = activeHotel?.name || "HotelSoft";
  const addressParts = [
    activeHotel?.address,
    activeHotel?.city,
    activeHotel?.state
  ].filter(Boolean);
  const hotelAddress = addressParts.length > 0 ? addressParts.join(', ') : '';
  const hotelEmail = activeHotel?.email || "";
  const hotelPhone = activeHotel?.phone || "";
  const hotelGstin = activeHotel?.gstin || "";

  // 1. Header Branding
  doc.setFont(fontName, "bold");
  doc.setFontSize(16);
  doc.setTextColor(30, 30, 30);
  doc.text(hotelName.toUpperCase(), margin, 22);

  // Right Side Hotel details
  doc.setFontSize(8);
  doc.setTextColor(...darkGray);
  const hotelAddressLines = hotelAddress ? doc.splitTextToSize(hotelAddress, 75) : [];
  const hotelDetails = [...hotelAddressLines];
  if (hotelEmail) hotelDetails.push(`Email: ${hotelEmail}`);
  if (hotelPhone) hotelDetails.push(`Tel: ${hotelPhone}`);
  if (hotelGstin) hotelDetails.push(`GSTIN: ${hotelGstin}`);

  hotelDetails.forEach((line, i) => {
    doc.text(line, pageWidth - margin, 15 + (i * 3.5), { align: "right" });
  });

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(margin, 40, pageWidth - margin, 40);

  // 2. Banner Title
  doc.setFont(fontName, "bold");
  doc.setFontSize(11);
  doc.setTextColor(...primaryColor);
  doc.text("SERVICE RECEIPT / INVOICE", pageWidth / 2, 47, { align: "center" });
  doc.line(margin, 50, pageWidth - margin, 50);

  // 3. Receipt Metadata
  const infoY = 56;
  doc.setFontSize(8.5);
  doc.setTextColor(50, 50, 50);

  // Left Info
  doc.setFont(fontName, "bold");
  doc.text("GUEST DETAILS", margin, infoY);
  doc.setFont(fontName, "normal");
  doc.text(`Guest Name: ${charge.guestName || "N/A"}`, margin, infoY + 5);
  doc.text(`Room Number: Room ${charge.roomNumber || "N/A"}`, margin, infoY + 10);
  doc.text(`Status: Billed to Room Charge`, margin, infoY + 15);

  // Right Info
  const rightColX = pageWidth - 80;
  doc.setFont(fontName, "bold");
  doc.text("RECEIPT DETAILS", rightColX, infoY);
  doc.setFont(fontName, "normal");
  const receiptNo = `SRV-${String(charge.id).padStart(5, '0')}`;
  doc.text(`Receipt No: ${receiptNo}`, rightColX, infoY + 5);
  const chargeDate = charge.createdAt 
    ? new Date(charge.createdAt).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      })
    : new Date().toLocaleDateString('en-GB');
  doc.text(`Date & Time: ${chargeDate}`, rightColX, infoY + 10);

  // 4. Itemized Table
  const tableHead = [[
    'S.No.',
    'Description of Item / Service',
    'Qty',
    'Price (Rs)',
    'Sub Total (Rs)',
    'GST Rate',
    'GST Amt (Rs)',
    'Total (Rs)'
  ]];

  const cgstAmount = Number(charge.gstAmount || 0) / 2;
  const sgstAmount = Number(charge.gstAmount || 0) / 2;
  const subtotal = Number(charge.subtotal || 0);
  const grandTotal = Number(charge.grandTotal || 0);

  const tableBody = [[
    '1.',
    charge.serviceName,
    String(charge.qty),
    Number(charge.price).toFixed(2),
    subtotal.toFixed(2),
    charge.gstOption === 'none' ? 'No GST' : `${charge.gstRate}% (${charge.gstOption === 'inclusive' ? 'Incl' : 'Excl'})`,
    Number(charge.gstAmount || 0).toFixed(2),
    grandTotal.toFixed(2)
  ]];

  autoTable(doc, {
    startY: infoY + 23,
    margin: { left: margin, right: margin },
    head: tableHead,
    body: tableBody,
    theme: 'striped',
    styles: { fontSize: 8.5, cellPadding: 3, font: fontName },
    headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 46 },
      2: { cellWidth: 10, halign: 'center' },
      3: { cellWidth: 20, halign: 'right' },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 26, halign: 'center' },
      6: { cellWidth: 22, halign: 'right' },
      7: { cellWidth: 24, halign: 'right', fontStyle: 'bold' }
    }
  });

  const tableBottomY = doc.lastAutoTable.finalY;

  // 5. Summary calculations box
  const boxWidth = 70;
  const boxLeft = pageWidth - margin - boxWidth;
  let boxY = tableBottomY + 8;

  doc.setDrawColor(220, 220, 220);
  doc.setFillColor(250, 252, 245);
  doc.rect(boxLeft, boxY, boxWidth, 24, 'FD');

  doc.setFont(fontName, "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(80, 80, 80);

  // Subtotal
  doc.text("Sub Total:", boxLeft + 3, boxY + 5);
  doc.text(`Rs. ${subtotal.toFixed(2)}`, pageWidth - margin - 3, boxY + 5, { align: "right" });

  // GST
  doc.text(`GST Amount:`, boxLeft + 3, boxY + 11);
  doc.text(`Rs. ${Number(charge.gstAmount || 0).toFixed(2)}`, pageWidth - margin - 3, boxY + 11, { align: "right" });

  // Grand Total
  doc.setFont(fontName, "bold");
  doc.setTextColor(30, 30, 30);
  doc.text("Grand Total:", boxLeft + 3, boxY + 19);
  doc.text(`Rs. ${grandTotal.toFixed(2)}`, pageWidth - margin - 3, boxY + 19, { align: "right" });

  // GST breakdown details on the left
  if (charge.gstOption !== 'none' && Number(charge.gstAmount) > 0) {
    let breakdownY = tableBottomY + 12;
    doc.setFont(fontName, "bold");
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text("GST BREAKDOWN:", margin, breakdownY);
    doc.setFont(fontName, "normal");
    doc.text(`CGST (${(Number(charge.gstRate)/2).toFixed(1)}%): Rs. ${cgstAmount.toFixed(2)}`, margin, breakdownY + 4);
    doc.text(`SGST (${(Number(charge.gstRate)/2).toFixed(1)}%): Rs. ${sgstAmount.toFixed(2)}`, margin, breakdownY + 8);
  }

  // Footer declaration
  const footerY = pageHeight - 20;
  doc.setDrawColor(230, 230, 230);
  doc.line(margin, footerY, pageWidth - margin, footerY);
  
  doc.setFont(fontName, "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  doc.text("* This is computer generated invoice signature and stamp not required", pageWidth / 2, footerY + 5, { align: 'center' });

  if (outputMode === 'blob') {
    return doc.output('blob');
  }
  doc.save(`Receipt_${charge.serviceName.replace(/\s/g, '_')}_${receiptNo}.pdf`);
};
