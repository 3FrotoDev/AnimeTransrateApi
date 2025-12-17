const { getEpisodeStreaming } = require("../dist/main");
const { getAnime3rb, getEpisodeByNumber, getEpisodeStreams } = require("../dist/anime3rb")
module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const urlParts = req.url.split("/");
    const ep = Number(urlParts[urlParts.length - 1]);
    const id = urlParts[urlParts.length - 2];
    if (!id || !ep) {
      return res
        .status(400)
        .json({ error: "AnilistID and ep parameters are required" });
    }

    const anime3rb = await getAnime3rb(id)
    const animeSlug = anime3rb.slug
    console.log(animeSlug)
    if(!animeSlug){
        return res.status(500).json({ error: "Failed to find this anime", message: error.message });
    }
    const animeEpisode = await getEpisodeByNumber(animeSlug,ep)
    if(animeEpisode.found !== true || !animeEpisode.episode?.url){
        return res.status(500).json({ error: "Failed to find this ep", message: animeEpisode.message });
    }
    const episodeUrl = animeEpisode.episode?.url
    console.log(episodeUrl)
    const episode_streams = await getEpisodeStreams(episodeUrl)
    console.log(episode_streams)
    if(!episode_streams){
        return res.status(500).json({ error: "Failed to find stream link try again later", message: animeEpisode.message });
    }

    return res
    .status(200)
    .json({ episode_streams });
  } catch (error) {
    return res.status(500).json({ error: "Failed", message: error.message });
  }
};
