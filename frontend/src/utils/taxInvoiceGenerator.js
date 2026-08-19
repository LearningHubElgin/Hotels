import { jsPDF } from "jspdf";
import api from "../services/api";
import { renderTemplate1 } from "./templates/template_1";
import { renderTemplate2 } from "./templates/template_2";
import { renderTemplate3 } from "./templates/template_3";
import { renderTemplate4 } from "./templates/template_4";
import { renderTemplate5 } from "./templates/template_5";
import namasteImgUrl from "../assets/namaste.png";
import { formatTime12hr } from "./roomHelper";

const imageBase64Cache = new Map();

const loadImageBase64 = (url) => {
  if (!url) return Promise.resolve(null);
  if (imageBase64Cache.has(url)) {
    return Promise.resolve(imageBase64Cache.get(url));
  }

  return new Promise((resolve) => {
    let resolved = false;
    const finish = (result) => {
      if (!resolved) {
        resolved = true;
        if (result) imageBase64Cache.set(url, result);
        resolve(result);
      }
    };

    const timer = setTimeout(() => finish(null), 500);

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      clearTimeout(timer);
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
            if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) {
              data[i + 3] = 0;
            }
          }
          ctx.putImageData(imgData, 0, 0);
        } catch (canvasErr) {
          console.error("Canvas pixel manipulation failed:", canvasErr);
        }

        finish(canvas.toDataURL("image/png"));
      } catch (err) {
        finish(null);
      }
    };
    img.onerror = () => {
      clearTimeout(timer);
      finish(null);
    };
    img.src = url;
  });
};

export const generateTaxInvoice = async (bill, outputMode = 'save') => {
  const doc = new jsPDF('p', 'mm', 'a4');
  
  // Dynamic hotel details from local storage
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
  const hotelCheckoutTime = activeHotel?.checkoutTime ? formatTime12hr(activeHotel.checkoutTime) : "11:00 AM";
  const hotelInvoicePrefix = activeHotel?.invoicePrefix || "INV-";

  // Pre-load the hotel logo image asynchronously into a Base64 string if it exists
  const logoUrl = activeHotel?.logoUrl || "";
  let logoBase64 = null;
  if (logoUrl) {
    let fullLogoUrl = logoUrl;
    if (!logoUrl.startsWith('http') && !logoUrl.startsWith('data:')) {
      const backendBase = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5006';
      fullLogoUrl = `${backendBase}${logoUrl.startsWith('/') ? '' : '/'}${logoUrl}`;
    }
    logoBase64 = await loadImageBase64(fullLogoUrl);
  }

  // Pre-load the namaste icon
  const namasteBase64 = await loadImageBase64(namasteImgUrl);

  const hotelData = {
    name: hotelName,
    address: hotelAddress,
    email: hotelEmail,
    phone: hotelPhone,
    gstin: hotelGstin,
    checkoutTime: hotelCheckoutTime,
    invoicePrefix: hotelInvoicePrefix,
    since: activeHotel?.since || "",
    defaultGstRate: activeHotel?.defaultGstRate !== undefined ? Number(activeHotel.defaultGstRate) : 12,
    logoBase64: logoBase64,
    namasteBase64: namasteBase64
  };

  doc.setProperties({
    title: `Tax Invoice - ${bill.guestName || 'Guest'}`
  });

  // Helper: Amount to words converter
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

  // Fetch extra charges / service orders for the stay (Parallelized with Promise.all)
  let extraChargesList = bill.extraChargesList || [];
  if (!bill.extraChargesList) {
    try {
      const isGroup = bill.groupBookings && bill.groupBookings.length > 1;
      const bookingIds = isGroup ? bill.groupBookings.map(b => b.id) : [bill.id];
      const responses = await Promise.all(
        bookingIds.map(bId => api.get(`/extra-charges/booking/${bId}`).catch(() => null))
      );
      responses.forEach(res => {
        if (res?.data?.success) {
          extraChargesList = [...extraChargesList, ...(res.data.data || [])];
        }
      });
    } catch (err) {
      console.error("Error loading extra charges for invoice PDF:", err);
    }
  }

  const extraCharges = extraChargesList.reduce((sum, c) => sum + Number(c.grandTotal || 0), 0);
  const billWithExtras = {
    ...bill,
    extraCharges,
    extraChargesList
  };

  // Determine which template to render based on the active hotel setting
  const billingTemplateId = activeHotel?.billingTemplateId || 'template_1';

  // Dispatch layout drawing
  if (billingTemplateId === 'template_5') {
    renderTemplate5(doc, billWithExtras, hotelData, numberToWords);
  } else if (billingTemplateId === 'template_4') {
    renderTemplate4(doc, billWithExtras, hotelData, numberToWords);
  } else if (billingTemplateId === 'template_3') {
    renderTemplate3(doc, billWithExtras, hotelData, numberToWords);
  } else if (billingTemplateId === 'template_2') {
    renderTemplate2(doc, billWithExtras, hotelData, numberToWords);
  } else {
    renderTemplate1(doc, billWithExtras, hotelData, numberToWords);
  }

  if (outputMode === 'blob') {
    return doc.output('blob');
  }
  doc.save(`Tax_Invoice_${bill.guestName ? bill.guestName.replace(/\s/g, '_') : 'Guest'}_${bill.id ? String(bill.id).substring(0, 5) : 'Bill'}.pdf`);
};