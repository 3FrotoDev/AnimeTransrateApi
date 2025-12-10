const { getEpisodeStreaming } = require("../dist/main");
const { getVideoUrl } = require("../dist/getUrl")
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const videoUrl = req.query.url;
    
    if (!videoUrl) {
      return res
        .status(400)
        .json({ error: "url parameters are required" });
    }

    console.log(videoUrl)
    const a = await getVideoUrl(videoUrl)

    return res.status(200).json({ a })
  } catch (error) {
    return res.status(500).json({ error: "Failed", message: error.message });
  }
};
