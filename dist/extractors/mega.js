const { File } = require("megajs");

class MegaNZExtractor {
  constructor() {
    this.serverName = "Mega.nz";
  }

  async extract(videoUrl) {
    try {
      // megajs يقبل embed و file links
      const file = File.fromURL(videoUrl.toString());

      // تحميل الميتاداتا (name, size, key, ...)
      await file.loadAttributes();

      // رابط ستريم مباشر (ReadableStream)
      const stream = await file.download();

      return {
        provider: "mega.nz",
        name: file.name,
        size: file.size,
        mime: file.type ?? "video/mp4",

        // مهم: ده Stream مش URL
        stream,

        // لو محتاج URL مؤقت (مش دايمًا متاح)
        downloadable: true,
      };
    } catch (err) {
      throw new Error("Mega.nz extraction failed: " + err.message);
    }
  }
}

module.exports = MegaNZExtractor;
