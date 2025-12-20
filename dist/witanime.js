"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAnilistTitle = void 0;
exports.getWinAnime = getWinAnime;
exports.parseEpisodesFromScript = parseEpisodesFromScript;
exports.getEpisodesByNumbers = getEpisodesByNumbers;
exports.getEpisodeStream = getEpisodeStream;
exports.getEpisodeVideaStream = getEpisodeVideaStream;
const puppeteer_1 = __importDefault(require("puppeteer"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const cheerio = __importStar(require("cheerio"));
const axios_1 = __importDefault(require("axios"));
const frequency_1 = require("./frequency");
const puppeteer_core_1 = __importDefault(require("puppeteer-core"));
const puppeteer_real_browser_1 = require("puppeteer-real-browser");
const chromium_min_1 = __importDefault(require("@sparticuz/chromium-min"));
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
const getAnilistTitle = async (mediaId) => {
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
    }
    catch {
        return null;
    }
};
exports.getAnilistTitle = getAnilistTitle;
async function getWinAnime(id) {
    const title = await (0, exports.getAnilistTitle)(id);
    if (!title?.romaji) {
        throw new Error("Title not found");
    }
    const encodedTitle = encodeURIComponent(title.romaji);
    const url = `https://witanime.day/?search_param=animes&s=${encodedTitle}`;
    const scrapeUrl = `https://api.scrape.do/?token=33721b3bd63c428e8beb5e358cd7791621a67d2ac45&url=${url}`;
    const html = await axios_1.default.get(scrapeUrl);
    console.log(JSON.stringify(html.data));
    const $ = cheerio.load(html.data);
    const results = [];
    $(".anime-card-container").each((_, el) => {
        const container = $(el);
        const title = container.find(".anime-card-title h3 a").text().trim();
        const url = container.find(".anime-card-title h3 a").attr("href") || "";
        const image = container.find(".anime-card-poster img").attr("src") || "";
        const status = container.find(".anime-card-status a").text().trim();
        const type = container.find(".anime-card-type a").text().trim();
        const description = container.find(".anime-card-title").attr("data-content") || "";
        results.push({
            title,
            url,
            image,
            status,
            type,
            description,
        });
    });
    const best = (0, frequency_1.FindBestMatchByTitles)({
        native: title.native ?? "",
        romaji: title.romaji ?? "",
        english: title.english ?? "",
    }, 
    //@ts-ignore
    results);
    //@ts-ignore
    return results[best.mostCommonMatchIndex] || [];
}
function decodeBase64(str) {
    return Buffer.from(str, "base64").toString("utf-8");
}
function parseEpisodesFromScript(html, page = 1, perPage = 50) {
    const $ = cheerio.load(html);
    let encoded = "";
    $("script").each((_, el) => {
        const text = $(el).html() || "";
        if (text.includes("encodedEpisodeData")) {
            const match = text.match(/encodedEpisodeData\s*=\s*'([^']+)'/);
            //@ts-ignore
            if (match)
                encoded = match[1];
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
    const allEpisodes = parsed.map((ep) => ({
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
async function getEpisodesByNumbers(url, numbers) {
    const scrapeUrl = `https://api.scrape.do/?token=33721b3bd63c428e8beb5e358cd7791621a67d2ac45&url=${url}`;
    const res = await axios_1.default.get(scrapeUrl);
    const html = res.data;
    const $ = cheerio.load(html);
    let encoded = "";
    $("script").each((_, el) => {
        const text = $(el).html() || "";
        const match = text.match(/encodedEpisodeData\s*=\s*'([^']+)'/);
        //@ts-ignore
        if (match)
            encoded = match[1];
    });
    if (!encoded)
        return [];
    const decoded = Buffer.from(encoded, "base64").toString("utf-8");
    const episodes = JSON.parse(decoded);
    return episodes.filter((ep) => numbers.includes(Number(ep.number)));
}
async function getEpisodeStream(url) {
    let browser;
    if (process.env.IS_LOCAL !== "true") {
        const executablePath = await chromium_min_1.default.executablePath();
        browser = await puppeteer_core_1.default.launch({
            executablePath,
            args: chromium_min_1.default.args,
            //@ts-ignore
            headless: chromium_min_1.default.headless,
            //@ts-ignore
            defaultViewport: chromium_min_1.default.defaultViewport,
        });
    }
    else {
        browser = await puppeteer_1.default.launch({
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
    fs_1.default.writeFileSync(path_1.default.join(process.cwd(), "iframe_snapshot.html"), html, "utf-8");
    const $ = cheerio.load(html);
    const servers = [];
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
const CHROMIUM_PACK_URL = "https://github.com/gabenunez/puppeteer-on-vercel/raw/refs/heads/main/example/chromium-dont-use-in-prod.tar";
let cachedExecutablePath = null;
let downloadPromise = null;
async function getChromiumPath() {
    if (cachedExecutablePath)
        return cachedExecutablePath;
    if (!downloadPromise) {
        const chromium = (await Promise.resolve().then(() => __importStar(require("@sparticuz/chromium-min")))).default;
        downloadPromise = chromium
            .executablePath(CHROMIUM_PACK_URL)
            .then((p) => {
            cachedExecutablePath = p;
            console.log("Chromium path resolved:", p);
            return p;
        })
            .catch((err) => {
            console.error("Failed to get Chromium path:", err);
            downloadPromise = null;
            throw err;
        });
    }
    return downloadPromise;
}
async function getEpisodeVideaStream(url1) {
    const url = url1;
    const blockedAds = [
        "doubleclick.net",
        "googlesyndication.com",
        "imasdk.googleapis.com",
    ];
    const startTime = performance.now();
    let resolveFinal;
    let finished = false;
    const finalPromise = new Promise((resolve) => {
        resolveFinal = resolve;
    });
    const execPath = await getChromiumPath();
    const { browser, page } = await (0, puppeteer_real_browser_1.connect)({
        headless: true,
        args: [],
        customConfig: {
            chromePath: execPath,
        },
        turnstile: true,
    });
    await page.setRequestInterception(true);
    page.on("request", async (req) => {
        const u = req.url();
        if (blockedAds.some((d) => u.includes(d))) {
            return req.abort();
        }
        if (!finished && /videa\.hu\/static\/[a-z]*\d+p\//i.test(u)) {
            finished = true;
            const timeMs = Math.round(performance.now() - startTime);
            resolveFinal({ url: u, timeMs });
            await browser.close();
            return;
        }
        req.continue();
    });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".server-link");
    const videa = await page.$$(".server-link");
    let btn = null;
    for (const el of videa) {
        const text = await el.evaluate((el) => el.textContent?.toLowerCase().trim());
        if (text && text.includes("videa")) {
            btn = el;
            break;
        }
    }
    if (btn)
        await btn.click();
    const html = await page.content();
    fs_1.default.writeFileSync(path_1.default.join(process.cwd(), "iframe_snapshot.html"), html, "utf-8");
    const result = await Promise.race([
        finalPromise,
        new Promise((res) => setTimeout(() => res(null), 10000)),
    ]);
    if (!result)
        await browser.close();
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
