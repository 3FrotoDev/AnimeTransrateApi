const fetch = require("node-fetch");
const { GoogleGenAI } = require("@google/genai");
const { createClient } = require("@supabase/supabase-js");
let pLimit;
(async () => {
  pLimit = (await import("p-limit")).default;
})();

require("dotenv").config();

const ai = process.env.GOOGLE_AI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GOOGLE_AI_API_KEY,
      httpOptions: { apiVersion: "v1alpha" },
    })
  : null;

const supabaseUrl = "https://rtbmnumryqmhlcepttfh.supabase.co";
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY;
const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || "subtitles";

// ==================== UTILS ====================

function extractIdFromUrl(url) {
  const match = url.match(/\/subtitle\/([^\/]+)\//);
  return match ? match[1] : null;
}

function generateThanksMessage() {
  const startTime = "99:59:55.000";
  const endTime = "99:59:59.999";
  return `${startTime} --> ${endTime}
Thanks for watching nuvex team`;
}

function splitVTTIntoChunks(vttText, maxChunkSize = 2000) {
  const lines = vttText.split("\n");
  const chunks = [];
  let currentChunk = "";

  for (const line of lines) {
    const testChunk = currentChunk + line + "\n";
    if (testChunk.length > maxChunkSize && currentChunk.trim()) {
      chunks.push(currentChunk.trim());
      currentChunk = line + "\n";
    } else {
      currentChunk = testChunk;
    }
  }
  if (currentChunk.trim()) chunks.push(currentChunk.trim());
  return chunks;
}

async function translateChunkWithRetry(ai, chunk, targetLang, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const prompt = `
      You are a professional subtitle translator.
      Translate the following WebVTT subtitle chunk into ${targetLang}.
      - Keep the VTT format (timestamps, numbering, etc).
      - Only translate the dialogue text.
      - Do not remove or change timing codes.
      - Do not add explanations, just return the translated VTT chunk.
      - Do not include WEBVTT header in your response.

      Here is the chunk:
      ${chunk}`;

      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
        generationConfig: {
          temperature: 0.1,
          topK: 1,
          topP: 1,
          maxOutputTokens: 4096,
        },
      });

      return response.text.trim();
    } catch (error) {
      console.warn(`Attempt ${attempt} failed:`, error.message);
      if (attempt === maxRetries) throw error;
      await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
}

async function getCachedContent(id, targetLang) {
  if (!supabase) return null;
  try {
    const filePath = `${id}/${targetLang}.vtt`;
    const { data, error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .download(filePath);
    if (!error && data) {
      const text = Buffer.from(await data.arrayBuffer()).toString("utf8");
      return text.replace(/^\uFEFF/, "");
    }
  } catch (e) {
    console.warn("Supabase download failed:", e.message);
  }
  return null;
}

async function saveToCache(id, targetLang, content) {
  if (!supabase) throw new Error("Supabase not configured");
  const filePath = `${id}/${targetLang}.vtt`;
  const buffer = Buffer.from(content, "utf8");
  const { error } = await supabase.storage.from(SUPABASE_BUCKET).upload(
    filePath,
    buffer,
    {
      cacheControl: "604800",
      upsert: true,
      contentType: "text/vtt; charset=utf-8",
    }
  );
  if (error) throw new Error("Supabase upload error: " + error.message);
  return true;
}

// ==================== CORE TRANSLATION ====================

async function translateVTTWithProgress(url, targetLang, progressCallback) {
  const id = extractIdFromUrl(url);
  if (!id) throw new Error("Invalid VTT URL");

  const cached = await getCachedContent(id, targetLang);
  if (cached) {
    progressCallback("completed", 100, `Using cached translation for ${id}`);
    return "cached";
  }

  progressCallback("downloading", 10, `Downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download: ${res.status}`);
  const vttText = await res.text();

  progressCallback("processing", 25, `Splitting ${id} into chunks...`);
  const chunks = splitVTTIntoChunks(vttText);

  let translated = "WEBVTT\n\n";
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const prog = 25 + Math.floor((i / chunks.length) * 60);
    progressCallback("translating", prog, `Chunk ${i + 1}/${chunks.length}`);
    try {
      const t = await translateChunkWithRetry(ai, chunk, targetLang);
      translated += t + "\n\n";
    } catch {
      translated += chunk + "\n\n";
    }
    if (i < chunks.length - 1)
      await new Promise((r) => setTimeout(r, 800)); // small delay
  }

  translated = translated.replace(/\n\n\n+/g, "\n\n").trim();
  translated += "\n\n" + generateThanksMessage();

  progressCallback("saving", 95, `Saving ${id} translation...`);
  await saveToCache(id, targetLang, translated);

  progressCallback("completed", 100, `Completed ${id}`);
  return "saved";
}

// ==================== HANDLER ====================

module.exports = async (req, res) => {
  const clientKey = req.headers["x-api-key"];
  if (!process.env.CLIENT_API_KEY || clientKey !== process.env.CLIENT_API_KEY)
    return res.status(403).json({ error: "Forbidden" });

  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { url, targetLang = "ar" } = req.body;
  if (!url) return res.status(400).json({ error: "URL is required" });

  const urls = Array.isArray(url) ? url : [url];
  if (urls.length > 10)
    return res
      .status(400)
      .json({ error: "Too many files. Limit is 10 per request." });

  const limit = pLimit(3); // عدد الملفات المتزامنة
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Transfer-Encoding": "chunked",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  res.write(
    JSON.stringify({
      type: "start",
      count: urls.length,
      timestamp: new Date().toISOString(),
    }) + "\n"
  );

  const progressCallback = (status, progress, message) => {
    res.write(
      JSON.stringify({
        type: "progress",
        status,
        progress,
        message,
        timestamp: new Date().toISOString(),
      }) + "\n"
    );
  };

  const tasks = urls.map((singleUrl) =>
    limit(async () => {
      try {
        const result = await translateVTTWithProgress(
          singleUrl,
          targetLang,
          progressCallback
        );
        const id = extractIdFromUrl(singleUrl);
        const protocol = req.headers["x-forwarded-proto"] || "https";
        const host = req.headers["x-forwarded-host"] || req.headers.host;
        const downloadUrl = `${protocol}://${host}/api/download/${id}/${targetLang}`;
        return {
          id,
          url: singleUrl,
          result,
          downloadUrl,
          status: "success",
        };
      } catch (err) {
        return { url: singleUrl, status: "failed", error: err.message };
      }
    })
  );

  const allResults = await Promise.all(tasks);

  res.write(
    JSON.stringify({
      type: "completed",
      success: true,
      count: allResults.length,
      results: allResults,
      timestamp: new Date().toISOString(),
    }) + "\n"
  );

  res.end();
};
