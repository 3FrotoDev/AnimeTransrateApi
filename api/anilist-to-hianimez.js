const axios = require("axios");
const cheerio = require("cheerio");

function toKebabCase(str) {
  return str
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function getAnimeInfoFromAniList(animeId) {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        siteUrl
        title { romaji english native userPreferred }
        format
        status
        episodes
        season
        seasonYear
        averageScore
        genres
        bannerImage
        coverImage { medium large extraLarge color }
        description(asHtml: false)
      }
    }
  `;
  const { data } = await axios.post("https://graphql.anilist.co", {
    query,
    variables: { id: animeId },
  });

  const media = data?.data?.Media;
  if (!media) return null;

  return {
    id: media.id,
    siteUrl: media.siteUrl,
    title: media.title,
    format: media.format,
    status: media.status,
    episodes: media.episodes,
    season: media.season,
    seasonYear: media.seasonYear,
    averageScore: media.averageScore,
    genres: media.genres,
    bannerImage: media.bannerImage,
    coverImage: media.coverImage,
    description: media.description
  };
}

async function getHiAnimeSlug(animeName) {
  try {
    const searchUrl = `https://hianime.to/search?keyword=${encodeURIComponent(
      animeName
    )}`;
    const { data } = await axios.get(searchUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const $ = cheerio.load(data);

    const firstLink = $("a[href^='/watch/']").attr("href");
    if (!firstLink) return null;

    const match = firstLink.match(/\/watch\/([a-z0-9-]+)-(\d+)$/);
    if (!match) return null;

    const slug = match[1];
    const id = match[2];
    return `${slug}-${id}`;
  } catch (err) {
    return null;
  }
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const idsParam = req.query?.ids;
    const singleIdParam = req.query?.id || req.query?.anilistId;

    if (!idsParam && !singleIdParam) {
      return res
        .status(400)
        .json({ error: "Provide 'id' or 'ids' (comma-separated AniList IDs)" });
    }

    if (idsParam) {
      const ids = String(idsParam)
        .split(',')
        .map(s => parseInt(s.trim(), 10))
        .filter(n => Number.isInteger(n) && n > 0);

      if (!ids.length) {
        return res.status(400).json({ error: "No valid IDs provided" });
      }

      const results = await Promise.all(ids.map(async (anilistId) => {
        const info = await getAnimeInfoFromAniList(anilistId);
        if (!info) {
          return { anilistId, error: "Not found" };
        }
        const animeName = info.title?.romaji || info.title?.english || info.title?.userPreferred;
        const kebabName = animeName ? toKebabCase(animeName) : null;
        const hiAnimeSlug = animeName ? await getHiAnimeSlug(animeName) : null;
        return {
          anilistId,
          animeName,
          kebabName,
          hiAnimeSlug,
          animeInfo: info
        };
      }));

      return res.status(200).json({ ok: true, results });
    }

    // Single ID path
    const anilistId = parseInt(singleIdParam, 10);
    if (!anilistId || Number.isNaN(anilistId)) {
      return res
        .status(400)
        .json({ error: "Query param 'id' (AniList ID) is invalid" });
    }

    const info = await getAnimeInfoFromAniList(anilistId);
    if (!info) {
      return res.status(404).json({ error: "Anime not found on AniList" });
    }

    const animeName = info.title?.romaji || info.title?.english || info.title?.userPreferred;
    const kebabName = animeName ? toKebabCase(animeName) : null;
    const hiAnimeSlug = animeName ? await getHiAnimeSlug(animeName) : null;

    return res.status(200).json({
      ok: true,
      anilistId,
      animeName,
      kebabName,
      hiAnimeSlug,
      animeInfo: info
    });
  } catch (error) {
    return res
      .status(500)
      .json({ error: "Failed to resolve mapping", message: error.message });
  }
};
