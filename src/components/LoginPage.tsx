import { FormEvent, useState } from 'react';
import { useStore } from '../store/useStore';
import { createUser } from '../api';

type LoginMode = 'user' | 'admin' | 'register';

export default function LoginPage() {
  const adminSetupRequired = useStore((state) => state.adminSetupRequired);
  const setupAdmin = useStore((state) => state.setupAdmin);
  const loginAdmin = useStore((state) => state.loginAdmin);
  const loginUser = useStore((state) => state.loginUser);

  const [mode, setMode] = useState<LoginMode>(adminSetupRequired ? 'admin' : 'user');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);

  const resetFields = () => {
    setUsername('');
    setPassword('');
    setConfirmPassword('');
    setNickname('');
  };

  const switchMode = (newMode: LoginMode) => {
    setMode(newMode);
    resetFields();
    setLoading(false);
  };

  const submitAdmin = async (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim() || password.length < 6) { useStore.getState().showToast({ icon: '!', message: '密码至少6位' }); return; }
    setLoading(true);
    if (adminSetupRequired) await setupAdmin(username, password);
    else await loginAdmin(username, password);
    setLoading(false);
  };

  const submitUser = async (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password) return;
    setLoading(true);
    await loginUser(username, password);
    setLoading(false);
  };

  const submitRegister = async (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !nickname.trim() || password.length < 6) {
      useStore.getState().showToast({ icon: '!', message: '请填写所有字段，密码至少6位' });
      return;
    }
    if (password !== confirmPassword) {
      useStore.getState().showToast({ icon: '!', message: '两次密码不一致' });
      return;
    }
    setLoading(true);
    try {
      await createUser(nickname.trim(), { username: username.trim(), password, is_admin: false });
      await loginUser(username.trim(), password);
      setLoading(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '注册失败';
      useStore.getState().showToast({ icon: '!', message: msg });
      setLoading(false);
    }
  };

  // First-run: admin setup only — no tabs, no user login
  if (adminSetupRequired) {
    return (
      <div className="login-page">
        <div className="login-bg" />
        <section className="login-panel glass">
          <div className="login-header">
            <div className="brand-mark">🗺️</div>
            <h1>城市足迹</h1>
            <p>记录你走过的每一座城</p>
          </div>
          <form onSubmit={submitAdmin} className="login-form">
            <span className="label-sm">设置管理员</span>
            <div className="form-row">
              <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="管理员用户名" autoFocus />
            </div>
            <div className="form-row">
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少6位" />
            </div>
            <button className="btn-primary login-btn" type="submit" disabled={loading} onClick={(e) => { e.preventDefault(); submitAdmin(e); }}>
              {loading ? '创建中...' : '创建管理员并进入'}
            </button>
          </form>
        </section>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-bg" />
      <section className="login-panel glass">
        <div className="login-header">
          <div className="brand-mark">🗺️</div>
          <h1>城市足迹</h1>
          <p>记录你走过的每一座城</p>
        </div>

        {/* Tab switcher — user is default */}
        <div className="login-tabs">
          <button
            type="button"
            className={`login-tab${mode === 'user' ? ' active' : ''}`}
            onClick={() => switchMode('user')}
          >
            用户登录
          </button>
          <button
            type="button"
            className={`login-tab${mode === 'admin' ? ' active' : ''}`}
            onClick={() => switchMode('admin')}
          >
            管理员登录
          </button>
        </div>

        {/* ===== USER LOGIN ===== */}
        {mode === 'user' && (
          <form onSubmit={submitUser} className="login-form">
            <div className="form-row">
              <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="用户名" autoFocus />
            </div>
            <div className="form-row">
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="密码" />
            </div>
            <button className="btn-primary login-btn" type="submit" disabled={loading} onClick={(e) => { e.preventDefault(); submitUser(e); }}>
              {loading ? '登录中...' : '登录'}
            </button>
            <div className="login-link-row">
              <button type="button" className="login-link" onClick={() => switchMode('register')}>
                注册新用户
              </button>
            </div>
          </form>
        )}

        {/* ===== REGISTER ===== */}
        {mode === 'register' && (
          <form onSubmit={submitRegister} className="login-form">
            <div className="form-row">
              <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="用户名" autoFocus />
            </div>
            <div className="form-row">
              <input className="input" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="昵称" />
            </div>
            <div className="form-row">
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="密码（至少6位）" />
            </div>
            <div className="form-row">
              <input className="input" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="确认密码" />
            </div>
            <button className="btn-primary login-btn" type="submit" disabled={loading} onClick={(e) => { e.preventDefault(); submitRegister(e); }}>
              {loading ? '注册中...' : '注册'}
            </button>
            <div className="login-link-row">
              <button type="button" className="login-link secondary" onClick={() => switchMode('user')}>
                返回登录
              </button>
            </div>
          </form>
        )}

        {/* ===== ADMIN LOGIN ===== */}
        {mode === 'admin' && (
          <form onSubmit={submitAdmin} className="login-form">
            <div className="form-row">
              <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="管理员用户名" autoFocus />
            </div>
            <div className="form-row">
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="密码" />
            </div>
            <button className="btn-primary login-btn" type="submit" disabled={loading} onClick={(e) => { e.preventDefault(); submitAdmin(e); }}>
              {loading ? '登录中...' : '登录'}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
