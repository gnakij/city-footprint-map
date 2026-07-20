/**
 * 导入预览表 —— 封装在 Table 组件之上的固定列结构，用于"导入数据"流程
 * 的预览环节。
 *
 * 来源：抽出此组件前，AdminPanel.tsx（数据管理）和 UserProfile.tsx
 * （访问记录）里各自手写了一份几乎一字不差的导入预览表（同样的6列结构、
 * 同样的"重复/错误行高亮"逻辑），现在统一成这一处实现，两个调用方只需
 * 传入各自的 rows 数据。
 *
 * 跟 Table.tsx 一样放在 src/components/ 本地，不放进软链接到共享库的
 * src/components/ui/——同样的原因：重度绑定项目专属CSS class和Icon组件，
 * 不是行为通用、可以脱离单个项目使用的组件。
 *
 * 注意：这里只统一"表格怎么展示"。error 表示不能导入，notice 表示仍可
 * 导入但需要提示用户（例如同城记录会新增一条，而不是被前端误判为失败）。
 */
import Table, { type TableColumn } from './Table';
import Icon from './Icon';
import type { ImportVisitRow } from '../types';

const SKIPPED_WARNINGS = new Set(['文件内重复']);

interface ImportPreviewTableProps {
  rows: ImportVisitRow[];
  showUser?: boolean;
}

export default function ImportPreviewTable({ rows, showUser = false }: ImportPreviewTableProps) {
  const columns: TableColumn<ImportVisitRow>[] = [
    ...(showUser ? [
      { key: 'username', header: '用户名', render: (row) => row.username || '-' },
      { key: 'name', header: '昵称', render: (row) => row.name || '-' },
    ] satisfies TableColumn<ImportVisitRow>[] : []),
    { key: 'province', header: '省份', render: (row) => row.province || '-' },
    { key: 'city', header: '城市', render: (row) => row.city || '-' },
    { key: 'duration', header: '天数', render: (row) => (Number.isFinite(row.duration_days) ? row.duration_days : '-') },
    { key: 'lastStay', header: '最后停留', render: (row) => row.last_stay_date || '-' },
    { key: 'notes', header: '备注', render: (row) => row.notes || '-' },
    {
      key: 'status',
      header: '状态',
      render: (row) => {
        if (row.error && !SKIPPED_WARNINGS.has(row.error)) {
          return <span className="danger-text">{row.error}</span>;
        }
        if (row.error) return row.error;
        if (row.notice) return row.notice;
        return (
          <>
            <Icon name="check" /> 可导入
          </>
        );
      },
    },
  ];

  return (
    <Table
      columns={columns}
      data={rows}
      rowKey={(row, index) => `${row.city}-${index}`}
      scroll="fixed"
      maxHeight={220}
      rowClassName={(row) => {
        if (!row.error) return undefined;
        if (row.notice) return 'is-row-warning';
        return SKIPPED_WARNINGS.has(row.error) ? 'is-row-warning' : 'is-row-error';
      }}
    />
  );
}
