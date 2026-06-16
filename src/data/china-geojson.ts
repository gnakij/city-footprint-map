const provinceNames = [
  ['北京市', '110000'], ['天津市', '120000'], ['河北省', '130000'], ['山西省', '140000'], ['内蒙古自治区', '150000'],
  ['辽宁省', '210000'], ['吉林省', '220000'], ['黑龙江省', '230000'], ['上海市', '310000'], ['江苏省', '320000'],
  ['浙江省', '330000'], ['安徽省', '340000'], ['福建省', '350000'], ['江西省', '360000'], ['山东省', '370000'],
  ['河南省', '410000'], ['湖北省', '420000'], ['湖南省', '430000'], ['广东省', '440000'], ['广西壮族自治区', '450000'],
  ['海南省', '460000'], ['重庆市', '500000'], ['四川省', '510000'], ['贵州省', '520000'], ['云南省', '530000'],
  ['西藏自治区', '540000'], ['陕西省', '610000'], ['甘肃省', '620000'], ['青海省', '630000'], ['宁夏回族自治区', '640000'],
  ['新疆维吾尔自治区', '650000'], ['台湾省', '710000'], ['香港特别行政区', '810000'], ['澳门特别行政区', '820000'],
];

const makeBox = (index: number) => {
  const col = index % 7;
  const row = Math.floor(index / 7);
  const x = 73 + col * 8;
  const y = 18 + row * 7;
  return [[[
    [x, y],
    [x + 6, y],
    [x + 6, y + 5],
    [x, y + 5],
    [x, y],
  ]]];
};

export async function loadChinaGeoJSON() {
  try {
    const response = await fetch('https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json', { cache: 'force-cache' });
    if (!response.ok) {
      throw new Error('地图数据加载失败');
    }
    return await response.json();
  } catch {
    return {
      type: 'FeatureCollection',
      features: provinceNames.map(([name, id], index) => ({
        type: 'Feature',
        properties: { name, id },
        geometry: {
          type: 'MultiPolygon',
          coordinates: makeBox(index),
        },
      })),
    };
  }
}
