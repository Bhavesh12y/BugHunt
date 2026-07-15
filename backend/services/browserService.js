const puppeteer = require('puppeteer');
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runBrowser(startUrl, username, password, device = 'desktop', customSelectors = {}, onProgress = () => {}) {
  onProgress({ type: 'log', message: 'Booting Headless Chromium Engine...' });
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
  });
  
  const page = await browser.newPage();
  if (device === 'mobile') {
    await page.setViewport({ width: 390, height: 844, isMobile: true });
  } else {
    await page.setViewport({ width: 1440, height: 900 });
  }

  const pageStates = [];
  const MAX_STATES = 3; 
  let consoleLogs = [];
  let networkIssues = [];

  page.on('pageerror', err => consoleLogs.push(`[FATAL] ${err.message}`));
  page.on('response', res => { if (res.status() >= 400) networkIssues.push(`[HTTP ${res.status()}] ${res.url()}`); });
  page.on('console', msg => { if (['error', 'warning'].includes(msg.type())) consoleLogs.push(`[${msg.type().toUpperCase()}] ${msg.text()}`); });

  try {
    onProgress({ type: 'log', message: `Crawling Target: ${startUrl}` });
    await page.goto(startUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await wait(2000); 

    // THE RESTORED AUTHENTICATION BLOCK
    if (username && password) {
      onProgress({ type: 'log', message: 'Credentials detected. Attempting login flow...' });
      const userSel = customSelectors.username || 'input[name*="user"], input[name*="email"], input[type="email"], input[type="text"]';
      const passSel = customSelectors.password || 'input[name*="pass"], input[type="password"]';
      const submitSel = customSelectors.submit || 'button[type="submit"], input[type="submit"]';

      try {
        const hasLogin = await page.$(userSel);
        if (hasLogin) {
          await page.type(userSel, username);
          await page.type(passSel, password);
          const submitBtn = await page.$(submitSel);
          
          if (submitBtn) {
            await Promise.all([submitBtn.click(), page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => wait(3000))]);
          } else {
            await Promise.all([page.keyboard.press('Enter'), page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => wait(3000))]);
          }
          onProgress({ type: 'log', message: 'Login successful. Awaiting dashboard hydration...' });
          await wait(3000); 
        } else {
           onProgress({ type: 'log', message: 'No login fields found. Proceeding as guest.' });
        }
      } catch (authErr) {
        onProgress({ type: 'log', message: 'Login attempt failed. Proceeding with current state.' });
      }
    }

    onProgress({ type: 'log', message: 'Capturing Base DOM State (1/3)...' });
    pageStates.push({
      url: page.url(),
      screenshot: await page.screenshot({ fullPage: true, type: 'jpeg', quality: 80, encoding: 'base64' }),
      consoleLogs: [...consoleLogs],
      networkIssues: [...networkIssues]
    });

    onProgress({ type: 'log', message: 'Discovering interactive routes (SPAs and Links)...' });
    const elementsToInteract = await page.evaluate(() => {
      const targets = [];
      document.querySelectorAll('aside a, aside button, nav a, .sidebar a, [role="menuitem"]').forEach((el, index) => {
        targets.push({ type: 'spa_click', selectorIndex: index, label: el.innerText.trim() || `Menu_Item_${index}` });
      });
      document.querySelectorAll('a[href]').forEach(a => {
        if (a.href.startsWith(window.location.origin) && !a.href.includes('#')) {
          targets.push({ type: 'url_nav', href: a.href, label: a.innerText.trim() || 'Internal_Link' });
        }
      });
      return targets;
    });

    let statesCaptured = 1;
    for (let i = 1; i < elementsToInteract.length && statesCaptured < MAX_STATES; i++) {
      consoleLogs.length = 0;
      networkIssues.length = 0;
      const target = elementsToInteract[i];

      if (target.type === 'spa_click') {
        onProgress({ type: 'log', message: `Interacting: [${target.label}] (${statesCaptured + 1}/${MAX_STATES})` });
        await page.evaluate((index) => {
           const items = document.querySelectorAll('aside a, aside button, nav a, .sidebar a, [role="menuitem"]');
           if (items[index]) items[index].click();
        }, target.selectorIndex);
        await wait(2500); 
      } else if (target.type === 'url_nav') {
        onProgress({ type: 'log', message: `Navigating: [${target.href}] (${statesCaptured + 1}/${MAX_STATES})` });
        await page.goto(target.href, { waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
        await wait(1500);
      }

      pageStates.push({
        url: `${page.url()} [Action: ${target.label}]`,
        screenshot: await page.screenshot({ fullPage: true, type: 'jpeg', quality: 80, encoding: 'base64' }),
        consoleLogs: [...consoleLogs],
        networkIssues: [...networkIssues]
      });
      statesCaptured++;
    }

    return pageStates;
  } finally {
    await browser.close();
  }
}

module.exports = { runBrowser };