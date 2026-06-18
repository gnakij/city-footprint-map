// @ts-nocheck
import fallbackChinaGeoJSON from './china.json';

const GEO_BASE = '/cityprint/geojson';
const cache = new Map<string, unknown>();

/** 全国省级地图（仅省界轮廓，用于判断某个点击位置属于哪个省，及作为兜底） */
export async function loadChinaGeoJSON() {
  if (cache.has('china')) return cache.get('china');
  try {
    const response = await fetch(`${GEO_BASE}/100000.json`);
    if (!response.ok) throw new Error(`GeoJSON request failed: ${response.status}`);
    const data = await response.json();
    cache.set('china', data);
    return data;
  } catch (error) {
    console.warn('Using bundled China GeoJSON fallback', error);
    cache.set('china', fallbackChinaGeoJSON);
    return fallbackChinaGeoJSON;
  }
}

/**
 * 全国市级地图：合并了 369 个地级市/直辖市的边界，用于首页直接展示到城市粒度。
 * 由构建时脚本从各省 geojson 拼合生成（public/geojson/china-cities.json）。
 */
export async function loadChinaCitiesGeoJSON() {
  if (cache.has('china-cities')) return cache.get('china-cities');
  const response = await fetch(`${GEO_BASE}/china-cities.json`);
  if (!response.ok) throw new Error(`China cities GeoJSON request failed: ${response.status}`);
  const data = await response.json();
  cache.set('china-cities', data);
  return data;
}

/**
 * 省界强调图层：33 个省级行政区轮廓，几何上由 china-cities.json 里同省份的
 * 所有市合并（union）而成 —— 与市级地图共享同一份原始地理数据，保证投影坐标完全对齐，
 * 用于在市级色块之上叠加更粗的省界线，同时不会与主图层产生缩放/平移不同步的问题。
 */
export async function loadProvinceOutlineGeoJSON() {
  if (cache.has('province-outline')) return cache.get('province-outline');
  const response = await fetch(`${GEO_BASE}/china-provinces-outline.json`);
  if (!response.ok) throw new Error(`Province outline GeoJSON request failed: ${response.status}`);
  const data = await response.json();
  cache.set('province-outline', data);
  return data;
}

export async function loadProvinceGeoJSON(adcode: number | string) {
  const key = String(adcode);
  if (cache.has(key)) return cache.get(key);
  const response = await fetch(`${GEO_BASE}/${key}.json`);
  if (!response.ok) throw new Error(`Province GeoJSON request failed: ${response.status}`);
  const data = await response.json();
  cache.set(key, data);
  return data;
}
