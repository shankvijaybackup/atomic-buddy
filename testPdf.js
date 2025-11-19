const fs = require('fs');
const pdfParse = require('pdf-parse');

(async () => {
  try {
    // You'll need to replace this with the actual path to your PDF
    const buffer = fs.readFileSync('[product overview] Atomicwork.pdf');
    const parsed = await pdfParse(buffer);

    console.log('=== PDF Parse Test Results ===');
    console.log('Text length:', parsed.text?.length || 0);
    console.log('Pages:', parsed.numpages);
    console.log('Info:', parsed.info);
    console.log('Metadata:', parsed.metadata);
    console.log('\n=== First 500 chars ===');
    console.log(parsed.text?.slice(0, 500) || 'NO TEXT FOUND');
    console.log('\n=== Full parsed object keys ===');
    console.log(Object.keys(parsed));
    
    if (parsed.text && parsed.text.length > 0) {
      console.log('\n✅ SUCCESS: PDF contains extractable text');
    } else {
      console.log('\n❌ ISSUE: PDF contains no extractable text');
      console.log('This PDF might be image-based or have encoding issues');
    }
  } catch (error) {
    console.error('❌ ERROR: pdf-parse failed:', error);
  }
})();
