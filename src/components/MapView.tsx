// 按需引入 ECharts 核心模块：本组件只用到 map 系列 + tooltip + markPoint，
// 完整的 `import * as echarts from 'echarts'` 会把 bar/line/pie/dataZoom 等
// 全部图表类型和组件一并打包进来，是 MapView chunk 体积偏大（约1.6MB）的主因。
// 按需引入后只打包实际使用的部分，可大幅缩小该 chunk。
import * as echarts from 'echarts/core';
import { MapChart } from 'echarts/charts';
import { TooltipComponent, MarkPointComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadChinaCitiesGeoJSON, loadChinaGeoJSON, loadProvinceGeoJSON, loadProvinceOutlineGeoJSON } from '../data/china-geojson';
import { CITIES } from '../data/cities';
import { useStore } from '../store/useStore';
import type { CityData } from '../types';
import { getDurationColor, getLastDepartureColor, getPreviewColor, getLitLabelColor, getUnlitLabelColor, getTooltipBorderColor, getHaloColor } from '../utils/colors';
import { daysSinceDate, visitDays } from '../utils/date';
import { findCityForFeature, municipalities, PROVINCE_CENTROIDS, shortName } from '../utils/mapHelpers';
import Icon from './Icon';

// 注册按需引入的模块（替代完整 import 后必须手动注册实际用到的部分）
echarts.use([MapChart, TooltipComponent, MarkPointComponent, CanvasRenderer]);

type ProvinceView = { name: string; short: string; adcode: number };
type GeoJsonFeature = { properties: { name: string; adcode: number; center?: [number, number]; parent?: { adcode: number } } };
type GeoJson = { features?: GeoJsonFeature[] };

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

// 点亮/未点亮省份的标签颜色：2026-06-20 之前是固定字面量(#8C2540/#B7A2AA)，
// 不跟随主题切换。用户明确要求"已点亮统一用品牌主色，未点亮用项目已有的灰色
// 文字变量"，不要新造颜色，也不要衍生深浅变体——直接复用 --color-primary 和
// --color-on-surface-variant，三个主题各自天然就有协调的专属值。
// 改为函数而非常量，确保每次 renderMap 执行时都重新读取当前生效的CSS变量
// (主题切换后能跟着变)，与 getDurationColor/getPreviewColor 保持同一模式。

// 全国视图下的两个 series 下标：0 = 主图层（市级色块），1 = 省界轮廓层（粗边框+
// 省名标注）。2026-06-20 曾尝试"给两层广播完全相同的 zoom/dx/dy，让它们各自
// 独立计算"的方案，多轮真实设备录屏验证后发现这种方式在连续操作后仍会产生
// 肉眼可见的像素级偏移（具体内部机制未查实，但现象本身被反复证实）。现已改为
// 单向同步：只驱动 series 0，再用 syncOutlineToMainLayer 读取它的真实渲染
// 状态原样复制给 series 1，这个下标数组现在只用于 resetView 等需要同时显式
// 设置两层绝对初始值的场景，不再用于"同时广播增量"。
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
  // 是否正处于触摸交互中：移动端浏览器会把 touch 滑动模拟成 mouseover/mousemove 事件，
  // 这会触发 ECharts 的 hover 高亮 + tooltip + setPreviewCity（进而引发组件重渲染和
  // 完整的 setOption 重绘），这条路径与 pinch/拖拽手势本身无关，但同样会拖慢移动端体验。
  // 用这个标志位在触摸期间临时屏蔽 hover 预览，鼠标场景（包括触屏笔记本用鼠标操作）不受影响。
  const isTouchingRef = useRef(false);
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
  const colorMode = useStore(s => s.colorMode);
  const setColorMode = useStore(s => s.setColorMode);
  // 2026-06-20: 主题颜色（地图色块/标签）通过getComputedStyle实时读取CSS变量，
  // 不是React state驱动；主题切换只改document.documentElement.dataset.theme这个
  // DOM属性，不触发任何React重渲染。renderMap之前没有把theme放进依赖数组，导致
  // 切主题后地图颜色不会自动刷新，要等用户操作触发了别的依赖变化（如点击改变
  // previewCity）renderMap才被迫重跑，颜色才"顺带"更新——表现为"双击才生效"。
  // 订阅theme仅为了让renderMap在主题切换时重新执行，函数内部仍然用
  // getComputedStyle取真实颜色值，不直接使用这个变量。
  const theme = useStore(s => s.settings.theme);

  const cityDays = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of visits) map.set(v.city_id, (map.get(v.city_id) ?? 0) + visitDays(v));
    return map;
  }, [visits]);

  const cityLastDepartureDays = useMemo(() => {
    const map = new Map<string, number>();
    for (const visit of visits) {
      const daysAgo = daysSinceDate(visit.last_stay_date);
      const current = map.get(visit.city_id);
      if (current === undefined || daysAgo < current) map.set(visit.city_id, daysAgo);
    }
    return map;
  }, [visits]);

  const cityFillColor = useCallback((city?: CityData) => {
    if (!city) return '#F0F0F0';
    if (colorMode === 'lastDeparture') {
      const daysAgo = cityLastDepartureDays.get(city.city_id);
      return daysAgo === undefined ? '#F0F0F0' : getLastDepartureColor(daysAgo);
    }
    const days = cityDays.get(city.city_id) ?? 0;
    return days > 0 ? getDurationColor(days) : '#F0F0F0';
  }, [cityDays, cityLastDepartureDays, colorMode]);

  const cityTooltipText = useCallback((city?: CityData, emptyText = '点击添加访问记录') => {
    if (!city) return emptyText;
    const days = cityDays.get(city.city_id) ?? 0;
    if (days <= 0) return emptyText;
    if (colorMode === 'lastDeparture') {
      const daysAgo = cityLastDepartureDays.get(city.city_id);
      const lastText = daysAgo === undefined ? '暂无最后离开时间' : daysAgo === 0 ? '今天离开' : `最后离开 ${daysAgo} 天前`;
      return `${lastText}<br/>累计${days}天`;
    }
    return `累计${days}天`;
  }, [cityDays, cityLastDepartureDays, colorMode]);

  // 每个省份是否至少有一座点亮的城市（用于全国视图下省名标注的颜色区分）
  const litProvinces = useMemo(() => {
    const set = new Set<string>();
    for (const city of CITIES) {
      if ((cityDays.get(city.city_id) ?? 0) > 0) set.add(city.province);
    }
    return set;
  }, [cityDays]);

  useEffect(() => { activeProvinceRef.current = activeProvince; }, [activeProvince]);

  // ── 强制把省界轮廓层(series 1)的视图状态，原样同步成主图层(series 0)的真实状态 ──
  // 之前的方案是给两个 series 各自独立广播相同的 zoom/dx/dy 增量，让它们"各自算账"。
  // 排查多轮真实设备录屏后发现，即使输入完全相同，两个独立坐标系在连续多次缩放/
  // 平移操作后仍会产生肉眼可见的像素级偏移（具体内部机制未能100%查证，但现象
  // 本身被录屏反复证实存在）。这次改为更直接、不依赖"为什么会分叉"这一假设的
  // 方式：每次操作后，不再让 series 1 自己算，而是读取 series 0 坐标系的真实
  // zoom/center（ECharts 公开 API），把这个真实值原样设置给 series 1。
  // 这样 series 1 永远是 series 0 的"镜像"，不存在两边各自独立计算导致分叉的可能。
  const syncOutlineToMainLayer = useCallback(() => {
    const chart = chartRef.current;
    if (!chart || activeProvinceRef.current) return; // 省级视图下没有轮廓层，不需要同步
    const ecModel = (chart as unknown as { getModel: () => {
      getSeriesByIndex: (idx: number) => { coordinateSystem?: { getZoom: () => number; getCenter: () => number[] } } | undefined;
    } }).getModel();
    const mainSeries = ecModel.getSeriesByIndex(0);
    const mainGeo = mainSeries?.coordinateSystem;
    if (!mainGeo) return;
    const zoom = mainGeo.getZoom();
    const center = mainGeo.getCenter();
    chart.setOption({
      series: [{}, { zoom, center }],
    }, false);
  }, []);

  // ── 用 dispatchAction geoRoam 做缩放（可选同时平移）──────────────────────
  // 只广播给主图层(series 0)，省界轮廓层(series 1)不再独立接收广播，
  // 而是广播结束后调用 syncOutlineToMainLayer 强制对齐，见上方注释。
  const dispatchZoom = useCallback((
    zoomDelta: number,
    originX: number,
    originY: number,
    dx = 0,
    dy = 0,
    // 滚轮/wheel 是高频小增量，需要限制单帧最大步长（MAX/MIN_ZOOM_FACTOR）；
    // pinch 手势传入的是整个手势期间的累积总倍率（可能远超单帧步长范围），
    // 这里必须跳过单帧限制，否则会被错误地砍到 0.8~1.25 之间。
    applyStepLimit = true,
  ) => {
    const chart = chartRef.current;
    if (!chart) return;
    const rawClamped = applyStepLimit
      ? Math.min(MAX_ZOOM_FACTOR, Math.max(MIN_ZOOM_FACTOR, zoomDelta))
      : zoomDelta;
    const targetZoom = Math.min(12, Math.max(0.5, currentZoomRef.current * rawClamped));
    const effectiveFactor = targetZoom / currentZoomRef.current;
    currentZoomRef.current = targetZoom;
    chart.dispatchAction({
      type: 'geoRoam',
      seriesIndex: 0,
      zoom: effectiveFactor,
      originX,
      originY,
      ...(dx || dy ? { dx, dy } : {}),
      animation: { duration: 0 },
    } as GeoRoamAction);
    syncOutlineToMainLayer();
  }, [syncOutlineToMainLayer]);

  // ── 用 dispatchAction geoRoam 做平移 ────────────────────────────────────
  const dispatchPan = useCallback((dx: number, dy: number) => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.dispatchAction({
      type: 'geoRoam',
      seriesIndex: 0,
      dx,
      dy,
      animation: { duration: 0 },
    } as GeoRoamAction);
    syncOutlineToMainLayer();
  }, [syncOutlineToMainLayer]);

  const renderMap = useCallback(async () => {
    void theme;
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
    // 循环外统一取一次悬停预览色/已点亮/未点亮标签色，避免369个城市的map()
    // 循环里每次都重新调用getComputedStyle（这几个get函数内部实现），
    // 降低不必要的性能开销。
    const previewColor = getPreviewColor();
    const litLabelColor = getLitLabelColor();
    const unlitLabelColor = getUnlitLabelColor();

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
              ? previewColor
              : cityFillColor(city),
          },
          label: { color: lit ? litLabelColor : unlitLabelColor },
        };
      });
    } else {
      // 全国视图：直接渲染到城市粒度（369个地级市/直辖市色块），点击后下钻到所属省份
      data = (chinaCitiesGeoRef.current?.features ?? []).map(f => {
        const adcode = f.properties.adcode;
        const city = CITIES.find(c => c.adcode === adcode);
        const value = city ? cityDays.get(city.city_id) ?? 0 : 0;
        return {
          name: f.properties.name,
          value,
          itemStyle: {
            areaColor: previewCity?.city_id === city?.city_id ? previewColor : cityFillColor(city),
          },
        };
      });
    }

    // 省界轮廓层数据：只在全国视图渲染。这是一份独立的 GeoJSON（33 个省级行政区，
    // 几何上由市级数据 union 合并而来），作为单独的 map 系列叠加在主图层之上，
    // 只画粗边框不填色，承载省名 markPoint 标注（点亮/未点亮颜色区分）。
    let provinceOutlineData: Array<{ name: string; value: number }> = [];
    let provinceMarkPoints: Array<{ name: string; coord: [number, number]; itemStyle: { color: string } }> = [];
    if (!activeProvince && provinceOutlineGeoRef.current?.features) {
      provinceOutlineData = provinceOutlineGeoRef.current.features.map(f => ({ name: f.properties.name, value: 0 }));
      provinceMarkPoints = provinceOutlineGeoRef.current.features
        .map(f => {
          const short = shortName(f.properties.name);
          const centroid = PROVINCE_CENTROIDS[short];
          if (!centroid) return null;
          const lit = litProvinces.has(short);
          // 2026-06-20修正: 之前误把"点亮/未点亮区分"和"对比度不足"当成
          // 同一个问题一起改掉了，导致未点亮省份的灰色文字也变成了主色，丢失
          // 了"点亮=醒目主色，未点亮=低调灰色"这个视觉区分本身（用户反馈"没
          // 点亮的城市应该都是灰灰的颜色，现在怎么都成主题色了"）。halo方案
          // 解决的是"文字在深色块上看不清"，跟"点亮/未点亮该用什么颜色"是
          //两件独立的事——halo对灰色文字同样有效（已验证三主题下unlit文字
          // vs halo色对比度均>=4.5），不需要为了让halo生效而牺牲这个区分。
          return {
            name: short,
            coord: centroid,
            itemStyle: { color: lit ? litLabelColor : unlitLabelColor },
          };
        })
        .filter((p): p is { name: string; coord: [number, number]; itemStyle: { color: string } } => p !== null);
    }

    chart.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        enterable: false,
        confine: true,
        // ECharts tooltip 默认渲染模式是 'html'（不是早先误以为的 canvas内绘制），
        // 是真实的 <div>，默认挂载在 ECharts 容器(api.getDom())内部——不是
        // document.body，这是之前长期存在的错误认知。该 <div> 的 z-index 由
        // ECharts 库内部硬编码为 9999999（见 echarts/lib/component/tooltip/
        // TooltipHTMLContent.js 的 gCssText），完全不读取任何配置项，之前写的
        // `z: 35` 在 html 渲染模式下从未真正生效，只是被误以为生效了。
        //
        // 真正的问题：pinch 缩放期间会给地图容器加 CSS transform（见下方
        // applyCssTransform），任何非 none 的 transform 都会给该元素建立新的
        // CSS 层叠上下文，导致挂在容器内部的 tooltip 不管 z-index 多大，都
        // 无法越过容器本身去压在管理员面板等外部模态框之上——这才是"打开
        // 管理员面板时地图标签浮在面板上方"的真正根因，且只在地图容器带有
        // transform 的窗口期内出现，与缩放程度本身无关（不需要查清楚精确的
        // 触发时间窗口，只要让 tooltip 不再被装在这个容器里就能从机制上根治）。
        //
        // 修复：appendTo: 'body' 让 tooltip 挂载到 document.body，脱离容器
        // 及其可能存在的 transform；同时用 className 配合 .map-tooltip 这个
        // CSS class（定义在 index.css，用 !important 覆盖库内联的 9999999），
        // 把层级压回项目自己的语义化体系（与 .user-dropdown 同级，低于
        // --z-modal，不会再盖住管理员面板等弹窗）。
        appendTo: 'body',
        className: 'map-tooltip',
        // 固定使用主题色作边框，不再跟随被点击数据项的填充色变化（默认行为
        // 是取 tooltipDataParams.color，城市按停留天数染色后若落在某些中间
        // 档会呈现蓝色等不符合主题的颜色，用户反馈"边框颜色很奇怪"）。
        borderColor: getTooltipBorderColor(),
        formatter: (params: { name: string; seriesIndex?: number }) => {
          if (params.seriesIndex === 1) return params.name; // 省界轮廓层，不需要额外信息
          if (activeProvince) {
            const city = findCityForFeature(activeProvince.short, params.name);
            return `${params.name}<br/>${cityTooltipText(city)}`;
          }
          const city = CITIES.find(c => c.city_name === params.name || `${c.city_name}市` === params.name);
          return `${params.name}<br/>${cityTooltipText(city, '点击进入省份')}`;
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
          itemStyle: { areaColor: 'transparent', borderColor: '#666666', borderWidth: 0.5 },
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
              fontSize: 10,
              fontWeight: 400,
              // 2026-06-20: 原固定白色阴影(rgba(255,255,255,.85))+blur3，在暗色
              // 主题(Linear)下白色光晕糊在暗背景上效果差，用户反馈"像一团雾"；
              // 且不跟随主题。改为：halo色跟随主题--color-background（与文字色
              // --color-primary形成固定的高对比度组合，不受省名标注下方实际色块
              // 深浅影响——这是halo手法的核心价值，对比度关系是"文字色 vs halo色"
              // 而非"文字色 vs 色块色"），blur从3降到1.5减少模糊感。
              textShadowColor: getHaloColor(),
              textShadowBlur: 1.5,
            },
            data: provinceMarkPoints.map(p => ({
              name: p.name,
              coord: p.coord,
              label: { color: p.itemStyle.color },
            })),
          },
        }]),
      ],
    }, provinceChanged);  // 省份切换时才全量替换，preview 变化时 merge 保留 zoom
  }, [activeProvince, cityDays, cityFillColor, cityTooltipText, litProvinces, previewCity, showToast, theme]);

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
      // devicePixelRatio 钳到 2：高清屏（iPhone 等普遍 3x）下，369 个城市色块
      // 按 3x 像素渲染的像素总量是 2x 的 2.25 倍，缩放时每帧重绘成本显著增加，
      // 但视觉上 2x 已经足够清晰，肉眼几乎无法分辨与 3x 的差异
      const chart = echarts.init(elRef.current, null, {
        devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      });
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
        // 移动端浏览器会把手指滑动模拟成 mouseover 事件触发这里——这不是用户想要的
        // "悬浮预览"交互，而是触屏滑动的副作用，且每次触发都会引起一次完整重绘，
        // 在 pinch/拖拽过程中尤其明显。触摸交互期间直接跳过。
        if (isTouchingRef.current) return;
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
      // 用 rAF 合并同一帧内的多次 touchmove：只保留最新手势量，到下一帧才真正 dispatch，
      // 避免触屏事件频率超过渲染帧率时主线程被连续打断（卡顿/反应不及时的根因）
      let rafId = 0;
      let pendingPan: { dx: number; dy: number } | null = null;
      const flushPending = () => {
        rafId = 0;
        if (pendingPan) {
          dispatchPan(pendingPan.dx, pendingPan.dy);
          pendingPan = null;
        }
      };
      const scheduleFlush = () => {
        if (!rafId) rafId = requestAnimationFrame(flushPending);
      };

      // ── CSS transform 临时缩放（移动端优化）────────────────────────────
      // pinch 时用 CSS transform 缩放容器（GPU 加速，不触发 ECharts 重绘），
      // touchend 时再同步给 ECharts，避免每帧重绘 369 个城市的 path
      let cssZoomAccumulator = 1; // CSS transform 累积的缩放因子
      let cssPanX = 0; // CSS transform 累积的平移 X
      let cssPanY = 0; // CSS transform 累积的平移 Y
      let pinchStartZoom = 1; // pinch 开始时的 ECharts zoom
      let transformOriginX = 0;
      let transformOriginY = 0;
      
      const applyCssTransform = (scale: number, panX: number, panY: number, originX: number, originY: number) => {
        dom.style.transformOrigin = `${originX}px ${originY}px`;
        dom.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
      };
      
      const clearCssTransform = () => {
        dom.style.transform = '';
        dom.style.transformOrigin = '';
      };

      const getTouches = (list: TouchList) =>
        Array.from(list).map(t => ({ x: t.clientX, y: t.clientY }));

      const onTouchStart = (e: TouchEvent) => {
        // 不 preventDefault，让 ECharts 的 click 事件仍能触发
        isTouchingRef.current = true;
        prevTouches = getTouches(e.touches);
        if (e.touches.length === 2) {
          prevDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY,
          );
          // 记录 pinch 开始时的状态，用于 CSS transform 缩放
          const rect = dom.getBoundingClientRect();
          transformOriginX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
          transformOriginY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
          cssZoomAccumulator = 1;
          cssPanX = 0;
          cssPanY = 0;
          pinchStartZoom = currentZoomRef.current;
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

        if (e.touches.length === 1) {
          // 单指拖拽
          const dx = cur[0].x - prevTouches[0].x;
          const dy = cur[0].y - prevTouches[0].y;
          if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
            pendingPan = pendingPan ? { dx: pendingPan.dx + dx, dy: pendingPan.dy + dy } : { dx, dy };
            scheduleFlush();
          }
        } else if (e.touches.length === 2) {
          const newDist = Math.hypot(cur[0].x - cur[1].x, cur[0].y - cur[1].y);

          if (prevDist > 0 && newDist > 0) {
            // 帧间增量
            const rawFactor = newDist / prevDist;
            const factor = 1 + (rawFactor - 1) * 1.0;
            // 累积 CSS 缩放因子
            cssZoomAccumulator *= factor;
            // 用 CSS transform 缩放（GPU 加速，不触发 ECharts 重绘）
            applyCssTransform(cssZoomAccumulator, cssPanX, cssPanY, transformOriginX, transformOriginY);
          }

          // 双指平移
          const prevMidX = (prevTouches[0].x + prevTouches[1].x) / 2;
          const prevMidY = (prevTouches[0].y + prevTouches[1].y) / 2;
          const dx = (cur[0].x + cur[1].x) / 2 - prevMidX;
          const dy = (cur[0].y + cur[1].y) / 2 - prevMidY;
          // 双指平移也用 CSS transform，避免触发 ECharts 重绘
          if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
            cssPanX += dx;
            cssPanY += dy;
            applyCssTransform(cssZoomAccumulator, cssPanX, cssPanY, transformOriginX, transformOriginY);
          }

          prevDist = newDist;
        }

        prevTouches = cur;
      };

      const onTouchEnd = (e: TouchEvent) => {
        // 手指抬起时重置 prevDist
        if (e.touches.length < 2) {
          prevDist = 0;
          // 如果之前有 CSS transform 缩放和/或平移，清除并一次性同步给 ECharts。
          // 注意：必须同时判断 cssPanX/cssPanY，否则「几乎不缩放、纯双指平移」的手势
          // （cssZoomAccumulator 始终为 1）会被整个跳过，平移量丢失，松手后地图回跳。
          if (cssZoomAccumulator !== 1 || cssPanX !== 0 || cssPanY !== 0) {
            clearCssTransform();
            // 统一走 dispatchZoom，复用其中"先按总量裁剪、再用同一个有效增量广播给
            // 两个 series"的逻辑——避免这里曾经手写的独立 dispatchAction 路径绕开
            // 该修正，导致主图层与省界轮廓层在 pinch 手势下各自钳位不同步而错位。
            //
            // 健全性检查：pinch 期间 currentZoomRef.current 理论上应该一直等于
            // pinchStartZoom（CSS transform 阶段不会更新它）。如果这里不相等，
            // 说明这期间有别的代码路径意外改动了 currentZoomRef，dispatchZoom 内部
            // 用 currentZoomRef.current 当基准算出来的目标值就会偏离 pinch 手势本身
            // 期望的缩放结果——开发环境下打印出来，方便及时发现而不是默默吃掉。
            if (import.meta.env.DEV && currentZoomRef.current !== pinchStartZoom) {
              console.warn(
                `[MapView] pinch 结束时 currentZoomRef(${currentZoomRef.current}) 与 ` +
                `pinchStartZoom(${pinchStartZoom}) 不一致，缩放基准可能有误`,
              );
            }
            dispatchZoom(cssZoomAccumulator, transformOriginX, transformOriginY, cssPanX, cssPanY, false);
            cssZoomAccumulator = 1;
            cssPanX = 0;
            cssPanY = 0;
          }
        }
        // 所有手指都已离开屏幕，恢复 hover 预览（鼠标场景不受影响，
        // 用户接下来若用鼠标操作，mouseover 逻辑正常生效）
        if (e.touches.length === 0) isTouchingRef.current = false;
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
        if (rafId) cancelAnimationFrame(rafId);
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
        {/* 2026-06-20: 移动端重设计为统一竖向胶囊，四个按钮（含"返回省级视图"
            和"重置视图"）改为纯图标+title提示，不再带文字——原来文字按钮和
            icon-btn混在一起宽度不一致，做不成统一宽度的胶囊。桌面端样式
            未改动，仍是原来的方块堆叠（按钮文字这次没改，因为桌面端没有
            这个空间限制问题，用户也只反馈了移动端）。*/}
        {activeProvince && (
          <button className="btn-outline" title="返回省级视图" onClick={() => setActiveProvince(null)}><Icon name="arrow-left" /><span className="map-controls-label"> 返回省级视图</span></button>
        )}
        <button className="btn-outline" title="重置视图" onClick={resetView}><Icon name="refresh" /><span className="map-controls-label"> 重置视图</span></button>
        <button className="icon-btn" title="放大" onClick={() => zoomCenter(1.4)}><Icon name="plus" /></button>
        <button className="icon-btn" title="缩小" onClick={() => zoomCenter(1 / 1.4)}><Icon name="minus" /></button>
      </div>
      <div className="map-level card">
        {activeProvince ? `${activeProvince.short} · 城市` : '全国 · 城市'}
      </div>
      <div className="map-color-mode mode-pill card" role="group" aria-label="地图上色模式">
        <button
          className={colorMode === 'duration' ? 'active' : ''}
          onClick={() => setColorMode('duration')}
          aria-pressed={colorMode === 'duration'}
        >
          按停留时间
        </button>
        <button
          className={colorMode === 'lastDeparture' ? 'active' : ''}
          onClick={() => setColorMode('lastDeparture')}
          aria-pressed={colorMode === 'lastDeparture'}
        >
          按最后离开时间
        </button>
      </div>
      <div className="china-map" ref={elRef} />
    </div>
  );
}
