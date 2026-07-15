const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

const GEMINI_PRIMARY = process.env.GEMINI_API_KEY_PRIMARY;
const GEMINI_SECONDARY = process.env.GEMINI_API_KEY_SECONDARY;
const GROQ_KEY = process.env.GROQ_API_KEY;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

const truncate = (arr, limit = 1000) => {
  if (!arr || arr.length === 0) return 'None detected.';
  const text = arr.join('\n');
  return text.length > limit ? text.substring(0, limit) + '\n...[TRUNCATED]' : text;
};

// ... keep fetchGroqAnalysis and fetchOpenRouterAnalysis exactly as they were in the previous step ...
async function fetchGroqAnalysis(systemData) {
  if (!GROQ_KEY) return "[Groq Disabled]";
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [{ role: 'user', content: `Review logs: \n${systemData}\n List critical JS/Network failures only.` }],
        max_tokens: 300
      })
    });
    const data = await response.json();
    return response.ok ? data.choices[0].message.content : `[Groq Error]`;
  } catch (err) { return "[Groq Failed]"; }
}

async function fetchOpenRouterAnalysis(systemData) {
  if (!OPENROUTER_KEY) return "[OpenRouter Disabled]";
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENROUTER_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'http://localhost:3000', 'X-Title': 'VisionQA' },
      body: JSON.stringify({
        model: 'mistralai/mistral-7b-instruct:free',
        messages: [{ role: 'user', content: `Review data: \n${systemData}\n Detail accessibility/structural issues only.` }],
        max_tokens: 300
      })
    });
    const data = await response.json();
    return response.ok ? data.choices[0].message.content : `[OpenRouter Error]`;
  } catch (err) { return "[OpenRouter Failed]"; }
}

async function callGeminiJudge(apiKey, prompt, imageParts) {
  const genAI = new GoogleGenAI({ apiKey });
  return await genAI.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }, ...imageParts] }],
  });
}

// Added userInstructions parameter
async function generateReport(pageStates, onProgress, userInstructions = "") {
  let aggregateData = '';
  const imageParts = [];

  pageStates.forEach((state, index) => {
    aggregateData += `\n--- PAGE ${index} (${state.url}) ---\nLogs: ${truncate(state.consoleLogs)}\nNetwork: ${truncate(state.networkIssues)}\n`;
    imageParts.push({ inlineData: { data: state.screenshot, mimeType: 'image/jpeg' } });
  });

  onProgress({ type: 'log', message: 'Analyzing data streams...' });
  const [groqReport, openRouterReport] = await Promise.all([
    fetchGroqAnalysis(aggregateData),
    fetchOpenRouterAnalysis(aggregateData)
  ]);

  // THE NEW RUTHLESS PROMPT WITH CUSTOM INSTRUCTIONS
  const prompt = `You are an elite QA Automation Architect. Your analysis must be 100% factual and objective. ZERO fluff, ZERO hallucinations, ZERO assumptions. Only report what is definitively broken or flawed based strictly on the provided screenshots and data.

--- USER DEFINED CONTEXT & INSTRUCTIONS ---
${userInstructions ? `The user has explicitly instructed: "${userInstructions}"\nYou MUST adhere strictly to these instructions. If they tell you to ignore a specific visual element or color contrast, you must completely ignore it in your report.` : "No specific user instructions provided. Perform a standard audit."}
-------------------------------------------

We have consulted two junior QA agents. Here are their notes:
[NETWORK AGENT (Llama-3)]: ${groqReport}
[A11Y AGENT (Mistral)]: ${openRouterReport}

Review the provided screenshots (Index 0 to ${pageStates.length - 1}). 
Whenever you refer to a specific page, you MUST insert the exact tag [IMAGE_X] (where X is the index of the page) immediately below that finding.

Format your output in Markdown with the following strict structure:
# QA Execution Report
## 1. System Overview (Keep it extremely brief and factual)
## 2.  Hard Defect Audit (List ONLY objective failures: truncations, missing images, console errors. If none exist, state "No hard defects detected.")
## 3.  UX/UI Observations (Subjective visual tweaks, UNLESS the User Instructions told you to ignore them.)
## 4. Remediation Steps`;

  let result;
  try {
     onProgress({ type: 'log', message: 'Gemini 2.5 Flash is finalizing the report...' });
     result = await callGeminiJudge(GEMINI_PRIMARY, prompt, imageParts);
  } catch (err) {
     if (err.status === 401 || err.status === 429 || err.status === 503) {
         onProgress({ type: 'log', message: `Switching to Backup Engine...` });
         try { result = await callGeminiJudge(GEMINI_SECONDARY, prompt, imageParts); } 
         catch (fallbackErr) { throw fallbackErr; }
     } else { throw err; }
  }

  onProgress({ type: 'log', message: 'Pipeline Execution Complete.' });
  return result.text;
}

module.exports = { generateReport };