import { FormEvent, useMemo, useState } from 'react';
import { useStore } from '../store/useStore';

export default function LoginPage() {
  const users = useStore((state) => state.users);
  const adminSetupRequired = useStore((state) => state.adminSetupRequired);
  const setupAdmin = useStore((state) => state.setupAdmin);
  const loginAdmin = useStore((state) => state.loginAdmin);
  const switchUser = useStore((state) => state.switchUser);
  const createRegularUser = useStore((state) => state.createRegularUser);
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [newUser, setNewUser] = useState('');
  const regularUsers = useMemo(() => users.filter((user) => !user.is_admin), [users]);

  const submitAdmin = (event: FormEvent) => {
    event.preventDefault();
    if (adminSetupRequired) void setupAdmin(username, password);
    else void loginAdmin(username, password);
  };

  const addUser = async () => {
    if (!newUser.trim()) return;
    const user = await createRegularUser(newUser.trim());
    setNewUser('');
    await switchUser(user);
  };

  return (
    <div className="login-page">
      <section className="login-card card">
        <div className="brand-mark">城</div>
        <h1>城市足迹地图</h1>
        <form onSubmit={submitAdmin} className="stack">
          <strong>{adminSetupRequired ? '首次运行：创建管理员' : '管理员登录'}</strong>
          <label>
            <span className="label-sm">用户名</span>
            <input className="input" value={username} onChange={(event) => setUsername(event.target.value)} autoFocus />
          </label>
          <label>
            <span className="label-sm">密码</span>
            <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <button className="btn-primary" type="submit">{adminSetupRequired ? '创建并登录' : '登录'}</button>
        </form>

        {!adminSetupRequired && (
          <div className="login-users">
            <strong>普通用户</strong>
            <div className="user-list">
              {regularUsers.map((user) => (
                <button key={user.id} className="list-button" onClick={() => void switchUser(user)}>
                  <span>{user.name}</span>
                  <small>无密码登录</small>
                </button>
              ))}
              {regularUsers.length === 0 && <p className="muted">暂无普通用户</p>}
            </div>
            <div className="inline-form">
              <input className="input" value={newUser} onChange={(event) => setNewUser(event.target.value)} placeholder="新用户昵称" />
              <button className="btn-outline" onClick={() => void addUser()}>新增</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
