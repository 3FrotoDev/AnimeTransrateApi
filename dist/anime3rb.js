"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEpisodeStreams = exports.getEpisodeByNumber = exports.getAnime3rbEpisodes = exports.getAnime3rb = void 0;
exports.animeSlug = animeSlug;
const mapping_1 = require("./mapping");
const puppeteer_1 = __importDefault(require("puppeteer"));
const puppeteer_core_1 = __importDefault(require("puppeteer-core"));
const chromium_1 = __importDefault(require("@sparticuz/chromium"));
const axios_1 = __importDefault(require("axios"));
const cheerio_1 = require("cheerio");
const puppeteer_extra_1 = require("puppeteer-extra");
const puppeteer_extra_plugin_stealth_1 = __importDefault(require("puppeteer-extra-plugin-stealth"));
const puppeteer_real_browser_1 = require("puppeteer-real-browser");
function animeSlug(name) {
    return name
        .toLowerCase()
        .replace(/[&:]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}
const puppeteerExtra = (0, puppeteer_extra_1.addExtra)(puppeteer_core_1.default);
puppeteerExtra.use((0, puppeteer_extra_plugin_stealth_1.default)());
const PROXY_LIST = [
    "142.111.48.253:7030:fbfvjlgx:fega5qqtnlgd",
    "31.59.20.176:6754:fbfvjlgx:fega5qqtnlgd",
    "23.95.150.145:6114:fbfvjlgx:fega5qqtnlgd",
    "198.23.239.134:6540:fbfvjlgx:fega5qqtnlgd",
    "107.172.163.27:6543:fbfvjlgx:fega5qqtnlgd",
    "198.105.121.200:6462:fbfvjlgx:fega5qqtnlgd",
    "64.137.96.74:6641:fbfvjlgx:fega5qqtnlgd",
    "84.247.60.125:6095:fbfvjlgx:fega5qqtnlgd",
    "216.10.27.159:6837:fbfvjlgx:fega5qqtnlgd",
    "142.111.67.146:5611:fbfvjlgx:fega5qqtnlgd",
];
const getRandomProxy = () => {
    const proxy = PROXY_LIST[Math.floor(Math.random() * PROXY_LIST.length)];
    const [ip, port, username, password] = proxy.split(":");
    return {
        server: `http://${ip}:${port}`,
        username,
        password,
    };
};
const getAnime3rb = async (id) => {
    const title = await (0, mapping_1.getAnilistTitle)(id);
    if (!title?.romaji)
        throw new Error("No title");
    const { browser, page } = await (0, puppeteer_real_browser_1.connect)({
        headless: false,
        args: [],
        customConfig: {},
        turnstile: true,
        connectOption: {},
        disableXvfb: false,
        ignoreAllFlags: false,
        // proxy:{
        //     host:'<proxy-host>',
        //     port:'<proxy-port>',
        //     username:'<proxy-username>',
        //     password:'<proxy-password>'
        // }
    });
    try {
        const page = await browser.newPage();
        // إعدادات إضافية للتخفي
        await page.setExtraHTTPHeaders({
            "accept-language": "en-US,en;q=0.9,ar;q=0.8",
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
        });
        await page.setViewport({ width: 1366, height: 768 });
        // الذهاب للموقع
        console.log(`Navigating to anime3rb for: ${title.romaji}`);
        await page.goto("https://anime3rb.com/", {
            waitUntil: "networkidle2",
            timeout: 60000,
        });
        // التحقق من وجود مربع البحث
        const hasQuery = await page.$("#query");
        if (!hasQuery) {
            // طباعة المحتوى في حالة الخطأ لفهم السبب (كلاودفلير مثلا)
            const content = await page.content();
            console.log("Blocked or Error. HTML Snippet:", content.slice(0, 500));
            throw new Error("Search input #query not found (likely Cloudflare blocked)");
        }
        // الكتابة في البحث
        await page.click("#query");
        // تفريغ الحقل بطريقة آمنة
        await page.evaluate(() => {
            const input = document.querySelector("#query");
            if (input)
                input.value = '';
        });
        await page.type("#query", title.romaji, { delay: 150 }); // زيادة التأخير قليلاً ليبدو بشرياً
        // انتظار استجابة Livewire
        await page.waitForResponse((res) => res.url().includes("livewire") &&
            res.request().method() === "POST" &&
            res.status() === 200, { timeout: 15000 });
        // انتظار ظهور النتائج في DOM
        await page.waitForFunction(() => {
            const el = document.querySelector(".search-results a");
            return el && el.textContent && el.textContent.trim().length > 0;
        }, { timeout: 10000 });
        // استخراج النتيجة
        const firstResult = await page.evaluate(() => {
            const el = document.querySelector(".search-results a");
            if (!el)
                return null;
            const href = el.getAttribute("href") || "";
            const match = href.match(/\/titles\/([^\/]+)$/);
            const slug = match ? match[1] : null;
            return {
                title: el.textContent?.trim() || null,
                url: href,
                slug: slug,
            };
        });
        console.log("Result found:", firstResult);
        return firstResult;
    }
    catch (error) {
        console.error("Error in scraping:", error);
        throw error;
    }
    finally {
        if (browser) {
            await browser.close();
        }
    }
};
exports.getAnime3rb = getAnime3rb;
const getAnime3rbEpisodes = async (slug) => {
    const url = `https://anime3rb.com/titles/${slug}`;
    const { data } = await axios_1.default.get(url, {
        headers: {
            "User-Agent": "Mozilla/5.0",
        },
    });
    const $ = (0, cheerio_1.load)(data);
    const episodes = [];
    $(".episodes-list a, a.episode-item, a[href*='/episode/']").each((_, el) => {
        const href = $(el).attr("href");
        const text = $(el).text().trim();
        const match = href.match(/(\d+)(?!.*\d)/);
        if (!href || !match)
            return;
        episodes.push({
            number: Number(match[1]),
            url: href.startsWith("http") ? href : `https://anime3rb.com${href}`,
            title: text,
        });
    });
    return episodes;
};
exports.getAnime3rbEpisodes = getAnime3rbEpisodes;
const getEpisodeByNumber = async (slug, episodeNumber) => {
    const episodes = await (0, exports.getAnime3rbEpisodes)(slug);
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
exports.getEpisodeByNumber = getEpisodeByNumber;
const getEpisodeStreams = async (episodeUrl) => {
    let browser;
    if (process.env.IS_LOCAL !== "true") {
        const executablePath = await chromium_1.default.executablePath();
        browser = await puppeteer_core_1.default.launch({
            executablePath,
            args: chromium_1.default.args,
            headless: chromium_1.default.headless,
            defaultViewport: chromium_1.default.defaultViewport,
        });
    }
    else {
        browser = await puppeteer_1.default.launch({
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
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36");
    return new Promise(async (resolve, reject) => {
        let done = false;
        const cleanup = async () => {
            try {
                page.removeAllListeners();
                await browser.close();
            }
            catch { }
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
                    const btn = document.querySelector(".vjs-big-play-button") ||
                        document.querySelector("button[class*='play']");
                    if (btn)
                        btn.click();
                });
            }
            else {
                await page.click("iframe[src*='video.vid3rb.com']");
            }
            setTimeout(async () => {
                if (!done) {
                    await cleanup();
                    reject(new Error("Video URL not found"));
                }
            }, 15000);
        }
        catch (err) {
            await cleanup();
            reject(err);
        }
    });
};
exports.getEpisodeStreams = getEpisodeStreams;
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
