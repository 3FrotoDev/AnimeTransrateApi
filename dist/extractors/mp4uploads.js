"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractMp4Uplaods = void 0;
const cheerio_1 = require("cheerio");
function scrapeMp4UploadsVideoData(html) {
    const $ = (0, cheerio_1.load)(html);
    let videoId = '';
    let videoUrl = '';
    let mp4Url = '';
    let posterUrl = '';
    $('script').each((_, element) => {
        const scriptContent = $(element).html() || '';
        if (scriptContent.includes('player.src') && scriptContent.includes('video/mp4')) {
            const mp4Match = scriptContent.match(/src:\s*"([^"]+\.mp4)"/);
            if (mp4Match) {
                mp4Url = mp4Match[1];
            }
            const posterMatch = scriptContent.match(/player\.poster\("([^"]+)"\)/);
            if (posterMatch) {
                posterUrl = posterMatch[1];
            }
            const videoIdMatch = scriptContent.match(/video_id:\s*"([^"]+)"/);
            if (videoIdMatch) {
                videoId = videoIdMatch[1];
            }
            const urlMatch = scriptContent.match(/url:\s*"([^"]+)"/);
            if (urlMatch) {
                videoUrl = urlMatch[1];
            }
        }
    });
    if (!videoId || !mp4Url) {
        return null;
    }
    return {
        videoId,
        videoUrl,
        mp4Url,
        posterUrl
    };
}
const extractMp4Uplaods = async (url) => {
    const res = await fetch(url);
    const text = await res.text();
    const data = scrapeMp4UploadsVideoData(text);
    return data;
};
exports.extractMp4Uplaods = extractMp4Uplaods;
