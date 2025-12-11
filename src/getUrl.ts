import axios from "axios";
import { load } from "cheerio";
import puppeteer from 'puppeteer'
import puppeteerCore from 'puppeteer-core'
import chromium from '@sparticuz/chromium'

// ===================================================
// 1) Basic HTML Scraper
// ===================================================
export async function extractMp4(embedUrl: string) {
  try {
    const { data } = await axios.get(embedUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    const $ = load(data);

    let mp4 = $("video").attr("src");
    if (mp4) return mp4;

    mp4 = $("source").attr("src");
    if (mp4) return mp4;

    return null;
  } catch (err: any) {
    console.log("extractMp4 error:", err.message);
    return null;
  }
}

// ===================================================
// 2) 4shared extractor
// ===================================================
export async function getDirectVideoUrl(embedUrl: string) {
  try {
    const { data } = await axios.get(embedUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    const $ = load(data);

    const mp4 = $("source").attr("src");
    if (mp4) return mp4;

    const scripts = $("script").toArray();
    for (const script of scripts) {
      const content = $(script).html();
      if (!content) continue;

      const match = content.match(/https?:\/\/[^"']+\.mp4/);
      if (match) return match[0];
    }

    return null;
  } catch (err: any) {
    console.log("getDirectVideoUrl error:", err.message);
    return null;
  }
}

// ===================================================
// 3) Videa.hu extractor (Puppeteer - Vercel compatible)
// ===================================================
export async function getMp4(embedUrl: string) {
  let finalUrl: string | null = null;

  const blockedAdsDomains = [
    "googleapis.com",
    "doubleclick.net",
    "imasdk.googleapis.com",
  ];

  try {

    let browser
    if (process.env.VERCEL_ENV === 'production') {
      const executablePath = await chromium.executablePath()
      browser = await puppeteerCore.launch({
        executablePath,
        args: chromium.args,
        headless: chromium.headless,
        defaultViewport: chromium.defaultViewport
      })
    } else {
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      })
    }

    const page = await browser.newPage();

    await page.setRequestInterception(true);

    page.on("request", (req) => {
      const url = req.url();
      if (blockedAdsDomains.some((d) => url.includes(d))) {
        return req.abort();
      }
      req.continue();
    });

    page.on("response", (res) => {
      const url = res.url();
      if (url.includes(".mp4") && !blockedAdsDomains.some((d) => url.includes(d))) {
        finalUrl = url;
      }
    });

    await page.goto(embedUrl, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    // Try clicking Play button
    try {
      await page.click(".vjs-big-play-button");
    } catch {}

    // Fallback: get video src
    if (!finalUrl) {
      finalUrl = await page.evaluate(() => {
        const vid = document.querySelector("video") as HTMLVideoElement | null;
        return vid?.src ?? null;
      });
    }

    await browser.close();
    return finalUrl;
  } catch (err: any) {
    console.log("getMp4 error:", err.message);
    return null;
  }
}

// ===================================================
// 4) mp4upload extractor
// ===================================================
export async function extractMp4FromMp4Upload(embedUrl: string) {
  try {
    const { data } = await axios.get(embedUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    const $ = load(data);

    const vid = $("video").attr("src");
    if (vid) return vid;

    const scripts = $("script").toArray();
    for (const s of scripts) {
      const content = $(s).html();
      if (!content) continue;

      const match = content.match(/https?:\/\/[^"']+\.mp4/);
      if (match) return match[0];
    }

    return null;
  } catch (err: any) {
    console.log("extractMp4FromMp4Upload error:", err.message);
    return null;
  }
}

export async function getVideaHighestQuality(url: string) {
  let finalUrl: string | null = null;

  const blockedAds = [
    "doubleclick.net",
    "googlesyndication.com",
    "imasdk.googleapis.com",
  ];

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const u = req.url();
    if (blockedAds.some((d) => u.includes(d))) return req.abort();
    req.continue();
  });


  await page.goto(url, { waitUntil: "networkidle2" });

  try {
    await page.click(".videa-toolbar-settings");
    await page.waitForSelector(".settings-main-menu", { visible: true });
  } catch {
    console.log("Failed to open settings menu");
  }

  try {
    const items = await page.$$(".settings-main-menu-item");
    await items[0].click();
    await page.waitForSelector(".settings-version-selector-block .submenu-item", {
      visible: true,
    });
  } catch {
    console.log("Failed to open quality submenu");
  }

  const qualities = await page.$$eval(
    ".settings-version-selector-block .submenu-item",
    (els) => els.map((e) => e.innerText.trim())
  );

  console.log("Available qualities:", qualities);

  try {
    await page.click(".settings-version-selector-block .submenu-item");
  } catch {
    console.log("Quality selection failed");
  }

  try {
    await page.click(".videa-toolbar-playpause", { delay: 500 }).catch(() => {})
  } catch {
    console.log("asd")
  }

  
  if (!finalUrl) {
    finalUrl = await page.evaluate(() => {
      //@ts-ignore
      const vid = document.querySelector("video");
      return vid ? vid.src : null;
    });
  }

  await browser.close();
  return finalUrl;
}
// ===================================================
// 5) Domain Router
// ===================================================
export async function getVideoUrl(embedUrl: string) {
  const domain = new URL(embedUrl).hostname;
  console.log("Extracting from:", domain);

  if (domain.includes("4shared.com")) {
    return await getDirectVideoUrl(embedUrl);
  }

  if (domain.includes("videa.hu") || domain.includes("video6.videa.hu")) {
    return await getVideaHighestQuality(embedUrl);
  }

  if (domain.includes("mp4upload")) {
    return await extractMp4FromMp4Upload(embedUrl);
  }

  return await extractMp4(embedUrl);
}
