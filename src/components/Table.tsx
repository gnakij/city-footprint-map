/**
 * 项目标准表格结构。移动端卡片列表不走这里；行内操作仍由列 render 决定。
 * scroll='fixed'/'fill' 提供内部滚动，配合全局 sticky 表头样式使用。
 */
import type { CSSProperties, ReactNode } from 'react';

export interface TableColumn<T> {
  /** 列唯一 key，用作 React key，不需要对应真实字段名。 */
  key: string;
  header: string;
  headerStyle?: CSSProperties;
  cellClassName?: string;
  render: (row: T, index: number) => ReactNode;
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  rowKey: (row: T, index: number) => string | number;
  /** 空状态文案，colSpan 自动按 columns.length 计算。 */
  emptyText?: string;
  scroll?: 'none' | 'fixed' | 'fill';
  /** 仅 scroll='fixed' 时生效，单位px */
  maxHeight?: number;
  rowClassName?: (row: T, index: number) => string | undefined;
  tableStyle?: CSSProperties;
  /** 外层 .table-wrap 追加 class。 */
  wrapClassName?: string;
}

export default function Table<T>({
  columns,
  data,
  rowKey,
  emptyText = '暂无数据',
  scroll = 'none',
  maxHeight,
  rowClassName,
  tableStyle,
  wrapClassName,
}: TableProps<T>) {
  const wrapClass = ['table-wrap', scroll === 'fill' ? 'table-wrap--fill' : '', wrapClassName ?? '']
    .filter(Boolean)
    .join(' ');
  const wrapStyle: CSSProperties | undefined =
    scroll === 'fixed' && maxHeight ? { maxHeight, overflowY: 'auto' } : undefined;

  return (
    <div className={wrapClass} style={wrapStyle}>
      <table className="data-table" style={tableStyle}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} style={col.headerStyle}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="muted text-center p-32">
                {emptyText}
              </td>
            </tr>
          ) : (
            data.map((row, index) => (
              <tr key={rowKey(row, index)} className={rowClassName?.(row, index)}>
                {columns.map((col) => (
                  <td key={col.key} className={col.cellClassName}>
                    {col.render(row, index)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
