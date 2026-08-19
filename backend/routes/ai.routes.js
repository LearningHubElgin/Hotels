const express = require('express');
const router = express.Router();
const { recognize } = require('tesseract.js');
const { protect } = require('../middleware/auth');

router.post('/scan-id', protect, async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ success: false, message: 'Image base64 data required' });
    }

    let imgBuffer = image;
    if (typeof image === 'string' && image.startsWith('data:image')) {
      const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
      imgBuffer = Buffer.from(base64Data, 'base64');
    }

    let text = '';
    try {
      const result = await recognize(imgBuffer, 'eng');
      text = result?.data?.text || '';
    } catch (ocrErr) {
      console.warn('[AI Scan OCR Warning]:', ocrErr.message);
    }

    console.log('[AI OCR Scan Text]:', text);

    let idNumber = null;
    let gender = null;
    let age = null;
    let guestName = null;

    // 1. Aadhaar 12-digit pattern
    const aadhaarMatch = text.match(/\b\d{4}\s?\d{4}\s?\d{4}\b/);
    if (aadhaarMatch) {
      idNumber = aadhaarMatch[0].replace(/\s+/g, ' ');
    }

    // 2. Gender pattern
    if (/MALE|M\b/i.test(text) && !/FEMALE/i.test(text)) {
      gender = 'Male';
    } else if (/FEMALE|F\b/i.test(text)) {
      gender = 'Female';
    }

    // 3. DOB / YOB pattern
    const dobMatch = text.match(/(?:DOB|Year of Birth|Date of Birth|Birth|YOB)[\s:-]*(\d{2}[\/-]\d{2}[\/-]\d{4}|\d{4})/i);
    if (dobMatch) {
      const yearStr = dobMatch[1].length === 4 ? dobMatch[1] : dobMatch[1].split(/[\/-]/)[2];
      const yob = parseInt(yearStr, 10);
      if (!isNaN(yob) && yob > 1920 && yob <= new Date().getFullYear()) {
        age = new Date().getFullYear() - yob;
      }
    }

    // 4. Guest Name pattern
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (
        !/Government|India|Aadhaar|Unique|Identification|Authority|DOB|Male|Female|Father|Address/i.test(line) &&
        /^[A-Z][a-z]+(\s+[A-Z][a-z]+)+$/.test(line)
      ) {
        guestName = line;
        break;
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        guestName: guestName || null,
        idNumber: idNumber || null,
        gender: gender || null,
        age: age || null,
        rawText: text
      }
    });
  } catch (error) {
    console.error('AI Scan Endpoint Error:', error.message);
    return res.status(200).json({
      success: false,
      message: 'Failed to process AI OCR scan',
      error: error.message
    });
  }
});

module.exports = router;
