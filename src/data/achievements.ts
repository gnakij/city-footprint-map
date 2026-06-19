import type { Achievement } from '../types';
import { visitDays } from '../utils/date';

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
    description: '任意城市停留超过20年',
    icon: '🏠',
    check: (records) => records.some((record) => visitDays(record) > 365 * 20),
  },
  {
    id: 'north_extreme',
    name: '神州北极',
    description: '点亮漠河（中国最北）',
    icon: '🧭',
    check: (records) => records.some((record) => record.city_id === 'mohe'),
  },
  {
    id: 'east_extreme',
    name: '东极迎光',
    description: '点亮抚远（中国最东）',
    icon: '🌅',
    check: (records) => records.some((record) => record.city_id === 'fuyuan'),
  },
  {
    id: 'south_extreme',
    name: '南海逐浪',
    description: '点亮三沙（中国最南）',
    icon: '🏝️',
    check: (records) => records.some((record) => record.city_id === 'sansha'),
  },
  {
    id: 'west_extreme',
    name: '西域极境',
    description: '点亮喀什（中国最西）',
    icon: '🏜️',
    check: (records) => records.some((record) => record.city_id === 'kashi'),
  },
  {
    id: 'all_cities',
    name: '全国制霸',
    description: '点亮城市库中的全部城市',
    icon: '👑',
    check: (records, cities) => uniqueCities(records).size >= cities.length,
  },
];
