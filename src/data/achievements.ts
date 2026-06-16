import type { Achievement } from '../types';

const uniqueCities = (records: { city_id: string }[]) => new Set(records.map((record) => record.city_id));

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_light',
    name: '初次点亮',
    description: '点亮第一座城市',
    icon: '🌟',
    check: (records) => uniqueCities(records).size >= 1,
  },
  {
    id: 'ten_cities',
    name: '十城达人',
    description: '点亮十座城市',
    icon: '⭐',
    check: (records) => uniqueCities(records).size >= 10,
  },
  {
    id: 'province_conqueror',
    name: '省份征服者',
    description: '点亮十个省级地区',
    icon: '🏆',
    check: (records, cities) => {
      const lit = uniqueCities(records);
      return new Set(cities.filter((city) => lit.has(city.city_id)).map((city) => city.province)).size >= 10;
    },
  },
  {
    id: 'hundred_club',
    name: '百城俱乐部',
    description: '点亮一百座城市',
    icon: '💯',
    check: (records) => uniqueCities(records).size >= 100,
  },
  {
    id: 'long_stay',
    name: '长居达人',
    description: '任意城市停留超过一年',
    icon: '🏠',
    check: (records) => records.some((record) => 'days' in record && record.days > 365),
  },
  {
    id: 'all_cities',
    name: '全国制霸',
    description: '点亮城市库中的全部城市',
    icon: '👑',
    check: (records, cities) => uniqueCities(records).size >= cities.length,
  },
];
