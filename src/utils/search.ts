import type { CityData } from '../types';

function scoreCity(query: string, city: CityData): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const haystacks = [city.city_name, city.province, city.pinyin].map((item) => item.toLowerCase());
  let score = 0;
  for (const text of haystacks) {
    if (text === q) score = Math.max(score, 100);
    else if (text.startsWith(q)) score = Math.max(score, 80 - text.length);
    else if (text.includes(q)) score = Math.max(score, 50 - text.indexOf(q));
    else {
      let cursor = 0;
      let matched = 0;
      for (const char of q) {
        const next = text.indexOf(char, cursor);
        if (next === -1) break;
        cursor = next + 1;
        matched += 1;
      }
      if (matched === q.length) score = Math.max(score, 25 - text.length);
    }
  }
  return score;
}

export function fuzzySearch(query: string, cities: CityData[]): CityData[] {
  return cities
    .map((city) => ({ city, score: scoreCity(query, city) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.city.pinyin.localeCompare(b.city.pinyin))
    .slice(0, 8)
    .map((item) => item.city);
}
