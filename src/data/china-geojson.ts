// @ts-nocheck
import chinaGeoJSON from './china.json';

const CDN_BASE = 'https://geo.datav.aliyun.com/areas_v3/bound';

export const PROVINCE_ADCODES: Record<string, string> = {
  北京: '110000',
  天津: '120000',
  河北: '130000',
  山西: '140000',
  内蒙古: '150000',
  辽宁: '210000',
  吉林: '220000',
  黑龙江: '230000',
  上海: '310000',
  江苏: '320000',
  浙江: '330000',
  安徽: '340000',
  福建: '350000',
  江西: '360000',
  山东: '370000',
  河南: '410000',
  湖北: '420000',
  湖南: '430000',
  广东: '440000',
  广西: '450000',
  海南: '460000',
  重庆: '500000',
  四川: '510000',
  贵州: '520000',
  云南: '530000',
  西藏: '540000',
  陕西: '610000',
  甘肃: '620000',
  青海: '630000',
  宁夏: '640000',
  新疆: '650000',
  台湾: '710000',
  香港: '810000',
  澳门: '820000',
};

const cache = new Map<string, unknown>();

async function fetchGeoJson(path: string) {
  if (cache.has(path)) return cache.get(path);
  const response = await fetch(`${CDN_BASE}/${path}`);
  if (!response.ok) throw new Error(`GeoJSON fetch failed: ${path}`);
  const json = await response.json();
  cache.set(path, json);
  return json;
}

export async function loadChinaGeoJSON() {
  try {
    return await fetchGeoJson('100000_full.json');
  } catch (error) {
    console.warn('Using bundled China GeoJSON fallback', error);
    return chinaGeoJSON;
  }
}

export async function loadProvinceGeoJSON(province: string) {
  const adcode = PROVINCE_ADCODES[province];
  if (!adcode) return null;
  try {
    return await fetchGeoJson(`${adcode}_full.json`);
  } catch (error) {
    console.warn('Province GeoJSON fetch failed', province, error);
    return null;
  }
}
