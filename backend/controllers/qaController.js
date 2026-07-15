const { runBrowser } = require('../services/browserService');
const { generateReport } = require('../services/aiService');
const { URL } = require('url');

async function runQaPipeline(req, res) {
  // Grab credentials and instructions
  const { url, device, instructions, username, password, selectors } = req.body;

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Transfer-Encoding', 'chunked');

  if (!url) {
    res.write(JSON.stringify({ type: 'error', message: 'URL is required.' }) + '\n');
    return res.end();
  }

  try {
    const targetUrl = new URL(url);
    if (!['http:', 'https:'].includes(targetUrl.protocol)) throw new Error('Invalid protocol');
    
    const progressCallback = (logData) => { res.write(JSON.stringify(logData) + '\n'); };

    // Pass username and password back to the browser service
    const pageStates = await runBrowser(targetUrl.href, username, password, device, selectors || {}, progressCallback);
    
    const report = await generateReport(pageStates, progressCallback, instructions);
    
    const screenshots = pageStates.map(state => `data:image/jpeg;base64,${state.screenshot}`);

    res.write(JSON.stringify({ type: 'complete', success: true, report, screenshots }) + '\n');
    res.end();
  } catch (error) {
    console.error('[Pipeline Error]:', error);
    res.write(JSON.stringify({ type: 'error', message: error.message }) + '\n');
    res.end();
  }
}

module.exports = { runQaPipeline };