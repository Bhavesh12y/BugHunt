const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

const PRIMARY_KEY = process.env.GEMINI_API_KEY_PRIMARY;
const SECONDARY_KEY = process.env.GEMINI_API_KEY_SECONDARY;
async function generateReport(pageStates) {
  try {
    return await callGemini(PRIMARY_KEY, pageStates);
  } catch (error) {
    // Add 503 to the fallback conditions
    if (error.status === 401 || error.status === 429 || error.status === 503) {
      console.log(`[API Error ${error.status}] Primary key failed, trying secondary key...`);
      return await callGemini(SECONDARY_KEY, pageStates);
    }
    throw error;
  }
}

async function callGemini(apiKey, pageStates) {
  const genAI = new GoogleGenAI({ apiKey });
  
  // Format the text data for all visited pages
  let aggregateData = '';
  const imageParts = [];

  pageStates.forEach((state, index) => {
    aggregateData += `
--- PAGE ${index} ---
URL: ${state.url}
Console Logs: ${state.consoleLogs.length ? state.consoleLogs.join(' | ') : 'Clean'}
Network Issues: ${state.networkIssues.length ? state.networkIssues.join(' | ') : 'Clean'}
`;
    // Attach the images to the Gemini payload
    imageParts.push({ inlineData: { data: state.screenshot, mimeType: 'image/jpeg' } });
  });

const prompt = `You are a Lead Quality Assurance Architect. Perform a rigorous, factual technical audit on the provided web pages.
Do not use conversational language or emojis. Be objective, precise, and highly observant.

CRITICAL INSTRUCTION - THE GOLDILOCKS RULE: 
1. DO NOT invent or fabricate layout breaks, overlaps, or truncations.
2. DO NOT be overly passive. You must actively hunt for subtle flaws.
3. Specifically evaluate: WCAG color contrast ratios (e.g., dark gray text on a black background), padding/margin inconsistencies, subtle alignment mismatches, and empty/missing states.
4. If you flag a visual defect, you MUST justify it based on standard UI/UX heuristics. If a component is genuinely flawless, leave it be, but scrutinize the details first.

DATA CONTEXT:
${aggregateData}

You have been provided with ${pageStates.length} screenshots in sequential order (Index 0 to ${pageStates.length - 1}). 
Whenever you refer to a specific page or a visual defect, you MUST insert the exact tag [IMAGE_X] (where X is the index of the page) immediately below that finding.

Format your output in Markdown with the following strict structure:

# Comprehensive QA Diagnostic Report

## 1. System Overview
Provide a high-level summary of the crawled pages and their general health.

## 2. Page-Level Vulnerability & Defect Audit
For each page analyzed, detail the functional and visual defects. Follow this exact format:

### https://www.amazon.com/Off-Page-Jodi-Picoult/dp/0553535595
**Visual Findings:**
* [SEVERITY] - Description of the issue and UI/UX justification.
[IMAGE_X]

**Functional/Network Findings:**
* [SEVERITY] - Description of JS/Network errors.

## 3. Remediation Directives
Actionable, technical steps for engineering to resolve the highest-severity issues.`;

  const parts = [{ text: prompt }, ...imageParts];

  const result = await genAI.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: parts }],
  });

  return result.text;
}

module.exports = { generateReport };