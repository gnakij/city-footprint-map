import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import Icon from './Icon';

// 2026-06-21: 五主题全量重制，删除Linear，新增琥珀/绿松/冰河，晨雾(原Stripe)
// 重新调整色相。命名风格统一为"中文意象名 · 色调说明"，与樱花保持一致。
const THEME_OPTIONS: Array<{ value: 'rose' | 'stripe' | 'amber' | 'turquoise' | 'azure'; label: string }> = [
  { value: 'rose', label: '樱花 · 粉调' },
  { value: 'stripe', label: '晨雾 · 紫调' },
  { value: 'amber', label: '琥珀 · 金调' },
  { value: 'turquoise', label: '绿松 · 青调' },
  { value: 'azure', label: '冰河 · 蓝调' },
];

export default function TopBar() {
  const currentUser = useStore((state) => state.currentUser);
  const logout = useStore((state) => state.logout);
  const setProfileOpen = useStore((state) => state.setProfileOpen);
  const setAdminOpen = useStore((state) => state.setAdminOpen);
  const settings = useStore((state) => state.settings);
  const updateSettings = useStore((state) => state.updateSettings);
  const [menuOpen, setMenuOpen] = useState(false);
  // 2026-06-20: "主题选择"原是个人资料弹窗里"系统设置"tab下唯一的一项内容
  // （只有一个下拉框），用户要求改名"主题选择"并移到账号下拉菜单的"个人资料"
  // 和"系统管理"之间。考虑到用户提到"未来还想多做几个主题"，不用独立弹窗
  // （太重，当前内容量配不上一个弹窗），改为原地展开的二级列表：点击"主题
  // 选择"这一行不关闭账号下拉菜单本身，而是在原地展开/收起主题选项列表，
  // 这样以后增加主题只需要在THEME_OPTIONS里加一项，不需要改变交互形式。
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
        setThemeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [menuOpen]);

  return (
    <header className="topbar glass">
      <div className="logo-group">
        <span className="logo-mark" aria-hidden="true">🗺️</span>
        <div className="logo-text-group">
          <div className="logo">城市足迹</div>
          <p className="logo-slogan">记录你走过的每一座城</p>
        </div>
      </div>
      <div className="current-user account-menu" ref={menuRef}>
        <button
          className="account-trigger"
          onClick={() => setMenuOpen((value) => !value)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          {currentUser?.name || currentUser?.username}
          <svg className={`account-trigger-arrow${menuOpen ? ' is-open' : ''}`} width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M6 8L2 4H10L6 8Z" fill="currentColor"/>
          </svg>
        </button>
        {menuOpen && (
          <div className="account-dropdown card" role="menu">
            <button
              className="account-dropdown-item"
              role="menuitem"
              onClick={() => { setMenuOpen(false); setThemeMenuOpen(false); setProfileOpen(true); }}
            >
              <Icon name="user" />
              个人资料
            </button>
            <button
              className="account-dropdown-item"
              role="menuitem"
              aria-haspopup="true"
              aria-expanded={themeMenuOpen}
              onClick={() => setThemeMenuOpen((value) => !value)}
            >
              <Icon name="palette" />
              主题选择
              <svg className={`account-trigger-arrow${themeMenuOpen ? ' is-open' : ''}`} width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{ marginLeft: 'auto' }}>
                <path d="M6 8L2 4H10L6 8Z" fill="currentColor"/>
              </svg>
            </button>
            {themeMenuOpen && (
              <div className="account-dropdown-submenu" role="menu">
                {THEME_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    className="account-dropdown-item account-dropdown-subitem"
                    role="menuitem"
                    onClick={() => void updateSettings({ ...settings, theme: opt.value })}
                  >
                    {settings.theme === opt.value ? <Icon name="check" /> : <span className="account-subitem-spacer" aria-hidden="true" />}
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
            {currentUser?.is_admin && (
              // 2026-06-20: "系统管理"从个人资料弹窗的tab里移出来，改成这里的
              // 独立入口，点击后打开AdminPanel的独立弹窗（非embedded模式，
              // App.tsx里根据adminOpen状态挂载）。原因：管理面板内容结构、
              // 内容量与个人资料弹窗里其他tab差异很大，共享同一个弹窗容器时
              // 切换会有高度跳变问题，拆成独立弹窗从根上避免这个问题。
              <button
                className="account-dropdown-item"
                role="menuitem"
                onClick={() => { setMenuOpen(false); setThemeMenuOpen(false); setAdminOpen(true); }}
              >
                <Icon name="settings" />
                系统管理
              </button>
            )}
            <button
              className="account-dropdown-item is-danger"
              role="menuitem"
              onClick={() => { setMenuOpen(false); setThemeMenuOpen(false); logout(); }}
            >
              <Icon name="logout" />
              退出登录
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
