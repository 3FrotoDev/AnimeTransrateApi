import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";
import axios from "axios";
import { FindBestMatchByTitles } from "./frequency";
import puppeteerCore from "puppeteer-core";
import chromium from "@sparticuz/chromium";

interface AniListTitle {
  romaji?: string;
  english?: string;
  native?: string;
}

const ANILIST_GRAPHQL = `
query($mediaId: Int) {
  Media(id: $mediaId) {
    title {
      romaji
      english
      native
      userPreferred
    }
  }
}
`;

export const getAnilistTitle = async (
  mediaId: number
): Promise<AniListTitle | null> => {
  try {
    const response = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: ANILIST_GRAPHQL,
        variables: { mediaId },
      }),
    });

    const json = await response.json();
    //@ts-ignore
    return json.data?.Media?.title ?? null;
  } catch {
    return null;
  }
};

export async function getWinAnime(id: number) {
  const title = await getAnilistTitle(id);

  if (!title?.romaji) {
    throw new Error("Title not found");
  }

  const encodedTitle = encodeURIComponent(title.romaji);

  const url = `https://witanime.day/?search_param=animes&s=${encodedTitle}`;
  const scrapeUrl = `https://api.scrape.do/?token=33721b3bd63c428e8beb5e358cd7791621a67d2ac45&url=${url}`

  const html = await axios.get(scrapeUrl);
  console.log(JSON.stringify(html.data));

  const $ = cheerio.load(html.data);

  type AnimeCard = {
    title: string;
    url: string;
    image: string;
    status: string;
    type: string;
    description: string;
  };

  const results: AnimeCard[] = [];

  $(".anime-card-container").each((_, el) => {
    const container = $(el);

    const title = container.find(".anime-card-title h3 a").text().trim();

    const url = container.find(".anime-card-title h3 a").attr("href") || "";

    const image = container.find(".anime-card-poster img").attr("src") || "";

    const status = container.find(".anime-card-status a").text().trim();

    const type = container.find(".anime-card-type a").text().trim();

    const description =
      container.find(".anime-card-title").attr("data-content") || "";

    results.push({
      title,
      url,
      image,
      status,
      type,
      description,
    });
  });

  const best = FindBestMatchByTitles(
    {
      native: title.native ?? "",
      romaji: title.romaji ?? "",
      english: title.english ?? "",
    },
    //@ts-ignore
    results
  );

  //@ts-ignore
  return results[best.mostCommonMatchIndex] || ([] as AnimeCard);
}
function decodeBase64(str: string) {
  return Buffer.from(str, "base64").toString("utf-8");
}

type Episode = {
  number: number;
  url: string;
};

type EpisodesResponse = {
  episodes: Episode[];
  page: number;
  perPage: number;
  totalPages: number;
  totalEpisodes: number;
};

export function parseEpisodesFromScript(
  html: string,
  page = 1,
  perPage = 50
): EpisodesResponse {
  const $ = cheerio.load(html);

  let encoded = "";

  $("script").each((_, el) => {
    const text = $(el).html() || "";
    if (text.includes("encodedEpisodeData")) {
      const match = text.match(/encodedEpisodeData\s*=\s*'([^']+)'/);
      //@ts-ignore
      if (match) encoded = match[1];
    }
  });

  if (!encoded) {
    return {
      episodes: [],
      page: 0,
      perPage,
      totalPages: 0,
      totalEpisodes: 0,
    };
  }

  const decoded = decodeBase64(encoded);
  const parsed = JSON.parse(decoded);

  const allEpisodes: Episode[] = parsed.map((ep: any) => ({
    number: Number(ep.number),
    url: ep.url,
  }));

  const totalEpisodes = allEpisodes.length;
  const totalPages = Math.ceil(totalEpisodes / perPage);
  const safePage = Math.min(Math.max(page, 1), totalPages);

  const start = (safePage - 1) * perPage;
  const end = start + perPage;

  return {
    episodes: allEpisodes.slice(start, end),
    page: safePage,
    perPage,
    totalPages,
    totalEpisodes,
  };
}

export async function getEpisodesByNumbers(url: string, numbers: number[]) {
  const scrapeUrl = `https://api.scrape.do/?token=33721b3bd63c428e8beb5e358cd7791621a67d2ac45&url=${url}`
  const res = await axios.get(scrapeUrl);
  const html = res.data;
  const $ = cheerio.load(html);

  let encoded = "";

  $("script").each((_, el) => {
    const text = $(el).html() || "";
    const match = text.match(/encodedEpisodeData\s*=\s*'([^']+)'/);
    //@ts-ignore
    if (match) encoded = match[1];
  });

  if (!encoded) return [];

  const decoded = Buffer.from(encoded, "base64").toString("utf-8");
  const episodes = JSON.parse(decoded);

  return episodes.filter((ep: any) => numbers.includes(Number(ep.number)));
}

export async function getEpisodeStream(url: string) {
  let browser;
  if (process.env.IS_LOCAL !== "true") {
    const executablePath = await chromium.executablePath();
    browser = await puppeteerCore.launch({
      executablePath,
      args: chromium.args,
      //@ts-ignore
      headless: chromium.headless,
      //@ts-ignore
      defaultViewport: chromium.defaultViewport,
    });
  } else {
    browser = await puppeteer.launch({
      //@ts-ignore
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }


  const page = await browser.newPage();

  await page.goto(url, { waitUntil: "networkidle2" });

  await page.waitForSelector(".server-link");

  await page.evaluate(() => {
    //@ts-ignore
    const servers = Array.from(document.querySelectorAll(".server-link"));
    //@ts-ignore
    const target = servers.find((el) => el.textContent?.includes("yonaplay"));
    //@ts-ignore
    target?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  await page.waitForSelector("#iframe-container iframe", { timeout: 15000 });

  const iframeHandle = await page.$("#iframe-container iframe");
  if (!iframeHandle) {
    throw new Error("Yonaplay iframe not found");
  }

  console.log("✅ Yonaplay iframe found");

  const frame = await iframeHandle.contentFrame();
  if (!frame) {
    throw new Error("frame is null");
  }

  console.log("✅ frame context loaded");

  await frame.waitForSelector(".OptionsLangDisp li", { timeout: 15000 });

  const html = await frame.content();

  fs.writeFileSync(
    path.join(process.cwd(), "iframe_snapshot.html"),
    html,
    "utf-8"
  );

  const $ = cheerio.load(html);

  const servers: {
    name: string;
    quality: string;
    encodedUrl: string | null;
  }[] = [];

  $(".OptionsLangDisp li").each((_, el) => {
    const name = $(el).find("span").text().trim();
    const quality = $(el).find("p").text().trim();
    const onclick = $(el).attr("onclick") || "";
    const match = onclick.match(/go_to_player\('(.+?)'\)/);

    servers.push({
      name,
      quality,
      //@ts-ignore
      encodedUrl: match ? match[1] : null,
      //@ts-ignore
      url: Buffer.from(match ? match[1] : null, "base64").toString("utf-8"),
    });
  });

  await browser.close();

  return servers.length > 0 ? servers : [];
}

export async function getEpisodeVideaStream(url: string) {
  const blockedAds = [
    "doubleclick.net",
    "googlesyndication.com",
    "imasdk.googleapis.com",
  ];

  const startTime = performance.now();

  let resolveFinal!: (data: { url: string; timeMs: number }) => void;
  let finished = false;

  const finalPromise = new Promise<{ url: string; timeMs: number }>(
    (resolve) => {
      resolveFinal = resolve;
    }
  );

  let browser;
  if (process.env.IS_LOCAL !== "true") {
    const executablePath = await chromium.executablePath();
    browser = await puppeteerCore.launch({
      executablePath,
      args: chromium.args,
      //@ts-ignore
      headless: chromium.headless,
      //@ts-ignore
      defaultViewport: chromium.defaultViewport,
    });
  } else {
    browser = await puppeteer.launch({
      //@ts-ignore
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }


  const page = await browser.newPage();

  await page.setRequestInterception(true);

  page.on("request", async (req) => {
    const u = req.url();

    if (blockedAds.some((d) => u.includes(d))) {
      return req.abort();
    }

    // 🎯 DIRECT VIDEA VIDEO
    if (!finished && /videa\.hu\/static\/[a-z]*\d+p\//i.test(u)) {
      finished = true;

      const timeMs = Math.round(performance.now() - startTime);

      console.log(timeMs, "ms");

      resolveFinal({ url: u, timeMs });

      await browser.close();
      return;
    }

    req.continue();
  });

  await page.goto(url, { waitUntil: "domcontentloaded" });

  await page.waitForSelector(".server-link");

  await page.evaluate(() => {
    const videa = Array.from(
      //@ts-ignore
      document.querySelectorAll<HTMLAnchorElement>(".server-link")
      //@ts-ignore
    ).find((el) => el.textContent?.toLowerCase().includes("videa"));
    //@ts-ignore
    videa?.click();
  });

  // 🛑 fallback timeout
  const result = await Promise.race([
    finalPromise,
    new Promise<null>((res) => setTimeout(() => res(null), 10000)),
  ]);

  if (!result) {
    await browser.close();
    return null;
  }

  return result;
}

// export async function idl(url: string) {

//   const browser = await puppeteer.launch({ headless: false });
//   const page = await browser.newPage();

//   await page.goto("https://drive.usercontent.google.com/download?id=1kG9QKbabFoXKgtPIl_dwO3fokn_KD-pj&export=download&authuser=0", {
//     waitUntil: "networkidle2",
//   });

//   await page.waitForSelector("#uc-download-link", { timeout: 10000 });
//   await page.click("#uc-download-link");

//   page.on("response", async (res) => {
//     const url = res.url();
//     if (url.includes("googleusercontent.com")) {
//       console.log("Direct video URL:", url);
//     }
//   });
// }

// idl("https://drive.google.com/uc?id=1kG9QKbabFoXKgtPIl_dwO3fokn_KD-pj")

// import { File } from "megajs";

// async function extractMega(url: string) {
//   const normalized = normalizeMegaUrl(url);

//   const file = File.fromURL(normalized);

//   await file.loadAttributes();

//   return {
//     provider: "mega",
//     id: file.id,
//     name: file.name,
//     size: file.size,
//     mime: file.type,
//     downloadable: true,

//     // stream or download
//     getStream: () => file.download()
//   };
// }

// function normalizeMegaUrl(url: string) {
//   if (url.includes("/embed/")) {
//     return url.replace("/embed/", "/file/");
//   }
//   return url;
// }
// const data = await extractMega(
//   "https://mega.nz/embed/joYDyYRB#WWQXelIm0JZRbhEVzRnGgwdz0c5Io6_A3ykXgcUHcSo"
// );

// console.log(data.name);
// console.log(data.size);

// const stream = data.getStream();
// // pipe to fs / response
// console.log(stream)
