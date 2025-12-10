import axios from "axios";
import { load } from "cheerio";
import puppeteer from "puppeteer-core";
import chromium from "chrome-aws-lambda";

// ===============================================
// 1) Basic HTML Scraper (<video> أو <source>)
// ===============================================
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
// 2) Direct Extractor for 4shared (<script> أو <source>)
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
// 3) Puppeteer Sniffing (videa.hu) - Serverless ready
// ===================================================
export async function getMp4(embedUrl: string) {
  let finalUrl: string | null = null;
  const blockedAdsDomains = [
    "cdn.nwmgroups.hu",
    "googleapis.com",
    "doubleclick.net",
    "gahu.hit.gemius.pl",
    "imasdk.googleapis.com",
  ];

  try {
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
    });

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

    await page.goto(embedUrl, { waitUntil: "networkidle2", timeout: 60000 });

    // اضغط Play إذا موجود
    try {
      await page.click(".vjs-big-play-button");
    } catch {}

    // fallback: جلب src من الفيديو
    if (!finalUrl) {
      finalUrl = await page.evaluate(() => {
        const vid = document.querySelector("video");
        return vid ? vid.src : null;
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

// ===================================================
// 5) DOMAIN ROUTER (Auto detect by hostname)
// ===================================================
export async function getVideoUrl(embedUrl: string) {
  const domain = new URL(embedUrl).hostname;
  console.log("Extracting from:", domain);

  if (domain.includes("4shared.com")) {
    console.log("Using 4shared extractor…");
    return await getDirectVideoUrl(embedUrl);
  }

  if (domain.includes("videa.hu") || domain.includes("video6.videa.hu")) {
    console.log("Using Videa Puppeteer extractor…");
    return await getMp4(embedUrl);
  }

  if (domain.includes("mp4upload")) {
    console.log("Using mp4upload extractor...");
    return await extractMp4FromMp4Upload(embedUrl);
  }

  console.log("Using fallback extractor…");
  return await extractMp4(embedUrl);
}
