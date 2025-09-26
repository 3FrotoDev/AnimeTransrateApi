const fetch = require("node-fetch");
const { GoogleGenAI } = require("@google/genai");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

if (!process.env.GOOGLE_AI_API_KEY) {
  console.error("❌ GOOGLE_AI_API_KEY environment variable is not set!");
}

const ai = process.env.GOOGLE_AI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GOOGLE_AI_API_KEY,
      httpOptions: { apiVersion: "v1alpha" },
    })
  : null;


function extractIdFromUrl(url) {
  const match = url.match(/\/subtitle\/([^\/]+)\//);
  return match ? match[1] : null;
}

function generateThanksMessage() {
  // Create a timestamp that appears at the end of the video
  // This will show for 5 seconds at the end
  const startTime = "99:59:55.000";
  const endTime = "99:59:59.999";
  
  return `${startTime} --> ${endTime}
Thanks for watching nuvex team`;
}

function splitVTTIntoChunks(vttText, maxChunkSize) {
  const lines = vttText.split('\n');
  const chunks = [];
  let currentChunk = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const testChunk = currentChunk + line + '\n';
    
    // If adding this line would exceed the chunk size, save current chunk
    if (testChunk.length > maxChunkSize && currentChunk.trim()) {
      // Try to find a good break point (empty line or timestamp)
      const lastEmptyLine = currentChunk.lastIndexOf('\n\n');
      if (lastEmptyLine > 0) {
        // Split at the last empty line
        const goodChunk = currentChunk.substring(0, lastEmptyLine).trim();
        const remaining = currentChunk.substring(lastEmptyLine).trim();
        chunks.push(goodChunk);
        currentChunk = remaining + '\n' + line + '\n';
      } else {
        chunks.push(currentChunk.trim());
        currentChunk = line + '\n';
      }
    } else {
      currentChunk = testChunk;
    }
  }
  
  // Add the last chunk if it has content
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
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
      ${chunk}
      `;

      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
        generationConfig: {
          temperature: 0.1,
          topK: 1,
          topP: 1,
          maxOutputTokens: 4096,
        }
      });

      return response.text.trim();
    } catch (error) {
      console.warn(`Attempt ${attempt} failed for chunk:`, error.message);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, attempt * 2000));
    }
  }
}

const supabaseUrl = "https://rtbmnumryqmhlcepttfh.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || "subtitles";

async function getCachedContent(id, targetLang) {
  const key = `vtt:${id}:${targetLang}`;
  if (supabase) {
    try {
      const filePath = `${id}/${targetLang}.vtt`;
      const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).download(filePath);
      if (!error && data) {
        const arrayBuffer = await data.arrayBuffer();
        const text = Buffer.from(arrayBuffer).toString("utf8");
        const cleanText = text.replace(/^\uFEFF/, "");
        console.log(`📁 Found Supabase Storage item: ${filePath}`);
        return cleanText;
      }
    } catch (e) {
      console.warn("Supabase download failed:", e.message);
    }
  }
  return null;
}

async function saveToCache(id, targetLang, content) {
  if (supabase) {
    try {
      const filePath = `${id}/${targetLang}.vtt`;
      const buffer = Buffer.from(content, "utf8");
      const { error } = await supabase.storage.from(SUPABASE_BUCKET).upload(filePath, buffer, {
        cacheControl: "604800",
        upsert: true,
        contentType: "text/vtt; charset=utf-8"
      });
      if (!error) {
        console.log(`💾 Saved to Supabase Storage: ${filePath}`);
        return true;
      } else {
        console.warn("Supabase upload error:", error.message);
      }
    } catch (e) {
      console.warn("Supabase upload failed:", e.message);
    }
  }
  throw new Error("Supabase not configured or upload failed");
}

async function translateVTTWithProgress(url, targetLang = "ar", progressCallback) {
  try {
    if (!ai) {
      throw new Error("Google AI API key is not configured. Please set GOOGLE_AI_API_KEY.");
    }

    const id = extractIdFromUrl(url);
    if (!id) throw new Error("Invalid VTT URL format");

    progressCallback("initializing", 5, "Starting translation process...");

    const cachedContent = await getCachedContent(id, targetLang);
    if (cachedContent) {
      progressCallback("completed", 100, "Using cached translation (cache)");
      return "cached";
    }

    progressCallback("downloading", 15, "Downloading VTT file...");

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download file: ${res.status}`);
    const vttText = await res.text();

    progressCallback("processing", 30, "File downloaded, preparing for translation...");

    // Split large VTT files into chunks for better translation
    const chunks = splitVTTIntoChunks(vttText, 3000); // Split into chunks of ~3000 characters
    let translatedText = "WEBVTT\n\n";
    
    progressCallback("translating", 40, `Translating content using AI (${chunks.length} chunks)...`);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const progress = 40 + Math.floor((i / chunks.length) * 50);
      
      progressCallback("translating", progress, `Translating chunk ${i + 1}/${chunks.length}...`);

      try {
        const chunkTranslation = await translateChunkWithRetry(ai, chunk, targetLang);
        
        if (chunkTranslation) {
          translatedText += chunkTranslation + "\n\n";
          console.log(`✅ Successfully translated chunk ${i + 1}/${chunks.length}`);
        } else {
          console.warn(`⚠️ Empty translation for chunk ${i + 1}`);
        }
      } catch (error) {
        console.error(`❌ Failed to translate chunk ${i + 1} after all retries:`, error.message);
        
        // Add the original chunk as fallback
        translatedText += chunk + "\n\n";
        console.log(`📝 Added original chunk ${i + 1} as fallback`);
      }
      
      // Add a small delay between chunks to avoid rate limiting
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Clean up the final text
    translatedText = translatedText.replace(/\n\n\n+/g, '\n\n').trim();
    
    // Add thanks message at the end
    const thanksMessage = generateThanksMessage();
    translatedText += "\n\n" + thanksMessage;
    
    progressCallback("saving", 95, "Saving translated file...");

    await saveToCache(id, targetLang, translatedText);

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
