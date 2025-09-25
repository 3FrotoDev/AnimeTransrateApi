const { createClient } = require("@supabase/supabase-js");
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

    let content = null;
    // Fetch exclusively from Supabase Storage
    try {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY;
      const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
      const bucket = process.env.SUPABASE_BUCKET || "subtitles";
      if (supabase) {
        const filePath = `${id}/${lang}.vtt`;
        const { data, error } = await supabase.storage.from(bucket).download(filePath);
        if (!error && data) {
          content = await data.text();
        }
      }
    } catch (_) {
      // ignore
    }
    if (typeof content !== "string") {
      return res.status(404).json({ error: "File not found" });
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
