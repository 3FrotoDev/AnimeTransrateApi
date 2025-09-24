const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

// ✅ Check if Google AI API key is configured
if (!process.env.GOOGLE_AI_API_KEY) {
  console.error("❌ GOOGLE_AI_API_KEY environment variable is not set!");
}

const genAI = process.env.GOOGLE_AI_API_KEY
  ? new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY)
  : null;

// ✅ Use ../cache (one level up from api folder)
const CACHE_DIR = path.join(__dirname, "..", "cache");

// ✅ Make sure the cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function extractIdFromUrl(url) {
  const match = url.match(/\/subtitle\/([^\/]+)\//);
  return match ? match[1] : null;
}

function getCachedFile(id, targetLang) {
  const filename = `${id}_${targetLang}.vtt`;
  const filepath = path.join(CACHE_DIR, filename);

  if (fs.existsSync(filepath)) {
    console.log(`📁 Found cached file: ${filename}`);
    return filepath;
  }
  return null;
}

function saveToCache(id, targetLang, content) {
  const filename = `${id}_${targetLang}.vtt`;
  const filepath = path.join(CACHE_DIR, filename);

  fs.writeFileSync(filepath, content, "utf-8");
  console.log(`💾 Saved to cache: ${filename}`);
  return filepath;
}

async function translateVTTWithProgress(url, targetLang = "ar", progressCallback) {
  try {
    if (!genAI) {
      throw new Error("Google AI API key is not configured. Please set GOOGLE_AI_API_KEY.");
    }

    const id = extractIdFromUrl(url);
    if (!id) throw new Error("Invalid VTT URL format");

    progressCallback("initializing", 5, "Starting translation process...");

    const cachedFile = getCachedFile(id, targetLang);
    if (cachedFile) {
      progressCallback("completed", 100, "Using cached translation");
      return cachedFile;
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

    const savedPath = saveToCache(id, targetLang, collected);

    progressCallback("completed", 100, "Translation completed successfully!");
    return savedPath;
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
      const filePath = await translateVTTWithProgress(url, targetLang, progressCallback);
      const id = extractIdFromUrl(url);
      const downloadUrl = `${req.protocol}://${req.get("host")}/api/download/${id}/${targetLang}`;
      const cachedFile = getCachedFile(id, targetLang);

      const finalResult = {
        type: "completed",
        success: true,
        status: 200,
        message: "Translation completed successfully!",
        foundCached: !!cachedFile,
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
