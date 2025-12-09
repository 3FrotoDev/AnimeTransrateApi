import { load } from "cheerio";

interface VideoServer {
  name: string;
  type: string;
  quality: string;
  data: string;
  source: string;
  url?: string;
}

interface Episode {
  episodeNumber: number;
  servers: VideoServer[];
}

interface AnimeData {
  totalEpisodes: number;
  episodes: Episode[];
}

export const getAnimeEpisodes = async (animeId: string): Promise<AnimeData> => {
  try {
    const res = await fetch(`https://animeslayerweb.com/anime/${animeId}`);
    
    if (!res.ok) {
      throw new Error(`Failed to fetch anime data: ${res.status} ${res.statusText}`);
    }

    const text = await res.text();
    const $ = load(text);

    const noscript = $("#diplayer").html();
    
    if (!noscript) {
      throw new Error("Could not find episode data in page");
    }

    const $$ = load(noscript);

    const episodes: Episode[] = [];
    
    $$(".divv11").each((episodeIndex, episodeElement) => {
      const servers: VideoServer[] = [];
      
      $$(episodeElement).find("li").each((serverIndex, serverElement) => {
        const $server = $$(serverElement);
        
        servers.push({
          name: $server.text().trim(),
          type: $server.attr("type") || "",
          quality: $server.attr("quality-data") || "",
          data: $server.attr("data") || "",
          source: $server.attr("source") || "",
          url: generateIframeUrl({
                      name: $server.text().trim(),
          type: $server.attr("type") || "",
          quality: $server.attr("quality-data") || "",
          data: $server.attr("data") || "",
          source: $server.attr("source") || "",
          }) || undefined,
        });
      });

      episodes.push({
        episodeNumber: episodeIndex + 1,
        servers
      });
    });

    return {
      totalEpisodes: episodes.length,
      episodes
    };
  } catch (error) {
    console.error("Oopsie! Something went wrong:", error);
    throw error;
  }
};

export const getEpisodeServers = async (
  animeId: string, 
  episodeNumber: number
): Promise<VideoServer[]> => {
  const data = await getAnimeEpisodes(animeId);
  
  const episode = data.episodes.find(ep => ep.episodeNumber === episodeNumber);
  
  if (!episode) {
    throw new Error(`Episode ${episodeNumber} not found! Only ${data.totalEpisodes} episodes available.`);
  }
  
  return episode.servers;
};


export const getEpisodeServersByQuality = async (
  animeId: string,
  episodeNumber: number,
  quality: "FHD" | "HD" | "SD" | "LD"
): Promise<VideoServer[]> => {
  const servers = await getEpisodeServers(animeId, episodeNumber);
  return servers.filter(server => server.quality === quality);
};


export const generateIframeUrl = (server: VideoServer): string | null => {
  const { type, data } = server;
  
  switch (type.toLowerCase()) {
    case "ok":
      return `https://www.ok.ru/videoembed/${data}`;
    
    case "drive":
      if (data.includes("/preview")) {
        const fileId = data.split("/p")[0];
        return `https://drive.google.com/file/d/${fileId}/preview`;
      }
      return `https://drive.google.com/file/d/${data}/preview`;
    
    case "fembed":
      return `https://www.fembed.com/v/${data}`;
    
    case "vid4up":
      return `https://cdn2.vid4up.xyz/embedvideo/${data}`;
    
    case "4shared":
      return `https://www.4shared.com/web/embed/file/${data}`;
    
    case "mega":
      return `https://mega.nz/embed/${data}`;
    
    case "animeup":
      return `https://www.anime4up.net/player/${data}`;
    
    case "mp4upload":
      return `https://www.mp4upload.com/embed-${data}.html`;
    
    case "dood":
    case "doodstream":
      return `https://dood.so/e/${data}`;
    
    case "videa":
      // Videa uses a different embed format
      return `https://videa.hu/player?v=${data}`;
    
    case "dailymotion":
      return `https://www.dailymotion.com/embed/video/${data}`;
    
    case "uqload":
      return `https://uqload.to/embed-${data}.html`;
    
    default:
      console.warn(`Unknown server type: ${type}`);
      return null;
  }
};


export const getPlayableServer = async (
  animeId: string,
  episodeNumber: number,
  preferredQuality?: "FHD" | "HD" | "SD" | "LD"
): Promise<VideoServer & { iframeUrl: string | null }> => {
  let servers = await getEpisodeServers(animeId, episodeNumber);
  
  if (preferredQuality) {
    const qualityServers = servers.filter(s => s.quality === preferredQuality);
    if (qualityServers.length > 0) {
      servers = qualityServers;
    }
  }
  
  for (const server of servers) {
    const iframeUrl = generateIframeUrl(server);
    if (iframeUrl) {
      return { ...server, iframeUrl };
    }
  }
  
  return { ...servers[0], iframeUrl: null };
};


