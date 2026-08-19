/**
 * Helper utility to clean room numbers, specifically stripping out the soft-delete suffix (_deleted_timestamp) if present.
 * @param {string|number} roomNumber - The room number to clean.
 * @param {string} fallback - The fallback value if roomNumber is falsy.
 * @returns {string} The cleaned room number or fallback.
 */
export const cleanRoomNumber = (roomNumber, fallback = 'N/A') => {
  if (!roomNumber) return fallback;
  return String(roomNumber).replace(/_deleted_\d+$/, '');
};

/**
 * Dynamically extracts the trailing numeric part of an invoice number,
 * stripping away any legacy prefixes without hardcoding them.
 */
export const cleanInvoiceNumber = (invoiceNumber) => {
  if (!invoiceNumber) return '';
  const match = String(invoiceNumber).match(/^(.*?)(\d+)$/);
  return match ? match[2] : invoiceNumber;
};

/**
 * Formats an invoice number using the current active hotel's prefix.
 */
export const formatInvoiceNumber = (invoiceNumber, activeHotel) => {
  if (!invoiceNumber) return 'N/A';
  const prefix = (activeHotel?.invoicePrefix !== undefined && activeHotel?.invoicePrefix !== null)
    ? activeHotel.invoicePrefix
    : 'INV-';
  return `${prefix}${cleanInvoiceNumber(invoiceNumber)}`;
};

/**
 * Helper to convert 24hr time (e.g. "13:14") to 12hr time format with AM/PM (e.g. "01:14 PM").
 */
export const formatTime12hr = (timeStr) => {
  if (!timeStr) return '';
  const upper = timeStr.toUpperCase();
  if (upper.includes('AM') || upper.includes('PM')) {
    return upper;
  }
  try {
    const [hour, minute] = timeStr.split(':');
    const h = parseInt(hour, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHour = h % 12 || 12;
    return `${displayHour.toString().padStart(2, '0')}:${minute.substring(0, 2)} ${ampm}`;
  } catch (e) {
    return timeStr.toUpperCase();
  }
};
