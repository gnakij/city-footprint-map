import { ChangeEvent, useRef } from 'react';
import { useStore } from '../store/useStore';
import { importData } from '../utils/export';

export default function SettingsPanel() {
  const settings = useStore((state) => state.settings);
  const updateSettings = useStore((state) => state.updateSettings);
  const setSettingsOpen = useStore((state) => state.setSettingsOpen);
  const exportBackup = useStore((state) => state.exportBackup);
  const importBackup = useStore((state) => state.importBackup);
  const clearData = useStore((state) => state.clearData);
  const showToast = useStore((state) => state.showToast);
  const fileRef = useRef<HTMLInputElement>(null);

  const download = async () => {
    const blob = new Blob([await exportBackup()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '城市足迹备份.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const parsed = importData(await file.text());
    if (!parsed.success || !parsed.data) {
      showToast({ icon: '!', message: parsed.error ?? '导入失败' });
      return;
    }
    await importBackup(parsed.data);
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal">
        <div className="modal-head">
          <h2>设置</h2>
          <button className="icon-btn" onClick={() => setSettingsOpen(false)}>×</button>
        </div>
        <div className="settings-section" style={{ borderTop: 0, paddingTop: 0, marginTop: 0 }}>
          <label>
            <span className="label-sm">主题</span>
            <select className="input" value={settings.theme} onChange={(event) => void updateSettings({ ...settings, theme: event.target.value as typeof settings.theme })}>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
          </label>
        </div>
        <div className="settings-section">
          <div className="actions">
            <button className="btn-primary" onClick={() => void download()}>导出数据</button>
            <button className="btn-outline" onClick={() => fileRef.current?.click()}>导入数据</button>
            <button className="btn-danger" onClick={() => void clearData()}>清空数据</button>
          </div>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={onFile} />
        </div>
        <div className="settings-section">
          <strong>关于</strong>
          <p style={{ margin: 0, color: 'var(--color-on-surface-variant)', lineHeight: 1.7 }}>
            城市足迹地图用于记录你在中国城市的多次访问、停留天数与备注。数据保存在本机浏览器 IndexedDB 中。
          </p>
        </div>
      </section>
    </div>
  );
}
