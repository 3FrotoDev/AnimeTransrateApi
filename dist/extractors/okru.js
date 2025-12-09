"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractOKRu = void 0;
function scrapeOKVideo(html) {
    try {
        const dataOptionsMatch = html.match(/data-options="({[^"]+})"/);
        if (!dataOptionsMatch) {
            throw new Error('Could not find data-options attribute');
        }
        const dataOptionsStr = dataOptionsMatch[1]
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&');
        const dataOptions = JSON.parse(dataOptionsStr);
        const metadataStr = dataOptions.flashvars?.metadata;
        if (!metadataStr) {
            throw new Error('Could not find metadata in flashvars');
        }
        const metadata = JSON.parse(metadataStr.replace(/\\"/g, '"').replace(/\\u0026/g, '&'));
        const durationInSeconds = parseInt(metadata.movie.duration, 10);
        const videoData = {
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
    }
    catch (error) {
        console.error('Error scraping OK video:', error);
        return null;
    }
}
const extractOKRu = async (url) => {
    const res = await fetch(url);
    const text = await res.text();
    const data = scrapeOKVideo(text);
    return data;
};
exports.extractOKRu = extractOKRu;
