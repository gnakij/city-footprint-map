import type { MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from 'react';
import type { User } from '../types';
import Icon from './Icon';
import Table from './Table';

type PressEvent = ReactTouchEvent | ReactMouseEvent;

interface AdminUsersPanelProps {
  users: User[];
  names: Record<string, string>;
  editingNameId: string | null;
  selectionMode: boolean;
  selectedIds: Set<string>;
  onNameChange: (userId: string, name: string) => void;
  onNameEdit: (userId: string) => void;
  onNameSave: (userId: string) => void;
  onNameCancel: (userId: string, originalName: string) => void;
  onResetPassword: (userId: string, name: string) => void;
  onRemoveUser: (userId: string) => void;
  onCardClick: (user: User) => void;
  onLongPressStart: (event: PressEvent, user: User) => void;
  onLongPressMove: (event: ReactTouchEvent) => void;
  onLongPressEnd: () => void;
}

export default function AdminUsersPanel({
  users,
  names,
  editingNameId,
  selectionMode,
  selectedIds,
  onNameChange,
  onNameEdit,
  onNameSave,
  onNameCancel,
  onResetPassword,
  onRemoveUser,
  onCardClick,
  onLongPressStart,
  onLongPressMove,
  onLongPressEnd,
}: AdminUsersPanelProps) {
  return (
    <>
      <Table
        wrapClassName="desktop-only"
        scroll="fixed"
        maxHeight={320}
        rowKey={(user) => user.id}
        data={users}
        columns={[
          {
            key: 'name',
            header: '用户',
            render: (user) => {
              const isEditing = editingNameId === user.id;
              return isEditing ? (
                <input
                  className="input"
                  value={names[user.id] ?? user.name}
                  onChange={(event) => onNameChange(user.id, event.target.value)}
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
                      <button className="btn-primary compact" onClick={() => onNameSave(user.id)}>保存</button>
                      <button className="btn-outline compact" onClick={() => onNameCancel(user.id, user.name)}>取消</button>
                    </>
                  ) : (
                    <>
                      <button className="btn-tertiary" onClick={() => onNameEdit(user.id)}>修改昵称</button>
                      <button className="btn-tertiary" onClick={() => onResetPassword(user.id, user.name)}>重置密码</button>
                      {!user.is_admin && <button className="btn-tertiary-danger" onClick={() => onRemoveUser(user.id)}>删除</button>}
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
          return (
            <div
              key={user.id}
              className={`admin-user-card${isEditing || selectionMode ? '' : ' is-interactive'}${selectionMode && isChecked ? ' is-checked' : ''}`}
              onTouchStart={user.is_admin || selectionMode ? undefined : (event) => onLongPressStart(event, user)}
              onTouchEnd={user.is_admin || selectionMode ? undefined : onLongPressEnd}
              onTouchMove={user.is_admin || selectionMode ? undefined : onLongPressMove}
              onMouseDown={user.is_admin || selectionMode ? undefined : (event) => onLongPressStart(event, user)}
              onMouseUp={user.is_admin || selectionMode ? undefined : onLongPressEnd}
              onMouseLeave={user.is_admin || selectionMode ? undefined : onLongPressEnd}
              onContextMenu={(event) => event.preventDefault()}
              onClick={() => onCardClick(user)}
            >
              {selectionMode ? (
                <div className="admin-user-card-select-row">
                  <span className={`admin-user-card-checkbox${isChecked ? ' is-checked' : ''}${user.is_admin ? ' is-disabled' : ''}`}>
                    {isChecked && <Icon name="check" />}
                  </span>
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
                      onChange={(event) => onNameChange(user.id, event.target.value)}
                      placeholder="用户名称"
                      autoFocus
                    />
                  </div>
                  <div className="card-btn-row">
                    <button className="btn-primary compact" onClick={() => onNameSave(user.id)}>保存</button>
                    <button className="btn-outline compact" onClick={() => onNameCancel(user.id, user.name)}>取消</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="admin-user-card-head">
                    <div className="admin-user-card-name-row">
                      <span className="admin-user-card-name">{names[user.id] ?? user.name}</span>
                      <button className="btn-tertiary" onClick={() => onNameEdit(user.id)}>修改</button>
                    </div>
                    <span className={`admin-user-card-tag${user.is_admin ? ' is-admin' : ''}`}>{user.is_admin ? '管理员' : '普通用户'}</span>
                  </div>
                  <div className="admin-user-card-meta">
                    {user.username && `@${user.username} · `}创建于 {user.created_at.slice(0, 10)}
                  </div>
                  <div className="admin-user-card-footer">
                    <button className="btn-tertiary" onClick={() => onResetPassword(user.id, user.name)}>重置密码</button>
                    {!user.is_admin && <span className="admin-user-card-hint">长按可批量删除</span>}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
