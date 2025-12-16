"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractMp4 = extractMp4;
exports.getDirectVideoUrl = getDirectVideoUrl;
exports.getMp4 = getMp4;
exports.extractMp4FromMp4Upload = extractMp4FromMp4Upload;
exports.getVideaHighestQuality = getVideaHighestQuality;
exports.getVideoUrl = getVideoUrl;
const axios_1 = __importDefault(require("axios"));
const cheerio_1 = require("cheerio");
const puppeteer_1 = __importDefault(require("puppeteer"));
const puppeteer_core_1 = __importDefault(require("puppeteer-core"));
const chromium_1 = __importDefault(require("@sparticuz/chromium"));
// ===================================================
// 1) Basic HTML Scraper
// ===================================================
async function extractMp4(embedUrl) {
    try {
        const { data } = await axios_1.default.get(embedUrl, {
            headers: { "User-Agent": "Mozilla/5.0" },
        });
        const $ = (0, cheerio_1.load)(data);
        let mp4 = $("video").attr("src");
        if (mp4)
            return mp4;
        mp4 = $("source").attr("src");
        if (mp4)
            return mp4;
        return null;
    }
    catch (err) {
        console.log("extractMp4 error:", err.message);
        return null;
    }
}
// ===================================================
// 2) 4shared extractor
// ===================================================
async function getDirectVideoUrl(embedUrl) {
    try {
        const { data } = await axios_1.default.get(embedUrl, {
            headers: { "User-Agent": "Mozilla/5.0" },
        });
        const $ = (0, cheerio_1.load)(data);
        const mp4 = $("source").attr("src");
        if (mp4)
            return mp4;
        const scripts = $("script").toArray();
        for (const script of scripts) {
            const content = $(script).html();
            if (!content)
                continue;
            const match = content.match(/https?:\/\/[^"']+\.mp4/);
            if (match)
                return match[0];
        }
        return null;
    }
    catch (err) {
        console.log("getDirectVideoUrl error:", err.message);
        return null;
    }
}
// ===================================================
// 3) Videa.hu extractor (Puppeteer - Vercel compatible)
// ===================================================
async function getMp4(embedUrl) {
    let finalUrl = null;
    const blockedAdsDomains = [
        "googleapis.com",
        "doubleclick.net",
        "imasdk.googleapis.com",
    ];
    try {
        let browser;
        if (process.env.VERCEL_ENV === 'production') {
            const executablePath = await chromium_1.default.executablePath();
            browser = await puppeteer_core_1.default.launch({
                executablePath,
                args: chromium_1.default.args,
                headless: chromium_1.default.headless,
                defaultViewport: chromium_1.default.defaultViewport
            });
        }
        else {
            browser = await puppeteer_1.default.launch({
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
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
        }
        catch { }
        // Fallback: get video src
        if (!finalUrl) {
            finalUrl = await page.evaluate(() => {
                const vid = document.querySelector("video");
                return vid?.src ?? null;
            });
        }
        await browser.close();
        return finalUrl;
    }
    catch (err) {
        console.log("getMp4 error:", err.message);
        return null;
    }
}
// ===================================================
// 4) mp4upload extractor
// ===================================================
async function extractMp4FromMp4Upload(embedUrl) {
    try {
        const { data } = await axios_1.default.get(embedUrl, {
            headers: { "User-Agent": "Mozilla/5.0" },
        });
        const $ = (0, cheerio_1.load)(data);
        const vid = $("video").attr("src");
        if (vid)
            return vid;
        const scripts = $("script").toArray();
        for (const s of scripts) {
            const content = $(s).html();
            if (!content)
                continue;
            const match = content.match(/https?:\/\/[^"']+\.mp4/);
            if (match)
                return match[0];
        }
        return null;
    }
    catch (err) {
        console.log("extractMp4FromMp4Upload error:", err.message);
        return null;
    }
}
async function getVideaHighestQuality(url) {
    let finalUrl = null;
    const blockedAds = [
        "doubleclick.net",
        "googlesyndication.com",
        "imasdk.googleapis.com",
    ];
    let browser;
    if (process.env.IS_LOCAL !== 'true') {
        const executablePath = await chromium_1.default.executablePath();
        browser = await puppeteer_core_1.default.launch({
            executablePath,
            args: chromium_1.default.args,
            headless: chromium_1.default.headless,
            defaultViewport: chromium_1.default.defaultViewport
        });
    }
    else {
        browser = await puppeteer_1.default.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
    }
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (req) => {
        const u = req.url();
        if (blockedAds.some((d) => u.includes(d)))
            return req.abort();
        req.continue();
    });
    await page.goto(url, { waitUntil: "networkidle2" });
    try {
        await page.click(".videa-toolbar-settings");
        await page.waitForSelector(".settings-main-menu", { visible: true });
    }
    catch {
        console.log("Failed to open settings menu");
    }
    try {
        const items = await page.$$(".settings-main-menu-item");
        await items[0].click();
        await page.waitForSelector(".settings-version-selector-block .submenu-item", {
            visible: true,
        });
    }
    catch {
        console.log("Failed to open quality submenu");
    }
    const qualities = await page.$$eval(".settings-version-selector-block .submenu-item", (els) => els.map((e) => e.innerText.trim()));
    console.log("Available qualities:", qualities);
    try {
        await page.click(".settings-version-selector-block .submenu-item");
    }
    catch {
        console.log("Quality selection failed");
    }
    try {
        await page.click(".videa-toolbar-playpause").catch(() => { });
    }
    catch {
        console.log("asd");
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
async function getVideoUrl(embedUrl) {
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
