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
 * 注意：这里只统一"表格怎么展示"，不改变两处各自的导入校验逻辑——
 * AdminPanel 的批量导入会产生"文件内重复"这个错误值，UserProfile 单用户
 * 导入不会产生这个值，两边的 row.error 来源完全独立，这个组件只是按
 * error 的值决定展示成"警告"还是"错误"样式，对从未出现过的错误值类型
 * 天然不会有任何影响。
 */
import Table, { type TableColumn } from './Table';
import Icon from './Icon';
import type { ImportVisitRow } from '../types';

const DUPLICATE_ERRORS = new Set(['城市已存在', '文件内重复']);

interface ImportPreviewTableProps {
  rows: ImportVisitRow[];
}

export default function ImportPreviewTable({ rows }: ImportPreviewTableProps) {
  const columns: TableColumn<ImportVisitRow>[] = [
    { key: 'province', header: '省份', render: (row) => row.province || '-' },
    { key: 'city', header: '城市', render: (row) => row.city || '-' },
    { key: 'duration', header: '天数', render: (row) => (Number.isFinite(row.duration_days) ? row.duration_days : '-') },
    { key: 'lastStay', header: '最后停留', render: (row) => row.last_stay_date || '-' },
    { key: 'notes', header: '备注', render: (row) => row.notes || '-' },
    {
      key: 'status',
      header: '状态',
      render: (row) => {
        if (row.error && !DUPLICATE_ERRORS.has(row.error)) {
          return <span className="danger-text">{row.error}</span>;
        }
        if (row.error) return row.error;
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
        return DUPLICATE_ERRORS.has(row.error) ? 'is-row-warning' : 'is-row-error';
      }}
    />
  );
}
