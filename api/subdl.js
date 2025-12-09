// index.js
const axios = require("axios");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// ================= helpers =================
function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}
async function safeGet(url, params, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await axios.get(url, { params, timeout: 30000 });
    } catch (err) {
      if (i === retries - 1) throw err;
      const wait = 500 + i * 500;
      console.log(`safeGet retry (${i + 1}) wait ${wait}ms`);
      await delay(wait);
    }
  }
}
function getThrottleDelay(totalPages) {
  if (totalPages <= 5) return 150;
  if (totalPages <= 10) return 300;
  if (totalPages <= 20) return 450;
  return 650;
}
function extractJSONFromText(text) {
  if (!text || typeof text !== "string")
    throw new Error("No text to extract JSON from");
  const cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("No JSON object found in AI response");
  return m[0];
}
function safeNumber(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Build plausible download link from subtitle object when possible.
// We prefer explicit 'url' field, then 'subtitlePage', then id-based dl link if id present.
function buildDownloadLink(sub) {
  if (!sub || typeof sub !== "object") return null;
  if (sub.url) return sub.url;
  if (sub.download_url) return sub.download_url;
  if (sub.subtitlePage) return String(sub.subtitlePage);
  // SubDL example dl link: https://dl.subdl.com/subtitle/<zip-id>.zip
  // some subtitle objects include 'id' or 'sd_id' or 'zip'
  if (sub.id) return `https://dl.subdl.com/subtitle/${sub.id}.zip`;
  if (sub.subtitle_id)
    return `https://dl.subdl.com/subtitle/${sub.subtitle_id}.zip`;
  return null;
}

// Try to extract numeric episode_from / episode_end or parse release_name for single episodes
function parseEpisodeRangeFromSub(sub) {
  const episode_from = safeNumber(
    sub.episode_from ?? sub.ep_from ?? sub.episodeStart
  );
  const episode_end = safeNumber(
    sub.episode_end ?? sub.ep_end ?? sub.episodeEnd
  );
  if (episode_from != null || episode_end != null) {
    return {
      from: episode_from ?? episode_end ?? null,
      to: episode_end ?? episode_from ?? null,
    };
  }
  // fallback parse from release_name
  const name = (sub.release_name || sub.name || "").toString();
  // patterns: [01-12], 01~12, 1-12, Ep 01, EP1, E01
  const rangeMatch = name.match(
    /(?:\[|\(|\s|^)([0-9]{1,3})\s*(?:~|-|to)\s*([0-9]{1,3})(?:\]|\)|\s|$)/i
  );
  if (rangeMatch) {
    return { from: Number(rangeMatch[1]), to: Number(rangeMatch[2]) };
  }
  const singleMatch =
    name.match(/\b[Ee]p(?:isode)?\s*\.?\s*0*([0-9]{1,3})\b/) ||
    name.match(/\b[Ee]\s*0*([0-9]{1,3})\b/) ||
    name.match(/\b0*([0-9]{1,3})\b/);
  if (singleMatch) {
    return { from: Number(singleMatch[1]), to: Number(singleMatch[1]) };
  }
  return { from: null, to: null };
}

// find best single episode link in local subtitles list for given episode number
function findBestSingleEpisodeLink(subtitles, episode, preferLang) {
  if (!Array.isArray(subtitles) || episode == null) return null;
  // prioritize: exact episode_from==episode && episode_end==episode, then release_name contains "ep X", then language preference
  const candidates = [];
  for (const s of subtitles) {
    const { from, to } = parseEpisodeRangeFromSub(s);
    if (from != null && to != null) {
      if (from <= episode && episode <= to) {
        // if it's a pack [1-2] that includes target ep, we should still consider it but prefer single-file exact
        candidates.push({ sub: s, from, to, exactSingle: from === to });
      }
    }
  }
  if (!candidates.length) return null;
  // prefer exact single
  const exact = candidates.find((c) => c.exactSingle);
  if (exact)
    return {
      episode,
      url: buildDownloadLink(exact.sub),
      release_name: exact.sub.release_name || exact.sub.name || null,
    };
  // else prefer candidate with from===episode or to===episode (smaller pack)
  candidates.sort((a, b) => {
    const lenA = (a.to ?? a.from) - (a.from ?? a.to) + 1;
    const lenB = (b.to ?? b.from) - (b.from ?? b.to) + 1;
    // smaller package first, then prefer language match
    const langScoreA =
      preferLang &&
      String(a.sub.lang || "").toLowerCase() ===
        String(preferLang).toLowerCase()
        ? 0
        : 1;
    const langScoreB =
      preferLang &&
      String(b.sub.lang || "").toLowerCase() ===
        String(preferLang).toLowerCase()
        ? 0
        : 1;
    return lenA - lenB || langScoreA - langScoreB;
  });
  const chosen = candidates[0];
  return {
    episode,
    url: buildDownloadLink(chosen.sub),
    release_name: chosen.sub.release_name || chosen.sub.name || null,
  };
}

// Utility: parse all episode numbers or ranges from a release_name string
function extractEpisodesFromName(name) {
  if (!name || typeof name !== "string") return [];
  const results = new Set();

  // 1) ranges like 01 ~ 12, 1-12, 01~12
  const rangeRegex = /([0-9]{1,3})\s*(?:~|-|to)\s*([0-9]{1,3})/g;
  let m;
  while ((m = rangeRegex.exec(name)) !== null) {
    const start = Number(m[1]);
    const end = Number(m[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const s = Math.min(start, end);
    const e = Math.max(start, end);
    for (let i = s; i <= e; i++) results.add(i);
  }

  // 2) explicit bracket ranges like [01 ~ 12 END] already handled by rangeRegex above

  // 3) single episode patterns Ep10, E10, Episode 10, " - 10 "
  const singleRegex = /\b(?:ep(?:isode)?|e)\.?\s*0*([0-9]{1,3})\b/gi;
  while ((m = singleRegex.exec(name)) !== null) {
    const ep = Number(m[1]);
    if (Number.isFinite(ep)) results.add(ep);
  }

  // 4) fallback: standalone numbers separated by non-digits, but avoid capturing years or other big numbers (>500)
  const fallbackRegex = /(?:^|[^0-9])0*([0-9]{1,3})(?:[^0-9]|$)/g;
  while ((m = fallbackRegex.exec(name)) !== null) {
    const ep = Number(m[1]);
    if (Number.isFinite(ep) && ep <= 999) results.add(ep);
  }

  return Array.from(results).sort((a, b) => a - b);
}

function isFullSeasonName(name) {
  if (!name || typeof name !== "string") return false;
  // Consider '[01 ~ 12 END]', 'END', 'COMPLETE', 'FULL SEASON', 'FULLPACK' as indicators
  if (/\bEND\b/i.test(name)) return true;
  if (/\bCOMPLETE\b/i.test(name)) return true;
  if (/\bFULL\s*SEASON\b/i.test(name)) return true;
  if (/\bFULL\s*PACK\b/i.test(name)) return true;
  if (/\b\[.*END.*\]/i.test(name)) return true;
  return false;
}

// ================= main handler =================
module.exports = async (req, res) => {
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const SUBDL_BASE = "https://api.subdl.com/api/v1/subtitles";
    const SUBDL_API_KEY =
      process.env.SUBDL_API_KEY || "df4uxdAdS8FOw4PkOoOnczS25LkFI27x";
    if (!SUBDL_API_KEY)
      return res
        .status(500)
        .json({ error: "Missing SUBDL_API_KEY in environment" });

    const imdb_id = req.query.imdb_id; // required
    const title = req.query.title || null; // optional helper
    const ep = req.query.ep ? Number(req.query.ep) : null; // optional episode request
    const lang = req.query.lang || "all";
    const maxEpisodes = req.query.maxEpisodes
      ? Number(req.query.maxEpisodes)
      : null;

    if (!imdb_id)
      return res
        .status(400)
        .json({ error: "imdb_id is required (use ?imdb_id=tt...)" });

    if (!process.env.GOOGLE_AI_API_KEY)
      return res
        .status(500)
        .json({ error: "Missing GOOGLE_AI_API_KEY in environment" });

    // init AI
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
    const aiModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    // 1) Search by imdb_id to get the SD (SubDL) entry and sd_id
    const searchResp = await safeGet(SUBDL_BASE, {
      api_key: SUBDL_API_KEY,
      imdb_id,
      type: "tv",
      languages: lang,
      subs_per_page: 30,
      page: 1,
    });
    const searchData = (searchResp && searchResp.data) || {};
    const resultsArr = Array.isArray(searchData.results)
      ? searchData.results
      : [];
    if (!resultsArr.length)
      return res.status(404).json({ error: "No show found for given imdb_id" });

    const primary = resultsArr[0];
    const sd_id =
      primary.sd_id ?? primary.sdId ?? primary.sdId ?? primary.sd ?? null;
    if (!sd_id)
      return res
        .status(404)
        .json({
          error: "No sd_id found in SubDL result for this imdb_id",
          primary,
        });

    // 2) Fetch ALL subtitles by sd_id (we want both packs and singles)
    const firstPage = await safeGet(SUBDL_BASE, {
      api_key: SUBDL_API_KEY,
      sd_id,
      type: "tv",
      languages: lang,
      subs_per_page: 30,
      page: 1,
    });
    const firstData = (firstPage && firstPage.data) || {};
    const totalPages =
      firstData.total_pages ??
      firstData.totalPages ??
      firstData.totalPagesCount ??
      1;
    let subtitles = Array.isArray(firstData.subtitles)
      ? [...firstData.subtitles]
      : [];

    const throttle = getThrottleDelay(totalPages);
    for (let page = 2; page <= totalPages; page++) {
      try {
        const rp = await safeGet(SUBDL_BASE, {
          api_key: SUBDL_API_KEY,
          sd_id,
          type: "tv",
          languages: lang,
          subs_per_page: 30,
          page,
        });
        if (rp && rp.data && Array.isArray(rp.data.subtitles))
          subtitles.push(...rp.data.subtitles);
      } catch (err) {
        console.warn(
          `Failed page ${page} (ignored):`,
          err.message || err.toString()
        );
      }
      await delay(throttle);
    }

    // 3) Prepare analyzePrompt (include title & ep details)
    const analyzePrompt = `
You are a subtitle-picking AI. Output JSON ONLY.

Context:
- imdb_id: "${imdb_id}"
- sd_id: "${sd_id}"
- Optional title (may help identify season/part): ${title ? `"${title}"` : "null"}
- Optional target episode (may be null): ${ep === null ? "null" : ep}
- Optional maxEpisodes (may be null): ${maxEpisodes === null ? "null" : maxEpisodes}

IMPORTANT PREPROCESSING (determine preferredSeason):
- Parse the provided title for explicit season indicators (examples: "S2", "Season 2", "2nd Season", "Season.2", "第2季", "Season II").
  * If an explicit season is found in the title, set preferredSeason to that number.
  * Otherwise, set preferredSeason = 1 (DEFAULT). This default **must** be used when the user did not state a season.
- Use preferredSeason as the primary season to match. Only consider other seasons if no viable matches exist for preferredSeason.

Important notes:
- Ignore 'part' information unless it represents a full season pack.
- If no 'season' information is found in subtitle or title, assume it is season 1 (this is handled by preferredSeason).
- Only consider a subtitle matching if it belongs to the correct season/title (where "correct" is primarily preferredSeason).
- If a release_name includes [END], [COMPLETE], [FULL SEASON], or [FULL PACK], it is preferred ONLY if the season/title match (especially preferredSeason).
- Prefer full season packs over partial packs.
- When multiple seasons exist, do not return partial packs unless no full season is available.

You will be given an array of subtitle objects (SUBTITLE_LIST). Typical fields include:
release_name, name, lang, author, url, subtitlePage, season, episode_from, episode_end, full_season, release_info

Task (strict):

1) Determine the season to match:
   - Use preferredSeason from preprocessing as the primary target season.
   - Parse season/part from release_name/title and explicit subtitle fields.
   - When title explicitly contained a season, prefer those packages. If title had no season, prefer packages matching preferredSeason (which will be 1).

2) Use available fields AND optional title to identify the correct season and part/cour.
   - Parse season/part from release_name/title.
   - When title is provided without explicit season, prefer packages that match preferredSeason (season 1).
   - If season is missing in both, assume preferredSeason.

3) Try to find a single subtitle file that is a "full season pack".
   - Recognize patterns like [01-12], [1~12], 01-12, etc or via episode_from/episode_end.
   - Prefer single-file full packs that explicitly indicate the preferredSeason.
   - If found and matches expected episode count (maxEpisodes if provided), return as bestPackage with package_type "full_pack_single_file".

4) If no single-file full-pack:
   - Search for single-episode files and multi-episode packs.
   - If collectively they cover the entire preferredSeason (or maxEpisodes), return package_type "full_pack_multi_files" with package_complete true.
   - If incomplete (ongoing or missing episodes), set finished_anime = false and fill ep_links with available episodes.
   - If user provided target episode and it exists in singles or bundles, return ep_link.

5) If no full pack and insufficient singles:
   - Choose the largest partial pack that matches preferredSeason and return it as best_partial_pack with package_complete false.

Rules/Priorities:

- Prioritize correct title/season/part matching above all other factors.
  * A subtitle is only a strong match if release_name/name matches the provided title (when available) AND the detected season equals preferredSeason.

- After validating title/season:
  * Prefer releases containing [END], [COMPLETE], [FULL SEASON], [FULL PACK] **only if they belong to the preferredSeason and title match**.
  * Do NOT choose END/COMPLETE releases from a different season or with unclear season.

- If no END/COMPLETE full-season pack matches preferredSeason:
  * Choose the full pack (single-file) with the widest episode coverage for preferredSeason.
  * If none exist, fallback to multi-file complete coverage for preferredSeason.
  * If still incomplete, choose best partial pack matching preferredSeason.

- Name/season matching MUST be stronger than "END".
  * END does NOT override wrong season/title.

- ALLOWING fallback to other seasons:
  * Only if NO viable matches exist for preferredSeason (no full-pack, no multi-file full coverage, no reasonable partial packs), THEN:
    - Evaluate subtitle entries for other seasons.
    - Choose best alternative season using the same rules (prefer END if season/title match for that season).
    - NOTE: this fallback should be rare and only used when preferredSeason yields nothing.

- FINAL FALLBACK (only when no valid bestPackage for any season is found):
  * Select the best matching release where:
      - The title and season match correctly (for any season), AND
      - The release_name contains [END], [COMPLETE], [FULL SEASON], or [FULL PACK].
  * This fallback release becomes bestPackage with:
        package_type: "best_partial_pack",
        package_complete: false.

  - If NO full-season pack, NO multi-file full coverage, and NO partial packs can be selected as bestPackage:
    * Collect ALL single-episode subtitles from SUBTITLE_LIST.
    * Extract the episode numbers from each subtitle.
    * Build ep_links as a continuous list of unique episodes starting from episode 1 up to the last available episode.
    * Sort episodes ascending.
    * Remove duplicates (if multiple subs exist for same episode, choose the one with best matching language or shortest range).
    * Set:
        bestPackage = null
        package_type = null
        package_complete = false
        matchedSeason = preferredSeason
        finished_anime = false

Return JSON exactly in this structure:
{
  "imdb_id": "${imdb_id}",
  "sd_id": "${sd_id}",
  "bestPackage": {...} | null,
  "package_type": "full_pack_single_file" | "full_pack_multi_files" | "best_partial_pack" | null,
  "package_complete": true|false,
  "matchedSeason": <int|null>,
  "matchedPart": <int|null>,
  "coverage": "X-Y" | null,
  "finished_anime": true|false,
  "ep_links": [ { "episode": <int>, "url":"...", "release_name":"..." }, ... ],
  "ep_link": { "episode": <int>, "url":"...", "release_name":"..." } | null,
  "reason": "short explanation",
  "note": "optional note"
}

SUBTITLE_LIST:
${JSON.stringify(subtitles, null, 2)}
`;

    
    // 4) Call AI to analyze
    console.log(JSON.stringify(subtitles, null, 2));
    const analyzeResp = await aiModel.generateContent({
      contents: [{ role: "user", parts: [{ text: analyzePrompt }] }],
      generationConfig: { temperature: 0.0, topK: 1, topP: 1 },
    });
    const analyzeRaw = analyzeResp.response.text();
    let analyzeParsed;
    try {
      analyzeParsed = JSON.parse(extractJSONFromText(analyzeRaw));
    } catch (e) {
      // if AI returns invalid JSON, still try to recover some basic ep_link using subtitles
      console.warn(
        "AI returned invalid JSON, returning raw AI text and subtitle sample"
      );
      return res.status(500).json({
        error: "AI returned invalid analysis JSON",
        ai_raw: analyzeRaw,
        subtitles_sample: subtitles.slice(0, 12),
      });
    }

    // 5) Ensure ep_links exists (normalize)
    analyzeParsed.ep_links = Array.isArray(analyzeParsed.ep_links)
      ? analyzeParsed.ep_links
      : [];

    // 6) If user requested a specific episode, ensure ep_link is present: prefer AI result, otherwise derive from subtitles list
    if (ep !== null) {
      // if AI provided ep_link, keep it but verify url exists
      if (analyzeParsed.ep_link && analyzeParsed.ep_link.url) {
        // ok
      } else {
        // try to find locally
        const found = findBestSingleEpisodeLink(subtitles, ep, lang);
        if (found) {
          analyzeParsed.ep_link = {
            episode: found.episode,
            url: found.url,
            release_name: found.release_name || null,
          };
          // also ensure ep_links contains this entry (we will normalize ep_links below)
          analyzeParsed.ep_links.push({
            episode: found.episode,
            url: found.url,
            release_name: found.release_name || null,
          });
        } else {
          analyzeParsed.ep_link = null;
        }
      }
    } else {
      // if no ep requested, ensure ep_link key exists
      analyzeParsed.ep_link = analyzeParsed.ep_link || null;
    }

    // === START: New normalization block (convert ep_links -> merged episodes arrays, remove full-season END packs) ===
    (function normalizeEpLinksToEpisodes() {
      // Input: analyzeParsed.ep_links is an array of objects that may have { episode, url, release_name } or other shapes from AI.
      const raw = Array.isArray(analyzeParsed.ep_links)
        ? analyzeParsed.ep_links.slice(0)
        : [];

      // Step 0: If AI returned a bestPackage that is full season, drop ep_links entirely (redundant)
      if (analyzeParsed.bestPackage && analyzeParsed.bestPackage.full_season) {
        analyzeParsed.ep_links = [];
        return;
      }

      // Helper: normalize each raw item to { url, release_name, episodes: [] }
      const normalized = [];
      for (const item of raw) {
        const url = item.url || item.download || item.link || null;
        const release_name = (
          item.release_name ||
          item.name ||
          item.title ||
          ""
        ).toString();
        if (!url) continue;

        // If AI gave explicit 'episodes' array, prefer that
        if (Array.isArray(item.episodes) && item.episodes.length) {
          const eps = item.episodes
            .map((n) => Number(n))
            .filter((n) => Number.isFinite(n));
          if (eps.length) {
            normalized.push({
              url,
              release_name,
              episodes: Array.from(new Set(eps)).sort((a, b) => a - b),
            });
            continue;
          }
        }

        // If AI gave single 'episode' field
        if (Number.isFinite(Number(item.episode))) {
          const epn = Number(item.episode);
          normalized.push({ url, release_name, episodes: [epn] });
          continue;
        }

        // Otherwise, extract episodes from release_name
        const extracted = extractEpisodesFromName(release_name);
        if (extracted && extracted.length) {
          normalized.push({ url, release_name, episodes: extracted });
          continue;
        }

        // If no episodes found, but item has fields episode_from/episode_end, try them
        const episode_from = safeNumber(
          item.episode_from ?? item.ep_from ?? item.episodeStart
        );
        const episode_end = safeNumber(
          item.episode_end ?? item.ep_end ?? item.episodeEnd
        );
        if (episode_from != null || episode_end != null) {
          const s = episode_from ?? episode_end;
          const e = episode_end ?? episode_from;
          if (s != null && e != null) {
            const arr = [];
            for (let i = s; i <= e; i++) arr.push(i);
            normalized.push({ url, release_name, episodes: arr });
            continue;
          } else if (s != null) {
            normalized.push({ url, release_name, episodes: [s] });
            continue;
          }
        }

        // otherwise skip entries we cannot parse
      }

      // Step 1: Remove entries whose release_name indicates a full-season END / COMPLETE pack
      const filtered = normalized.filter(
        (n) => !isFullSeasonName(n.release_name)
      );

      // Step 2: Merge entries by URL (same file) => combine episodes arrays and unify release_name (prefer the longer name)
      const map = new Map();
      for (const entry of filtered) {
        const key = entry.url;
        if (!map.has(key)) {
          map.set(key, {
            url: entry.url,
            release_name: entry.release_name,
            episodes: Array.from(new Set(entry.episodes)).sort((a, b) => a - b),
          });
        } else {
          const cur = map.get(key);
          const merged = Array.from(
            new Set([...cur.episodes, ...entry.episodes])
          ).sort((a, b) => a - b);
          // choose more informative release_name (longer string) if differs
          const rn =
            entry.release_name &&
            entry.release_name.length > (cur.release_name || "").length
              ? entry.release_name
              : cur.release_name;
          cur.episodes = merged;
          cur.release_name = rn;
          map.set(key, cur);
        }
      }

      // Step 3: Convert map to array, and also collapse entries where episodes array is empty
      const mergedArr = [];
      for (const [k, v] of map.entries()) {
        if (!Array.isArray(v.episodes) || !v.episodes.length) continue;
        mergedArr.push({
          episodes: v.episodes,
          url: v.url,
          release_name: v.release_name || null,
        });
      }

      // Step 4: Sort by first episode ascending
      mergedArr.sort((a, b) => {
        const aFirst =
          Array.isArray(a.episodes) && a.episodes.length
            ? a.episodes[0]
            : 99999;
        const bFirst =
          Array.isArray(b.episodes) && b.episodes.length
            ? b.episodes[0]
            : 99999;
        return aFirst - bFirst;
      });

      analyzeParsed.ep_links = mergedArr;
    })();
    // === END normalization block ===

    // If we removed ep_links because bestPackage was full_season, set finished_anime true if not explicitly set
    if (analyzeParsed.bestPackage && analyzeParsed.bestPackage.full_season) {
      analyzeParsed.finished_anime = true;
    }

    // 7) Final normalization: coverage formatting, booleans, required keys
    const final = {
      imdb_id,
      sd_id,
      total_subtitles: subtitles.length,
      analysis: {
        bestPackage: analyzeParsed.bestPackage ?? null,
        package_type: analyzeParsed.package_type ?? null,
        package_complete: Boolean(analyzeParsed.package_complete),
        matchedSeason: analyzeParsed.matchedSeason ?? null,
        matchedPart: analyzeParsed.matchedPart ?? null,
        coverage: analyzeParsed.coverage ?? null,
        finished_anime:
          typeof analyzeParsed.finished_anime === "boolean"
            ? analyzeParsed.finished_anime
            : !!analyzeParsed.ep_links?.length && !analyzeParsed.bestPackage,
        ep_links: Array.isArray(analyzeParsed.ep_links)
          ? analyzeParsed.ep_links
          : [],
        ep_link: analyzeParsed.ep_link || null,
        reason: analyzeParsed.reason ?? null,
        note: analyzeParsed.note ?? null,
      },
    };

    return res.status(200).json(final);
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({
      error: "Failed",
      message: err.message,
    });
  }
};
