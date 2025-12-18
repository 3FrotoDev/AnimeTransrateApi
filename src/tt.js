const chromium = require('@sparticuz/chromium');
const { chromium: pwChromium } = require('playwright-core');

async function scrapeResponses(url = 'https://anime3rb.com') {
  let browser;

  try {
    browser = await pwChromium.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const context = await browser.newContext({
      locale: 'en-US',
      viewport: { width: 1366, height: 768 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });

    const page = await context.newPage();

    const pageResponses = [];

    page.on('response', (response) => {
      pageResponses.push({
        status: response.status(),
        url: response.url(),
        headers: response.headers(),
        statusText: response.statusText(),
      });
    });

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    await page.waitForSelector('body', { timeout: 30000 });

    await page.evaluate(async () => {
      for (let i = 0; i < 4; i++) {
        window.scrollBy(0, 300);
        await new Promise(r =>
          setTimeout(r, 500 + Math.random() * 700)
        );
      }
    });

    await page.waitForTimeout(2000);

    const title = await page.title();

    return {
      success: true,
      title,
      responsesCount: pageResponses.length,
      pageResponses,
    };

  } catch (err) {
    return {
      success: false,
      error: err.message,
    };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { scrapeResponses };
