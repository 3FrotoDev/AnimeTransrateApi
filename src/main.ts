import { getAnime } from "./mapping";
import { getEpisodeServers } from "./scraper";
import axios, { type AxiosResponse } from "axios";


export interface VideoLink {
  name?: string;
  type?: string;
  quality?: string;
  data?: string;
  source?: string;
  url?: string;
}

export interface GroupedQualities {
  [quality: string]: VideoLink[];
}

export interface GroupedType {
  type: string;
  qualities: GroupedQualities;
}

export type GroupedResult = GroupedType[];


export async function checkVideo(url: string): Promise<boolean> {
  try {
    const headRes: AxiosResponse = await axios.head(url, {
      timeout: 8000,
      validateStatus: () => true,
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (headRes.status >= 400) return false;
    return true;
  } catch {
    try {
      const res: AxiosResponse<string> = await axios.get(url, {
        timeout: 10000,
        headers: { "User-Agent": "Mozilla/5.0" },
      });

      const html = res.data?.toLowerCase() || "";

      const errorPatterns = [
        "not found",
        "file was deleted",
        "file not found",
        "video unavailable",
        "removed",
        "error loading",
        "we're sorry",
        "404",
        "this video doesn",
        "the file you are looking for",
      ];

      return !errorPatterns.some((e) => html.includes(e));
    } catch {
      return false;
    }
  }
}

export async function filterWorkingLinks(
  links: VideoLink[]
): Promise<VideoLink[]> {
  const results = await Promise.all(
    links.map(async (link) => {
      if (!link.url) return null;
      const ok = await checkVideo(link.url);
      return ok ? link : null;
    })
  );

  return results.filter((x): x is VideoLink => x !== null);
}

export function groupLinks(links: VideoLink[]): GroupedResult {
  const allowedTypes = ["mp4upload", "videa", "4shared"];
  const result: GroupedResult = [];

  for (const type of allowedTypes) {
    const typeLinks = links.filter(
      (l) => l.type?.toLowerCase() === type && l.url
    );

    if (typeLinks.length === 0) continue;

    const qualities: GroupedQualities = {};

    for (const link of typeLinks) {
      const q = link.quality || "UNKNOWN";

      if (!qualities[q]) qualities[q] = [];
      qualities[q].push({ ...link });
    }

    result.push({ type, qualities });
  }

  return result;
}


export async function getEpisodeStreaming(anilistId: number,ep:number) {
  const anime = await getAnime(anilistId);
  //@ts-ignore
  const animeId = anime.animeId ?? undefined;

  if (!animeId) {
    return {
      animeId: null,
      servers: [],
    };
  }

  const episodeServers: VideoLink[] = await getEpisodeServers(animeId, ep);

  const workingLinks = await filterWorkingLinks(episodeServers);

  const grouped = groupLinks(workingLinks);

  return {
    animeId,
    servers: grouped,
  };
}
