interface OKVideoQuality {
  name: string;
  url: string;
  seekSchema: number;
  disallowed: boolean;
}

interface OKCollageInfo {
  imageType: string;
  url: string;
  frequency: number;
  height: number;
  width: number;
  count: number;
  tileWidth: number;
  tileHeight: number;
}

interface OKVideoMovie {
  id: string;
  movieId: string;
  likeId: string;
  contentId: string;
  poster: string;
  duration: string;
  title: string;
  url: string;
  link: string;
  collageInfo: OKCollageInfo;
  status: string;
  statusText: string;
  isLive: boolean;
  notPublished: boolean;
  isClip: boolean;
  width: number;
  height: number;
}

interface OKAutoplayConfig {
  autoplayEnabled: boolean;
  timeFromEnabled: boolean;
  noRec: boolean;
  fullScreenExit: boolean;
  vitrinaSection: string;
}

interface OKSecurityConfig {
  url: string;
  cookie: string;
}

interface OKP2PInfo {
  isPeerEnabled: boolean;
  ubsc: number;
  pbsc: number;
  mptpc: number;
  pctmt: number;
  pbesc: number;
  prrt: number;
  srt: number;
  swrt: number;
  dctt: number;
}

interface OKStunServer {
  urls: string[];
}

interface OKVideoMetadata {
  movie: OKVideoMovie;
  failoverHosts: string[];
  provider: string;
  service: string;
  owner: boolean;
  voted: boolean;
  likeCount: number;
  subscribed: boolean;
  isWatchLater: boolean;
  slot: number;
  siteZone: number;
  showAd: boolean;
  fromTime: number;
  author: Record<string, any>;
  admanMetadata: Record<string, any>;
  partnerId: number;
  ownerMovieId: string;
  alwaysShowRec: boolean;
  videos: OKVideoQuality[];
  vkMovie: boolean;
  metadataUrl: string;
  hlsManifestUrl: string;
  autoplay: OKAutoplayConfig;
  security: OKSecurityConfig;
  p2pInfo: OKP2PInfo;
  stunServers: OKStunServer[];
  episodes: any[];
}

interface OKVideoData {
  movieId: string;
  title: string;
  duration: number; // in seconds
  poster: string;
  width: number;
  height: number;
  hlsManifestUrl: string;
  metadataUrl: string;
  qualities: OKVideoQuality[];
  collageInfo: OKCollageInfo;
  isLive: boolean;
  isClip: boolean;
  provider: string;
  likeCount: number;
  failoverHosts: string[];
  autoplay: OKAutoplayConfig;
  security: OKSecurityConfig;
  p2pInfo: OKP2PInfo;
  stunServers: OKStunServer[];
  episodes: any[];
  rawMetadata: OKVideoMetadata;
}

function scrapeOKVideo(html: string): OKVideoData | null {
  try {
    const dataOptionsMatch = html.match(/data-options="({[^"]+})"/);
    if (!dataOptionsMatch) {
      throw new Error('Could not find data-options attribute');
    }

    const dataOptionsStr = dataOptionsMatch[1]!
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&');
    
    const dataOptions = JSON.parse(dataOptionsStr);
    
    const metadataStr = dataOptions.flashvars?.metadata;
    if (!metadataStr) {
      throw new Error('Could not find metadata in flashvars');
    }

    const metadata: OKVideoMetadata = JSON.parse(
      metadataStr.replace(/\\"/g, '"').replace(/\\u0026/g, '&')
    );

    const durationInSeconds = parseInt(metadata.movie.duration, 10);

    const videoData: OKVideoData = {
      movieId: metadata.movie.movieId,
      title: metadata.movie.title,
      duration: durationInSeconds,
      poster: metadata.movie.poster,
      width: metadata.movie.width,
      height: metadata.movie.height,
      hlsManifestUrl: metadata.hlsManifestUrl,
      metadataUrl: metadata.metadataUrl,
      qualities: metadata.videos,
      collageInfo: metadata.movie.collageInfo,
      isLive: metadata.movie.isLive,
      isClip: metadata.movie.isClip,
      provider: metadata.provider,
      likeCount: metadata.likeCount,
      failoverHosts: metadata.failoverHosts,
      autoplay: metadata.autoplay,
      security: metadata.security,
      p2pInfo: metadata.p2pInfo,
      stunServers: metadata.stunServers,
      episodes: metadata.episodes,
      rawMetadata: metadata
    };

    return videoData;
  } catch (error) {
    console.error('Error scraping OK video:', error);
    return null;
  }
}

export const extractOKRu = async (url: string) => {
    const res = await fetch(url);
    const text = await res.text();

    const data = scrapeOKVideo(text);

    return data;
}