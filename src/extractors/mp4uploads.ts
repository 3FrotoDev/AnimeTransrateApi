import { load } from "cheerio";

interface MP4UploadsVideoData {
  videoId: string;
  videoUrl: string;
  mp4Url: string;
  posterUrl: string;
}

function scrapeMp4UploadsVideoData(html: string): MP4UploadsVideoData | null {
  const $ = load(html);
  
  let videoId: string | undefined = '';
  let videoUrl: string | undefined = '';
  let mp4Url: string | undefined = '';
  let posterUrl: string | undefined = '';
  
  $('script').each((_, element) => {
    const scriptContent = $(element).html() || '';
    
    if (scriptContent.includes('player.src') && scriptContent.includes('video/mp4')) {
      
      const mp4Match = scriptContent.match(/src:\s*"([^"]+\.mp4)"/);
      if (mp4Match) {
        mp4Url = mp4Match[1];
      }
      
      const posterMatch = scriptContent.match(/player\.poster\("([^"]+)"\)/);
      if (posterMatch) {
        posterUrl = posterMatch[1];
      }
      
      const videoIdMatch = scriptContent.match(/video_id:\s*"([^"]+)"/);
      if (videoIdMatch) {
        videoId = videoIdMatch[1];
      }
      
      const urlMatch = scriptContent.match(/url:\s*"([^"]+)"/);
      if (urlMatch) {
        videoUrl = urlMatch[1];
      }
    }
  });
  
  if (!videoId || !mp4Url) {
    return null;
  }
  
  return {
    videoId,
    videoUrl,
    mp4Url,
    posterUrl
  };
}

export const extractMp4Uplaods = async (url: string) => {
    const res = await fetch(url);
    const text = await res.text();

    const data = scrapeMp4UploadsVideoData(text);

    return data;
}
