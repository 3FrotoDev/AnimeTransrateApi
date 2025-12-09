"use strict";
// Code by illusionztba
// https://discord.com/channels/987492554486452315/1273988465222090783/1274199611191590984
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindBestMatchByTitles = exports.normalize = void 0;
exports.sanitize = sanitize;
const fastest_levenshtein_1 = require("fastest-levenshtein");
const normalize = (str) => str ? str.toLowerCase() : "";
exports.normalize = normalize;
function sanitize(title) {
    let lowercased = title.toLowerCase();
    lowercased = lowercased.replace(/[^\p{L}\p{N}\s]/gu, "");
    const wordsToRemove = ["season", "cour", "part"];
    const words = lowercased.split(/\s+/);
    const sanitizedWords = words.filter((word) => !wordsToRemove.includes(word));
    return sanitizedWords.join(" ");
}
const FindBestMatchByTitles = (title, results) => {
    const resultTitles = results.map((r) => (0, exports.normalize)(r.title));
    const bestMatch_english = title.english && (0, fastest_levenshtein_1.closest)((0, exports.normalize)(title.english), resultTitles);
    const bestMatch_romaji = title.romaji && (0, fastest_levenshtein_1.closest)((0, exports.normalize)(title.romaji), resultTitles);
    const bestMatch_native = title.native && (0, fastest_levenshtein_1.closest)((0, exports.normalize)(title.native), resultTitles);
    const matches = [
        bestMatch_english,
        bestMatch_romaji,
        bestMatch_native,
    ];
    // Count the frequency of each match and store the first index it appears
    const frequencyMap = {};
    const indexMap = {};
    matches.forEach((match) => {
        frequencyMap[match] = (frequencyMap[match] || 0) + 1;
        if (indexMap[match] === undefined) {
            indexMap[match] = resultTitles.indexOf(match);
        }
    });
    // Find the most common match
    let mostCommonMatch = null;
    let maxFrequency = 0;
    for (const [match, frequency] of Object.entries(frequencyMap)) {
        if (frequency > maxFrequency) {
            mostCommonMatch = match;
            maxFrequency = frequency;
        }
    }
    const mostCommonMatchIndex = mostCommonMatch ? indexMap[mostCommonMatch] : -1;
    return { mostCommonMatch, mostCommonMatchIndex };
};
exports.FindBestMatchByTitles = FindBestMatchByTitles;
