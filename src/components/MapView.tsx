import * as echarts from 'echarts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadChinaCitiesGeoJSON, loadChinaGeoJSON, loadProvinceGeoJSON, loadProvinceOutlineGeoJSON } from '../data/china-geojson';
import { CITIES } from '../data/cities';
import { useStore } from '../store/useStore';
import type { CityData } from '../types';
import { getDurationColor } from '../utils/colors';
import { visitDays } from '../utils/date';

const provinceAlias: Record<string, string> = {
  北京: '北京市', 天津: '天津市', 上海: '上海市', 重庆: '重庆市', 河北: '河北省', 山西: '山西省',
  内蒙古: '内蒙古自治区', 辽宁: '辽宁省', 吉林: '吉林省', 黑龙江: '黑龙江省', 江苏: '江苏省', 浙江: '浙江省',
  安徽: '安徽省', 福建: '福建省', 江西: '江西省', 山东: '山东省', 河南: '河南省', 湖北: '湖北省',
  湖南: '湖南省', 广东: '广东省', 广西: '广西壮族自治区', 海南: '海南省', 四川: '四川省', 贵州: '贵州省',
  云南: '云南省', 西藏: '西藏自治区', 陕西: '陕西省', 甘肃: '甘肃省', 青海: '青海省', 宁夏: '宁夏回族自治区',
  新疆: '新疆维吾尔自治区', 台湾: '台湾省', 香港: '香港特别行政区', 澳门: '澳门特别行政区',
};

const municipalities = new Set(['北京', '天津', '上海', '重庆', '香港', '澳门']);

type ProvinceView = { name: string; short: string; adcode: number };
type GeoJsonFeature = { properties: { name: string; adcode: number; center?: [number, number]; parent?: { adcode: number } } };
type GeoJson = { features?: GeoJsonFeature[] };

function shortName(name: string) {
  return name.replace(/省|市|壮族自治区|回族自治区|维吾尔自治区|维吾尔自治州|族自治州|自治州|族自治县|自治县|族自治旗|自治旗|自治区|特别行政区|地区|盟|县|区/g, '');
}
function findCityForFeature(provinceShort: string, featureName: string, featureAdcode?: number) {
  if (municipalities.has(provinceShort)) return CITIES.find(c => c.province === provinceShort);
  const provCities = CITIES.filter(c => c.province === provinceShort);
  // 优先：adcode 精确匹配
  if (featureAdcode) {
    const byAdcode = provCities.find(c => c.adcode === featureAdcode);
    if (byAdcode) return byAdcode;
  }
  // 兜底：城市名去"市"后缀匹配
  const cleanFeature = featureName.replace(/市$/, '');
  return provCities.find(c => c.city_name === featureName || c.city_name === cleanFeature);
}

// ECharts dispatchAction geoRoam 的参数格式
interface GeoRoamAction {
  type: 'geoRoam';
  seriesId?: string;
  seriesIndex?: number | number[];
  // 平移（像素）
  dx?: number;
  dy?: number;
  // 缩放：zoom 是增量倍率，originX/Y 是锚点像素坐标（相对容器）
  zoom?: number;
  originX?: number;
  originY?: number;
  animation?: { duration: number };
}

// 每次 pinch/wheel 的最大缩放步长（倍率），限制单帧变化量
const MAX_ZOOM_FACTOR = 1.25;
const MIN_ZOOM_FACTOR = 0.8;
const ZOOM_INIT = 1.1;  // 与 renderMap 里的初始 zoom 一致
const WHEEL_STEP = 0.15;       // 鼠标滚轮每格步长
// 拖拽判定阈值（像素）：移动超过这个距离才算"拖拽"，否则视为点击
const DRAG_THRESHOLD = 6;

// 点亮/未点亮省份的标签颜色
const LABEL_COLOR_LIT = '#8C2540';     // 已点亮：更深更明显
const LABEL_COLOR_UNLIT = '#B7A2AA';   // 未点亮：更淡

// 全国视图下参与 geoRoam 同步的 series 下标：
// 0 = 主图层（市级色块），1 = 省界轮廓层（粗边框+省名标注）。
// 两者的 GeoJSON 几何来源相同（省界图是市级图按省份 union 而来，bbox 完全一致），
// 所以即使是两个独立的 geo 坐标系实例，只要每次都用完全相同的 zoom/dx/dy 参数
// 同时驱动，视觉上就会保持像素级对齐，不会出现拖拽时两层分离的问题。
const NATIONAL_VIEW_SERIES_INDICES = [0, 1];

export default function MapView() {
  const elRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts>();
  const activeProvinceRef = useRef<ProvinceView | null>(null);
  const chinaGeoRef = useRef<GeoJson | null>(null);
  const chinaCitiesGeoRef = useRef<GeoJson | null>(null);
  const provinceOutlineGeoRef = useRef<GeoJson | null>(null);
  const provinceGeoRef = useRef<GeoJson | null>(null);

  // 是否发生了拖拽：在 pointerdown 时清零，pointermove/touchmove 真实位移超过阈值时置位
  // ECharts click 回调里直接读这个布尔值，不再依赖时间戳/距离的事后计算（避免误判）
  const didDragRef = useRef(false);
  // 自维护当前 zoom，避免依赖 ECharts 内部 API 读取
  const currentZoomRef = useRef(ZOOM_INIT);
  // 追踪省份是否切换（用于决定是否重置 zoom）
  const prevProvinceRef = useRef<string | null | undefined>(undefined);

  const [activeProvince, setActiveProvince] = useState<ProvinceView | null>(null);
  const visits = useStore(s => s.visits);
  const previewCity = useStore(s => s.previewCity);
  const setPreviewCity = useStore(s => s.setPreviewCity);
  const setSelectedCity = useStore(s => s.setSelectedCity);
  const showToast = useStore(s => s.showToast);

  const cityDays = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of visits) map.set(v.city_id, (map.get(v.city_id) ?? 0) + visitDays(v));
    return map;
  }, [visits]);

  // 每个省份是否至少有一座点亮的城市（用于全国视图下省名标注的颜色区分）
  const litProvinces = useMemo(() => {
    const set = new Set<string>();
    for (const city of CITIES) {
      if ((cityDays.get(city.city_id) ?? 0) > 0) set.add(city.province);
    }
    return set;
  }, [cityDays]);

  useEffect(() => { activeProvinceRef.current = activeProvince; }, [activeProvince]);

  // ── 用 dispatchAction geoRoam 做缩放 ────────────────────────────────────
  // 省级视图下只有 1 个系列（坐标系天然唯一），全国视图下需要把同一个 zoom/origin
  // 同时广播给主图层和省界轮廓层这两个独立坐标系，保证二者像素对齐、不分离。
  const dispatchZoom = useCallback((
    zoomDelta: number,
    originX: number,
    originY: number,
  ) => {
    const chart = chartRef.current;
    if (!chart) return;
    const clamped = Math.min(MAX_ZOOM_FACTOR, Math.max(MIN_ZOOM_FACTOR, zoomDelta));
    currentZoomRef.current = Math.min(12, Math.max(0.5, currentZoomRef.current * clamped));
    const seriesIndices = activeProvinceRef.current ? [0] : NATIONAL_VIEW_SERIES_INDICES;
    for (const seriesIndex of seriesIndices) {
      chart.dispatchAction({
        type: 'geoRoam',
        seriesIndex,
        zoom: clamped,
        originX,
        originY,
        animation: { duration: 0 },
      } as GeoRoamAction);
    }
  }, []);

  // ── 用 dispatchAction geoRoam 做平移 ────────────────────────────────────
  const dispatchPan = useCallback((dx: number, dy: number) => {
    const chart = chartRef.current;
    if (!chart) return;
    const seriesIndices = activeProvinceRef.current ? [0] : NATIONAL_VIEW_SERIES_INDICES;
    for (const seriesIndex of seriesIndices) {
      chart.dispatchAction({
        type: 'geoRoam',
        seriesIndex,
        dx,
        dy,
        animation: { duration: 0 },
      } as GeoRoamAction);
    }
  }, []);

  const renderMap = useCallback(async () => {
    const chart = chartRef.current;
    if (!chart) return;
    const mapName = activeProvince ? `province-${activeProvince.adcode}` : 'china-cities-footprint';

    let provinceGeo: GeoJson | undefined;
    if (activeProvince) {
      try {
        provinceGeo = await loadProvinceGeoJSON(activeProvince.adcode) as GeoJson;
        if (!provinceGeo?.features?.length) {
          showToast({ icon: '!', message: '无法加载该省份地图数据' });
          setActiveProvince(null);
          return;
        }
        echarts.registerMap(mapName, provinceGeo as never);
        provinceGeoRef.current = provinceGeo;
      } catch {
        showToast({ icon: '!', message: '加载省份地图失败，请检查网络连接' });
        setActiveProvince(null);
        return;
      }
    }

    if (!activeProvince) provinceGeoRef.current = null;
    // 只在真正切换省份（或首次渲染）时重置 zoom，preview 变化不影响
    const prevProv = prevProvinceRef.current;
    const curProv = activeProvince ? activeProvince.short : null;
    const provinceChanged = prevProv !== curProv;
    prevProvinceRef.current = curProv;
    if (provinceChanged) {
      currentZoomRef.current = activeProvince ? 1 : ZOOM_INIT;
    }

    let data: Array<{ name: string; value: number; itemStyle: { areaColor: string }; label?: { color: string } }>;

    if (activeProvince) {
      // 省级视图：城市级 data，点击直接打开录入抽屉
      data = (provinceGeo?.features ?? []).map(f => {
        const city = findCityForFeature(activeProvince.short, f.properties.name, f.properties.adcode as number);
        const value = city ? cityDays.get(city.city_id) ?? 0 : 0;
        const lit = value > 0;
        return {
          name: f.properties.name,
          value,
          itemStyle: {
            areaColor: previewCity?.city_id === city?.city_id
              ? '#FFD166'
              : lit ? getDurationColor(value) : '#F0F0F0',
          },
          label: { color: lit ? LABEL_COLOR_LIT : LABEL_COLOR_UNLIT },
        };
      });
    } else {
      // 全国视图：直接渲染到城市粒度（369个地级市/直辖市色块），点击后下钻到所属省份
      data = (chinaCitiesGeoRef.current?.features ?? []).map(f => {
        const adcode = f.properties.adcode;
        const city = CITIES.find(c => c.adcode === adcode);
        const value = city ? cityDays.get(city.city_id) ?? 0 : 0;
        const lit = value > 0;
        return {
          name: f.properties.name,
          value,
          itemStyle: {
            areaColor: previewCity?.city_id === city?.city_id ? '#FFD166' : lit ? getDurationColor(value) : '#F0F0F0',
          },
        };
      });
    }

    // 省界轮廓层数据：只在全国视图渲染。这是一份独立的 GeoJSON（33 个省级行政区，
    // 几何上由市级数据 union 合并而来），作为单独的 map 系列叠加在主图层之上，
    // 只画粗边框不填色，承载省名 markPoint 标注（点亮/未点亮颜色区分）。
    let provinceOutlineData: Array<{ name: string; value: number }> = [];
    let provinceMarkPoints: Array<{ name: string; coord: [number, number]; itemStyle: { color: string } }> = [];
    if (!activeProvince && provinceOutlineGeoRef.current?.features && chinaGeoRef.current?.features) {
      const centerByAdcode = new Map(
        chinaGeoRef.current.features
          .filter(f => f.properties.center)
          .map(f => [f.properties.adcode, f.properties.center as [number, number]]),
      );
      provinceOutlineData = provinceOutlineGeoRef.current.features.map(f => ({ name: f.properties.name, value: 0 }));
      provinceMarkPoints = provinceOutlineGeoRef.current.features
        .map(f => {
          const center = centerByAdcode.get(f.properties.adcode);
          if (!center) return null;
          const short = shortName(f.properties.name);
          const lit = litProvinces.has(short);
          return { name: short, coord: center, itemStyle: { color: lit ? LABEL_COLOR_LIT : LABEL_COLOR_UNLIT } };
        })
        .filter((p): p is { name: string; coord: [number, number]; itemStyle: { color: string } } => p !== null);
    }

    chart.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        enterable: false,
        confine: true,
        formatter: (params: { name: string; seriesIndex?: number }) => {
          if (params.seriesIndex === 1) return params.name; // 省界轮廓层，不需要额外信息
          if (activeProvince) {
            const city = findCityForFeature(activeProvince.short, params.name);
            const days = city ? cityDays.get(city.city_id) ?? 0 : 0;
            return `${params.name}<br/>${days > 0 ? `累计${days}天` : '点击添加访问记录'}`;
          }
          const city = CITIES.find(c => c.city_name === params.name || `${c.city_name}市` === params.name);
          const days = city ? cityDays.get(city.city_id) ?? 0 : 0;
          return `${params.name}<br/>${days > 0 ? `累计${days}天` : '点击进入省份'}`;
        },
      },
      series: [
        {
          name: '城市足迹',
          type: 'map',
          map: mapName,
          // 禁用 ECharts 自带的一切交互（包括双击缩放），完全由我们自己控制
          roam: false,
          scaleLimit: { min: 0.5, max: 12 },
          ...(provinceChanged ? { zoom: activeProvince ? 1 : 1.1, center: undefined as never } : {}),
          selectedMode: false,
          emphasis: { label: { show: true, color: '#131B2E' }, itemStyle: { areaColor: '#B7D4FF' } },
          // 市级视图标签维持原有较小字号；全国视图下城市色块本身不显示文字（避免369个标签拥挤），
          // 省名标注由独立的第二个 series 承载（markPoint）
          label: activeProvince
            ? { show: true, fontSize: 10 }
            : { show: false },
          // 全国视图下市与市之间用纤细浅色边框，作为色块内部的精细分界；
          // 省界的粗线由第二个系列单独叠加，两者叠加后呈现"省界明显、市内分界纤细"的效果
          itemStyle: activeProvince
            ? { areaColor: '#F0F0F0', borderColor: '#FFFFFF', borderWidth: 1 }
            : { areaColor: '#F0F0F0', borderColor: '#D8C3CB', borderWidth: 0.6 },
          data,
        },
        // 省界轮廓层：独立的 33 省级行政区 GeoJSON，只在全国视图显示。
        // 不填充颜色，只用粗边框凸显省界；通过 dispatchZoom/dispatchPan 手动
        // 与主图层同步缩放/平移（见上方 NATIONAL_VIEW_SERIES_INDICES 注释）。
        ...(activeProvince ? [] : [{
          name: '省界轮廓',
          type: 'map' as const,
          map: 'china-provinces-outline',
          roam: false,
          silent: true,
          selectedMode: false,
          z: 5,
          // 必须和主图层的 scaleLimit 完全一致：否则放大超过上限时，主图层会被
          // ECharts 内部钳位不再继续变化，而这层若没有同样的限制会继续放大，
          // 从这一刻起两层产生实际差异且持续累积——这正是"放大到一定程度才分离"的根因。
          scaleLimit: { min: 0.5, max: 12 },
          ...(provinceChanged ? { zoom: 1.1, center: undefined as never } : {}),
          itemStyle: { areaColor: 'transparent', borderColor: '#B98A98', borderWidth: 1.8 },
          emphasis: { disabled: true },
          label: { show: false },
          data: provinceOutlineData,
          markPoint: {
            silent: true,
            symbolSize: 0,
            label: {
              show: true,
              position: 'inside',
              formatter: '{b}',
              fontSize: 12,
              fontWeight: 700,
              textShadowColor: 'rgba(255,255,255,.85)',
              textShadowBlur: 3,
            },
            data: provinceMarkPoints.map(p => ({ name: p.name, coord: p.coord, label: { color: p.itemStyle.color } })),
          },
        }]),
      ],
    }, provinceChanged);  // 省份切换时才全量替换，preview 变化时 merge 保留 zoom
  }, [activeProvince, cityDays, litProvinces, previewCity, showToast]);

  // ── 绑定原生手势事件 ────────────────────────────────────────────────────
  useEffect(() => {
    let disposed = false;
    let resizeHandler: (() => void) | undefined;
    const cleanups: (() => void)[] = [];

    const init = async () => {
      const [geoJson, citiesGeoJson, outlineGeoJson] = await Promise.all([
        loadChinaGeoJSON() as Promise<GeoJson>,
        loadChinaCitiesGeoJSON() as Promise<GeoJson>,
        loadProvinceOutlineGeoJSON() as Promise<GeoJson>,
      ]);
      if (disposed || !elRef.current) return;
      chinaGeoRef.current = geoJson;
      chinaCitiesGeoRef.current = citiesGeoJson;
      provinceOutlineGeoRef.current = outlineGeoJson;
      // 注册全国省级图（用于点击判断省份归属的兜底、及取省份中心点坐标）
      echarts.registerMap('china-footprint', geoJson as never);
      // 注册全国市级图（首页主渲染：369 个地级市/直辖市边界）
      echarts.registerMap('china-cities-footprint', citiesGeoJson as never);
      // 注册省界轮廓图（33 个省级行政区合并轮廓，用于叠加粗边框强调省界）
      echarts.registerMap('china-provinces-outline', outlineGeoJson as never);
      const chart = echarts.init(elRef.current);
      chartRef.current = chart;
      const dom = chart.getDom();

      // ── pointerdown 时清零拖拽标记；pointermove 若发生明显位移则置位 ──────
      // 比"事后比较 down/up 坐标和时间戳"更可靠：不依赖任何时间戳计算，
      // 不会因为 timeStamp 基准不一致或事件丢失而误判点击为拖拽。
      let downX = 0, downY = 0;
      const onPointerDown = (e: PointerEvent) => {
        didDragRef.current = false;
        downX = e.clientX;
        downY = e.clientY;
      };
      const onPointerMove = (e: PointerEvent) => {
        if (didDragRef.current) return;
        const dist = Math.hypot(e.clientX - downX, e.clientY - downY);
        if (dist > DRAG_THRESHOLD) didDragRef.current = true;
      };

      dom.addEventListener('pointerdown', onPointerDown, { capture: true });
      dom.addEventListener('pointermove', onPointerMove, { capture: true });
      cleanups.push(() => {
        dom.removeEventListener('pointerdown', onPointerDown, { capture: true });
        dom.removeEventListener('pointermove', onPointerMove, { capture: true });
      });

      chart.on('click', (params) => {
        // 只有真正发生了拖拽位移才拦截，其余一律视为有效点击
        if (didDragRef.current) return;
        // 省界轮廓层（silent:true）不会触发 click，这里仅做防御，只处理主图层的点击
        if (params.seriesType !== 'map' || params.seriesIndex !== 0) return;

        const name = String(params.name ?? '');
        if (!name) return;
        const cur = activeProvinceRef.current;

        if (!cur) {
          // 全国视图（城市粒度）：点击某个城市，通过 parent.adcode 反查所属省份，进入省级视图
          const feat = chinaCitiesGeoRef.current?.features?.find(f => f.properties.name === name);
          const provinceAdcode = feat?.properties.parent?.adcode;

          // 直辖市/特别行政区：自身既是"省级"又是"城市级"，点击直接打开录入抽屉
          if (feat && municipalities.has(shortName(name))) {
            const short = shortName(name);
            const city = CITIES.find(c => c.province === short);
            if (city) { chart.dispatchAction({ type: 'hideTip' }); setSelectedCity(city); return; }
          }

          if (!provinceAdcode) return;
          const provinceFeat = chinaGeoRef.current?.features?.find(f => f.properties.adcode === provinceAdcode);
          if (!provinceFeat) return;
          const short = shortName(provinceFeat.properties.name);
          setActiveProvince({ name: provinceFeat.properties.name, short, adcode: provinceAdcode });
          setPreviewCity(undefined);
          return;
        }

        // 省级视图：单击直接打开城市抽屉（无需两步）
        const feat = provinceGeoRef.current?.features?.find(f => f.properties.name === name);
        const city = findCityForFeature(cur.short, name, feat?.properties.adcode as number | undefined);
        if (!city) return;
        chart.dispatchAction({ type: 'hideTip' });
        setSelectedCity(city);
      });
      chart.on('mouseover', 'series', (params) => {
        if (params.seriesType !== 'map' || params.seriesIndex !== 0) return;
        const name = String(params.name ?? '');
        const cur = activeProvinceRef.current;
        if (cur) {
          const feat2 = provinceGeoRef.current?.features?.find(f => f.properties.name === name);
          const city = findCityForFeature(cur.short, name, feat2?.properties.adcode as number | undefined);
          if (city && !(cityDays.get(city.city_id) ?? 0)) setPreviewCity(city);
        } else {
          const feat = chinaCitiesGeoRef.current?.features?.find(f => f.properties.name === name);
          const city = feat ? CITIES.find(c => c.adcode === feat.properties.adcode) : undefined;
          if (city && !(cityDays.get(city.city_id) ?? 0)) setPreviewCity(city);
        }
      });
      chart.on('mouseout', 'series', () => setPreviewCity(undefined));

      // ── 滚轮：拦截默认，转为 dispatchAction ─────────────────────────────
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const rect = dom.getBoundingClientRect();
        const ox = e.clientX - rect.left;
        const oy = e.clientY - rect.top;
        // 归一化 delta（触控板 pixel 模式 delta 很大，需要压缩）
        const raw = e.deltaMode === WheelEvent.DOM_DELTA_PIXEL
          ? e.deltaY / 120   // 触控板：每120px视为1格
          : e.deltaY;        // 鼠标滚轮：直接是格数
        const clamped = Math.max(-1.5, Math.min(1.5, raw));
        const factor = clamped > 0
          ? 1 / (1 + WHEEL_STEP * Math.abs(clamped))
          : 1 + WHEEL_STEP * Math.abs(clamped);
        dispatchZoom(factor, ox, oy);
      };
      dom.addEventListener('wheel', onWheel, { passive: false, capture: true });
      cleanups.push(() => dom.removeEventListener('wheel', onWheel, { capture: true }));

      // ── 鼠标拖拽：拦截 ECharts 默认（它用 pointer 事件），我们用 mouse 事件 ──
      // ECharts roam 用的是 zrender 内部事件，不影响原生 mouse 事件
      let lastMouseX = 0, lastMouseY = 0, isDragging = false;

      const onMouseDown = (e: MouseEvent) => {
        if (e.button !== 0) return;
        isDragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        dom.style.cursor = 'grabbing';
      };
      const onMouseMove = (e: MouseEvent) => {
        if (!isDragging) return;
        const dx = e.clientX - lastMouseX;
        const dy = e.clientY - lastMouseY;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        dispatchPan(dx, dy);
      };
      const onMouseUp = () => {
        isDragging = false;
        dom.style.cursor = '';
      };

      // 监听在 dom 上而不是 window，避免影响其他元素
      dom.addEventListener('mousedown', onMouseDown);
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      cleanups.push(() => {
        dom.removeEventListener('mousedown', onMouseDown);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      });

      // ── 触摸手势 ─────────────────────────────────────────────────────────
      let prevTouches: { x: number; y: number }[] = [];
      let prevDist = 0;

      const getTouches = (list: TouchList) =>
        Array.from(list).map(t => ({ x: t.clientX, y: t.clientY }));

      const onTouchStart = (e: TouchEvent) => {
        // 不 preventDefault，让 ECharts 的 click 事件仍能触发
        prevTouches = getTouches(e.touches);
        if (e.touches.length === 2) {
          prevDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY,
          );
        }
      };

      const onTouchMove = (e: TouchEvent) => {
        e.preventDefault(); // 阻止页面滚动
        const cur = getTouches(e.touches);
        if (!prevTouches.length || cur.length !== prevTouches.length) {
          prevTouches = cur;
          if (e.touches.length === 2) {
            prevDist = Math.hypot(cur[0].x - cur[1].x, cur[0].y - cur[1].y);
          }
          return;
        }

        const rect = dom.getBoundingClientRect();

        if (e.touches.length === 1) {
          // 单指拖拽
          const dx = cur[0].x - prevTouches[0].x;
          const dy = cur[0].y - prevTouches[0].y;
          if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
            dispatchPan(dx, dy);
          }
        } else if (e.touches.length === 2) {
          const newDist = Math.hypot(cur[0].x - cur[1].x, cur[0].y - cur[1].y);
          const midX = (cur[0].x + cur[1].x) / 2 - rect.left;
          const midY = (cur[0].y + cur[1].y) / 2 - rect.top;

          if (prevDist > 0 && newDist > 0) {
            // 帧间增量：dispatchAction，轻量无卡顿
            const rawFactor = newDist / prevDist;
            const factor = 1 + (rawFactor - 1) * 1.0;
            dispatchZoom(factor, midX, midY);
          }

          // 双指平移
          const prevMidX = (prevTouches[0].x + prevTouches[1].x) / 2;
          const prevMidY = (prevTouches[0].y + prevTouches[1].y) / 2;
          const dx = (cur[0].x + cur[1].x) / 2 - prevMidX;
          const dy = (cur[0].y + cur[1].y) / 2 - prevMidY;
          if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) dispatchPan(dx, dy);

          prevDist = newDist;
        }

        prevTouches = cur;
      };

      const onTouchEnd = (e: TouchEvent) => {
        // 手指抬起时重置 prevDist
        if (e.touches.length < 2) { prevDist = 0; }
        prevTouches = getTouches(e.touches);
        if (e.touches.length === 2) {
          prevDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY,
          );
        }
      };

      // passive: false 是必须的，否则无法 preventDefault
      dom.addEventListener('touchstart', onTouchStart, { passive: true });
      dom.addEventListener('touchmove', onTouchMove, { passive: false });
      dom.addEventListener('touchend', onTouchEnd, { passive: true });
      cleanups.push(() => {
        dom.removeEventListener('touchstart', onTouchStart);
        dom.removeEventListener('touchmove', onTouchMove);
        dom.removeEventListener('touchend', onTouchEnd);
      });

      resizeHandler = () => chart.resize();
      window.addEventListener('resize', resizeHandler);
      await renderMap();
    };

    void init();
    return () => {
      disposed = true;
      cleanups.forEach(fn => fn());
      if (resizeHandler) window.removeEventListener('resize', resizeHandler);
      chartRef.current?.dispose();
      chartRef.current = undefined;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void renderMap(); }, [renderMap]);

  const resetView = () => {
    setActiveProvince(null);
    setPreviewCity(undefined);
    currentZoomRef.current = ZOOM_INIT;
    // 全国视图下有两个 series（主图层 + 省界轮廓层），需要同时重置，避免二者再次出现缩放不同步
    chartRef.current?.setOption({
      series: NATIONAL_VIEW_SERIES_INDICES.map(() => ({ zoom: 1.1, center: undefined as never })),
    });
  };

  const zoomCenter = (factor: number) => {
    const dom = chartRef.current?.getDom();
    const rect = dom?.getBoundingClientRect();
    if (!rect) return;
    dispatchZoom(factor, rect.width / 2, rect.height / 2);
  };

  return (
    <div className="map-wrap">
      <div className="map-controls glass">
        {activeProvince && (
          <button className="btn-outline" onClick={() => setActiveProvince(null)}>返回省级视图</button>
        )}
        <button className="btn-outline" onClick={resetView}>🔄 重置视图</button>
        <button className="icon-btn" title="放大" onClick={() => zoomCenter(1.4)}>+</button>
        <button className="icon-btn" title="缩小" onClick={() => zoomCenter(1 / 1.4)}>−</button>
      </div>
      <div className="map-level card">
        {activeProvince ? `${activeProvince.short} · 城市` : '全国 · 城市'}
      </div>
      <div className="china-map" ref={elRef} />
    </div>
  );
}
