// Code by illusionztba
// https://discord.com/channels/987492554486452315/1273988465222090783/1274199611191590984

import { closest } from "fastest-levenshtein";

export type Title = {
    native: string;
    romaji: string;
    english: string;
}

type FrequencyMap = { [key: string]: number };
type IndexMap = { [key: string]: number };

export const normalize = (str: string | null | undefined) =>
  str ? str.toLowerCase() : "";

export function sanitize(title: string): string {
  let lowercased = title.toLowerCase();

  lowercased = lowercased.replace(/[^\p{L}\p{N}\s]/gu, "");

  const wordsToRemove = ["season", "cour", "part"];

  const words = lowercased.split(/\s+/);

  const sanitizedWords = words.filter((word) => !wordsToRemove.includes(word));

  return sanitizedWords.join(" ");
}

export type Input<T> = {
  id: string;
  title: string;
} & T;

const FindBestMatchByTitles = <T>(title: Title, results: Input<T>[]) => {
  const resultTitles = results.map((r) => normalize(r.title));

  const bestMatch_english =
    title.english && closest(normalize(title.english), resultTitles);
  const bestMatch_romaji =
    title.romaji && closest(normalize(title.romaji), resultTitles);
  const bestMatch_native =
    title.native && closest(normalize(title.native), resultTitles);

  const matches: string[] = [
    bestMatch_english,
    bestMatch_romaji,
    bestMatch_native,
  ];

  // Count the frequency of each match and store the first index it appears
  const frequencyMap: FrequencyMap = {};
  const indexMap: IndexMap = {};

  matches.forEach((match) => {
    frequencyMap[match] = (frequencyMap[match] || 0) + 1;
    if (indexMap[match] === undefined) {
      indexMap[match] = resultTitles.indexOf(match);
    }
  });

  // Find the most common match
  let mostCommonMatch: string | null = null;
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

export { FindBestMatchByTitles };