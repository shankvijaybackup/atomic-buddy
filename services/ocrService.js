// services/ocrService.js
const fs = require('fs');
const path = require('path');
const { openai } = require('./aiConfig');
const pdf2pic = require('pdf2pic');

/**
 * Convert PDF page to image using pdf2pic
 */
async function pdfPageToImage(pdfPath, pageNum = 1) {
  try {
    const options = {
      density: 200,
      saveFilename: `page_${pageNum}`,
      savePath: path.join(__dirname, '..', 'temp'),
      format: 'png',
      width: 1200,
      height: 1600
    };

    const convert = pdf2pic.fromPath(pdfPath, options);
    const result = await convert(pageNum, { responseType: 'base64' });
    
    return result.base64;
  } catch (error) {
    console.error('PDF to image conversion failed for page', pageNum, error);
    throw new Error(`Failed to convert PDF page ${pageNum} to image: ${error.message}`);
  }
}

/**
 * Extract text from base64 image using GPT-4 Vision API
 */
async function extractTextFromBase64Image(base64Image, pageNum) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract all text from this image. Return only the extracted text, nothing else. Preserve formatting, paragraphs, and structure as much as possible.'
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 2000,
      temperature: 0
    });

    const text = response.choices[0]?.message?.content || '';
    console.log(`Page ${pageNum}: Extracted ${text.length} characters`);
    return text;
  } catch (error) {
    console.error('Vision API failed for page', pageNum, error);
    throw new Error(`Vision API extraction failed for page ${pageNum}: ${error.message}`);
  }
}

/**
 * Extract text from image-based PDF using OCR
 * @param {string} pdfPath - Path to PDF file
 * @param {Object} options - Options for OCR processing
 * @returns {string} Extracted text
 */
async function extractTextFromPDF(pdfPath, options = {}) {
  const {
    maxPages = 3, // Reduced to control costs
    tempDir = path.join(__dirname, '..', 'temp')
  } = options;

  try {
    // Ensure temp directory exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    console.log(`Starting OCR extraction for ${maxPages} pages...`);
    const pageTexts = [];

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      try {
        console.log(`Processing page ${pageNum}...`);
        
        // Convert page to base64 image
        const base64Image = await pdfPageToImage(pdfPath, pageNum);
        
        // Extract text using Vision API
        const text = await extractTextFromBase64Image(base64Image, pageNum);
        
        if (text.trim()) {
          pageTexts.push(text);
        } else {
          console.log(`Page ${pageNum}: No text extracted`);
        }
      } catch (error) {
        console.error(`Failed to process page ${pageNum}:`, error.message);
        // Continue with other pages
      }
    }

    // Combine all extracted text
    const combinedText = pageTexts.join('\n\n--- Page Break ---\n\n');
    console.log(`OCR complete. Total extracted text length: ${combinedText.length}`);
    
    return combinedText;

  } catch (error) {
    console.error('OCR extraction failed:', error);
    throw error;
  }
}

module.exports = {
  extractTextFromPDF,
  pdfPageToImage,
  extractTextFromBase64Image
};
