"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAnime = exports.getAnilistTitle = exports.getSearch = void 0;
const cheerio_1 = require("cheerio");
const frequency_1 = require("./frequency");
function scrapeSiteSearch(html) {
    const $ = (0, cheerio_1.load)(html);
    const results = [];
    $("article.bs.dd1").each((i, el) => {
        const root = $(el).find(".bsx").first();
        const a = root.find("a").first();
        const link = a.attr("href") || "";
        const image = root.find(".limit img").attr("src") || "";
        const title = root.find(".tt h2").text().trim() ||
            root.find(".tt").clone().children().remove().end().text().trim();
        let animeId = "";
        const m = link.match(/\/anime\/([^/]+)\//);
        //@ts-ignore
        if (m)
            animeId = m[1];
        if (title && link) {
            results.push({
                title,
                link,
                imageUrl: image,
                animeId,
            });
        }
    });
    return results;
}
function scrapeAnimeFromJson(jsonString) {
    try {
        const parsed = JSON.parse(jsonString);
        const scrapedData = [];
        if (!parsed || !parsed.anime)
            return [];
        for (const animeGroup of parsed.anime) {
            const template = animeGroup.template || "";
            for (const item of animeGroup.all || []) {
                let html = template
                    .replace("{post_link}", item.post_link || "")
                    .replace("{post_image_html}", item.post_image_html || "")
                    .replace("{post_title}", item.post_title || "")
                    .replace("{post_type}", item.post_type || "")
                    .replace("{post_latest}", item.post_latest || "")
                    .replace("{post_sub}", item.post_sub || "")
                    .replace("{post_genres}", item.post_genres || "");
                const $ = (0, cheerio_1.load)(html);
                const link = $("a").attr("href") || "";
                const imageUrl = $(".ts-post-image").attr("src") || $("img").attr("src") || "";
                const title = $(".autotitle").text().trim() || $("a").text().trim();
                let animeId = "";
                const match = link.match(/\/anime\/([^/]+)\//);
                //@ts-ignore
                if (match)
                    animeId = match[1];
                const genresText = $(".post-meta").text().trim() || "";
                const genres = genresText
                    .split(",")
                    .map((g) => g.trim())
                    .filter(Boolean);
                scrapedData.push({
                    id: item.ID,
                    title,
                    imageUrl,
                    link,
                    animeId,
                    genres,
                    type: item.post_type,
                    latestEpisode: item.post_latest,
                    subtitle: item.post_sub,
                });
            }
        }
        return scrapedData;
    }
    catch {
        return [];
    }
}
const getSearch = async (query) => {
    try {
        const payload = {
            action: "ts_ac_do_search",
            ts_ac_query: `${query}`,
        };
        const formBody = Object.entries(payload)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
            .join("&");
        const res = await fetch("https://animeslayerweb.com/wp-admin/admin-ajax.php", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "X-Requested-With": "XMLHttpRequest",
            },
            body: formBody,
        });
        const text = await res.text();
        const data = scrapeAnimeFromJson(text);
        if (data.length > 0)
            return data;
    }
    catch (e) { }
    try {
        const url = `https://animeslayerweb.com/?s=${encodeURIComponent(query)}`;
        const page = await fetch(url);
        const html = await page.text();
        return scrapeSiteSearch(html);
    }
    catch (e) {
        return [];
    }
};
exports.getSearch = getSearch;
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
const getAnime = async (id) => {
    const title = await (0, exports.getAnilistTitle)(id);
    if (!title)
        throw new Error("Title not found.");
    const preferred = title.romaji || title.english;
    const query = preferred.slice(0, 60);
    console.log("Searching:", preferred, "→", query);
    const searchResults = await (0, exports.getSearch)(query);
    const adapted = searchResults.map((r) => ({
        title: r.title,
        link: r.link,
        imageUrl: r.imageUrl,
    }));
    const best = (0, frequency_1.FindBestMatchByTitles)({
        native: title.native ?? "",
        romaji: title.romaji ?? "",
        english: title.english ?? "",
    }, adapted);
    console.log(adapted);
    //@ts-ignore
    return searchResults[best.mostCommonMatchIndex] || [];
};
exports.getAnime = getAnime;
