import { CITIES } from '../data/cities';

export const municipalities = new Set(['北京', '天津', '上海', '重庆', '香港', '澳门']);

export function shortName(name: string) {
  return name.replace(/省|市|壮族自治区|回族自治区|维吾尔自治区|维吾尔自治州|族自治州|自治州|自治县|自治区|特别行政区|地区|盟|县|区/g, '');
}

export function findCityForFeature(provinceShort: string, featureName: string, featureAdcode?: number) {
  if (municipalities.has(provinceShort)) return CITIES.find(c => c.province === provinceShort);
  const provCities = CITIES.filter(c => c.province === provinceShort);
  if (featureAdcode) {
    const byAdcode = provCities.find(c => c.adcode === featureAdcode);
    if (byAdcode) return byAdcode;
  }
  const cleanFeature = featureName.replace(/市$/, '');
  return provCities.find(c => c.city_name === featureName || c.city_name === cleanFeature);
}

export const PROVINCE_CENTROIDS: Record<string, [number, number]> = {
  北京: [116.4199, 40.188],
  天津: [117.3508, 39.2852],
  上海: [121.438, 31.0711],
  重庆: [107.8796, 30.055],
  香港: [114.1328, 22.3788],
  澳门: [113.5656, 22.1619],
  河北: [116.142, 39.5452],
  山西: [112.2954, 37.5724],
  内蒙古: [108, 40.2],
  辽宁: [122.6009, 41.2808],
  吉林: [126.1947, 43.6704],
  黑龙江: [127.7743, 47.8637],
  江苏: [119.4942, 32.9643],
  浙江: [120.1089, 29.1694],
  安徽: [117.2315, 31.8239],
  福建: [118.0034, 26.056],
  江西: [115.7274, 27.6116],
  山东: [118.1802, 36.3604],
  河南: [113.62, 33.8815],
  湖北: [112.2755, 30.974],
  湖南: [111.714, 27.6066],
  广东: [113.4216, 23.3213],
  广西: [108.7925, 23.8188],
  海南: [109.7541, 19.1874],
  四川: [102.695, 30.6265],
  贵州: [106.8779, 26.8125],
  云南: [101.488, 24.9723],
  西藏: [88.4436, 31.4891],
  陕西: [108.8741, 35.1911],
  甘肃: [101.5, 38.5],
  青海: [96.0412, 35.6699],
  宁夏: [106.1682, 37.2334],
  新疆: [85.1932, 41.1171],
  台湾: [120.9697, 23.7421],
};
