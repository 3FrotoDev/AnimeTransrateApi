const { getEpisodeStreaming } = require("../dist/main");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const urlParts = req.url.split("/");
    const ep = urlParts[urlParts.length - 1];
    const id = urlParts[urlParts.length - 2];
    if (!id || !ep) {
      return res
        .status(400)
        .json({ error: "AnilistID and ep parameters are required" });
    }

    const animeServer = await getEpisodeStreaming(Number(id),Number(ep))

    if(animeServer.servers.length <= 0){
        return res.status(500).json({ error: "Failed to find this anime", message: error.message });
    } else {
        return res
        .status(200)
        .json({ ok:true, data: animeServer });
    }
  } catch (error) {
    return res.status(500).json({ error: "Failed", message: error.message });
  }
};
