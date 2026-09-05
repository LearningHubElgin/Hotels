import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const formatCurrencyVal = (val) => {
  return `Rs. ${Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatCurrency3Val = (val) => {
  if (val === undefined || val === null || isNaN(val)) return 'Rs. 0.000';
  const num = Number(val);
  return 'Rs. ' + num.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
};

const drawHeader = (doc, title, subtitle) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const darkGray = [40, 50, 30];

  const storedHotel = localStorage.getItem('activeHotel');
  const activeHotel = storedHotel ? JSON.parse(storedHotel) : null;
  const hotelName = activeHotel?.name || "HOTEL REPORT";

  const addressParts = [
    activeHotel?.address,
    activeHotel?.city,
    activeHotel?.state
  ].filter(Boolean);
  const hotelAddress = addressParts.length > 0 ? addressParts.join(', ') : '';

  const hotelEmail = activeHotel?.email || "";
  const hotelPhone = activeHotel?.phone || "";
  const hotelGstin = activeHotel?.gstin || "";

  // Title Box
  doc.setFillColor(244, 246, 240);
  doc.rect(margin, 12, pageWidth - margin * 2, 28, 'F');
  doc.setDrawColor(221, 229, 208);
  doc.rect(margin, 12, pageWidth - margin * 2, 28, 'S');

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...darkGray);
  doc.text(hotelName.toUpperCase(), margin + 8, 24);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90, 100, 80);
  let subText = hotelAddress;
  if (hotelPhone) subText += (subText ? ' | Ph: ' : 'Ph: ') + hotelPhone;
  if (hotelGstin) subText += (subText ? ' | GSTIN: ' : 'GSTIN: ') + hotelGstin;
  doc.text(subText, margin + 8, 32);

  // Right Side - Report Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(132, 166, 60);
  doc.text(title, pageWidth - margin - 8, 23, { align: 'right' });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90, 100, 80);
  doc.text(subtitle, pageWidth - margin - 8, 32, { align: 'right' });

  return 46;
};

export const generateGeneralReportPdf = (data) => {
  const {
    periodTitle,
    periodSubtitle,
    summaryKpi,
    financialRows,
    financialTotals,
    totalRateAmount,
    transactionsList,
    tableTotals,
    isDaily
  } = data;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;

  let startY = drawHeader(doc, periodTitle || "General Front Office Report", periodSubtitle || "");

  // Check if all transaction dates are identical or if report is daily
  const isSingleDate = isDaily || (transactionsList && transactionsList.length > 0 && transactionsList.every(t => t.date === transactionsList[0].date));

  // Render Detailed Transactions Table
  if (transactionsList && transactionsList.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(26, 46, 5);
    doc.text("TRANSACTION DETAILS", margin, startY + 4);

    const headCols = isSingleDate
      ? ["Billing No.", "Guest Name", "Company", "Room No.", "Rate/Night", "Days", "Charges", "Discount", "Extra Service / Food", "CGST", "SGST", "Total GST", "Total Amount"]
      : ["Date", "Billing No.", "Guest Name", "Company", "Room No.", "Rate/Night", "Days", "Charges", "Discount", "Extra Service / Food", "CGST", "SGST", "Total GST", "Total Amount"];

    const txBody = transactionsList.map(tx => {
      const row = [
        tx.billNo,
        tx.guestName,
        tx.company || 'N/A',
        tx.roomNumber,
        tx.catalogRate ? `Rs. ${tx.catalogRate}` : 'N/A',
        String(tx.stayDays || 1),
        formatCurrencyVal(tx.baseAmount),
        formatCurrencyVal(tx.discount || 0),
        formatCurrencyVal(tx.extraService),
        formatCurrency3Val(tx.cgst),
        formatCurrency3Val(tx.sgst),
        formatCurrency3Val(tx.totalGst),
        formatCurrencyVal(tx.totalAmount)
      ];
      if (!isSingleDate) {
        row.unshift(tx.date);
      }
      return row;
    });

    if (tableTotals) {
      const totalRow = [
        `Total (${transactionsList.length} ${transactionsList.length === 1 ? 'Record' : 'Records'})`,
        "",
        "",
        "",
        "",
        "",
        formatCurrencyVal(tableTotals.baseAmount),
        formatCurrencyVal(tableTotals.discount || 0),
        formatCurrencyVal(tableTotals.extraServices),
        formatCurrency3Val(tableTotals.cgst),
        formatCurrency3Val(tableTotals.sgst),
        formatCurrency3Val(tableTotals.totalGst),
        formatCurrencyVal(tableTotals.totalAmount)
      ];
      if (!isSingleDate) {
        totalRow.unshift("");
      }
      txBody.push(totalRow);
    }

    const colStyles = isSingleDate
      ? {
          4: { halign: 'right' },
          5: { halign: 'center' },
          6: { halign: 'right' },
          7: { halign: 'right' },
          8: { halign: 'right' },
          9: { halign: 'right' },
          10: { halign: 'right' },
          11: { halign: 'right' },
          12: { halign: 'right', fontStyle: 'bold' }
        }
      : {
          5: { halign: 'right' },
          6: { halign: 'center' },
          7: { halign: 'right' },
          8: { halign: 'right' },
          9: { halign: 'right' },
          10: { halign: 'right' },
          11: { halign: 'right' },
          12: { halign: 'right' },
          13: { halign: 'right', fontStyle: 'bold' }
        };

    autoTable(doc, {
      startY: startY + 7,
      margin: { left: margin, right: margin },
      head: [headCols],
      body: txBody,
      theme: 'striped',
      headStyles: {
        fillColor: [74, 94, 56],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'left'
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: [40, 40, 40]
      },
      columnStyles: colStyles,
      didParseCell: function(data) {
        if (tableTotals && data.section === 'body' && data.row.index === txBody.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [240, 243, 232];
        }
      }
    });
  }

  // Bottom Footer Summary Section (Operational Left, Financial Right)
  let endY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 10 : startY + 10;
  if (endY + 52 > doc.internal.pageSize.getHeight() - 15) {
    doc.addPage();
    endY = 20;
  }

  // Left Side: Operational Summary
  const leftX = margin;
  const leftWidth = 90;

  autoTable(doc, {
    startY: endY,
    margin: { left: leftX },
    tableWidth: leftWidth,
    head: [[{ content: "OPERATIONAL SUMMARY", colSpan: 2, styles: { halign: 'left' } }]],
    body: [
      ["In-house Room", String(summaryKpi?.inHouseRooms || 0)],
      ["In-house Pax", String(summaryKpi?.inHousePax || 0)],
      ["Check-In", String(summaryKpi?.checkIn || 0)],
      ["Check-Out", String(summaryKpi?.checkOut || 0)]
    ],
    theme: 'grid',
    headStyles: {
      fillColor: [74, 94, 56],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [30, 30, 30]
    },
    columnStyles: {
      0: { fontStyle: 'bold', width: 60 },
      1: { halign: 'right', fontStyle: 'bold', width: 30 }
    }
  });

  // Right Side: Financial Summary
  const rightX = pageWidth - margin - 155;
  const rightWidth = 155;

  const finBody = (financialRows || []).map(row => [
    row.description,
    formatCurrencyVal(row.baseAmount),
    formatCurrencyVal(row.cgst),
    formatCurrencyVal(row.sgst)
  ]);

  if (financialTotals) {
    finBody.push([
      "DAY TOTAL",
      formatCurrencyVal(financialTotals.baseAmount),
      formatCurrencyVal(financialTotals.cgst),
      formatCurrencyVal(financialTotals.sgst)
    ]);
  }

  finBody.push([
    { content: "TOTAL RATE", colSpan: 3, styles: { fontStyle: 'bold', halign: 'left' } },
    { content: formatCurrencyVal(totalRateAmount || financialTotals?.totalAmount || 0), styles: { fontStyle: 'bold', halign: 'right' } }
  ]);

  autoTable(doc, {
    startY: endY,
    margin: { left: rightX },
    tableWidth: rightWidth,
    head: [["FINANCIAL SUMMARY", "AMOUNT", "CGST", "SGST"]],
    body: finBody,
    theme: 'grid',
    headStyles: {
      fillColor: [74, 94, 56],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'left'
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [30, 30, 30]
    },
    columnStyles: {
      0: { fontStyle: 'bold' },
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' }
    },
    didParseCell: function(data) {
      if (data.section === 'body') {
        if (data.row.index === finBody.length - 2) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [240, 243, 232];
        } else if (data.row.index === finBody.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [225, 236, 205];
          data.cell.styles.textColor = [26, 46, 5];
        }
      }
    }
  });

  // Footer with Page Numbers
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(130, 130, 130);
    doc.text(
      `Generated on ${new Date().toLocaleString('en-GB')}  |  Page ${i} of ${totalPages}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'center' }
    );
  }

  const cleanPeriod = (periodTitle || 'General_Report').replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`${cleanPeriod}.pdf`);
};
