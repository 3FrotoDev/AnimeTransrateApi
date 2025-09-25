const fs = require("fs");
const path = require("path");
const { kv } = require("@vercel/kv");
const CACHE_DIR = "./cache";
const BUFFER_SIZE = 128 * 1024; 

module.exports = async (req, res) => {
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

    let content = null;
    try {
      content = await kv.get(`vtt:${id}:${lang}`);
    } catch (e) {
      // fallback below
    }
    if (typeof content !== "string") {
      if (!fs.existsSync(filepath)) {
        return res.status(404).json({ error: "File not found" });
      }
      content = fs.readFileSync(filepath, "utf-8");
    }

    const fileSize = Buffer.byteLength(content, "utf8");

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", fileSize);
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Accept-Ranges", "bytes");

    res.statusCode = 200;
    res.end(content, "utf8");

  } catch (error) {
    res.status(500).json({ error: "Failed to download file", message: error.message });
  }
};
