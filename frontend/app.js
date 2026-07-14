lucide.createIcons();

const form = document.getElementById('qa-form');
const submitBtn = document.getElementById('submit-btn');
const emptyState = document.getElementById('empty-state');
const loadingState = document.getElementById('loading-state');
const resultsData = document.getElementById('results-data');
const reportContainer = document.getElementById('report-container');
const logTerminal = document.getElementById('live-logs-container'); // NEW

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const payload = {
    url: document.getElementById('url').value.trim(),
    device: document.getElementById('device').value,
    username: document.getElementById('username').value.trim(),
    password: document.getElementById('password').value
  };

  // UI Setup
  emptyState.classList.add('hidden');
  resultsData.classList.add('hidden');
  loadingState.classList.remove('hidden');
  logTerminal.innerHTML = ''; // Clear old logs
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<div class="spinner" style="width: 20px; height: 20px; border-width: 2px;"></div> Working...';

  try {
    const response = await fetch('http://localhost:3000/api/run-qa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    // Setup Stream Reader
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep the last incomplete chunk in the buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        
        const data = JSON.parse(line);

        if (data.type === 'log') {
          // Print to Terminal UI
          const logEntry = document.createElement('div');
          logEntry.className = 'log-line';
          logEntry.innerHTML = `<span class="timestamp">[${new Date().toLocaleTimeString()}]</span> ${data.message}`;
          logTerminal.appendChild(logEntry);
          logTerminal.scrollTop = logTerminal.scrollHeight; // Auto-scroll
        } 
        
        else if (data.type === 'complete') {
          // Render Final Markdown
          let rawHtml = marked.parse(data.report);
          data.screenshots.forEach((src, index) => {
            const imgTag = `<div class="embedded-screenshot">
                              <div class="screenshot-label">Reference: Capture ${index + 1}</div>
                              <img src="${src}" alt="Screenshot ${index}" loading="lazy"/>
                            </div>`;
            const regex = new RegExp(`\\[IMAGE_${index}\\]`, 'g');
            rawHtml = rawHtml.replace(regex, imgTag);
          });

          reportContainer.innerHTML = rawHtml;
          loadingState.classList.add('hidden');
          resultsData.classList.remove('hidden');
        }

        else if (data.type === 'error') {
            throw new Error(data.message);
        }
      }
    }

  } catch (error) {
    loadingState.classList.add('hidden');
    emptyState.classList.remove('hidden');
    
    let displayError = error.message;
    if (displayError.includes('503') || displayError.includes('high demand')) {
      displayError = "The AI model is temporarily overloaded. Please wait 10 seconds and try running the pipeline again.";
    }

    emptyState.innerHTML = `<i data-lucide="alert-triangle" style="color: #ef4444;"></i>
                            <h3 style="color: #ef4444;">Analysis Failed</h3>
                            <p>${displayError}</p>`;
    lucide.createIcons();
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i data-lucide="play"></i> Run QA Pipeline';
    lucide.createIcons();
  }
});