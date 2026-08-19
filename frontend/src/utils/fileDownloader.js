import { getUploadUrl } from "../services/api";

export const downloadDocumentFile = async (url, filename = 'guest_document') => {
  if (!url) return;
  try {
    const absoluteUrl = getUploadUrl(url);
    const response = await fetch(absoluteUrl);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;

    let ext = 'jpg';
    if (url.startsWith('data:image/png')) ext = 'png';
    else if (url.startsWith('data:image/jpeg') || url.startsWith('data:image/jpg')) ext = 'jpg';
    else if (url.startsWith('data:application/pdf') || url.toLowerCase().includes('.pdf')) ext = 'pdf';
    else if (url.includes('.')) {
      const parts = url.split('.').pop().split('?')[0];
      if (parts && parts.length <= 4) ext = parts;
    }

    link.download = `${filename.replace(/\s+/g, '_')}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
  } catch (err) {
    console.error('Download failed, opening URL:', err);
    window.open(getUploadUrl(url), '_blank');
  }
};
