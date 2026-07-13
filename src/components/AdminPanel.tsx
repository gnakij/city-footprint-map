import { ChangeEvent, MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent, useEffect, useMemo, useRef, useState } from 'react';
import { pinyin } from 'pinyin-pro';
import { adminExportVisits, adminImportVisits, createManagedUser, getUsers } from '../api';
import adminDocs from '../data/adminDocs.json';
import { CITIES } from '../data/cities';
import { useStore } from '../store/useStore';
import FuzzySelect from './ui/FuzzySelect';
import Table from './Table';
import ImportPreviewTable from './ImportPreviewTable';
import ConfirmDialog from './ConfirmDialog';
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
const FUZZY_SELECT_CLASSES = { dropdown: 'card', option: 'btn-outline small', activeOption: 'active' };
type XlsxModule = typeof import('xlsx');
type ChangelogEntry = { date: string; items: string[] };
type DocItem = { category: string; title: string; url?: string; action?: string; last_updated: string; description: string; };
const DOC_LIST = adminDocs as DocItem[];
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

function dateValue(value: unknown, xlsx: XlsxModule) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    const parsed = xlsx.SSF.parse_date_code(value);
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

async function writeAdminWorkbook(filename: string, rows: Array<Record<string, string | number | undefined>>) {
  const xlsx = await import('xlsx');
  const worksheet = xlsx.utils.json_to_sheet(rows, { header: ['用户名', '昵称', '省份', '城市', '停留天数', '最后停留日期', '备注', '更新时间'] });
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, '访问记录');
  xlsx.writeFile(workbook, filename);
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
  /* 2026-06-21: 移动端用户卡片"修改昵称"交互专用——记录当前正在编辑昵称
     的用户id，null表示没有任何卡片处于编辑态。PC端表格沿用原有的失焦
     保存模式不受影响，移动端用明确的"修改→保存/取消"交互，因为移动端
     没有PC端"点输入框直接改、点别处自动保存"的隐含习惯。 */
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  /* 2026-06-21: 移动端批量删除交互（第二版，替换第一版"长按直接删除单个"
     方案——真机测试发现长按会跟浏览器原生的"选择文本/分享"菜单冲突，且
     用户提出更完整的方案：长按进入多选模式，勾选若干个后统一删除，是
     更标准的批量操作交互，业内邮箱/相册/文件管理器都是这套模式）。
     selectionMode: 是否处于多选态。selectedIds: 当前已勾选的用户id集合。
     pendingDelete改为承载"待确认批量删除的用户列表"(单个删除也走同一个
     modal，传入长度为1的数组即可，不再需要两套确认逻辑)。
     longPressTimer/longPressTriggered配合阻止浏览器原生长按菜单——
     原生菜单是长按选中文本/呼出分享时触发的，跟我们自己的setTimeout
     长按检测同时存在会冲突，需要在长按命中时主动preventDefault。 */
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<{ userId: string; name: string }[] | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);
  const [newUsername, setNewUsername] = useState('');
  const [newNickname, setNewNickname] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [stats, setStats] = useState({ totalUsers: users.length, totalVisits: 0, adminUsers: 0 });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [adminTab, setAdminTab] = useState<'users' | 'data' | 'docs'>('users');
  const [showChangelog, setShowChangelog] = useState(false);
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([]);
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
    await createManagedUser(name, { username, password: newPassword, is_admin: false });
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

  /* 2026-06-21: 原用window.confirm()做确认，是浏览器原生弹窗、样式无法
     定制、跟项目自己的modal设计完全不统一。删除确认统一改用项目自己的
     modal样式(参照"重置密码"modal-sm模板)。pendingDelete现在是数组，
     桌面端单个删除传长度为1的数组，移动端批量删除传选中的全部用户，
     共用同一个modal和同一个confirmDeleteUser，不需要两套确认逻辑。 */
  const removeUser = (id: string) => {
    const user = users.find((u) => u.id === id);
    if (user) setPendingDelete([{ userId: id, name: user.name }]);
  };

  const confirmDeleteUser = () => {
    if (!pendingDelete) return;
    pendingDelete.forEach((item) => void deleteUserAndData(item.userId));
    setPendingDelete(null);
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  /* 2026-06-21: 移动端"长按进入多选模式"交互（第三版修复）。真机测试
     发现：①浏览器"手动标记广告"/划词工具栏菜单依然弹出——根因是上一版
     onContextMenu只能拦截右键菜单事件，移动端长按触发的是另一套系统级
     文本选择/菜单行为，必须在touchstart时就调用event.preventDefault()
     才能真正拦住（之前的处理函数都没接收原生事件参数、没调用过
     preventDefault，onContextMenu的return false在新版React里根本不
     生效）。②"手指多拨动一下页面就关闭了"——是浏览器的"边缘滑动返回
     上一页"系统手势被触发，需要在touchmove时也阻止默认行为，但不能
     无差别阻止——必须先用阈值区分"真的在滚动列表"还是"长按时手指轻微
     抖动"，否则用户长按时手指完全不动几乎不可能，体验会很差；阈值内的
     小幅移动允许继续计时，超出阈值才视为"取消长按、走滚动"，此时才放行
     默认行为（不阻止，让用户能正常滚动列表）。
     touchStartPos记录按下时的坐标，用于touchmove时计算位移量。 */
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const LONG_PRESS_MOVE_THRESHOLD = 10; // px，超出则视为滚动而不是长按抖动

  /* 2026-06-21: is_admin/selectionMode的拦截已经在JSX层处理（多选模式
     下和管理员卡片完全不绑定这些事件props），这里不再重复判断
     selectionMode——保留is_admin判断是因为这是函数自身逻辑的一部分
     （管理员永远不该进多选），但selectionMode属于"调用方该不该调用我"
     的范畴，不应该让函数自己再判断一遍调用时机，否则两处逻辑分散、
     不容易看出真正生效的是哪一层。 */
  const handleLongPressStart = (event: ReactTouchEvent | ReactMouseEvent, user: { id: string; name: string; is_admin: boolean }) => {
    if (user.is_admin) return;
    // 2026-06-21修复: 每次新的按下都先彻底清掉上一次可能残留的计时器，
    // 防止"长按A(被is_admin拦截，定时器从未启动)→长按B"这种连续操作下
    // 出现任何潜在的状态竞争——不依赖猜测具体哪一步残留了什么，直接在
    // 起点保证这次是完全干净的状态。
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if ('touches' in event) {
      const touch = event.touches[0];
      touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    }
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      longPressTimer.current = null;
      setSelectionMode(true);
      setSelectedIds(new Set([user.id]));
      // 长按命中的瞬间阻止默认行为，避免系统紧接着弹出选择文本/划词菜单。
      event.preventDefault?.();
    }, 500);
  };

  const handleLongPressMove = (event: ReactTouchEvent) => {
    if (!touchStartPos.current || !longPressTimer.current) return;
    const touch = event.touches[0];
    const dx = Math.abs(touch.clientX - touchStartPos.current.x);
    const dy = Math.abs(touch.clientY - touchStartPos.current.y);
    if (dx > LONG_PRESS_MOVE_THRESHOLD || dy > LONG_PRESS_MOVE_THRESHOLD) {
      // 超出阈值视为真实滚动/滑动，取消长按计时，并主动不调用
      // preventDefault——放行默认行为，让浏览器正常处理滚动或边缘返回手势，
      // 不要在用户明确是在滑动时还去拦截系统手势。
      handleLongPressEnd();
    }
  };

  const handleLongPressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    touchStartPos.current = null;
  };

  const toggleSelected = (userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      // 全部取消勾选后自动退出多选模式，作为"取消"按钮的补充，不强制
      // 用户一定要点按钮才能退出。
      if (next.size === 0) setSelectionMode(false);
      return next;
    });
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleBatchDelete = () => {
    const targets = users.filter((u) => selectedIds.has(u.id)).map((u) => ({ userId: u.id, name: u.name }));
    if (targets.length > 0) setPendingDelete(targets);
  };

  /* 2026-06-26: PC端用户名从失焦自动保存(handleNameBlur)改为按钮式“修改→
     保存/取消”后，handleNameBlur不再被调用，已删除。下handleNameSave/
     handleNameCancel现是PC端和移动端共享的唯一保存/取消逻辑。 */

  /* 2026-06-21: 移动端卡片"保存"按钮专用，复用PC端同一个updateAnyUserName
     接口，不另写一套保存逻辑——区别只在触发方式（明确点击保存，而不是
     失焦自动保存）。 */
  const handleNameSave = (userId: string) => {
    const currentName = names[userId];
    const originalName = users.find((u) => u.id === userId)?.name;
    if (currentName !== undefined && currentName !== originalName) {
      void updateAnyUserName(userId, currentName);
    }
    setEditingNameId(null);
  };

  const handleNameCancel = (userId: string, originalName: string) => {
    setNames({ ...names, [userId]: originalName });
    setEditingNameId(null);
  };

  const openChangelog = async () => {
    setShowChangelog(true);
    if (changelog.length === 0) {
      const data = await import('../data/changelog.json');
      setChangelog(data.default as ChangelogEntry[]);
    }
  };

  const downloadCurrentLedger = async () => {
    await writeAdminWorkbook('城市足迹当前视图.xlsx', ledgerVisits.map((visit) => {
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

  const downloadAdminTemplate = async () => {
    await writeAdminWorkbook('城市足迹导入模板.xlsx', [{
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

    const xlsx = await import('xlsx');
    const [workbook, existingData] = await Promise.all([
      file.arrayBuffer().then((buffer) => xlsx.read(buffer, { type: 'array', cellDates: true })),
      adminExportVisits([targetUserId]),
    ]);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const records = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet);
    const existingCityIds = new Set(existingData.visits.map((visit) => visit.city_id));
    const seenCityIds = new Set<string>();

    setImportPreview(records.map((record) => {
      const province = normalize(record['省份']);
      const city = normalize(record['城市']);
      const duration_days = numberValue(record['停留天数']);
      const last_stay_date = dateValue(record['最后停留日期'], xlsx);
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

      {/* 2026-06-21: 数字卡片(总用户/管理员/总访问)和"新增用户"按钮挪到
         .admin-tab-viewport外面，固定在顶部不随下方用户列表滚动——用户
         反馈"列表滚动时希望这些汇总信息和新增按钮保持可见"。只在
         adminTab==='users'时显示，不影响数据管理/系统文档两个tab。
         注意：不能挪到viewport内部再单独加一层sticky，那样容易跟viewport
         本身的overflow:auto重演"外层内层抢滚动权"的问题（之前修复tab切换
         高度跳动时已经踩过这个坑）——直接放在viewport外部、tab按钮同级，
         是更简单可靠的"不参与滚动"方案。 */}
      {adminTab === 'users' && (
        <>
          <div className="admin-stats">
            <div className="stat"><span className="label-sm">总用户</span><strong>{stats.totalUsers}</strong></div>
            <div className="stat"><span className="label-sm">管理员</span><strong>{stats.adminUsers}</strong></div>
            <div className="stat"><span className="label-sm">总访问</span><strong>{stats.totalVisits}</strong></div>
          </div>
          {/* 2026-06-21: 移动端多选模式下，"新增用户"切换为"取消"+
             "删除用户(已选N个)"。桌面端不会触发长按多选(走表格而非
             卡片)，所以桌面端的"新增用户"按钮始终显示，用desktop-only
             包裹；移动端用selectionMode分叉显示哪一组按钮。 */}
          <div className="mb-16 desktop-only">
            <button className="btn-primary" onClick={() => setShowCreateModal(true)}>+ 新增用户</button>
          </div>
          <div className="mb-16 mobile-only">
            {selectionMode ? (
              <div className="admin-selection-bar">
                <button className="btn-outline" onClick={exitSelectionMode}>取消</button>
                <button
                  className="btn-danger"
                  disabled={selectedIds.size === 0}
                  onClick={handleBatchDelete}
                >
                  删除用户{selectedIds.size > 0 ? `（已选${selectedIds.size}个）` : ''}
                </button>
              </div>
            ) : (
              <button className="btn-primary" onClick={() => setShowCreateModal(true)}>+ 新增用户</button>
            )}
          </div>
        </>
      )}

      {/* 2026-06-21: 之前用min-height硬撑"系统文档"tab去对齐另外两个tab的
         高度，但用户管理/数据管理的表格内容随实际用户数/访问记录数动态变化
         （当前测试数据只有4个用户，未来会增长），固定min-height只是凑了
         当下的数字，用户数一多依然会跳。改用更稳健的方案：tab按钮固定在
         外面不滚动，三个tab的内容统一包进.admin-tab-viewport（固定高度+
         内部overflow:auto），这样无论内容多少，外层弹窗高度永远不变，
         滚动发生在内容区域内部，根治"切tab高度跳动"问题，不依赖猜测的
         固定数值。 */}
      <div className="admin-tab-viewport">

      {adminTab === 'users' && (
        <>
          {/* 2026-06-21: 桌面端表格保持不变。移动端(768px以下)改用卡片列表
             ——根因排查发现.data-table设了min-width:720px，是桌面表格的
             设计思路，移动端完全没有专属断点处理，导致表格被硬塞进手机屏幕、
             靠横向滚动适配，文字相对显得小、操作按钮也要滚动才能点到。
             用户截图标注确认方向：调整箭头指向的用户列表（往大调），而不是
             调小圈出的数字卡片/Tab按钮（那两处被多个场景复用，风险更大）。
             两套结构通过.desktop-only/.mobile-only配合CSS媒体查询切换显示，
             不用JS判断设备类型，符合项目现有的响应式风格。 */}
          {/* 2026-06-21: 桌面表格三处整改：①用户名+@username合并同一行
             （baseline对齐），不再纵向堆叠撑高每行；②"密码"独立列(仅含重置
             密码按钮)与"操作"独立列(仅含删除按钮)合并为统一的"操作"列，
             不再让同一组对用户的操作分散在两个不相邻的列里；③.users-table-wrap
             固定高度+内部滚动，配合.data-table th的sticky，让表头无论数据
             量多少都保持可见，不依赖用户数将来是否增长到产生滚动的程度。 */}
          {/* 2026-06-27: 改用通用Table组件(scroll="fill")替代手写
             table结构。父级.admin-tab-viewport是flex容器，本表格需要
             占满它分配的剩余空间而不是用孤立的固定像素值——这正是
             Table组件scroll='fill'模式存在的原因，机制跟之前手写的
             .users-table-wrap完全一致，只是改名为通用的.table-wrap--fill。 */}
          <Table
            wrapClassName="desktop-only"
            scroll="fill"
            rowKey={(user) => user.id}
            data={users}
            columns={[
              {
                key: 'name',
                header: '用户',
                render: (user) => {
                  const isEditing = editingNameId === user.id;
                  /* 2026-06-26: 用户名从内联输入框改为按钮式"修改→保存/
                     取消"，跟移动端卡片的交互完全一致（不依赖PC端才有的
                     "失焦自动保存"隐含习惯），复用同一套editingNameId/
                     handleNameSave/handleNameCancel状态和逻辑，不另写
                     一套。非编辑态显示用户名+@username；编辑态显示输入框，
                     保存/取消按钮挪到"操作"列跟重置密码/删除放在一起。 */
                  return isEditing ? (
                    <input
                      className="input"
                      value={names[user.id] ?? user.name}
                      onChange={(event) => setNames({ ...names, [user.id]: event.target.value })}
                      placeholder="用户名称"
                      autoFocus
                    />
                  ) : (
                    <div className="user-name-cell">
                      <span>{names[user.id] ?? user.name}</span>
                      {user.username && <span className="muted">@{user.username}</span>}
                    </div>
                  );
                },
              },
              { key: 'type', header: '类型', render: (user) => (user.is_admin ? '管理员' : '普通用户') },
              { key: 'created', header: '创建时间', render: (user) => user.created_at.slice(0, 10) },
              {
                key: 'actions',
                header: '操作',
                render: (user) => {
                  const isEditing = editingNameId === user.id;
                  return (
                    <div className="row-actions">
                      {isEditing ? (
                        <>
                          <button className="btn-primary compact" onClick={() => handleNameSave(user.id)}>保存</button>
                          <button className="btn-outline compact" onClick={() => handleNameCancel(user.id, user.name)}>取消</button>
                        </>
                      ) : (
                        <>
                          <button className="btn-tertiary" onClick={() => setEditingNameId(user.id)}>修改昵称</button>
                          <button className="btn-tertiary" onClick={() => { setPendingReset({ userId: user.id, name: user.name }); setResetPw(''); setResetConfirm(''); }}>重置密码</button>
                          {!user.is_admin && <button className="btn-tertiary-danger" onClick={() => removeUser(user.id)}>删除</button>}
                        </>
                      )}
                    </div>
                  );
                },
              },
            ]}
          />

          <div className="admin-user-cards mobile-only">
            {users.map((user) => {
              const isEditing = editingNameId === user.id;
              const isChecked = selectedIds.has(user.id);
              /* 2026-06-21: 多选模式下，整卡点击=切换勾选（管理员账号
                 例外，不响应点击）；非多选模式下，长按进入多选，普通
                 点击不绑定在卡片本身（点"修改"/按钮各自触发）。
                 longPressTriggered用于区分"这次touchend/click是长按
                 松手后的尾随事件，还是真正的点击"——长按命中后会把
                 triggered设为true，这里检测到就直接return不处理点击，
                 避免长按进多选模式的同时又触发了一次勾选切换。 */
              /* 2026-06-21: 多选模式下彻底不绑定任何长按相关事件（不是
                 "绑定了但函数内部return"，是压根不传这些props）——用户
                 明确要求"多选状态下没有长按这件事"，要的是干净利落、没有
                 任何长按响应的暧昧空间，不只是行为上没反应。 */
              const handleCardClick = () => {
                if (longPressTriggered.current) {
                  longPressTriggered.current = false;
                  return;
                }
                if (selectionMode && !user.is_admin) toggleSelected(user.id);
              };
              return (
                <div
                  key={user.id}
                  className={`admin-user-card${isEditing || selectionMode ? '' : ' is-interactive'}${selectionMode && isChecked ? ' is-checked' : ''}`}
                  onTouchStart={user.is_admin || selectionMode ? undefined : (e) => handleLongPressStart(e, user)}
                  onTouchEnd={user.is_admin || selectionMode ? undefined : handleLongPressEnd}
                  onTouchMove={user.is_admin || selectionMode ? undefined : handleLongPressMove}
                  onMouseDown={user.is_admin || selectionMode ? undefined : (e) => handleLongPressStart(e, user)}
                  onMouseUp={user.is_admin || selectionMode ? undefined : handleLongPressEnd}
                  onMouseLeave={user.is_admin || selectionMode ? undefined : handleLongPressEnd}
                  onContextMenu={(e) => e.preventDefault()}
                  onClick={handleCardClick}
                >
                  {selectionMode ? (
                    <div className="admin-user-card-select-row">
                      <span className={`admin-user-card-checkbox${isChecked ? ' is-checked' : ''}${user.is_admin ? ' is-disabled' : ''}`}>
                        {isChecked && <Icon name="check" />}
                      </span>
                      {/* 2026-06-21: 多选行原来只显示昵称，补充显示用户名
                         (@username)解决重名分不清的问题。昵称+用户名同一行
                         横排显示（更紧凑），标签推到最右侧对齐。 */}
                      <div className="admin-user-card-select-info">
                        <div className="admin-user-card-select-text">
                          <span className="admin-user-card-name">{user.name}</span>
                          {user.username && <span className="admin-user-card-select-username">@{user.username}</span>}
                        </div>
                        <span className={`admin-user-card-tag${user.is_admin ? ' is-admin' : ''}`}>{user.is_admin ? '管理员' : '普通用户'}</span>
                      </div>
                    </div>
                  ) : isEditing ? (
                    <>
                      <div className="edit-input-row">
                        <input
                          className="input edit-input"
                          value={names[user.id] ?? user.name}
                          onChange={(event) => setNames({ ...names, [user.id]: event.target.value })}
                          placeholder="用户名称"
                          autoFocus
                        />
                      </div>
                      <div className="card-btn-row">
                        <button className="btn-primary compact" onClick={() => handleNameSave(user.id)}>保存</button>
                        <button className="btn-outline compact" onClick={() => handleNameCancel(user.id, user.name)}>取消</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="admin-user-card-head">
                        <div className="admin-user-card-name-row">
                          <span className="admin-user-card-name">{names[user.id] ?? user.name}</span>
                          <button className="btn-tertiary" onClick={() => setEditingNameId(user.id)}>修改</button>
                        </div>
                        <span className={`admin-user-card-tag${user.is_admin ? ' is-admin' : ''}`}>{user.is_admin ? '管理员' : '普通用户'}</span>
                      </div>
                      <div className="admin-user-card-meta">
                        {user.username && `@${user.username} · `}创建于 {user.created_at.slice(0, 10)}
                      </div>
                      {/* 2026-06-21: 常驻"删除"按钮移除（改为长按进入多选批量
                         删除），只剩"重置密码"——不再需要撑满整行的
                         card-btn-row布局，改为靠左、宽度刚好包裹文字的
                         紧凑按钮(admin-user-card-action)。非管理员账号
                         卡片下方提示"长按可批量删除"，告知这个隐藏交互
                         的存在。 */}
                      <div className="admin-user-card-footer">
                        <button className="btn-tertiary" onClick={() => { setPendingReset({ userId: user.id, name: user.name }); setResetPw(''); setResetConfirm(''); }}>重置密码</button>
                        {!user.is_admin && <span className="admin-user-card-hint">长按可批量删除</span>}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {adminTab === 'data' && (
        /* 2026-06-27: 外层改用.stack(默认gap=12px)统一管理顶层区块间距，
           不再每个区块各自补mt-8/mb-8/mb-12——原来这套手动margin还有个
           隐藏bug：如果"导入工具"面板和"导入预览"同时展开，两者之间完全
           没有间距(漏写了)，改用父容器gap后，不管当前具体是哪几个条件
           面板同时渲染，相邻可见元素之间的间距都会自动补全，不会再有
           漏的组合。筛选区+按钮是关系紧密的"操作控制区"，表格+分页器是
           关系紧密的"表格自身的一套"，这两组各自用更紧的gap-8(8px)，
           跟外层12px做出区分——不是所有间距都拉平成一个数字，是用项目里
           已有的.gap-8修饰符明确表达"这一组关系更紧密"。 */
        <div className="stack">
          <div className="stack gap-8">
          <div className="flex-start flex-wrap gap-8">
            <div className="col-username">
              <FuzzySelect
                className="input"
                options={usernameOptions}
                searchKeys={usernamePinyinMap}
                value={filterUsername}
                onChange={setFilterUsername}
                onSelect={setFilterUsername}
                placeholder="搜索选择用户名"
                classNames={FUZZY_SELECT_CLASSES}
              />
            </div>
            <div className="col-username">
              <FuzzySelect
                className="input"
                options={nameOptions}
                searchKeys={namePinyinMap}
                value={filterName}
                onChange={setFilterName}
                onSelect={setFilterName}
                placeholder="搜索选择昵称"
                classNames={FUZZY_SELECT_CLASSES}
              />
            </div>
            <div className="col-username">
              <FuzzySelect
                className="input"
                options={provinceOptionsList}
                searchKeys={PROVINCE_PINYIN}
                value={filterProvince}
                onChange={setFilterProvince}
                onSelect={setFilterProvince}
                placeholder="搜索选择省份"
                classNames={FUZZY_SELECT_CLASSES}
              />
            </div>
            <div className="col-nickname">
              <FuzzySelect
                className="input"
                options={cityOptionsList}
                searchKeys={cityPinyinMap}
                value={filterCity}
                onChange={setFilterCity}
                onSelect={setFilterCity}
                placeholder="搜索选择城市"
                classNames={FUZZY_SELECT_CLASSES}
              />
            </div>
          </div>
          <div className="actions flex-wrap">
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
              <button className="btn-outline" onClick={() => void downloadCurrentLedger()}><Icon name="upload" /> 导出当前视图</button>
              <button className="btn-outline" onClick={() => setShowImportTools((value) => !value)}><Icon name="download" /> 导入数据</button>
              <button className="btn-outline" onClick={() => void downloadAdminTemplate()}><Icon name="download" /> 下载模板</button>
            </div>
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
              {/* 2026-06-27: 改用通用ImportPreviewTable组件，跟UserProfile.tsx
                 的访问记录导入预览共用同一份实现，不再各自维护一份几乎
                 一字不差的表格代码。 */}
              <ImportPreviewTable rows={importPreview} />
              <div className="actions mt-12">
                <button className="btn-primary" disabled={importPreview.every((row) => row.error)} onClick={() => void confirmAdminImport()}>确认导入</button>
                <button className="btn-outline" onClick={() => setImportPreview([])}>取消</button>
              </div>
            </div>
          )}

          {/* 2026-06-27: 改用通用Table组件，scroll保持'none'(沿用原状态，
             配合下方分页器，不在这次抽象里顺手新增sticky表头——那是另一条
             独立待办，等PC端断点问题排查完后再处理，不在这次混着做)。
             data传pagedVisits而不是ledgerVisits：分页后的当页数据本来就是
             实际渲染的内容，空状态判断在常规场景下跟原来对ledgerVisits判空
             是等价的。 */}
          <div className="stack gap-8">
            <Table
              tableStyle={{ tableLayout: 'fixed', width: '100%' }}
              emptyText="暂无访问记录"
              data={pagedVisits}
              rowKey={(visit) => `${visit.user_id}-${visit.id}`}
              columns={[
                { key: 'username', header: '用户名', headerStyle: { width: '12%' }, render: (visit) => visit.username || visit.name },
                { key: 'name', header: '昵称', headerStyle: { width: '10%' }, render: (visit) => visit.name },
                { key: 'province', header: '省份', headerStyle: { width: '10%' }, render: (visit) => cityById.get(visit.city_id)?.province ?? '-' },
                { key: 'city', header: '城市', headerStyle: { width: '12%' }, render: (visit) => cityById.get(visit.city_id)?.city_name ?? visit.city_id },
                { key: 'duration', header: '停留天数', headerStyle: { width: '8%' }, render: (visit) => visit.duration_days },
                { key: 'lastStay', header: '最后停留', headerStyle: { width: '13%' }, render: (visit) => visit.last_stay_date },
                { key: 'notes', header: '备注', headerStyle: { width: '20%' }, render: (visit) => visit.notes || '-' },
                { key: 'updated', header: '更新时间', headerStyle: { width: '15%' }, render: (visit) => visit.updated_at.slice(0, 10) },
              ]}
            />

            {ledgerVisits.length > 0 && (
              <div className="actions flex-between flex-wrap">
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
        </div>
      )}

      {adminTab === 'docs' && (
        <div className="changelog-list">
          {DOC_LIST.map((doc, i) => {
            const handleEntryClick = () => {
              if (doc.action === 'changelog') {
                void openChangelog();
              } else {
                window.open(doc.url, '_blank', 'noopener,noreferrer');
              }
            };
            return (
              <div
                key={i}
                className="changelog-entry"
                role="button"
                tabIndex={0}
                onClick={handleEntryClick}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleEntryClick(); } }}
              >
                <div className="changelog-date">{doc.category} · 最后更新 {doc.last_updated}</div>
                <div className="changelog-body">
                  {doc.action === 'changelog' ? (
                    <a href="#" className="changelog-link" onClick={(e) => { e.preventDefault(); e.stopPropagation(); void openChangelog(); }}>{doc.title}</a>
                  ) : (
                    <a href={doc.url} target="_blank" rel="noopener noreferrer" className="changelog-link" onClick={(e) => e.stopPropagation()}>{doc.title}</a>
                  )}
                  <span className="changelog-desc">{' — '}{doc.description}</span>
                </div>
              </div>
            );
          })}
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

      {/* 2026-06-21: 删除确认改用项目自己的modal样式，替代之前的
         window.confirm()原生弹窗——桌面端单个删除和移动端批量删除共用
         这一个modal，pendingDelete统一是数组（单个删除传长度1的数组），
         不需要两套确认逻辑。批量删除时汇总展示全部待删除用户名列表，
         让用户确认前能清楚看到具体删的是谁。 */}
      {pendingDelete && (
        <ConfirmDialog
          title={pendingDelete.length > 1 ? `删除 ${pendingDelete.length} 个用户` : `删除用户 · ${pendingDelete[0].name}`}
          confirmLabel="确认删除"
          danger
          onConfirm={confirmDeleteUser}
          onCancel={() => setPendingDelete(null)}
        >
          <>
            {pendingDelete.length > 1 && (
              <ul className="admin-delete-list mb-16">
                {pendingDelete.map((item) => <li key={item.userId}>{item.name}</li>)}
              </ul>
            )}
            <p className="mb-16">确定删除{pendingDelete.length > 1 ? '以上用户' : '该用户'}及其所有数据？此操作不可恢复。</p>
          </>
        </ConfirmDialog>
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
              {changelog.length === 0 && <p className="muted">升级记录加载中…</p>}
              {changelog.map((entry, i) => (
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
      </div>
    </>
  );

  if (embedded) return <div className="embedded-panel">{content}</div>;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal modal-admin" style={{ width: 'min(1280px, calc(100vw - 32px))', maxWidth: 'none' }}>
        <div className="modal-head">
          <h2>管理员面板</h2>
          <button className="icon-btn" onClick={() => setAdminOpen(false)}><Icon name="close" /></button>
        </div>
        {content}
      </section>
    </div>
  );
}
