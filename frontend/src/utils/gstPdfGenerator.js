import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// Helper to format currency
const formatCurrencyVal = (val) => {
  return `Rs. ${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Common header for PDF reports
const drawHeader = (doc, title, subtitle, infoList) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const darkGray = [60, 60, 60];

  // Branding (matching invoice style)
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

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(26, 46, 5); // Brand dark green
  doc.text(hotelName.toUpperCase(), margin, 25);

  // Hotel Details
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

  doc.setDrawColor(221, 229, 208); // border green
  doc.setLineWidth(0.5);
  doc.line(margin, 48, pageWidth - margin, 48);

  // Title & Filters Info
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(26, 46, 5);
  doc.text(title, margin, 56);

  if (subtitle) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(74, 94, 56);
    doc.text(subtitle, margin, 62);
  }

  // Draw Meta Info (Filters, Date, etc.)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  let infoY = 56;
  infoList.forEach((info) => {
    doc.text(info, pageWidth - margin, infoY, { align: "right" });
    infoY += 4;
  });

  doc.line(margin, 68, pageWidth - margin, 68);
};

// Common footer for PDF reports
const drawFooter = (doc, pageNum) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;

  doc.setDrawColor(221, 229, 208);
  doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(
    `Report generated dynamically on ${new Date().toLocaleString('en-GB')}`,
    margin,
    pageHeight - 10
  );
  doc.text(`Page ${pageNum}`, pageWidth - margin, pageHeight - 10, { align: "right" });
};

/**
 * Generates and downloads a PDF of the overall Room GST Report table.
 */
export const generateOverallGstPdf = (roomsList, totals, filters) => {
  const doc = new jsPDF("p", "mm", "a4");
  const margin = 15;
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setProperties({
    title: "GST Room-wise Report",
  });

  const activeTab = filters.activeTab || 'all';

  let subtitle = `Filter Period: ${filters.year}`;
  let infoList = [];

  if (activeTab === 'all') {
    subtitle = `Filter Period: ${filters.year}`;
    infoList = [
      `Selected Quarter: Q${filters.quarter + 1}`,
      `Selected Month: ${filters.monthName}`,
      `Selected Date: ${new Date(filters.dateVal).toLocaleDateString('en-GB')}`,
      `Custom Range: ${filters.startDate} to ${filters.endDate}`
    ];
  } else {
    if (activeTab === 'daily') {
      subtitle = `Daily GST Report: ${new Date(filters.dateVal).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}`;
    } else if (activeTab === 'weekly') {
      subtitle = `Weekly GST Report: ${new Date(filters.weekStart).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} to ${new Date(filters.weekEnd).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    } else if (activeTab === 'monthly') {
      subtitle = `Monthly GST Report: ${filters.monthName} ${filters.year}`;
    } else if (activeTab === 'quarterly') {
      subtitle = `Quarterly GST Report: Q${filters.quarter + 1} ${filters.year}`;
    } else if (activeTab === 'yearly') {
      subtitle = `Yearly GST Report: ${filters.year}`;
    } else if (activeTab === 'custom') {
      subtitle = `Custom Range GST Report: ${new Date(filters.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} to ${new Date(filters.endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    }
    infoList = [
      `Generated: ${new Date().toLocaleDateString('en-GB')}`
    ];
  }

  drawHeader(doc, "Room-wise GST Report Summary", subtitle, infoList);

  const startY = 73;
  let nextY = startY;

  // --- STATS BOXES / SUMMARY GRID ---
  if (activeTab === 'all') {
    const boxWidth = (pageWidth - (margin * 2) - 16) / 5;
    const boxHeight = 18;
    const stats = [
      { label: "Year Total GST", val: totals.year, color: [26, 46, 5] },
      { label: "Quarterly GST", val: totals.quarter, color: [16, 185, 129] },
      { label: "Monthly GST", val: totals.month, color: [59, 130, 246] },
      { label: "Custom Range GST", val: totals.customRange, color: [147, 51, 234] },
      { label: "Daily GST", val: totals.daily, color: [249, 115, 22] }
    ];
    stats.forEach((stat, i) => {
      const x = margin + (i * (boxWidth + 4));
      doc.setFillColor(249, 250, 250);
      doc.setDrawColor(221, 229, 208);
      doc.rect(x, startY, boxWidth, boxHeight, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(74, 94, 56);
      doc.text(stat.label.toUpperCase(), x + 2, startY + 5);
      doc.setFontSize(9);
      doc.setTextColor(...stat.color);
      doc.text(formatCurrencyVal(stat.val), x + 2, startY + 12);
    });
    nextY = startY + boxHeight + 8;
  } else {
    const boxWidth = (pageWidth - (margin * 2) - 8) / 2;
    const boxHeight = 18;
    let periodVal = 0;
    let periodLabel = "Period GST";
    if (activeTab === 'daily') { periodVal = totals.daily; periodLabel = "Daily GST"; }
    else if (activeTab === 'weekly') { periodVal = totals.week; periodLabel = "Weekly GST"; }
    else if (activeTab === 'monthly') { periodVal = totals.month; periodLabel = "Monthly GST"; }
    else if (activeTab === 'quarterly') { periodVal = totals.quarter; periodLabel = "Quarterly GST"; }
    else if (activeTab === 'yearly') { periodVal = totals.year; periodLabel = "Yearly GST"; }
    else if (activeTab === 'custom') { periodVal = totals.customRange; periodLabel = "Custom Range GST"; }

    const stats = [
      { label: periodLabel, val: periodVal, color: [26, 46, 5] },
      { label: "Lifetime GST", val: roomsList.reduce((acc, r) => acc + Number(r.lifetime || 0), 0), color: [59, 130, 246] }
    ];
    stats.forEach((stat, i) => {
      const x = margin + (i * (boxWidth + 8));
      doc.setFillColor(249, 250, 250);
      doc.setDrawColor(221, 229, 208);
      doc.rect(x, startY, boxWidth, boxHeight, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(74, 94, 56);
      doc.text(stat.label.toUpperCase(), x + 3, startY + 6);
      doc.setFontSize(10.5);
      doc.setTextColor(...stat.color);
      doc.text(formatCurrencyVal(stat.val), x + 3, startY + 13);
    });
    nextY = startY + boxHeight + 8;
  }

  // --- TABLE SECTION ---
  let tableBody = [];
  let headers = [];
  let columnStyles = {};

  if (activeTab === 'all') {
    tableBody = roomsList.map((room) => [
      `Room ${room.roomNumber}`,
      room.roomType,
      Number(room.selectedDateGst).toFixed(2),
      Number(room.customRangeGst).toFixed(2),
      Number(room.selectedMonth).toFixed(2),
      Number(room.selectedQuarterGst).toFixed(2),
      Number(room.lifetime).toFixed(2)
    ]);
    const sumDaily = roomsList.reduce((acc, r) => acc + Number(r.selectedDateGst || 0), 0);
    const sumCustom = roomsList.reduce((acc, r) => acc + Number(r.customRangeGst || 0), 0);
    const sumMonthly = roomsList.reduce((acc, r) => acc + Number(r.selectedMonth || 0), 0);
    const sumQuarterly = roomsList.reduce((acc, r) => acc + Number(r.selectedQuarterGst || 0), 0);
    const sumLifetime = roomsList.reduce((acc, r) => acc + Number(r.lifetime || 0), 0);

    tableBody.push([
      "TOTALS",
      "",
      sumDaily.toFixed(2),
      sumCustom.toFixed(2),
      sumMonthly.toFixed(2),
      sumQuarterly.toFixed(2),
      sumLifetime.toFixed(2)
    ]);

    const customRangeHeader = `${new Date(filters.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} - ${new Date(filters.endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`;

    headers = [[
      "Room",
      "Room Type",
      `Daily GST (${new Date(filters.dateVal).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })})`,
      `Custom Range (${customRangeHeader})`,
      `Monthly GST (${filters.monthName})`,
      `Quarterly GST (Q${filters.quarter + 1})`,
      "Lifetime GST"
    ]];
    columnStyles = {
      0: { fontStyle: "bold" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right", fontStyle: "bold" }
    };
  } else {
    let colHeader = "Period GST";
    let colKey = "selectedMonth";

    if (activeTab === 'daily') {
      colHeader = `Daily GST (${new Date(filters.dateVal).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })})`;
      colKey = "selectedDateGst";
    } else if (activeTab === 'weekly') {
      colHeader = `Weekly GST (${new Date(filters.weekStart).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} - ${new Date(filters.weekEnd).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })})`;
      colKey = "selectedWeekGst";
    } else if (activeTab === 'monthly') {
      colHeader = `Monthly GST (${filters.monthName} ${filters.year})`;
      colKey = "selectedMonth";
    } else if (activeTab === 'quarterly') {
      colHeader = `Quarterly GST (Q${filters.quarter + 1} ${filters.year})`;
      colKey = "selectedQuarterGst";
    } else if (activeTab === 'yearly') {
      colHeader = `Yearly GST (${filters.year})`;
      colKey = "selectedYearGst";
    } else if (activeTab === 'custom') {
      colHeader = `Custom Range GST (${new Date(filters.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} - ${new Date(filters.endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })})`;
      colKey = "customRangeGst";
    }

    tableBody = roomsList.map((room) => [
      `Room ${room.roomNumber}`,
      room.roomType,
      Number(room[colKey] || 0).toFixed(2),
      Number(room.lifetime || 0).toFixed(2)
    ]);

    const sumPeriod = roomsList.reduce((acc, r) => acc + Number(r[colKey] || 0), 0);
    const sumLifetime = roomsList.reduce((acc, r) => acc + Number(r.lifetime || 0), 0);

    tableBody.push([
      "TOTALS",
      "",
      sumPeriod.toFixed(2),
      sumLifetime.toFixed(2)
    ]);

    headers = [[
      "Room",
      "Room Type",
      colHeader,
      "Lifetime GST"
    ]];

    columnStyles = {
      0: { fontStyle: "bold" },
      2: { halign: "right" },
      3: { halign: "right", fontStyle: "bold" }
    };
  }

  autoTable(doc, {
    startY: nextY,
    margin: { left: margin, right: margin },
    head: headers,
    body: tableBody,
    theme: "striped",
    styles: { fontSize: 8, cellPadding: 3, textColor: [30, 30, 30] },
    headStyles: {
      fillColor: [132, 166, 60], // #84A63C
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "left"
    },
    columnStyles: columnStyles,
    didParseCell: (data) => {
      if (data.row.index === tableBody.length - 1) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [240, 243, 232];
        data.cell.styles.textColor = [26, 46, 5];
      }
    }
  });

  drawFooter(doc, 1);
  doc.save(`GST_Room_Wise_Report_${activeTab}_${filters.year}.pdf`);
};

/**
 * Generates and downloads a PDF of a specific Room's GST History Ledger.
 */
export const generateRoomHistoryPdf = (roomDetails, bookings, filters) => {
  const doc = new jsPDF("p", "mm", "a4");
  const margin = 15;
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setProperties({
    title: `Room ${roomDetails.roomNumber} GST History`,
  });

  const subtitle = `Room ${roomDetails.roomNumber}`;
  const infoList = [
    `Filter Year: ${filters.modalYear}`,
    `Filter Month: ${filters.modalMonthName}`,
    `Custom Period: ${filters.startDate} to ${filters.endDate}`
  ];

  drawHeader(doc, `Room GST Ledger Statement`, subtitle, infoList);

  // --- STATS SUMMARY GRID ---
  const boxWidth = (pageWidth - (margin * 2) - 12) / 4;
  const boxHeight = 18;
  const startY = 73;

  const stats = [
    { label: "Lifetime Room GST", val: roomDetails.lifetime, color: [26, 46, 5] },
    { label: "Custom Range GST", val: roomDetails.customRangeGst, color: [147, 51, 234] },
    { label: "Selected Month GST", val: roomDetails.selectedMonth, color: [59, 130, 246] },
    { label: "Selected Date GST", val: roomDetails.selectedDateGst, color: [249, 115, 22] }
  ];

  stats.forEach((stat, i) => {
    const x = margin + (i * (boxWidth + 4));
    doc.setFillColor(249, 250, 250);
    doc.setDrawColor(221, 229, 208);
    doc.rect(x, startY, boxWidth, boxHeight, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(74, 94, 56);
    doc.text(stat.label.toUpperCase(), x + 2, startY + 5);

    doc.setFontSize(9.5);
    doc.setTextColor(...stat.color);
    doc.text(formatCurrencyVal(stat.val), x + 2, startY + 12);
  });

  // --- TABLE SECTION ---
  const tableBody = bookings.map((b) => {
    return [
      b.dateStr,
      b.invoiceNumber,
      b.guestName,
      `Room ${b.roomNumber}`,
      Number(b.amount || 0).toFixed(2),
      `${Number(b.gstAmount || 0).toFixed(2)} (${b.gstRate}%)`,
      Number(b.total || 0).toFixed(2)
    ];
  });

  const totalAmount = bookings.reduce((acc, b) => acc + Number(b.amount || 0), 0);
  const totalGstPaid = bookings.reduce((acc, b) => acc + Number(b.gstAmount || 0), 0);
  const grandTotal = bookings.reduce((acc, b) => acc + Number(b.total || 0), 0);

  // Add a final summary row
  tableBody.push([
    "TOTAL IN PERIOD",
    "",
    "",
    "",
    totalAmount.toFixed(2),
    totalGstPaid.toFixed(2),
    grandTotal.toFixed(2)
  ]);

  autoTable(doc, {
    startY: startY + boxHeight + 8,
    margin: { left: margin, right: margin },
    head: [[
      "Date",
      "Billing No.",
      "Guest Name",
      "Room Number",
      "Amount",
      "GST",
      "Total"
    ]],
    body: tableBody,
    theme: "grid",
    styles: {
      fontSize: 8.5,
      cellPadding: 3.5,
      textColor: [30, 30, 30],
      lineColor: [221, 229, 208],
      lineWidth: 0.15
    },
    headStyles: {
      fillColor: [132, 166, 60], // #84A63C
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "left"
    },
    columnStyles: {
      0: { fontStyle: "bold" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right", fontStyle: "bold" }
    },
    didParseCell: (data) => {
      // Highlight the Total row at the end
      if (data.row.index === tableBody.length - 1) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [240, 243, 232];
        data.cell.styles.textColor = [26, 46, 5];
      }
    }
  });

  drawFooter(doc, 1);
  doc.save(`Room_${roomDetails.roomNumber}_GST_Ledger_${new Date().toISOString().split('T')[0]}.pdf`);
};

/**
 * Generates and downloads a detailed PDF report containing the summary table
 * followed by transaction-by-transaction details for all rooms that have stays
 * in the selected custom range.
 */
export const generateDetailedAllRoomsGstPdf = (roomsList, allBookings, totals, filters) => {
  const doc = new jsPDF("p", "mm", "a4");
  const margin = 15;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setProperties({
    title: "GST Room-wise Detailed Report Summary",
  });

  const activeTab = filters.activeTab || 'all';

  let subtitle = `Filter Period: ${filters.year}`;
  let infoList = [];

  if (activeTab === 'all') {
    subtitle = `Filter Period: ${filters.year}`;
    infoList = [
      `Selected Quarter: Q${filters.quarter + 1}`,
      `Selected Month: ${filters.monthName}`,
      `Selected Date: ${new Date(filters.dateVal).toLocaleDateString('en-GB')}`,
      `Custom Range: ${filters.startDate} to ${filters.endDate}`
    ];
  } else {
    if (activeTab === 'daily') {
      subtitle = `Daily GST Report: ${new Date(filters.dateVal).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}`;
    } else if (activeTab === 'weekly') {
      subtitle = `Weekly GST Report: ${new Date(filters.weekStart).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} to ${new Date(filters.weekEnd).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    } else if (activeTab === 'monthly') {
      subtitle = `Monthly GST Report: ${filters.monthName} ${filters.year}`;
    } else if (activeTab === 'quarterly') {
      subtitle = `Quarterly GST Report: Q${filters.quarter + 1} ${filters.year}`;
    } else if (activeTab === 'yearly') {
      subtitle = `Yearly GST Report: ${filters.year}`;
    }
    infoList = [
      `Generated: ${new Date().toLocaleDateString('en-GB')}`
    ];
  }

  // --- PAGE 1: Summary Report ---
  drawHeader(doc, "Room-wise GST Report Summary", subtitle, infoList);

  const startY = 73;
  let nextY = startY;

  // Stats boxes
  if (activeTab === 'all') {
    const boxWidth = (pageWidth - (margin * 2) - 16) / 5;
    const boxHeight = 18;
    const stats = [
      { label: "Year Total GST", val: totals.year, color: [26, 46, 5] },
      { label: "Quarterly GST", val: totals.quarter, color: [16, 185, 129] },
      { label: "Monthly GST", val: totals.month, color: [59, 130, 246] },
      { label: "Custom Range GST", val: totals.customRange, color: [147, 51, 234] },
      { label: "Daily GST", val: totals.daily, color: [249, 115, 22] }
    ];
    stats.forEach((stat, i) => {
      const x = margin + (i * (boxWidth + 4));
      doc.setFillColor(249, 250, 250);
      doc.setDrawColor(221, 229, 208);
      doc.rect(x, startY, boxWidth, boxHeight, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(74, 94, 56);
      doc.text(stat.label.toUpperCase(), x + 2, startY + 5);
      doc.setFontSize(9);
      doc.setTextColor(...stat.color);
      doc.text(formatCurrencyVal(stat.val), x + 2, startY + 12);
    });
    nextY = startY + boxHeight + 8;
  } else {
    const boxWidth = (pageWidth - (margin * 2) - 8) / 2;
    const boxHeight = 18;
    let periodVal = 0;
    let periodLabel = "Period GST";
    if (activeTab === 'daily') { periodVal = totals.daily; periodLabel = "Daily GST"; }
    else if (activeTab === 'weekly') { periodVal = totals.week; periodLabel = "Weekly GST"; }
    else if (activeTab === 'monthly') { periodVal = totals.month; periodLabel = "Monthly GST"; }
    else if (activeTab === 'quarterly') { periodVal = totals.quarter; periodLabel = "Quarterly GST"; }
    else if (activeTab === 'yearly') { periodVal = totals.year; periodLabel = "Yearly GST"; }

    const stats = [
      { label: periodLabel, val: periodVal, color: [26, 46, 5] },
      { label: "Lifetime GST", val: roomsList.reduce((acc, r) => acc + Number(r.lifetime || 0), 0), color: [59, 130, 246] }
    ];
    stats.forEach((stat, i) => {
      const x = margin + (i * (boxWidth + 8));
      doc.setFillColor(249, 250, 250);
      doc.setDrawColor(221, 229, 208);
      doc.rect(x, startY, boxWidth, boxHeight, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(74, 94, 56);
      doc.text(stat.label.toUpperCase(), x + 3, startY + 6);
      doc.setFontSize(10.5);
      doc.setTextColor(...stat.color);
      doc.text(formatCurrencyVal(stat.val), x + 3, startY + 13);
    });
    nextY = startY + boxHeight + 8;
  }

  // Table Body
  let tableBody = [];
  let headers = [];
  let columnStyles = {};

  if (activeTab === 'all') {
    tableBody = roomsList.map((room) => [
      `Room ${room.roomNumber}`,
      room.roomType,
      Number(room.selectedDateGst).toFixed(2),
      Number(room.customRangeGst).toFixed(2),
      Number(room.selectedMonth).toFixed(2),
      Number(room.selectedQuarterGst).toFixed(2),
      Number(room.lifetime).toFixed(2)
    ]);
    const sumDaily = roomsList.reduce((acc, r) => acc + Number(r.selectedDateGst || 0), 0);
    const sumCustom = roomsList.reduce((acc, r) => acc + Number(r.customRangeGst || 0), 0);
    const sumMonthly = roomsList.reduce((acc, r) => acc + Number(r.selectedMonth || 0), 0);
    const sumQuarterly = roomsList.reduce((acc, r) => acc + Number(r.selectedQuarterGst || 0), 0);
    const sumLifetime = roomsList.reduce((acc, r) => acc + Number(r.lifetime || 0), 0);

    tableBody.push([
      "TOTALS",
      "",
      sumDaily.toFixed(2),
      sumCustom.toFixed(2),
      sumMonthly.toFixed(2),
      sumQuarterly.toFixed(2),
      sumLifetime.toFixed(2)
    ]);

    const customRangeHeader = `${new Date(filters.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} - ${new Date(filters.endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`;

    headers = [[
      "Room",
      "Room Type",
      `Daily GST (${new Date(filters.dateVal).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })})`,
      `Custom Range (${customRangeHeader})`,
      `Monthly GST (${filters.monthName})`,
      `Quarterly GST (Q${filters.quarter + 1})`,
      "Lifetime GST"
    ]];
    columnStyles = {
      0: { fontStyle: "bold" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right", fontStyle: "bold" }
    };
  } else {
    let colHeader = "Period GST";
    let colKey = "selectedMonth";

    if (activeTab === 'daily') {
      colHeader = `Daily GST (${new Date(filters.dateVal).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })})`;
      colKey = "selectedDateGst";
    } else if (activeTab === 'weekly') {
      colHeader = `Weekly GST (${new Date(filters.weekStart).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} - ${new Date(filters.weekEnd).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })})`;
      colKey = "selectedWeekGst";
    } else if (activeTab === 'monthly') {
      colHeader = `Monthly GST (${filters.monthName} ${filters.year})`;
      colKey = "selectedMonth";
    } else if (activeTab === 'quarterly') {
      colHeader = `Quarterly GST (Q${filters.quarter + 1} ${filters.year})`;
      colKey = "selectedQuarterGst";
    } else if (activeTab === 'yearly') {
      colHeader = `Yearly GST (${filters.year})`;
      colKey = "selectedYearGst";
    }

    tableBody = roomsList.map((room) => [
      `Room ${room.roomNumber}`,
      room.roomType,
      Number(room[colKey] || 0).toFixed(2),
      Number(room.lifetime || 0).toFixed(2)
    ]);

    const sumPeriod = roomsList.reduce((acc, r) => acc + Number(r[colKey] || 0), 0);
    const sumLifetime = roomsList.reduce((acc, r) => acc + Number(r.lifetime || 0), 0);

    tableBody.push([
      "TOTALS",
      "",
      sumPeriod.toFixed(2),
      sumLifetime.toFixed(2)
    ]);

    headers = [[
      "Room",
      "Room Type",
      colHeader,
      "Lifetime GST"
    ]];

    columnStyles = {
      0: { fontStyle: "bold" },
      2: { halign: "right" },
      3: { halign: "right", fontStyle: "bold" }
    };
  }

  autoTable(doc, {
    startY: nextY,
    margin: { left: margin, right: margin },
    head: headers,
    body: tableBody,
    theme: "striped",
    styles: { fontSize: 8, cellPadding: 3, textColor: [30, 30, 30] },
    headStyles: {
      fillColor: [132, 166, 60], // #84A63C
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "left"
    },
    columnStyles: columnStyles,
    didParseCell: (data) => {
      if (data.row.index === tableBody.length - 1) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [240, 243, 232];
        data.cell.styles.textColor = [26, 46, 5];
      }
    }
  });

  drawFooter(doc, 1);

  // --- PAGE 2 and onwards: Room-wise Ledgers ---
  let pageNum = 1;
  let currentY = doc.lastAutoTable.finalY + 15;

  const wStart = filters.weekStart ? parseLocalDate(filters.weekStart) : null;
  const wEnd = filters.weekEnd ? parseLocalDate(filters.weekEnd) : null;

  roomsList.forEach((room) => {
    // Filter bookings for this room that fall within the selected period
    const roomBookings = allBookings.filter((b) => {
      const rNum = b.Room?.roomNumber || b.previousRoomNumber;
      if (String(rNum) !== String(room.roomNumber)) return false;

      const dateStr = b.checkOutDate || b.createdAt;
      if (!dateStr) return false;
      const dateObj = new Date(dateStr);
      const bookingYear = dateObj.getFullYear();
      const bookingMonth = dateObj.getMonth();
      const bookingQuarter = Math.floor(bookingMonth / 3);
      const bookingDateOnly = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());

      if (activeTab === 'daily') {
        const selectedDOnly = parseLocalDate(filters.dateVal);
        return bookingDateOnly.toDateString() === selectedDOnly.toDateString();
      } else if (activeTab === 'weekly') {
        return bookingDateOnly >= wStart && bookingDateOnly <= wEnd;
      } else if (activeTab === 'monthly') {
        return bookingYear === Number(filters.year) && bookingMonth === Number(filters.month);
      } else if (activeTab === 'quarterly') {
        return bookingYear === Number(filters.year) && bookingQuarter === Number(filters.quarter);
      } else if (activeTab === 'yearly') {
        return bookingYear === Number(filters.year);
      } else {
        const startD = new Date(filters.startDate);
        const startDOnly = new Date(startD.getFullYear(), startD.getMonth(), startD.getDate());
        const endD = new Date(filters.endDate);
        const endDOnly = new Date(endD.getFullYear(), endD.getMonth(), endD.getDate());
        return bookingDateOnly >= startDOnly && bookingDateOnly <= endDOnly;
      }
    });

    if (roomBookings.length === 0) return;

    if (currentY + 35 > pageHeight - 20 || pageNum === 1) {
      doc.addPage();
      pageNum++;

      let ledgerSubtitle = `Date Range: ${filters.startDate} to ${filters.endDate}`;
      if (activeTab === 'daily') {
        ledgerSubtitle = `Day: ${new Date(filters.dateVal).toLocaleDateString('en-GB')}`;
      } else if (activeTab === 'weekly') {
        ledgerSubtitle = `Week: ${new Date(filters.weekStart).toLocaleDateString('en-GB')} to ${new Date(filters.weekEnd).toLocaleDateString('en-GB')}`;
      } else if (activeTab === 'monthly') {
        ledgerSubtitle = `Month: ${filters.monthName} ${filters.year}`;
      } else if (activeTab === 'quarterly') {
        ledgerSubtitle = `Quarter: Q${filters.quarter + 1} ${filters.year}`;
      } else if (activeTab === 'yearly') {
        ledgerSubtitle = `Year: ${filters.year}`;
      }

      drawHeader(
        doc,
        "Detailed Ledger Statement by Room",
        ledgerSubtitle,
        [`Page ${pageNum} of Details`]
      );
      drawFooter(doc, pageNum);
      currentY = 73;
    }

    let colKey = "selectedMonth";
    if (activeTab === 'daily') colKey = "selectedDateGst";
    else if (activeTab === 'weekly') colKey = "selectedWeekGst";
    else if (activeTab === 'monthly') colKey = "selectedMonth";
    else if (activeTab === 'quarterly') colKey = "selectedQuarterGst";
    else if (activeTab === 'yearly') colKey = "selectedYearGst";

    // Print Room Section Heading
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(26, 46, 5);
    doc.text(`Room ${room.roomNumber} (${room.roomType}) - Period GST: ${formatCurrencyVal(room[colKey] || 0)}`, margin, currentY);
    currentY += 4;

    // Generate table details
    const tableData = roomBookings.map((b) => {
      const baseAmount = Number(b.totalAmount || 0);
      const discount = Number(b.discount || 0);
      const gstRate = Number(b.gstRate !== undefined ? b.gstRate : 12);
      const gstAmount = (baseAmount - discount) * (gstRate / 100);
      return [
        new Date(b.checkOutDate || b.createdAt).toLocaleDateString('en-GB'),
        b.guestName || "N/A",
        b.invoiceNumber || 'Auto-generated',
        `${gstRate}%`,
        gstAmount.toFixed(2)
      ];
    });

    tableData.push([
      "Total Room GST In Period",
      "",
      "",
      "",
      Number(room[colKey] || 0).toFixed(2)
    ]);

    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      head: [["Checkout Date", "Guest Name", "Invoice Number", "GST Rate", "GST Paid (INR)"]],
      body: tableData,
      theme: "striped",
      styles: { fontSize: 7.5, cellPadding: 2, textColor: [30, 30, 30] },
      headStyles: {
        fillColor: [74, 94, 56],
        textColor: [255, 255, 255],
        fontStyle: "bold"
      },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 25 },
        3: { halign: "center", cellWidth: 20 },
        4: { halign: "right", fontStyle: "bold", cellWidth: 30 }
      },
      didParseCell: (data) => {
        if (data.row.index === tableData.length - 1) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [240, 243, 232];
          data.cell.styles.textColor = [26, 46, 5];
        }
      }
    });

    currentY = doc.lastAutoTable.finalY + 10;
  });

  doc.save(`GST_Room_Wise_Detailed_Report_${activeTab}_${filters.year}.pdf`);
};
