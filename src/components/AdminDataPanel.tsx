import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { pinyin } from 'pinyin-pro';
import { adminExportVisits, adminImportVisits, type AdminVisitExportRow } from '../api';
import { CITIES } from '../data/cities';
import { useStore } from '../store/useStore';
import type { ImportVisitRow, User } from '../types';
import { formatLocalDate, isValidDateText } from '../utils/date';
import { GIFT_MODE } from '../config';
import FuzzySelect from './ui/FuzzySelect';
import Icon from './Icon';
import ImportPreviewTable from './ImportPreviewTable';
import Table from './Table';

const LEDGER_PAGE_SIZE = 10;
const FUZZY_SELECT_CLASSES = { dropdown: 'card', option: 'btn-outline small', activeOption: 'active' };
type XlsxModule = typeof import('xlsx');

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

function toPinyinKey(text: string): string {
  return pinyin(text, { toneType: 'none' }).replace(/\s+/g, '');
}

function buildPinyinMap(options: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const option of options) {
    map[option] = toPinyinKey(option);
  }
  return map;
}

function normalize(value: unknown) {
  return String(value ?? '').trim();
}

function dateValue(value: unknown, xlsx: XlsxModule) {
  if (value instanceof Date) return formatLocalDate(value);
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

export default function AdminDataPanel({ users, onStatsRefresh }: { users: User[]; onStatsRefresh: () => void }) {
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
  const [targetUserId, setTargetUserId] = useState('');
  const [importPreview, setImportPreview] = useState<ImportVisitRow[]>([]);
  const importFileRef = useRef<HTMLInputElement>(null);

  const cityById = useMemo(() => new Map(CITIES.map((city) => [city.city_id, city])), []);
  const targetUser = users.find((user) => user.id === targetUserId);
  const userByUsername = useMemo(() => {
    const map = new Map<string, User>();
    for (const user of users) {
      if (user.username) map.set(user.username.trim().toLowerCase(), user);
    }
    return map;
  }, [users]);
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
    if (targetUserId && !users.some((user) => user.id === targetUserId)) setTargetUserId('');
  }, [targetUserId, users]);

  useEffect(() => {
    if (users.length === 0) return;
    void adminExportVisits(users.map((user) => user.id)).then((data) => setAllVisits(data.visits));
  }, [users]);

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
      用户名: targetUser?.username ?? users[0]?.username ?? '',
      昵称: targetUser?.name ?? users[0]?.name ?? '',
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

    const xlsx = await import('xlsx');
    const [workbook, existingData] = await Promise.all([
      file.arrayBuffer().then((buffer) => xlsx.read(buffer, { type: 'array', cellDates: true })),
      adminExportVisits(targetUserId ? [targetUserId] : users.map((user) => user.id)),
    ]);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const records = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet);
    const existingCityIdsByUser = new Map<string, Set<string>>();
    for (const visit of existingData.visits) {
      const set = existingCityIdsByUser.get(visit.user_id) ?? new Set<string>();
      set.add(visit.city_id);
      existingCityIdsByUser.set(visit.user_id, set);
    }
    const seenCityIdsByUser = new Map<string, Set<string>>();

    setImportPreview(records.map((record) => {
      const username = normalize(record['用户名']);
      const explicitUser = targetUserId ? targetUser : userByUsername.get(username.toLowerCase());
      const province = normalize(record['省份']);
      const city = normalize(record['城市']);
      const duration_days = numberValue(record['停留天数']);
      const last_stay_date = dateValue(record['最后停留日期'], xlsx);
      const notesValue = normalize(record['备注']);
      const matched = city ? findCity(province, city) : undefined;
      const row: ImportVisitRow = {
        username: targetUserId ? targetUser?.username : username,
        name: targetUserId ? targetUser?.name : explicitUser?.name,
        target_user_id: explicitUser?.id,
        province,
        city,
        duration_days,
        last_stay_date,
        notes: notesValue || undefined,
        city_id: matched?.city_id,
      };
      if (!targetUserId && !username) row.error = '用户名必填';
      else if (!explicitUser) row.error = '用户未匹配';
      else if (!city) row.error = '城市必填';
      else if (!matched) row.error = '城市未匹配';
      else if (!Number.isFinite(duration_days) || !Number.isInteger(duration_days) || duration_days < 1) row.error = '停留天数无效';
      else if (!isValidDateText(last_stay_date)) row.error = '日期无效';
      else if (existingCityIdsByUser.get(explicitUser.id)?.has(matched.city_id)) row.error = '城市已存在';
      else if (seenCityIdsByUser.get(explicitUser.id)?.has(matched.city_id)) row.error = '文件内重复';
      if (matched && explicitUser) {
        const set = seenCityIdsByUser.get(explicitUser.id) ?? new Set<string>();
        set.add(matched.city_id);
        seenCityIdsByUser.set(explicitUser.id, set);
      }
      return row;
    }));
    event.target.value = '';
  };

  const confirmAdminImport = async () => {
    const rowsByUser = new Map<string, ImportVisitRow[]>();
    for (const row of importPreview.filter((item) => !item.error && item.city_id && item.target_user_id)) {
      const rows = rowsByUser.get(row.target_user_id as string) ?? [];
      rows.push(row);
      rowsByUser.set(row.target_user_id as string, rows);
    }
    const results = await Promise.all(Array.from(rowsByUser.entries()).map(([userId, rows]) => (
      adminImportVisits(userId, rows.map((row) => ({
        city_id: row.city_id as string,
        duration_days: row.duration_days,
        last_stay_date: row.last_stay_date,
        notes: row.notes,
      })))
    )));
    const insertedCount = results.reduce((sum, result) => sum + result.inserted_count, 0);
    setImportPreview([]);
    useStore.getState().showToast({ icon: '✓', message: `已导入 ${insertedCount} 条访问记录` });
    onStatsRefresh();
    void adminExportVisits(users.map((user) => user.id)).then((data) => setAllVisits(data.visits));
  };

  return (
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
          {!GIFT_MODE && (
            <>
              <button className="btn-outline" onClick={() => void downloadCurrentLedger()}><Icon name="download" /> 导出当前视图</button>
              <button className="btn-outline" onClick={() => setShowImportTools((value) => !value)}><Icon name="upload" /> 导入数据</button>
            </>
          )}
        </div>
      </div>

      {!GIFT_MODE && showImportTools && (
        <div className="card import-tools-card">
          <div className="panel-title">
            <strong>数据导入</strong>
            <span className="muted">{targetUserId ? '导入到指定用户' : '按文件中的用户名分配记录'}</span>
          </div>
          <div className="import-tools-row">
              <select className="input compact-input" value={targetUserId} onChange={(event) => { setTargetUserId(event.target.value); setImportPreview([]); }}>
                <option value="">按文件用户名整体导入</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>{user.username || user.name} · {user.name}</option>
                ))}
              </select>
              <button className="btn-primary" onClick={() => importFileRef.current?.click()}><Icon name="upload" /> 选择文件</button>
              <button className="btn-outline" onClick={() => void downloadAdminTemplate()}><Icon name="download" /> 下载模板</button>
            <input ref={importFileRef} type="file" accept=".xlsx" hidden onChange={onImportFile} />
          </div>
        </div>
      )}

      {!GIFT_MODE && importPreview.length > 0 && (
        <div className="import-preview card">
          <div className="panel-title">
            <strong>导入预览</strong>
            <span className="muted">
              ✅ 有效 {importPreview.filter((row) => !row.error).length} 行 / ⚠️ 跳过 {importPreview.filter((row) => row.error === '城市已存在' || row.error === '文件内重复').length} 行 / ❌ 错误 {importPreview.filter((row) => row.error && row.error !== '城市已存在' && row.error !== '文件内重复').length} 行
            </span>
          </div>
          <ImportPreviewTable rows={importPreview} showUser />
          <div className="actions mt-12">
            <button className="btn-primary" disabled={importPreview.every((row) => row.error)} onClick={() => void confirmAdminImport()}>确认导入</button>
            <button className="btn-outline" onClick={() => setImportPreview([])}>取消</button>
          </div>
        </div>
      )}

      <div className="stack gap-8">
        <Table
          tableStyle={{ tableLayout: 'fixed', width: '100%' }}
          emptyText="暂无访问记录"
          data={pagedVisits}
          rowKey={(visit) => `${visit.user_id}-${visit.id}`}
          scroll="fixed"
          maxHeight={320}
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
  );
}
