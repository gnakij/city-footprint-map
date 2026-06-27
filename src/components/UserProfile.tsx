import { ChangeEvent, useMemo, useRef, useState } from 'react';
import { useScrollIntoViewOnChange } from '../hooks/useScrollIntoViewOnChange';
import * as XLSX from 'xlsx';
import DateInput from './ui/DateInput';
import FuzzySelect from './ui/FuzzySelect';
import Table from './Table';
import ImportPreviewTable from './ImportPreviewTable';
import DrillDownStats from './DrillDownStats';
import Icon from './Icon';

// 仅管理员可见，按需加载，避免普通用户打开个人资料时也下载这部分代码
import { CITIES } from '../data/cities';
import { useStore } from '../store/useStore';
import { updateMe } from '../store/api';
import type { ImportVisitRow, VisitRecord } from '../types';
import { visitDays } from '../utils/date';

type ProfileTab = 'profile' | 'visits';

const todayStr = () => new Date().toISOString().slice(0, 10);

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

function writeWorkbook(filename: string, rows: Array<Record<string, string | number | undefined>>) {
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: ['省份', '城市', '停留天数', '最后停留日期', '备注'] });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '访问记录');
  XLSX.writeFile(workbook, filename);
}

export default function UserProfile() {
  const currentUser = useStore((s) => s.currentUser);
  const visits = useStore((s) => s.visits);
  const saveVisit = useStore((s) => s.saveVisit);
  const deleteVisit = useStore((s) => s.deleteVisit);
  const bulkCreateVisits = useStore((s) => s.bulkCreateVisits);
  const clearData = useStore((s) => s.clearData);
  const profileTab = useStore((s) => s.profileTab);
  const setProfileOpen = useStore((s) => s.setProfileOpen);
  const showToast = useStore((s) => s.showToast);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<ProfileTab>(profileTab);
  const [name, setName] = useState(currentUser?.name ?? '');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [citySearchText, setCitySearchText] = useState('');
  const [citySearchLabel, setCitySearchLabel] = useState('');
  const [cityId, setCityId] = useState('');
  const [duration, setDuration] = useState('');
  const [lastStay, setLastStay] = useState(todayStr());
  const [notes, setNotes] = useState('');
  const [editingVisit, setEditingVisit] = useState<VisitRecord | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [preview, setPreview] = useState<ImportVisitRow[]>([]);

  // 城市映射：值/标签分离，供 FuzzySelect 使用
  const CITY_LABELS = useMemo(() => Object.fromEntries(CITIES.map((c) => [c.city_id, `${c.province} · ${c.city_name}`])), []);
  const CITY_PINYINS = useMemo(() => Object.fromEntries(CITIES.map((c) => [c.city_id, c.pinyin])), []);
  const CITY_IDS = useMemo(() => CITIES.map((c) => c.city_id), []);

  const selectedCityName = useMemo(() => {
    if (!cityId) return '';
    const c = CITIES.find((item) => item.city_id === cityId);
    return c ? `${c.province} · ${c.city_name}` : '';
  }, [cityId]);

  const rows = useMemo(() => visits.map((v) => ({
    visit: v,
    city: CITIES.find((c) => c.city_id === v.city_id),
    days: visitDays(v),
  })).sort((a, b) => b.visit.last_stay_date.localeCompare(a.visit.last_stay_date)), [visits]);

  const pickCity = (id: string) => {
    setCityId(id);
    const label = CITY_LABELS[id] ?? id;
    setCitySearchText('');
    setCitySearchLabel(label);
  };

  useScrollIntoViewOnChange(formRef, editingVisit);

  const startEdit = (visit: VisitRecord) => {
    setEditingVisit(visit);
    setShowForm(true);
    setCityId(visit.city_id);
    setDuration(String(visit.duration_days));
    setLastStay(visit.last_stay_date);
    setNotes(visit.notes ?? '');
    const c = CITIES.find((item) => item.city_id === visit.city_id);
    const label = c ? `${c.province} · ${c.city_name}` : '';
    setCitySearchLabel(label);
    setCitySearchText(label);
  };

  const resetForm = () => {
    setEditingVisit(null);
    setShowForm(false);
    setCityId('');
    setCitySearchText('');
    setCitySearchLabel('');
    setDuration('');
    setLastStay(todayStr());
    setNotes('');
  };

  const submitVisit = async () => {
    if (!cityId) { showToast({ icon: '!', message: '请选择城市' }); return; }
    const days = Number(duration);
    if (!days || days < 1) { showToast({ icon: '!', message: '请填写停留天数（至少1天）' }); return; }
    if (!lastStay) { showToast({ icon: '!', message: '请选择最后停留日期' }); return; }
    const city = CITIES.find((c) => c.city_id === cityId);
    if (!city) return;
    await saveVisit(city, { id: editingVisit?.id, duration_days: Math.floor(days), last_stay_date: lastStay, notes });
    // saveVisit returns after success OR failure (toast shown either way).
    // Check if visits actually changed — if so, it succeeded.
    const nowVisits = useStore.getState().visits;
    const oldLen = visits.length;
    if (nowVisits.length > oldLen || editingVisit) {
      resetForm();
    }
  };

  const updateName = () => {
    if (!name.trim()) { showToast({ icon: '!', message: '名称不能为空' }); return; }
    const store = useStore.getState();
    if (store.currentUser) store.updateUserName(name.trim());
    showToast({ icon: '✓', message: '名称已更新' });
  };

  const changePassword = async () => {
    if (newPw.length < 6) { showToast({ icon: '!', message: '新密码至少6位' }); return; }
    if (newPw !== confirmPw) { showToast({ icon: '!', message: '两次密码不一致' }); return; }
    const store = useStore.getState();
    if (!store.currentUser) return;
    try {
      await updateMe({ password: newPw });
      showToast({ icon: '✓', message: '密码已更新' });
      setNewPw('');
      setConfirmPw('');
    } catch (err: any) {
      showToast({ icon: '!', message: err?.message || '密码更新失败' });
    }
  };

  const download = () => {
    writeWorkbook('城市足迹备份.xlsx', rows.map(({ visit, city, days }) => ({
      省份: city?.province ?? '',
      城市: city?.city_name ?? visit.city_id,
      停留天数: days,
      最后停留日期: visit.last_stay_date,
      备注: visit.notes ?? '',
    })));
  };

  const downloadTemplate = () => {
    writeWorkbook('城市足迹导入模板.xlsx', [{
      省份: '广东',
      城市: '广州',
      停留天数: 365,
      最后停留日期: '2024-01-01',
      备注: '示例',
    }]);
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    const existingCityIds = new Set(visits.map((visit) => visit.city_id));
    setPreview(records.map((record) => {
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
      return row;
    }));
    event.target.value = '';
  };

  const confirmImport = async () => {
    await bulkCreateVisits(preview.filter((row) => !row.error && row.city_id).map((row) => ({
      city_id: row.city_id as string,
      duration_days: row.duration_days,
      last_stay_date: row.last_stay_date,
      notes: row.notes,
    })));
    setPreview([]);
  };

  const confirmClear = () => {
    if (window.confirm('确定清空所有数据？此操作不可恢复。')) void clearData();
  };

  if (!currentUser) return null;

  // 2026-06-20: "系统管理"和"系统设置"（改名"主题选择"）都已从这里移出，
  // 改为TopBar账号下拉菜单里的独立入口/二级展开列表。原因：①管理面板内容
  // 结构、内容量与"个人信息/访问记录"差异巨大，共享同一个.modal-xl容器时
  // 切换会有高度跳变问题；②主题选择本身只有一个下拉框，内容量配不上独立的
  // tab/弹窗，且用户提到未来还想加更多主题，改成下拉菜单内原地展开的二级
  // 列表更轻量，也更适合未来扩展。
  const tabs: Array<{ id: ProfileTab; label: string }> = [
    { id: 'profile', label: '个人信息' },
    { id: 'visits', label: '访问记录' },
  ];

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal modal-xl">
        <div className="modal-head">
          <h2>{currentUser.name}</h2>
          <button className="icon-btn" onClick={() => setProfileOpen(false)}><Icon name="close" /></button>
        </div>

        <div className="mode-pill profile-tabs mb-20">
          {tabs.map((item) => (
            <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => { setTab(item.id); setShowStats(false); }}>{item.label}</button>
          ))}
        </div>

        {tab === 'profile' && (
          <div className="stack">
            <div className="form-row">
              <span className="label-sm">用户名（登录用）</span>
              {/* 2026-06-27: background内联style已删除——.card .input现在全局
                 统一用--color-surface-container-low，跟这里原来手动指定的值
                 完全相同，不需要再单独覆盖一次，只保留cursor。 */}
              <input className="input" value={currentUser.username} readOnly style={{ cursor: 'not-allowed' }} />
            </div>

            {/* 2026-06-27: 重构为"区块自包含"模式——参照业内成熟做法
               (section-level editing：每个字段是独立区块，触发按钮跟字段
               本身绑定在一起，编辑态原地替换触发按钮，而不是另起一行/
               另一张卡片)，对齐AdminPanel表格行内编辑(.row-actions里
               [修改昵称/重置密码]<->[保存/取消]原地切换)的既有机制。
               之前的问题："修改昵称"和"修改密码"被塞进一个跟字段本身
               脱节的公共操作行，导致点击后编辑态分别出现在按钮上方(昵称)
               和下方(密码)，方向不一致且跟触发点本身脱节。 */}
            <div className="form-row">
              <span className="label-sm">昵称</span>
              {editingName ? (
                <>
                  <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="输入新昵称" />
                  <div className="actions">
                    <button className="btn-primary" onClick={() => { updateName(); setEditingName(false); }}>保存</button>
                    <button className="btn-outline" onClick={() => { setName(currentUser.name); setEditingName(false); }}>取消</button>
                  </div>
                </>
              ) : (
                <>
                  <input className="input" value={currentUser.name} readOnly style={{ cursor: 'default' }} />
                  <div className="actions">
                    <button className="btn-outline" onClick={() => { setName(currentUser.name); setEditingName(true); }}>修改昵称</button>
                  </div>
                </>
              )}
            </div>

            <div className="form-row">
              <span className="label-sm">密码</span>
              {editingPassword ? (
                <div className="card p-16">
                  <div className="form-row">
                    <span className="label-sm">新密码</span>
                    <input className="input" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="至少6位" />
                  </div>
                  <div className="form-row">
                    <span className="label-sm">确认密码</span>
                    <input className="input" type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="再次输入新密码" />
                  </div>
                  <div className="actions">
                    <button className="btn-primary" onClick={async () => { await changePassword(); setEditingPassword(false); }}>更新密码</button>
                    <button className="btn-outline" onClick={() => { setNewPw(''); setConfirmPw(''); setEditingPassword(false); }}>取消</button>
                  </div>
                </div>
              ) : (
                <>
                  {/* 密码没有"当前值"可展示(出于安全不能明文显示)，用掩码占位
                     仅作视觉对齐，不是真实密码长度的提示 */}
                  <input className="input" value="••••••••" readOnly style={{ cursor: 'default' }} />
                  <div className="actions">
                    <button className="btn-outline" onClick={() => setEditingPassword(true)}>修改密码</button>
                  </div>
                </>
              )}
            </div>

            <p className="muted">
              {currentUser.is_admin ? <><Icon name="key" /> 管理员</> : <><Icon name="user" /> 普通用户</>} · 于 {new Date(currentUser.created_at).toLocaleDateString('zh-CN')} 创建
            </p>
          </div>
        )}

        {tab === 'visits' && !showStats && (
          /* 2026-06-27: 调整顺序——操作按钮(及由按钮触发的导入预览/添加表单
             面板)放到表格上方，表格本身放最下面，跟AdminPanel数据管理tab的
             "筛选/操作按钮→条件面板→表格→分页器"结构保持一致。原来是表格在
             最上面、按钮在下面，跟项目里已经确立的这套约定不一致。
             外层改用.stack(gap机制)而不是手动给每个子元素补mt-12——
             这几个mt-12原来的数值正好都等于.stack的gap(--space-3=12px)，
             改用gap后视觉效果不变，但从"每个孩子各自记得加margin"变成
             "父容器统一管理子元素间距"，跟"个人信息"tab(同一个组件，
             一直用.stack)保持一致，不是两套并行的间距机制。 */
          <div className="stack">
            {/* 操作按钮行 */}
            <div className="actions">
              <button className="btn-primary" onClick={() => setShowForm(true)}><Icon name="plus" /> 添加访问</button>
              <button className="btn-outline" onClick={() => fileRef.current?.click()}><Icon name="download" /> 导入数据</button>
              <button className="btn-outline" onClick={download}><Icon name="upload" /> 导出数据</button>
              <button className="btn-outline" onClick={downloadTemplate}><Icon name="download" /> 下载模板</button>
              <button className="btn-danger" onClick={confirmClear}>清空所有数据</button>
              <button className="btn-outline" onClick={() => setShowStats(true)} style={{ marginLeft: 'auto' }}><Icon name="chart" /> 统计</button>
            </div>

            {preview.length > 0 && (
              <div className="import-preview card">
                <div className="panel-title">
                  <strong>导入预览</strong>
                  <span className="muted">
                    <Icon name="check" /> 有效 {preview.filter((row) => !row.error).length} 行 / <Icon name="warning" /> 跳过 {preview.filter((row) => row.error === '城市已存在').length} 行 / <Icon name="error" /> 错误 {preview.filter((row) => row.error && row.error !== '城市已存在').length} 行
                  </span>
                </div>
                {/* 2026-06-27: 改用通用ImportPreviewTable组件，跟AdminPanel.tsx
                   的数据管理导入预览共用同一份实现。 */}
                <ImportPreviewTable rows={preview} />
                <div className="actions mt-12">
                  <button className="btn-primary" disabled={preview.every((row) => row.error)} onClick={() => void confirmImport()}>确认导入</button>
                  <button className="btn-outline" onClick={() => setPreview([])}>取消</button>
                </div>
              </div>
            )}

            {/* 添加/编辑表单 */}
            {showForm && (
              <div className="card p-16" ref={formRef}>
                <div className="form-row">
                  <span className="label-sm">搜索并选择城市</span>
                  <FuzzySelect
                    className="input"
                    options={CITY_IDS}
                    optionLabels={CITY_LABELS}
                    searchKeys={CITY_PINYINS}
                    value={citySearchText}
                    selectedLabel={citySearchLabel}
                    onChange={(text) => {
                      setCitySearchText(text);
                      setCitySearchLabel('');
                      if (cityId) setCityId('');
                    }}
                    onSelect={(id) => pickCity(id)}
                    placeholder="搜索选择城市"
                    maxResults={12}
                  />
                  {selectedCityName && cityId && (
                    <p className="muted mt-6">已选：{selectedCityName}</p>
                  )}
                </div>

                <div className="form-grid-2 mt-12">
                  <div className="form-row">
                    <span className="label-sm">停留天数</span>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                      placeholder="例如 365，无需精确"
                    />
                  </div>
                  <div className="form-row">
                    <span className="label-sm">最后停留日期</span>
                    <DateInput value={lastStay} onChange={setLastStay} />
                  </div>
                  <div className="form-row">
                    <span className="label-sm">备注</span>
                    <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="可选，例如：大学期间 / 老家" />
                  </div>
                </div>

                <div className="actions mt-8">
                  <button className="btn-primary" onClick={submitVisit}>{editingVisit ? '保存修改' : '添加记录'}</button>
                  <button className="btn-outline" onClick={resetForm}>取消</button>
                </div>
              </div>
            )}

            {/* 访问记录列表 */}
            {/* 2026-06-27: 改用通用Table组件替代手写table结构。新增scroll="fixed"
               +maxHeight：之前这张表没有任何独立的滚动限制，数据多时只能靠整个
               .modal-xl弹窗本身在90vh处触发滚动(.modal的max-height+overflow:auto)，
               表格区域永远不会单独滚动、表头也就没有sticky的意义。这里给表格本身
               一个独立的固定高度滚动区域，配合.data-table th的全局sticky规则，
               让表头在列表内部滚动时保持可见。操作列按钮从.btn-outline/.btn-danger
               改为.btn-tertiary/.btn-tertiary-danger，跟AdminPanel用户管理表格已经
               统一过的"表格行内并列操作用低强调样式"规范保持一致——这两个表格的
               操作列定位完全相同(行内常规操作+危险操作并列)，没有理由用不同样式。 */}
            {/* 2026-06-27: 外层改用.stack后，表格跟上方元素的间距已经由父容器
               的gap统一处理，不再需要单独给表格补margin。 */}
            <Table
              emptyText="暂无访问记录"
              data={rows}
              rowKey={(row) => row.visit.id}
              scroll="fixed"
              maxHeight={320}
              columns={[
                { key: 'province', header: '省份', render: (row) => row.city?.province ?? '-' },
                { key: 'city', header: '城市', render: (row) => row.city?.city_name ?? row.visit.city_id },
                { key: 'days', header: '天数', render: (row) => <><strong>{row.days}</strong> 天</> },
                { key: 'lastStay', header: '最后停留', render: (row) => row.visit.last_stay_date },
                { key: 'notes', header: '备注', render: (row) => row.visit.notes || '-' },
                {
                  key: 'actions',
                  header: '操作',
                  // 2026-06-27: 改用row-actions而不是.mini-actions——
                  // .mini-actions是这张表独有的旧写法，专门给.btn-outline/
                  // .btn-danger做了缩小处理，跟AdminPanel用户管理表统一过的
                  // 做法不是同一套(那边是默认尺寸的.btn-tertiary+收紧单元格
                  // padding，不缩小按钮本身)。这张表的操作列定位跟那边完全
                  // 一样，改用同一个.row-actions class，直接复用已有的全局
                  // .data-table .row-actions/td:has(.row-actions)规则。
                  cellClassName: 'row-actions',
                  render: (row) => (
                    <>
                      <button className="btn-tertiary" onClick={() => startEdit(row.visit)}>编辑</button>
                      <button className="btn-tertiary-danger" onClick={() => void deleteVisit(row.visit.id)}>删除</button>
                    </>
                  ),
                },
              ]}
            />

            <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={onFile} />
          </div>
        )}

        {tab === 'visits' && showStats && (
          <>
            <button className="back-btn mb-12" onClick={() => setShowStats(false)}>← 返回访问列表</button>
            <DrillDownStats embedded />
          </>
        )}

      </section>
    </div>
  );
}
