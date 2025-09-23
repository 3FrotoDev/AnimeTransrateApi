const fs = require("fs");
const path = require("path");

const CACHE_DIR = "./cache";
const BUFFER_SIZE = 64 * 1024; 

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

    res.setHeader("Content-Type", "text/vtt; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.setHeader("Content-Length", fileSize);
    res.setHeader("Cache-Control", "public, max-age=86400"); 
    res.setHeader("ETag", `"${id}-${lang}"`);
    res.setHeader("Accept-Ranges", "bytes");

    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      
      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
      res.setHeader("Content-Length", chunksize);
      
      const fileStream = fs.createReadStream(filepath, { start, end, highWaterMark: BUFFER_SIZE });
      fileStream.pipe(res);
    } else {
      const fileStream = fs.createReadStream(filepath, { highWaterMark: BUFFER_SIZE });
      fileStream.pipe(res);
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to serve file", message: error.message });
  }
};
