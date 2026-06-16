import * as echarts from 'echarts';
import { useEffect, useMemo, useRef } from 'react';
import { loadChinaGeoJSON } from '../data/china-geojson';
import { CITIES } from '../data/cities';
import { useStore } from '../store/useStore';
import { getDepartureColor, getDurationColor } from '../utils/colors';

const provinceAlias: Record<string, string> = {
  北京: '北京市', 天津: '天津市', 上海: '上海市', 重庆: '重庆市', 河北: '河北省', 山西: '山西省',
  内蒙古: '内蒙古自治区', 辽宁: '辽宁省', 吉林: '吉林省', 黑龙江: '黑龙江省', 江苏: '江苏省', 浙江: '浙江省',
  安徽: '安徽省', 福建: '福建省', 江西: '江西省', 山东: '山东省', 河南: '河南省', 湖北: '湖北省',
  湖南: '湖南省', 广东: '广东省', 广西: '广西壮族自治区', 海南: '海南省', 四川: '四川省', 贵州: '贵州省',
  云南: '云南省', 西藏: '西藏自治区', 陕西: '陕西省', 甘肃: '甘肃省', 青海: '青海省', 宁夏: '宁夏回族自治区',
  新疆: '新疆维吾尔自治区', 台湾: '台湾省', 香港: '香港特别行政区', 澳门: '澳门特别行政区',
};

function shortProvince(name: string) {
  return name.replace(/省|市|壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区/g, '');
}

function daysAgo(date: string) {
  const diff = Date.now() - new Date(`${date}T00:00:00`).getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

export default function MapView() {
  const elRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts>();
  const lastPointer = useRef({ x: 0, y: 0, time: 0 });
  const mode = useStore((state) => state.mode);
  const durationRecords = useStore((state) => state.durationRecords);
  const departureRecords = useStore((state) => state.departureRecords);
  const previewCity = useStore((state) => state.previewCity);
  const setPreviewCity = useStore((state) => state.setPreviewCity);
  const setSelectedCity = useStore((state) => state.setSelectedCity);

  const provinceData = useMemo(() => {
    const map = new Map<string, { value: number; cities: string[]; color: string; lit: boolean }>();
    for (const city of CITIES) {
      const geoName = provinceAlias[city.province] ?? city.province;
      const duration = durationRecords.find((record) => record.city_id === city.city_id);
      const departure = departureRecords.find((record) => record.city_id === city.city_id);
      const current = map.get(geoName) ?? { value: 0, cities: [], color: '#F0F0F0', lit: false };
      if (mode === 'duration' && duration) {
        current.value += duration.days;
        current.cities.push(`${city.city_name}${duration.days}天`);
        current.color = getDurationColor(current.value);
        current.lit = true;
      }
      if (mode === 'departure' && departure) {
        const ago = daysAgo(departure.departure_date);
        current.value = current.value ? Math.min(current.value, ago) : ago;
        current.cities.push(`${city.city_name}${ago}天前`);
        current.color = getDepartureColor(current.value);
        current.lit = true;
      }
      map.set(geoName, current);
    }
    return map;
  }, [departureRecords, durationRecords, mode]);

  // Initialize chart and update when data changes
  useEffect(() => {
    let disposed = false;
    let chart: echarts.ECharts | undefined;

    const init = async () => {
      const geoJson = await loadChinaGeoJSON();
      if (disposed || !elRef.current) return;

      echarts.registerMap('china-footprint', geoJson as any);
      chart = echarts.init(elRef.current);
      chartRef.current = chart;

      chart.on('mousedown', (params) => {
        const event = params.event?.event as MouseEvent | undefined;
        if (event) lastPointer.current = { x: event.clientX, y: event.clientY, time: Date.now() };
      });
      chart.on('click', (params) => {
        const event = params.event?.event as MouseEvent | undefined;
        if (event) {
          const distance = Math.hypot(event.clientX - lastPointer.current.x, event.clientY - lastPointer.current.y);
          if (distance > 8 || Date.now() - lastPointer.current.time > 300) return;
        }
        const province = shortProvince(String(params.name ?? ''));
        const city = CITIES.find((item) => item.province === province) ?? CITIES.find((item) => provinceAlias[item.province] === params.name);
        if (!city) return;
        const hasRecord = mode === 'duration'
          ? durationRecords.some((record) => record.city_id === city.city_id)
          : departureRecords.some((record) => record.city_id === city.city_id);
        if (hasRecord || previewCity?.province === city.province) {
          setSelectedCity(city);
        } else {
          setPreviewCity(city);
        }
      });
      window.addEventListener('resize', () => chart?.resize());

      // Set initial option immediately after init
      updateChart(chart);
    };

    const updateChart = (c: echarts.ECharts) => {
      c.setOption({
        backgroundColor: 'transparent',
        tooltip: {
          trigger: 'item',
          formatter: (params: { name: string }) => {
            const data = provinceData.get(params.name);
            if (!data?.lit) return `${params.name}<br/>未点亮，再点一次添加记录`;
            return `${params.name}<br/>${data.cities.slice(0, 6).join('<br/>')}`;
          },
        },
        series: [{
          name: '城市足迹',
          type: 'map',
          map: 'china-footprint',
          roam: true,
          zoom: 1.1,
          selectedMode: false,
          emphasis: { label: { show: true, color: '#131B2E' }, itemStyle: { areaColor: '#B7D4FF' } },
          label: { show: true, fontSize: 11, color: '#424656' },
          itemStyle: { areaColor: '#F0F0F0', borderColor: '#FFFFFF', borderWidth: 1 },
          data: Array.from(provinceData.entries()).map(([name, data]) => ({
            name,
            value: data.value,
            itemStyle: { areaColor: previewCity && provinceAlias[previewCity.province] === name ? '#FFD166' : data.color },
          })),
        }],
      }, true);
      if (previewCity) {
        c.dispatchAction({ type: 'highlight', seriesIndex: 0, name: provinceAlias[previewCity.province] });
      }
    };

    void init();

    return () => {
      disposed = true;
      chart?.dispose();
    };
  }, [mode, provinceData, previewCity]);

  return (
    <div className="map-wrap">
      <div className="china-map" ref={elRef} />
      <div className="south-sea" aria-label="南海诸岛示意图"><span>南海诸岛</span><i /><i /><i /></div>
    </div>
  );
}
