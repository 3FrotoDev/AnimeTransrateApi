const axios = require("axios");
const cheerio = require("cheerio");

function toKebabCase(str) {
  return str
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function getAnimeNameFromAniList(animeId) {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        title {
          romaji
          english
        }
      }
    }
  `;
  const { data } = await axios.post("https://graphql.anilist.co", {
    query,
    variables: { id: animeId },
  });

  const title =
    data?.data?.Media?.title?.romaji || data?.data?.Media?.title?.english;
  return title || null;
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
    const idParam = req.query?.id || req.query?.anilistId;
    const anilistId = parseInt(idParam, 10);
    if (!anilistId || Number.isNaN(anilistId)) {
      return res
        .status(400)
        .json({ error: "Query param 'id' (AniList ID) is required" });
    }

    const animeName = await getAnimeNameFromAniList(anilistId);
    if (!animeName) {
      return res.status(404).json({ error: "Anime not found on AniList" });
    }

    const kebabName = toKebabCase(animeName);
    const hiAnimeSlug = await getHiAnimeSlug(animeName);

    
    return res.status(200).json({
      ok: true,
      anilistId,
      animeName,
      kebabName,
      hiAnimeSlug,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ error: "Failed to resolve mapping", message: error.message });
  }
};
