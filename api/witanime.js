const { default: axios } = require("axios");
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

    const a = await axios.get(url);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(a.data);
    
  } catch (error) {
    console.log(error)
    return res.status(500).json({ error: "Failed", message: error.message ? error.message : "Something went wrong"});
  }
};
