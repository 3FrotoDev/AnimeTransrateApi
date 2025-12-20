const { getEpisodeStreaming } = require("../dist/main");
const { getWinAnime, getEpisodesByNumbers, getEpisodeVideaStream } = require("../dist/witanime")
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

    // const witanime = await getWinAnime(143338);
    // if(!witanime){
    //     return res.status(500).json({ error: "Failed to find this anime", message: error.message });
    // }
    // console.log("WinAnime", witanime);

    // const episodes = await getEpisodesByNumbers(witanime.url, [Number(ep)]);
    // if(episodes.length <= 0){
    //     return res.status(500).json({ error: "Failed to find this ep", message: animeEpisode.message });
    // }
    // console.log("Episodes array", episodes);
    // const episode = episodes[0];
    // console.log("Full One Episode", episode);

    const episode_streams = await getEpisodeVideaStream("https://witanime.day/episode/otonari-no-tenshi-sama-ni-itsunomanika-dame-ningen-ni-sareteita-ken-%d8%a7%d9%84%d8%ad%d9%84%d9%82%d8%a9-1/");
    console.log(episode_streams)
    return res
    .status(200)
    .json({ episode_streams });
  } catch (error) {
    console.log(error)
    return res.status(500).json({ error: "Failed", message: error.message ? error.message : "Something went wrong"});
  }
};
