const axios = require("axios");

module.exports = async (req, res) => {
  const { id } = req.query;

  if (!id) return res.status(400).send("Missing file id");

  const range = req.headers.range; // optional
  const driveUrl = `https://drive.google.com/uc?export=download&id=${id}`;

  try {
    // نستخدم axios مع maxRedirects عشان Google Drive
    const response = await axios.get(driveUrl, {
      responseType: "stream",
      headers: range ? { Range: range } : {},
      maxRedirects: 5,
    });

    // لو فيه Range -> partial content
    res.status(range ? 206 : 200);
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Accept-Ranges", "bytes");

    // Content-Length مهم عشان duration يظهر صح
    let length =
      response.headers["content-length"] ||
      (range && response.headers["content-range"]
        ? response.headers["content-range"].split("/")[1]
        : null);

    if (length) res.setHeader("Content-Length", length);

    // Content-Range لو Range موجود
    if (range && response.headers["content-range"]) {
      res.setHeader("Content-Range", response.headers["content-range"]);
    }

    // نرسل الفيديو مباشرة
    console.log(response.headers['content-type'])
    response.data.pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).send("Streaming failed");
  }
};
