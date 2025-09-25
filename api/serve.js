const { createClient } = require("@supabase/supabase-js");

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
  } catch (e) {
    // ignore
  }

    if (typeof content !== "string") {
      return res.status(404).json({ error: "File not found" });
    }

    const fileSize = Buffer.byteLength(content, "utf8");

    res.setHeader("Content-Type", "text/vtt; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.setHeader("Content-Length", fileSize);
    res.setHeader("Cache-Control", "public, max-age=86400"); 
    res.setHeader("ETag", `"${id}-${lang}"`);
    res.setHeader("Accept-Ranges", "bytes");

    // Stream from memory buffer for simplicity; VTT files are typically small
    res.statusCode = 200;
    res.end(content, "utf8");
  } catch (error) {
    res.status(500).json({ error: "Failed to serve file", message: error.message });
  }
};
