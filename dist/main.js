"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkVideo = checkVideo;
exports.filterWorkingLinks = filterWorkingLinks;
exports.groupLinks = groupLinks;
exports.getEpisodeStreaming = getEpisodeStreaming;
const mapping_1 = require("./mapping");
const scraper_1 = require("./scraper");
const axios_1 = __importDefault(require("axios"));
async function checkVideo(url) {
    try {
        const headRes = await axios_1.default.head(url, {
            timeout: 8000,
            validateStatus: () => true,
            headers: { "User-Agent": "Mozilla/5.0" },
        });
        if (headRes.status >= 400)
            return false;
        return true;
    }
    catch {
        try {
            const res = await axios_1.default.get(url, {
                timeout: 10000,
                headers: { "User-Agent": "Mozilla/5.0" },
            });
            const html = res.data?.toLowerCase() || "";
            const errorPatterns = [
                "not found",
                "file was deleted",
                "file not found",
                "video unavailable",
                "removed",
                "error loading",
                "we're sorry",
                "404",
                "this video doesn",
                "the file you are looking for",
            ];
            return !errorPatterns.some((e) => html.includes(e));
        }
        catch {
            return false;
        }
    }
}
async function filterWorkingLinks(links) {
    const results = await Promise.all(links.map(async (link) => {
        if (!link.url)
            return null;
        const ok = await checkVideo(link.url);
        return ok ? link : null;
    }));
    return results.filter((x) => x !== null);
}
function groupLinks(links) {
    const allowedTypes = ["mp4upload", "videa", "4shared"];
    const result = [];
    for (const type of allowedTypes) {
        const typeLinks = links.filter((l) => l.type?.toLowerCase() === type && l.url);
        if (typeLinks.length === 0)
            continue;
        const qualities = {};
        for (const link of typeLinks) {
            const q = link.quality || "UNKNOWN";
            if (!qualities[q])
                qualities[q] = [];
            qualities[q].push({ ...link });
        }
        result.push({ type, qualities });
    }
    return result;
}
async function getEpisodeStreaming(anilistId, ep) {
    const anime = await (0, mapping_1.getAnime)(anilistId);
    //@ts-ignore
    const animeId = anime.animeId ?? undefined;
    if (!animeId) {
        return {
            animeId: null,
            servers: [],
        };
    }
    const episodeServers = await (0, scraper_1.getEpisodeServers)(animeId, ep);
    const workingLinks = await filterWorkingLinks(episodeServers);
    const grouped = groupLinks(workingLinks);
    return {
        animeId,
        servers: grouped,
    };
}
