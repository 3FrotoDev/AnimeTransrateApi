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

    const a = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
        "Referer": "https://witanime.day/",
        "Connection": "keep-alive",
      },
    });
    
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(a.data);

  } catch (error) {
    console.log(error)
    return res.status(500).json({ error: "Failed", message: error.message ? error.message : "Something went wrong"});
  }
};
