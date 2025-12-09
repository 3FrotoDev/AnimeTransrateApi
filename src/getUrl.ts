import axios from "axios";
import { load } from "cheerio";
import puppeteer from "puppeteer";

export async function extractMp4(embedUrl:string) {
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
  } catch (err:any) {
    console.log("extractMp4 error:", err.message);
    return null;
  }
}

export async function getDirectVideoUrl(embedUrl:string) {
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
  } catch (err:any) {
    console.log("getDirectVideoUrl error:", err.message);
    return null;
  }
}


export async function getMp4(embedUrl:string) {
  let finalUrl = null;
  const blockedAdsDomains = [
    "cdn.nwmgroups.hu",
    "googleapis.com",
    "doubleclick.net",
    "gahu.hit.gemius.pl",
    "imasdk.googleapis.com",
  ];

  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox"],
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

    // catch mp4
    page.on("response", (res) => {
      const url = res.url();
      if (
        url.includes(".mp4") &&
        !blockedAdsDomains.some((d) => url.includes(d))
      ) {
        //@ts-ignore
        finalUrl = url;
      }
    });

    await page.goto(embedUrl, { waitUntil: "networkidle2", timeout: 60000 });

    try {
      await page.click(".vjs-big-play-button");
    } catch {}

    await new Promise((res) => setTimeout(res, 15000));

    if (!finalUrl) {
      //@ts-ignore
      finalUrl = await page.evaluate(() => {
        //@ts-ignore
        const vid = document.querySelector("video");
        return vid ? vid.src : null;
      });
    }

    await browser.close();
    return finalUrl;
  } catch (err:any) {
    console.log("Error:", err.message);
    return null;
  }
}

export async function extractMp4FromMp4Upload(embedUrl:string) {
    const { data } = await axios.get(embedUrl, {
      headers: { "User-Agent": "Mozilla/5.0" }
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
  }

export async function getVideoUrl(embedUrl:string) {
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

  if (domain.includes("mp4upload")){
    console.log("Using mp4upload extractor...")
    return await extractMp4FromMp4Upload(embedUrl)
  }
  console.log("Using fallback extractor…");
  return await extractMp4(embedUrl);
}

// async function test() {
//   const url1 = "https://www.4shared.com/web/embed/file/zWWEm5lWfa";
//   const url2 = "https://videa.hu/player?v=CyxIUCUdcY38e1mQ";
//   const url3 = "https://www.mp4upload.com/embed-dwwcjb56c65w.html"

//   console.log("4SHARED RESULT:");
//   console.log(await getVideoUrl(url1));

//   console.log("VIDEA RESULT:");
//   console.log(await getVideoUrl(url2));

//   console.log("MP4UPLOAD RESULT:");
//   console.log(await getVideoUrl(url3));
// }

// test();
