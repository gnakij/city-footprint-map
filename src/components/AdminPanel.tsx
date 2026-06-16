import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';

export default function AdminPanel() {
  const users = useStore((state) => state.users);
  const currentUser = useStore((state) => state.currentUser);
  const setAdminOpen = useStore((state) => state.setAdminOpen);
  const deleteUserAndData = useStore((state) => state.deleteUserAndData);
  const resetUserPassword = useStore((state) => state.resetUserPassword);
  const createRegularUser = useStore((state) => state.createRegularUser);
  const getSystemStats = useStore((state) => state.getSystemStats);
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState('');
  const [stats, setStats] = useState({ totalUsers: 0, totalVisits: 0, adminUsers: 0 });

  useEffect(() => {
    void getSystemStats().then(setStats);
  }, [getSystemStats, users]);

  if (!currentUser?.is_admin) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal modal-wide">
        <div className="modal-head">
          <h2>用户管理</h2>
          <button className="icon-btn" onClick={() => setAdminOpen(false)}>×</button>
        </div>
        <div className="admin-stats">
          <div className="stat"><span className="label-sm">总用户</span><strong>{stats.totalUsers}</strong></div>
          <div className="stat"><span className="label-sm">管理员</span><strong>{stats.adminUsers}</strong></div>
          <div className="stat"><span className="label-sm">总访问记录</span><strong>{stats.totalVisits}</strong></div>
        </div>
        <div className="inline-form">
          <input className="input" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="新增普通用户昵称" />
          <button className="btn-primary" disabled={!newName.trim()} onClick={async () => { await createRegularUser(newName.trim()); setNewName(''); }}>新增用户</button>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>用户</th><th>类型</th><th>创建时间</th><th>重置密码</th><th>操作</th></tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}{user.username ? ` (${user.username})` : ''}</td>
                  <td>{user.is_admin ? '管理员' : '普通用户'}</td>
                  <td>{user.created_at.slice(0, 10)}</td>
                  <td>
                    <div className="inline-form compact">
                      <input className="input" type="password" value={passwords[user.id] ?? ''} onChange={(event) => setPasswords({ ...passwords, [user.id]: event.target.value })} placeholder="新密码" />
                      <button className="btn-outline" disabled={!passwords[user.id]} onClick={() => void resetUserPassword(user.id, passwords[user.id])}>保存</button>
                    </div>
                  </td>
                  <td><button className="btn-danger" disabled={user.id === currentUser.id} onClick={() => void deleteUserAndData(user.id)}>删除</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
