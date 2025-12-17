import { getAnilistTitle } from "./mapping";
import puppeteer from "puppeteer";
import puppeteerCore from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import axios from "axios";
import { load } from "cheerio";

export function animeSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[&:]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export const getAnime3rb = async (id: number) => {
  const title = await getAnilistTitle(id);
  if (!title?.romaji) throw new Error("No title");
  let browser;

  if (process.env.IS_LOCAL !== "true") {
    const executablePath = await chromium.executablePath();
    browser = await puppeteerCore.launch({
      executablePath,
      args: chromium.args,
      headless: chromium.headless,
      defaultViewport: chromium.defaultViewport,
    });
  } else {
    browser = await puppeteer.launch({
      headless: "shell",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }

  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
  );

  await page.setExtraHTTPHeaders({
    "accept-language": "ar,en-US;q=0.9,en;q=0.8",
  });

  await page.setViewport({ width: 1400, height: 900 });

  page.on("response", (res) => {
    if (res.url().includes("livewire")) {
      console.log("Livewire:", res.status(), res.url());
    }
  });

  await page.goto("https://anime3rb.com/", {
    waitUntil: "networkidle2",
    timeout: 60000,
  });
  const html = await page.content();
  console.log(html.slice(0, 2000));
  console.log(html.slice(-2000));

  const hasQuery = await page.evaluate(() => {
    return !!document.querySelector("#query");
  });

  if (!hasQuery) {
    throw new Error("Search input #query not found (blocked or not loaded)");
  }

  await page.waitForSelector("#query", { visible: true });

  await page.click("#query");
  await page.focus("#query");

  await page.evaluate(() => {
    const input = document.querySelector("#query") as HTMLInputElement;
    if (input) input.value = "";
  });

  await page.type("#query", title.romaji, { delay: 120 });

  await page.waitForResponse(
    (res) =>
      res.url().includes("livewire") &&
      res.request().method() === "POST" &&
      res.status() === 200,
    { timeout: 10000 }
  );

  await page.waitForFunction(
    () => {
      const el = document.querySelector(".search-results a");
      return el && el.textContent && el.textContent.trim().length > 0;
    },
    { timeout: 10000 }
  );

  const firstResult = await page.evaluate(() => {
    const el = document.querySelector(".search-results a");
    if (!el) return null;
    const match = el.getAttribute("href").match(/\/titles\/([^\/]+)$/);
    const slug = match ? match[1] : null;

    return {
      title: el.textContent?.trim() || null,
      url: el.getAttribute("href"),
      slug: slug,
    };
  });

  await browser.close();
  return firstResult;
};

type Episode = {
  number: number;
  url: string;
  title: string;
};

export const getAnime3rbEpisodes = async (slug: string) => {
  const url = `https://anime3rb.com/titles/${slug}`;

  const { data } = await axios.get(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
  });

  const $ = load(data);

  const episodes: Episode[] = [];

  $(".episodes-list a, a.episode-item, a[href*='/episode/']").each((_, el) => {
    const href = $(el).attr("href");
    const text = $(el).text().trim();

    const match = href.match(/(\d+)(?!.*\d)/);
    if (!href || !match) return;

    episodes.push({
      number: Number(match[1]),
      url: href.startsWith("http") ? href : `https://anime3rb.com${href}`,
      title: text,
    });
  });

  return episodes;
};

export const getEpisodeByNumber = async (
  slug: string,
  episodeNumber: number
) => {
  const episodes = await getAnime3rbEpisodes(slug);
  const ep = episodes.find((e) => e.number === episodeNumber);

  if (!ep) {
    return {
      found: false,
      message: `we can't found ${episodeNumber} ep just ${episodes.length} found`,
    };
  }

  return {
    found: true,
    episode: ep,
  };
};

export const getEpisodeStreams = async (
  episodeUrl: string
): Promise<string> => {
  let browser;

  if (process.env.IS_LOCAL !== "true") {
    const executablePath = await chromium.executablePath();
    browser = await puppeteerCore.launch({
      executablePath,
      args: chromium.args,
      headless: chromium.headless,
      defaultViewport: chromium.defaultViewport,
    });
  } else {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });
  }

  const page = await browser.newPage();

  await page.setViewport({ width: 1280, height: 720 });
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
  );

  return new Promise(async (resolve, reject) => {
    let done = false;

    const cleanup = async () => {
      try {
        page.removeAllListeners();
        await browser.close();
      } catch {}
    };

    page.on("response", async (response) => {
      const url = response.url();
      console.log(url);
      if (!done && /\.mp4\?.*noip=yes$/.test(url)) {
        done = true;
        console.log("Found video URL:", url);
        await cleanup();
        return resolve(url);
      }
    });

    try {
      await page.goto(episodeUrl, { waitUntil: "networkidle2" });
      await page.bringToFront();

      await page.waitForSelector("iframe[src*='video.vid3rb.com']", {
        timeout: 10000,
      });

      const iframeElement = await page.$("iframe[src*='video.vid3rb.com']");

      if (!iframeElement) {
        throw new Error("Iframe not found");
      }

      const iframe = await iframeElement.contentFrame();

      if (iframe) {
        await iframe.evaluate(() => {
          const btn =
            document.querySelector(".vjs-big-play-button") ||
            document.querySelector("button[class*='play']");
          if (btn) (btn as HTMLElement).click();
        });
      } else {
        await page.click("iframe[src*='video.vid3rb.com']");
      }

      setTimeout(async () => {
        if (!done) {
          await cleanup();
          reject(new Error("Video URL not found"));
        }
      }, 15000);
    } catch (err) {
      await cleanup();
      reject(err);
    }
  });
};

// export const savePageHtml = async (
//   episodeUrl: string,
//   filePath = "ttt.html"
// ) => {
//   const browser = await puppeteer.launch({ headless: false });
//   const page = await browser.newPage();

//   await page.setViewport({ width: 1280, height: 720 });
//   await page.setUserAgent(
//     "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
//   );

//   await page.goto(episodeUrl, { waitUntil: "networkidle2" });

//   await page.evaluate(() => {
//     const btn = document.querySelector(
//       ".vjs-big-play-button"
//     ) as HTMLButtonElement;
//     if (btn) btn.click();
//   });

//   await new Promise((resolve) => setTimeout(resolve, 3000));

//   const html = await page.content();
//   fs.writeFileSync(filePath, html, "utf-8");

//   await browser.close();
//   console.log(`✅ Page saved to ${filePath}`);
// };

// // مثال للاستخدام
// (async () => {
//   await savePageHtml(
//     "https://anime3rb.com/episode/nageki-no-bourei-wa-intai-shitai-part-2/1"
//   );
// })();
// const streams = await getEpisodeStreams(
//   "https://anime3rb.com/episode/nageki-no-bourei-wa-intai-shitai-part-2/1"
// );

// console.log("Stream", streams);
// console.log(res);
