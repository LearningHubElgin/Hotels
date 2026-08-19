const fs = require('fs');
const path = require('path');

function slugify(text) {
  if (!text) return 'guest';
  return text.toString().toLowerCase()
    .trim()
    .replace(/\s+/g, '_')           // Replace spaces with _
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '_')         // Replace multiple - with single _
    .replace(/^-+/, '')             // Trim - from start
    .replace(/-+$/, '');            // Trim - from end
}

/**
 * Saves a base64 encoded string to disk if it is a valid data URL.
 * Otherwise, returns the value as is.
 * 
 * @param {string} base64Str The raw base64 string or already stored URL
 * @param {string} filename The target filename without extension
 */
function saveBase64File(base64Str, filename) {
  if (!base64Str || typeof base64Str !== 'string') return base64Str;
  
  const matches = base64Str.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    return base64Str; // Not a base64 data URL
  }

  const mimeType = matches[1];
  const base64Data = matches[2];
  const buffer = Buffer.from(base64Data, 'base64');

  // Determine extension
  let extension = '.jpg';
  if (mimeType.includes('png')) extension = '.png';
  else if (mimeType.includes('pdf')) extension = '.pdf';
  else if (mimeType.includes('webp')) extension = '.webp';
  else if (mimeType.includes('jpeg')) extension = '.jpg';
  else if (mimeType.includes('svg')) extension = '.svg';

  // Ensure uploads/guest directory exists
  const uploadsDir = path.join(__dirname, '..', 'uploads', 'guest');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const fullFilename = `${filename}${extension}`;
  const filePath = path.join(uploadsDir, fullFilename);

  // Write file to disk
  fs.writeFileSync(filePath, buffer);

  return `/uploads/guest/${fullFilename}`;
}

/**
 * Deletes a file from the server's uploads folder if the path is valid.
 * 
 * @param {string} oldPath The virtual path, e.g. /uploads/file.jpg
 */
function deleteOldFile(oldPath) {
  if (oldPath && oldPath.startsWith('/uploads/')) {
    const filePath = path.join(__dirname, '..', oldPath);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        console.error(`Failed to delete old file: ${filePath}`, e);
      }
    }
  }
}

/**
 * Processes all base64 data strings for primary and extra guests and saves them as files.
 * Deletes any replaced files on disk if provided with the previous database values.
 * 
 * @param {object} body The request payload body (mutated in-place)
 * @param {string|number} hotelId The hotel's unique identifier
 * @param {object} [existingBooking] The existing booking record to compare for file replacements
 */
function processGuestDocuments(body, hotelId, existingBooking = null) {
  const timestamp = Date.now();
  const hotel_id = hotelId || 'hotel';
  const name_slug = slugify(body.guestName || (existingBooking && existingBooking.guestName) || 'guest');
  const id_type_slug = slugify(body.idType || (existingBooking && existingBooking.idType) || 'Aadhar');

  const fieldsToProcess = [
    { field: 'guestPhoto', prefix: 'profile_photo' },
    { field: 'aadhaarFront', prefix: `${id_type_slug}_front` },
    { field: 'aadhaarBack', prefix: `${id_type_slug}_back` },
    { field: 'signature', prefix: 'signature' }
  ];

  fieldsToProcess.forEach(({ field, prefix }) => {
    if (body[field] !== undefined) {
      const value = body[field];
      // Only process and save if it's a new base64 string
      if (value && value.startsWith('data:')) {
        // Delete the old file if it existed
        if (existingBooking && existingBooking[field]) {
          deleteOldFile(existingBooking[field]);
        }
        const fn = `${hotel_id}_${name_slug}_${prefix}_${timestamp}`;
        body[field] = saveBase64File(value, fn);
      }
    }
  });

  // Keep original placeholders in sync with the cropped images (to avoid duplicates on disk)
  if (body.guestPhoto !== undefined) {
    body.originalGuestPhoto = body.guestPhoto;
  }
  if (body.aadhaarFront !== undefined) {
    body.originalAadhaarFront = body.aadhaarFront;
  }
  if (body.aadhaarBack !== undefined) {
    body.originalAadhaarBack = body.aadhaarBack;
  }

  // Extra Registered Guests processing
  if (body.extraGuests !== undefined) {
    try {
      const list = typeof body.extraGuests === 'string'
        ? JSON.parse(body.extraGuests)
        : body.extraGuests;

      let existingExtraList = [];
      if (existingBooking && existingBooking.extraGuests) {
        try {
          existingExtraList = typeof existingBooking.extraGuests === 'string'
            ? JSON.parse(existingBooking.extraGuests)
            : existingBooking.extraGuests;
        } catch (err) {
          existingExtraList = [];
        }
      }

      if (Array.isArray(list)) {
        const processed = list.map((g, idx) => {
          const extra_name_slug = slugify(g.name || `extra_${idx}`);
          const extra_id_type_slug = slugify(g.idType || 'Aadhar');

          let idFront = g.idFront;
          let idBack = g.idBack;

          // Find the corresponding existing extra guest to delete old files if updated
          const matchingExisting = Array.isArray(existingExtraList) 
            ? existingExtraList.find(ex => ex.phone === g.phone || ex.name === g.name)
            : null;

          if (g.idFront && g.idFront.startsWith('data:')) {
            if (matchingExisting && matchingExisting.idFront) {
              deleteOldFile(matchingExisting.idFront);
            }
            const fn = `${hotel_id}_${name_slug}_additionalGuest_${extra_name_slug}_${extra_id_type_slug}_front_${timestamp}_${idx}`;
            idFront = saveBase64File(g.idFront, fn);
          }

          if (g.idBack && g.idBack.startsWith('data:')) {
            if (matchingExisting && matchingExisting.idBack) {
              deleteOldFile(matchingExisting.idBack);
            }
            const fn = `${hotel_id}_${name_slug}_additionalGuest_${extra_name_slug}_${extra_id_type_slug}_back_${timestamp}_${idx}`;
            idBack = saveBase64File(g.idBack, fn);
          }

          return { ...g, idFront, idBack };
        });
        body.extraGuests = JSON.stringify(processed);
      }
    } catch (e) {
      console.error('Error processing extraGuests file uploads', e);
    }
  }
}

module.exports = {
  slugify,
  saveBase64File,
  deleteOldFile,
  processGuestDocuments
};
