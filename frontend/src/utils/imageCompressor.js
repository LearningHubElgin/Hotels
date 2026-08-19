/**
 * Utility to compress a base64 image string to JPEG format.
 * Preserves aspect ratio while fitting within a bounding box.
 * 
 * @param {string} base64Str - The source base64 image data URL.
 * @param {number} maxDimension - The maximum width or height.
 * @param {number} quality - JPEG quality from 0.0 to 1.0.
 * @returns {Promise<string>} - A promise that resolves to the compressed JPEG base64 string.
 */
export const compressImage = (base64Str, maxDimension = 1024, quality = 0.7) => {
  return new Promise((resolve) => {
    if (!base64Str) return resolve(null);
    
    // Check if it's already a small data URL or not an image
    if (!base64Str.startsWith('data:image/')) {
      return resolve(base64Str);
    }

    const img = new Image();
    img.src = base64Str;
    
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      // Scale down if exceeding maxDimension
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // Export as compressed JPEG
      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(compressedDataUrl);
    };

    img.onerror = (err) => {
      console.error('Image compression failed, using original', err);
      resolve(base64Str); // Fallback to original on error
    };
  });
};
