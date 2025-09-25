const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { kv } = require("@vercel/kv");
require("dotenv").config();

if (!process.env.GOOGLE_AI_API_KEY) {
  console.error("❌ GOOGLE_AI_API_KEY environment variable is not set!");
}

const genAI = process.env.GOOGLE_AI_API_KEY
  ? new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY)
  : null;

const CACHE_DIR = path.join(__dirname, "..", "cache");
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function extractIdFromUrl(url) {
  const match = url.match(/\/subtitle\/([^\/]+)\//);
  return match ? match[1] : null;
}

async function getCachedContent(id, targetLang) {
  const key = `vtt:${id}:${targetLang}`;
  try {
    const cached = await kv.get(key);
    if (cached) {
      console.log(`📁 Found KV cached item: ${key}`);
      return typeof cached === "string" ? cached : String(cached);
    }
  } catch (e) {
    console.warn("KV get failed, falling back to local cache if exists:", e.message);
  }

  const filename = `${id}_${targetLang}.vtt`;
  const filepath = path.join(CACHE_DIR, filename);
  if (fs.existsSync(filepath)) {
    return fs.readFileSync(filepath, "utf-8");
  }
  return null;
}

async function saveToCache(id, targetLang, content) {
  const key = `vtt:${id}:${targetLang}`;
  try {
    await kv.set(key, content, { ex: 60 * 60 * 24 * 7 });
    console.log(`💾 Saved to KV: ${key}`);
    return true;
  } catch (e) {
    console.warn("KV set failed, saving to local fallback cache:", e.message);
    const filename = `${id}_${targetLang}.vtt`;
    const filepath = path.join(CACHE_DIR, filename);
    fs.writeFileSync(filepath, content, "utf-8");
    console.log(`💾 Saved to local cache: ${filename}`);
    return true;
  }
}

async function translateVTTWithProgress(url, targetLang = "ar", progressCallback) {
  try {
    if (!genAI) {
      throw new Error("Google AI API key is not configured. Please set GOOGLE_AI_API_KEY.");
    }

    const id = extractIdFromUrl(url);
    if (!id) throw new Error("Invalid VTT URL format");

    progressCallback("initializing", 5, "Starting translation process...");

    const cachedContent = await getCachedContent(id, targetLang);
    if (cachedContent) {
      progressCallback("completed", 100, "Using cached translation (KV)");
      return "cached";
    }

    progressCallback("downloading", 15, "Downloading VTT file...");

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download file: ${res.status}`);
    const vttText = await res.text();

    progressCallback("processing", 30, "File downloaded, preparing for translation...");

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
    You are a professional subtitle translator.
    Translate the following WebVTT subtitle file into ${targetLang}.
    - Keep the VTT format (timestamps, numbering, etc).
    - Only translate the dialogue text.
    - Do not remove or change timing codes.
    - Do not add explanations, just return the translated VTT.

    Here is the file:
    ${vttText}
    `;

    progressCallback("translating", 40, "Translating content using AI (streaming)...");

    const stream = await model.generateContentStream(prompt);

    let collected = "";
    let lastProgress = 40;

    for await (const chunk of stream.stream) {
      const text = chunk.text();
      if (text) {
        collected += text;
        lastProgress = Math.min(90, lastProgress + 2);
        progressCallback("translating", lastProgress, "Receiving translation...");
      }
    }

    progressCallback("saving", 95, "Saving translated file...");

    await saveToCache(id, targetLang, collected);

    progressCallback("completed", 100, "Translation completed successfully!");
    return "saved";
  } catch (err) {
    progressCallback("error", 0, `Error: ${err.message}`);
    throw err;
  }
}

module.exports = async (req, res) => {
  const clientKey = req.headers["x-api-key"];

  if (!process.env.CLIENT_API_KEY) {
    return res.status(500).json({ error: "Server configuration error" });
  }

  if (clientKey !== process.env.CLIENT_API_KEY || !clientKey) {
    return res.status(403).json({ error: "Forbidden", status: 403 });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { url, targetLang = "ar" } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });

    res.writeHead(200, {
      "Content-Type": "application/json",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    res.write(
      JSON.stringify({
        type: "progress",
        status: "initializing",
        progress: 0,
        message: "Starting translation process...",
        timestamp: new Date().toISOString(),
      }) + "\n"
    );

    const progressCallback = (status, progress, message) => {
      const progressData = {
        type: "progress",
        status,
        progress,
        message,
        timestamp: new Date().toISOString(),
      };
      res.write(JSON.stringify(progressData) + "\n");
    };

    try {
      const result = await translateVTTWithProgress(url, targetLang, progressCallback);
      const id = extractIdFromUrl(url);
      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const downloadUrl = `${protocol}://${host}/api/download/${id}/${targetLang}`;
      const cachedNow = await getCachedContent(id, targetLang);

      const finalResult = {
        type: "completed",
        success: true,
        status: 200,
        message: "Translation completed successfully!",
        foundCached: !!cachedNow,
        downloadUrl,
        id,
        language: targetLang,
        timestamp: new Date().toISOString(),
      };

      res.write(JSON.stringify(finalResult) + "\n");
      res.end();
    } catch (error) {
      const errorResult = {
        type: "error",
        status: 500,
        success: false,
        error: "Translation failed",
        message: error.message,
        timestamp: new Date().toISOString(),
      };
      res.write(JSON.stringify(errorResult) + "\n");
      res.end();
    }
  } catch (error) {
    res.status(500).json({ error: "Translation failed", message: error.message });
  }
};
