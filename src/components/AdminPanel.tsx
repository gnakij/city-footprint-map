import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { pinyin } from 'pinyin-pro';
import { adminExportVisits, adminImportVisits, createUser, getUsers } from '../api';
import { CITIES } from '../data/cities';
import { useStore } from '../store/useStore';
import FuzzySelect from './ui/FuzzySelect';
import Icon from './Icon';
import type { ImportVisitRow } from '../types';
import type { AdminVisitExportRow } from '../api';

/** 把中文文本转成不带空格的全拼，供拼音模糊匹配使用 */
function toPinyinKey(text: string): string {
  return pinyin(text, { toneType: 'none' }).replace(/\s+/g, '');
}

/** 给一组候选字符串批量生成 "自身 -> 全拼" 的映射字典 */
function buildPinyinMap(options: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const option of options) {
    map[option] = toPinyinKey(option);
  }
  return map;
}

const LEDGER_PAGE_SIZE = 10;
const CHANGELOG = [
  { date: '2026-06-20', items: ['修复打开管理员面板时地图标签浮在面板上方的问题：根因是 pinch 缩放期间地图容器会被加上 CSS transform，这会建立新的 CSS 层叠上下文，导致挂载在容器内部的地图标签（tooltip）的 z-index 无法越过容器边界去和管理员面板比较层级，与之前修复过的同类问题（tooltip默认挂载位置）是完全不同的诱因；同时纠正了一个长期存在的错误认知：之前以为 tooltip 默认挂载到 document.body 且配置的 z 数值会生效，实际上默认挂载在地图容器内部，且 ECharts 在当前渲染模式下完全不读取 z 配置，之前写的数值从未真正生效，只是恰好没暴露出问题', '改为用 tooltip.appendTo:"body" 让标签挂载到页面最外层，脱离地图容器的层叠上下文影响，再配合新增的 .map-tooltip CSS class（用 !important 覆盖 ECharts 库内部硬编码的 z-index，因为内联样式优先级天生更高）把层级压回项目自己的语义化体系，与用户下拉菜单同级，低于所有弹窗模态框'] },
  { date: '2026-06-20', items: ['地图缩放错位问题第三次修复，改为更直接的方式：之前两次修复（边界钳位分叉、geojson数据不同源）都解决了真实存在的问题，但用户用真实设备录屏反复验证后，确认放大后两层仍会出现统一方向的整体偏移，且不需要撞到任何边界即可复现——说明还有未查实的诱因。这次不再继续猜测具体机制，改为更直接的工程方式：放弃此前给主图层和省界轮廓层各自独立广播相同缩放增量、让二者各自计算的方案，改为只驱动主图层，再读取它的真实渲染状态（ECharts公开API getZoom/getCenter）原样复制给省界轮廓层，从机制上消除两者各自独立计算可能产生分叉的可能性'] },
  { date: '2026-06-20', items: ['彻底修复全国视图放大后主图层色块与省界轮廓线错位的问题（此前一次修复只解决了边界钳位分叉这一个次要诱因，未命中用户反馈的核心症状）：用 shapely 量化排查发现真正根因是 china-provinces-outline.json 并非由 china-cities.json 精确 union 生成，而是来自某次独立处理流程，与市级数据存在局部几何偏差（典型例子：海南省在两份文件里的纬度最小值相差约0.12度），这类局部偏差恰好落在全国地图最南端边界附近，被放大成两个 ECharts series 坐标系初始投影比例的差异，导致放大后两层立刻可见错位（不需要累积触发，与之前的边界钳位分叉是完全不同性质的问题）', '新增 scripts/regen_province_outline.py：直接从市级数据精确 union 重新生成省级轮廓，确保两份文件永久同源，避免未来市级数据更新后再次出现脱节；已验证脚本幂等（重跑不改变文件 MD5）'] },
  { date: '2026-06-20', items: ['修复全国视图放大后主图层色块与省界轮廓线持续性错位的问题：根因是 ECharts 内部对双 series geoRoam 缩放的边界钳位（0.5~12倍）是各自独立计算的，即使两层收到完全相同的缩放增量，只要某一帧其中一层先撞到边界、另一层还没撞到，二者就会产生实际缩放倍率的分叉且不会自愈；修复方式是广播前先用统一状态算出裁剪后的目标缩放，再反推出同一个有效增量广播给两层，从根上消除分叉触发条件', '修复鼠标滚轮缩放和触摸pinch缩放走的是两条独立代码路径，pinch路径此前未经过上述修正逻辑，导致该场景下错位修复未生效的问题：现统一改为调用同一处缩放函数'] },
  { date: '2026-06-20', items: ['MapView 性能优化：ECharts 从全量 import 改为按需引入（仅注册 map 系列 + tooltip + markPoint），打包体积从约1.63MB降至约46万字节，减少72%', '离线兜底地图数据改为动态 import：原本静态打包进主 chunk 的约57万字节兜底 GeoJSON，改为仅在网络请求失败时才单独加载', '清理未使用依赖 echarts-for-react（项目实际直接调用 echarts 原生 API，从未 import 过该库）'] },
  { date: '2026-06-20', items: ['升级记录入口整合：从管理员面板独立页签移至系统文档页签，点击链接弹窗展示', '图标系统统一：20处 emoji/文字符号替换为 SVG 图标组件（Icon.tsx）', '新增变量：--space-7(28px)、--space-9(36px)、--font-4xl(48px)', '消除硬编码：登录面板 padding、空状态图标 font-size 引用变量', '工具类引用变量：.p-16/.p-24/.p-32/.gap-8/.gap-10 改用 CSS 变量', '小箭头 SVG 化：▲▼ 文字符号改为内联 SVG，消除 11px 硬编码', '修复部署流程：rsync 去掉 --delete，避免删 docs 目录', '响应式断点规范化（767px/768px/1024px），CSS 注释记录', '颜色对比度检查：Rose 主题成功色/警告色略低，标注使用限制', '设计文档更新：响应式断点、全局状态规范落实，去掉"待定义"'] },
  { date: '2026-06-20', items: ['建立设计系统文档（docs/设计系统-2026-06-20.md）：完整设计 token 体系、组件规范、可访问性规范', '新增可访问性支持：:focus-visible 焦点环、prefers-reduced-motion 减少动效', '新增全局状态类名：.empty-state / .loading / .error-state', '修复 6 处硬编码：font-size/gap/z-index/padding 引用变量', '新增变量：--space-0-75(3px)、--z-tooltip(1000)', '管理员面板新增"系统文档"页签，集中展示设计文档和功能文档'] },
  { date: '2026-06-20', items: ['修复地图加载数据错位问题，并重新做了一次安全的体积压缩（china-cities.json 413万→65.7万字节，china-provinces-outline.json 130万→21.7万字节，几何精度损失小于1%，城市/省份零丢失）', '修复地图省份提示框浮在管理员等弹窗上方的问题', 'z-index 层级体系化：新建统一的语义化层级变量，修正统计面板/折叠胶囊与城市详情抽屉之间的层级混乱（折叠胶囊展开后跑到详情页下层、新打开的表单被胶囊遮挡等问题）'] },
  { date: '2026-06-20', items: ['字号体系化：建立完整字号梯度变量，替换44处硬编码值，仅保留少数确认为单次出现的精确调校值（品牌大标题、统计面板次要变体等）', '阴影体系化：建立三档elevation梯度变量，统一统计胶囊此前独有的内嵌高光拟物效果为扁平投影，修正其与卡片/弹窗/抽屉等组件之间的视觉风格不一致问题', '过渡曲线升级：标准缓动改用业内常见的Material Design贝塞尔曲线，交互更利落', '移除一处多余的!important声明（已验证导入预览报错提示样式无影响）', '修正搜索结果浮层层级归属、页签组件圆角变量误用间距变量的问题'] },
  { date: '2026-06-19', items: ['UI规范整理：按钮、页签、列表项样式统一', '颜色变量化：glass效果、阴影、边框等硬编码颜色替换为CSS变量', '间距变量化：4-48px常用尺寸替换为CSS变量', '新增系统升级记录页签'] },
  { date: '2026-06-19', items: ['修复用户名/昵称/省份/城市筛选框拼音模糊匹配（用户名昵称为新增，引入 pinyin-pro 实时转换）', '地图省界轮廓线变细，缓解移动端发黑发粗的问题', '修复移动端地图双指缩放/拖拽卡顿（touchmove 改为 rAF 帧节流）', 'CSS 设计 token 体系化：圆角按用途分层（面板 12px / 控件 8px）、交互过渡与状态强度（hover/active/disabled）统一为语义变量，修正多处字重与圆角跟规范不一致的问题，操作按钮组（.actions）统一靠右对齐'] },
];
type DocItem = { category: string; title: string; url?: string; action?: string; last_updated: string; description: string; };
const DOC_LIST: DocItem[] = [
  { category: '设计文档', title: '设计系统文档', url: '/cityprint/docs/设计系统-2026-06-20.md', last_updated: '2026-06-20', description: '完整设计 token 体系、组件规范' },
  { category: '功能文档', title: '功能现状文档', url: '/cityprint/docs/功能现状-2026-06-19.md', last_updated: '2026-06-19', description: '项目功能清单与现状说明' },
  { category: '协作文档', title: '协作者指南', url: '/cityprint/docs/协作者指南-2026-06-20.md', last_updated: '2026-06-20', description: '文档维护规则、更新流程' },
  { category: '升级记录', title: '系统升级记录', action: 'changelog', last_updated: '2026-06-20', description: '历次更新内容与变更记录' },
];
const PROVINCE_PINYIN: Record<string, string> = {
  北京: 'beijing',
  天津: 'tianjin',
  河北: 'hebei',
  山西: 'shanxi',
  内蒙古: 'neimenggu',
  辽宁: 'liaoning',
  吉林: 'jilin',
  黑龙江: 'heilongjiang',
  上海: 'shanghai',
  江苏: 'jiangsu',
  浙江: 'zhejiang',
  安徽: 'anhui',
  福建: 'fujian',
  江西: 'jiangxi',
  山东: 'shandong',
  河南: 'henan',
  湖北: 'hubei',
  湖南: 'hunan',
  广东: 'guangdong',
  广西: 'guangxi',
  海南: 'hainan',
  重庆: 'chongqing',
  四川: 'sichuan',
  贵州: 'guizhou',
  云南: 'yunnan',
  西藏: 'xizang',
  陕西: 'shaanxi',
  甘肃: 'gansu',
  青海: 'qinghai',
  宁夏: 'ningxia',
  新疆: 'xinjiang',
  台湾: 'taiwan',
  香港: 'xianggang',
  澳门: 'aomen',
};

function normalize(value: unknown) {
  return String(value ?? '').trim();
}

function dateValue(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  return normalize(value).replace(/\//g, '-');
}

function numberValue(value: unknown) {
  const n = Number(normalize(value));
  return Number.isFinite(n) ? n : NaN;
}

function isValidDateText(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function findCity(province: string, city: string) {
  const shortProvince = province.replace(/省|市|自治区|特别行政区|壮族|回族|维吾尔/g, '');
  const shortCity = city.replace(/市|地区|自治州|盟/g, '');
  return CITIES.find((item) => item.province === shortProvince && item.city_name === shortCity)
    ?? CITIES.find((item) => item.province === shortProvince && (item.city_name.includes(shortCity) || shortCity.includes(item.city_name)));
}

function writeAdminWorkbook(filename: string, rows: Array<Record<string, string | number | undefined>>) {
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: ['用户名', '昵称', '省份', '城市', '停留天数', '最后停留日期', '备注', '更新时间'] });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '访问记录');
  XLSX.writeFile(workbook, filename);
}

export default function AdminPanel({ embedded = false }: { embedded?: boolean }) {
  const users = useStore((state) => state.users);
  const setAdminOpen = useStore((state) => state.setAdminOpen);
  const deleteUserAndData = useStore((state) => state.deleteUserAndData);
  const resetUserPassword = useStore((state) => state.resetUserPassword);
  const updateAnyUserName = useStore((state) => state.updateAnyUserName);
  const getSystemStats = useStore((state) => state.getSystemStats);
  const [pendingReset, setPendingReset] = useState<{ userId: string; name: string } | null>(null);
  const [resetPw, setResetPw] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [names, setNames] = useState<Record<string, string>>({});
  const [newUsername, setNewUsername] = useState('');
  const [newNickname, setNewNickname] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [stats, setStats] = useState({ totalUsers: users.length, totalVisits: 0, adminUsers: 0 });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [adminTab, setAdminTab] = useState<'users' | 'data' | 'docs'>('users');
  const [showChangelog, setShowChangelog] = useState(false);
  const [allVisits, setAllVisits] = useState<AdminVisitExportRow[]>([]);
  const [filterUsername, setFilterUsername] = useState('');
  const [filterName, setFilterName] = useState('');
  const [filterProvince, setFilterProvince] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [appliedFilters, setAppliedFilters] = useState({
    username: '',
    name: '',
    province: '',
    city: '',
  });
  const [ledgerPage, setLedgerPage] = useState(1);
  const [showImportTools, setShowImportTools] = useState(false);
  const [targetUserId, setTargetUserId] = useState(users[0]?.id ?? '');
  const [importPreview, setImportPreview] = useState<ImportVisitRow[]>([]);
  const importFileRef = useRef<HTMLInputElement>(null);

  const cityById = useMemo(() => new Map(CITIES.map((city) => [city.city_id, city])), []);
  const targetUser = users.find((user) => user.id === targetUserId);
  const usernameOptions = useMemo(() => {
    return Array.from(new Set(allVisits.map((visit) => visit.username).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  }, [allVisits]);
  const usernamePinyinMap = useMemo(() => buildPinyinMap(usernameOptions), [usernameOptions]);
  const nameOptions = useMemo(() => {
    return Array.from(new Set(allVisits.map((visit) => visit.name).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  }, [allVisits]);
  const namePinyinMap = useMemo(() => buildPinyinMap(nameOptions), [nameOptions]);
  const provinceOptionsList = useMemo(() => {
    return Array.from(new Set(CITIES.map((city) => city.province))).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  }, []);
  const cityOptionsList = useMemo(() => {
    const selectedProvince = CITIES.some((city) => city.province === filterProvince) ? filterProvince : '';
    return CITIES
      .filter((city) => !selectedProvince || city.province === selectedProvince)
      .map((city) => city.city_name)
      .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  }, [filterProvince]);
  const cityPinyinMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const city of CITIES) {
      map[city.city_name] = city.pinyin;
    }
    return map;
  }, []);
  const ledgerVisits = useMemo(() => {
    const usernameQuery = appliedFilters.username.trim().toLowerCase();
    const nameQuery = appliedFilters.name.trim().toLowerCase();
    const provinceQuery = appliedFilters.province.trim();
    const cityQuery = appliedFilters.city.trim();
    return allVisits
      .filter((visit) => {
        const city = cityById.get(visit.city_id);
        if (usernameQuery && !(visit.username ?? '').toLowerCase().includes(usernameQuery)) return false;
        if (nameQuery && !(visit.name ?? '').toLowerCase().includes(nameQuery)) return false;
        if (provinceQuery && city?.province !== provinceQuery) return false;
        if (cityQuery && city?.city_name !== cityQuery) return false;
        return true;
      })
      .sort((a, b) => {
        return b.updated_at.localeCompare(a.updated_at);
      });
  }, [allVisits, appliedFilters, cityById]);
  const totalLedgerPages = Math.max(1, Math.ceil(ledgerVisits.length / LEDGER_PAGE_SIZE));
  const pagedVisits = useMemo(() => {
    const start = (ledgerPage - 1) * LEDGER_PAGE_SIZE;
    return ledgerVisits.slice(start, start + LEDGER_PAGE_SIZE);
  }, [ledgerPage, ledgerVisits]);

  useEffect(() => {
    setLedgerPage(1);
  }, [appliedFilters]);

  useEffect(() => {
    void getSystemStats().then(setStats);
  }, [getSystemStats, users.length]);

  useEffect(() => {
    setNames(Object.fromEntries(users.map((user) => [user.id, user.name])));
  }, [users]);

  useEffect(() => {
    if (!targetUserId && users[0]) setTargetUserId(users[0].id);
    if (targetUserId && !users.some((user) => user.id === targetUserId)) setTargetUserId(users[0]?.id ?? '');
  }, [targetUserId, users]);

  useEffect(() => {
    if (adminTab !== 'data' || users.length === 0) return;
    void adminExportVisits(users.map((user) => user.id)).then((data) => setAllVisits(data.visits));
  }, [adminTab, users]);

  const handleCreateUser = async () => {
    const username = newUsername.trim();
    const name = newNickname.trim();
    if (!username || !name || !newPassword) {
      useStore.getState().showToast({ icon: '!', message: '请填写所有字段' });
      return;
    }
    await createUser(name, { username, password: newPassword, is_admin: false });
    setNewUsername('');
    setNewNickname('');
    setNewPassword('');
    setShowCreateModal(false);
    const refreshed = await getUsers();
    useStore.setState({ users: refreshed, toast: { icon: '✓', message: '用户已创建' } });
    void getSystemStats().then(setStats);
  };

  const handleResetPassword = async () => {
    if (!pendingReset) return;
    if (resetPw.length < 6) {
      useStore.getState().showToast({ icon: '!', message: '密码至少6位' });
      return;
    }
    if (resetPw !== resetConfirm) {
      useStore.getState().showToast({ icon: '!', message: '两次密码不一致' });
      return;
    }
    await resetUserPassword(pendingReset.userId, resetPw);
    setPendingReset(null);
    setResetPw('');
    setResetConfirm('');
  };

  const removeUser = (id: string) => {
    if (window.confirm('确定删除该用户及其所有数据？此操作不可恢复。')) void deleteUserAndData(id);
  };

  const handleNameBlur = (userId: string) => {
    const currentName = names[userId];
    const originalName = users.find((u) => u.id === userId)?.name;
    if (currentName !== undefined && currentName !== originalName) {
      void updateAnyUserName(userId, currentName);
    }
  };

  const downloadCurrentLedger = () => {
    writeAdminWorkbook('城市足迹当前视图.xlsx', ledgerVisits.map((visit) => {
      const city = cityById.get(visit.city_id);
      return {
        用户名: visit.username,
        昵称: visit.name,
        省份: city?.province ?? '',
        城市: city?.city_name ?? visit.city_id,
        停留天数: visit.duration_days,
        最后停留日期: visit.last_stay_date,
        备注: visit.notes ?? '',
        更新时间: visit.updated_at.slice(0, 10),
      };
    }));
    useStore.getState().showToast({ icon: '✓', message: `已导出 ${ledgerVisits.length} 条访问记录` });
  };

  const downloadAdminTemplate = () => {
    writeAdminWorkbook('城市足迹导入模板.xlsx', [{
      用户名: targetUser?.username ?? '',
      昵称: targetUser?.name ?? '',
      省份: '广东',
      城市: '广州',
      停留天数: 365,
      最后停留日期: '2024-01-01',
      备注: '示例',
    }]);
  };

  const onImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!targetUserId) {
      useStore.getState().showToast({ icon: '!', message: '请选择导入目标用户' });
      event.target.value = '';
      return;
    }

    const [workbook, existingData] = await Promise.all([
      file.arrayBuffer().then((buffer) => XLSX.read(buffer, { type: 'array', cellDates: true })),
      adminExportVisits([targetUserId]),
    ]);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    const existingCityIds = new Set(existingData.visits.map((visit) => visit.city_id));
    const seenCityIds = new Set<string>();

    setImportPreview(records.map((record) => {
      const province = normalize(record['省份']);
      const city = normalize(record['城市']);
      const duration_days = numberValue(record['停留天数']);
      const last_stay_date = dateValue(record['最后停留日期']);
      const notesValue = normalize(record['备注']);
      const matched = city ? findCity(province, city) : undefined;
      const row: ImportVisitRow = { province, city, duration_days, last_stay_date, notes: notesValue || undefined, city_id: matched?.city_id };
      if (!city) row.error = '城市必填';
      else if (!matched) row.error = '城市未匹配';
      else if (!Number.isFinite(duration_days) || !Number.isInteger(duration_days) || duration_days < 1) row.error = '停留天数无效';
      else if (!isValidDateText(last_stay_date)) row.error = '日期无效';
      else if (existingCityIds.has(matched.city_id)) row.error = '城市已存在';
      else if (seenCityIds.has(matched.city_id)) row.error = '文件内重复';
      if (matched) seenCityIds.add(matched.city_id);
      return row;
    }));
    event.target.value = '';
  };

  const confirmAdminImport = async () => {
    if (!targetUserId) {
      useStore.getState().showToast({ icon: '!', message: '请选择导入目标用户' });
      return;
    }
    const validRows = importPreview.filter((row) => !row.error && row.city_id);
    const result = await adminImportVisits(targetUserId, validRows.map((row) => ({
      city_id: row.city_id as string,
      duration_days: row.duration_days,
      last_stay_date: row.last_stay_date,
      notes: row.notes,
    })));
    setImportPreview([]);
    useStore.getState().showToast({ icon: '✓', message: `已导入 ${result.inserted_count} 条访问记录` });
    void getSystemStats().then(setStats);
    if (adminTab === 'data') {
      void adminExportVisits(users.map((user) => user.id)).then((data) => setAllVisits(data.visits));
    }
  };

  const content = (
    <>
      <div className="mode-pill mb-20">
        <button className={adminTab === 'users' ? 'active' : ''} onClick={() => setAdminTab('users')}>用户管理</button>
        <button className={adminTab === 'data' ? 'active' : ''} onClick={() => setAdminTab('data')}>数据管理</button>
        <button className={adminTab === 'docs' ? 'active' : ''} onClick={() => setAdminTab('docs')}>系统文档</button>
      </div>

      {adminTab === 'users' && (
        <>
          <div className="admin-stats">
            <div className="stat"><span className="label-sm">总用户</span><strong>{stats.totalUsers}</strong></div>
            <div className="stat"><span className="label-sm">管理员</span><strong>{stats.adminUsers}</strong></div>
            <div className="stat"><span className="label-sm">总访问</span><strong>{stats.totalVisits}</strong></div>
          </div>

          <div className="mb-16">
            <button className="btn-primary" onClick={() => setShowCreateModal(true)}>+ 新增用户</button>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>用户</th><th>类型</th><th>创建时间</th><th>密码</th><th>操作</th></tr></thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <input
                        className="input"
                        value={names[user.id] ?? user.name}
                        onChange={(event) => setNames({ ...names, [user.id]: event.target.value })}
                        onBlur={() => handleNameBlur(user.id)}
                        placeholder="用户名称"
                      />
                      {user.username && <div className="muted">@{user.username}</div>}
                    </td>
                    <td>{user.is_admin ? '管理员' : '普通用户'}</td>
                    <td>{user.created_at.slice(0, 10)}</td>
                    <td>
                      <button className="btn-outline small" onClick={() => { setPendingReset({ userId: user.id, name: user.name }); setResetPw(''); setResetConfirm(''); }}>重置密码</button>
                    </td>
                    <td>
                      {!user.is_admin && <button className="btn-danger small" onClick={() => removeUser(user.id)}>删除</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {adminTab === 'data' && (
        <div>
          <div className="flex-start flex-wrap gap-8 mb-8">
            <div className="col-username">
              <FuzzySelect
                options={usernameOptions}
                searchKeys={usernamePinyinMap}
                value={filterUsername}
                onChange={setFilterUsername}
                onSelect={setFilterUsername}
                placeholder="搜索选择用户名"
              />
            </div>
            <div className="col-username">
              <FuzzySelect
                options={nameOptions}
                searchKeys={namePinyinMap}
                value={filterName}
                onChange={setFilterName}
                onSelect={setFilterName}
                placeholder="搜索选择昵称"
              />
            </div>
            <div className="col-username">
              <FuzzySelect
                options={provinceOptionsList}
                searchKeys={PROVINCE_PINYIN}
                value={filterProvince}
                onChange={setFilterProvince}
                onSelect={setFilterProvince}
                placeholder="搜索选择省份"
              />
            </div>
            <div className="col-nickname">
              <FuzzySelect
                options={cityOptionsList}
                searchKeys={cityPinyinMap}
                value={filterCity}
                onChange={setFilterCity}
                onSelect={setFilterCity}
                placeholder="搜索选择城市"
              />
            </div>
          </div>
          <div className="actions flex-wrap mb-12">
            <button
              className="btn-primary"
              onClick={() => setAppliedFilters({
                username: filterUsername,
                name: filterName,
                province: filterProvince,
                city: filterCity,
              })}
            >
              <Icon name="search" /> 查询
            </button>
            <button className="btn-primary" onClick={downloadCurrentLedger}><Icon name="upload" /> 导出当前视图</button>
            <button className="btn-outline" onClick={() => setShowImportTools((value) => !value)}><Icon name="download" /> 导入数据</button>
            <button className="btn-outline" onClick={downloadAdminTemplate}><Icon name="download" /> 下载模板</button>
          </div>

          {showImportTools && (
            <div className="card p-16">
              <div className="form-row">
                <span className="label-sm">批量导入</span>
                <div className="form-grid-2">
                  <select className="input" value={targetUserId} onChange={(event) => { setTargetUserId(event.target.value); setImportPreview([]); }}>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>{user.username || user.name} · {user.name}</option>
                    ))}
                  </select>
                  <div className="actions">
                    <button className="btn-primary" disabled={!targetUserId} onClick={() => importFileRef.current?.click()}><Icon name="download" /> 选择文件</button>
                  </div>
                </div>
                <input ref={importFileRef} type="file" accept=".xlsx" hidden onChange={onImportFile} />
              </div>
            </div>
          )}

          {importPreview.length > 0 && (
            <div className="import-preview card">
              <div className="panel-title">
                <strong>导入预览</strong>
                <span className="muted">
                  ✅ 有效 {importPreview.filter((row) => !row.error).length} 行 / ⚠️ 跳过 {importPreview.filter((row) => row.error === '城市已存在' || row.error === '文件内重复').length} 行 / ❌ 错误 {importPreview.filter((row) => row.error && row.error !== '城市已存在' && row.error !== '文件内重复').length} 行
                </span>
              </div>
              <div className="table-wrap compact">
                <table className="data-table">
                  <thead><tr><th>省份</th><th>城市</th><th>天数</th><th>最后停留</th><th>备注</th><th>状态</th></tr></thead>
                  <tbody>
                    {importPreview.map((row, index) => {
                      const isDuplicate = row.error === '城市已存在' || row.error === '文件内重复';
                      return (
                        <tr key={`${row.city}-${index}`} style={isDuplicate ? { background: 'color-mix(in srgb, #f59e0b 12%, transparent)' } : row.error ? { background: 'color-mix(in srgb, var(--color-error) 10%, transparent)' } : undefined}>
                          <td>{row.province || '-'}</td>
                          <td>{row.city || '-'}</td>
                          <td>{Number.isFinite(row.duration_days) ? row.duration_days : '-'}</td>
                          <td>{row.last_stay_date || '-'}</td>
                          <td>{row.notes || '-'}</td>
                          <td className={row.error && !isDuplicate ? 'danger-text' : ''}>{row.error ?? '✓ 可导入'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="actions mt-12">
                <button className="btn-primary" disabled={importPreview.every((row) => row.error)} onClick={() => void confirmAdminImport()}>确认导入</button>
                <button className="btn-outline" onClick={() => setImportPreview([])}>取消</button>
              </div>
            </div>
          )}

          <div className="table-wrap">
            <table className="data-table" style={{ tableLayout: 'fixed', width: '100%' }}>
              <thead><tr><th style={{ width: '12%' }}>用户名</th><th style={{ width: '10%' }}>昵称</th><th style={{ width: '10%' }}>省份</th><th style={{ width: '12%' }}>城市</th><th style={{ width: '8%' }}>停留天数</th><th style={{ width: '13%' }}>最后停留</th><th style={{ width: '20%' }}>备注</th><th style={{ width: '15%' }}>更新时间</th></tr></thead>
              <tbody>
                {ledgerVisits.length === 0 ? (
                  <tr><td colSpan={8} className="muted text-center p-32">暂无访问记录</td></tr>
                ) : pagedVisits.map((visit) => {
                  const city = cityById.get(visit.city_id);
                  return (
                    <tr key={`${visit.user_id}-${visit.id}`}>
                      <td>{visit.username || visit.name}</td>
                      <td>{visit.name}</td>
                      <td>{city?.province ?? '-'}</td>
                      <td>{city?.city_name ?? visit.city_id}</td>
                      <td>{visit.duration_days}</td>
                      <td>{visit.last_stay_date}</td>
                      <td>{visit.notes || '-'}</td>
                      <td>{visit.updated_at.slice(0, 10)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {ledgerVisits.length > 0 && (
            <div className="actions flex-between flex-wrap mt-8">
              <span className="muted">
                共 {ledgerVisits.length} 条，当前第 {ledgerPage} / {totalLedgerPages} 页
              </span>
              <div className="actions">
                <button
                  className="btn-outline small"
                  disabled={ledgerPage <= 1}
                  onClick={() => setLedgerPage((page) => Math.max(1, page - 1))}
                >
                  上一页
                </button>
                <button
                  className="btn-outline small"
                  disabled={ledgerPage >= totalLedgerPages}
                  onClick={() => setLedgerPage((page) => Math.min(totalLedgerPages, page + 1))}
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {adminTab === 'docs' && (
        <div className="changelog-list">
          {DOC_LIST.map((doc, i) => (
            <div key={i} className="changelog-entry">
              <div className="changelog-date">{doc.category} · 最后更新 {doc.last_updated}</div>
              <ul className="changelog-items">
                <li>
                  {doc.action === 'changelog' ? (
                    <a href="#" onClick={(e) => { e.preventDefault(); setShowChangelog(true); }} style={{ color: 'var(--color-primary)' }}>{doc.title}</a>
                  ) : (
                    <a href={doc.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)' }}>{doc.title}</a>
                  )}
                  {' — '}{doc.description}
                </li>
              </ul>
            </div>
          ))}
        </div>
      )}

      {pendingReset && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal modal-sm">
            <div className="modal-head">
              <h2>重置密码 · {pendingReset.name}</h2>
              <button className="icon-btn" onClick={() => setPendingReset(null)}><Icon name="close" /></button>
            </div>
            <div className="stack gap-10 mb-16">
              <div className="form-row">
                <span className="label-sm">新密码</span>
                <input className="input" type="password" autoFocus value={resetPw} onChange={(e) => setResetPw(e.target.value)} placeholder="至少6位" />
              </div>
              <div className="form-row">
                <span className="label-sm">确认密码</span>
                <input className="input" type="password" value={resetConfirm} onChange={(e) => setResetConfirm(e.target.value)} placeholder="再次输入" onKeyDown={(e) => { if (e.key === 'Enter') void handleResetPassword(); }} />
              </div>
            </div>
            <div className="flex-end gap-8">
              <button className="btn-outline" onClick={() => setPendingReset(null)}>取消</button>
              <button className="btn-primary" onClick={() => void handleResetPassword()}>确认重置</button>
            </div>
          </section>
        </div>
      )}

      {showCreateModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal">
            <div className="modal-head">
              <h2>新增用户</h2>
              <button className="icon-btn" onClick={() => setShowCreateModal(false)}><Icon name="close" /></button>
            </div>
            <div className="form-grid-2 mb-16">
              <input className="input" value={newUsername} onChange={(event) => setNewUsername(event.target.value)} placeholder="用户名" />
              <input className="input" value={newNickname} onChange={(event) => setNewNickname(event.target.value)} placeholder="昵称" />
              <input className="input" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="密码" />
            </div>
            <div className="flex-end gap-8">
              <button className="btn-outline" onClick={() => { setShowCreateModal(false); setNewUsername(''); setNewNickname(''); setNewPassword(''); }}>取消</button>
              <button className="btn-primary" onClick={() => void handleCreateUser()}>确认创建</button>
            </div>
          </section>
        </div>
      )}

      {showChangelog && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal modal-wide">
            <div className="modal-head">
              <h2>系统升级记录</h2>
              <button className="icon-btn" onClick={() => setShowChangelog(false)}><Icon name="close" /></button>
            </div>
            <div className="changelog-list">
              {CHANGELOG.map((entry, i) => (
                <div key={i} className="changelog-entry">
                  <div className="changelog-date">{entry.date}</div>
                  <ul className="changelog-items">
                    {entry.items.map((item, j) => (
                      <li key={j}>{j + 1}. {item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );

  if (embedded) return <div className="embedded-panel">{content}</div>;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal" style={{ width: 'min(1280px, calc(100vw - 32px))', maxWidth: 'none' }}>
        <div className="modal-head">
          <h2>管理员面板</h2>
          <button className="icon-btn" onClick={() => setAdminOpen(false)}><Icon name="close" /></button>
        </div>
        {content}
      </section>
    </div>
  );
}
