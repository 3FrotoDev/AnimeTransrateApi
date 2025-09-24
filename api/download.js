const fs = require("fs");
const path = require("path");
const CACHE_DIR = "./cache";
const BUFFER_SIZE = 128 * 1024; 

module.exports = (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const urlParts = req.url.split('/');
    const id = urlParts[urlParts.length - 2];
    const lang = urlParts[urlParts.length - 1];
    
    if (!id || !lang) {
      return res.status(400).json({ error: "ID and language parameters are required" });
    }

    const filename = `${id}_${lang}.vtt`;
    const filepath = path.join(CACHE_DIR, filename);

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: "File not found" });
    }

    const stats = fs.statSync(filepath);
    const fileSize = stats.size;

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", fileSize);
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Accept-Ranges", "bytes");

    const fileStream = fs.createReadStream(filepath, { 
      highWaterMark: BUFFER_SIZE,
      autoClose: true 
    });

    fileStream.on('error', (error) => {
      console.error('Stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Stream error", message: error.message });
      }
    });

    fileStream.pipe(res, { end: true });

  } catch (error) {
    res.status(500).json({ error: "Failed to download file", message: error.message });
  }
};
