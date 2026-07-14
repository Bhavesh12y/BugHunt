const { runBrowser } = require('../services/browserService');
const { generateReport } = require('../services/aiService');
const { URL } = require('url');

async function runQaPipeline(req, res) {
  const { url, username, password, device, selectors } = req.body;

  // Configure response headers for chunked streaming
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Transfer-Encoding', 'chunked');

  if (!url) {
    res.write(JSON.stringify({ type: 'error', message: 'URL is required.' }) + '\n');
    return res.end();
  }

  try {
    const targetUrl = new URL(url);
    if (!['http:', 'https:'].includes(targetUrl.protocol)) throw new Error('Invalid protocol');
    
    // Pass the callback to stream progress directly to the client
    const progressCallback = (logData) => {
      res.write(JSON.stringify(logData) + '\n');
    };

    const pageStates = await runBrowser(targetUrl.href, username, password, device, selectors || {}, progressCallback);
    
    progressCallback({ type: 'log', message: 'Analyzing captures with Gemini 2.5 Flash... (Estimated time: 10-15s)' });
    
    const report = await generateReport(pageStates);
    const screenshots = pageStates.map(state => `data:image/jpeg;base64,${state.screenshot}`);

    // Send final result
    res.write(JSON.stringify({ 
      type: 'complete', 
      success: true, 
      report, 
      screenshots 
    }) + '\n');

    res.end();
  } catch (error) {
    console.error('[Pipeline Error]:', error);
    res.write(JSON.stringify({ type: 'error', message: error.message }) + '\n');
    res.end();
  }
}

module.exports = { runQaPipeline };