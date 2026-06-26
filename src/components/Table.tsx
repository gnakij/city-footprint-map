/**
 * 标准表格组件 —— 项目唯一的表格结构实现。
 *
 * 规则：项目里任何需要展示表格数据的地方，应该使用这个组件，不要再手写
 * `<table className="data-table"><thead>...`。原因：在抽这个组件之前，
 * 项目里有 5 处表格各自手写结构，其中两处（数据管理/访问记录的"导入预览
 * 表"）几乎一字不差地重复了一遍；空状态的 colSpan 数字也是每处手敲、列数
 * 一变就容易跟着错。统一成列配置驱动（参照 MUI/PrimeReact/TanStack Table
 * 等业内主流方案的思路，但因为项目当前不需要排序/筛选/虚拟滚动，没有引入
 * 任何表格库依赖，只是把"结构"这一层抽出来，渲染逻辑仍完全交给调用方）。
 *
 * 放在 src/components/ 本地，不放进 src/components/ui/（那是软链接到
 * shared-ui-components 共享库的目录）——跟之前 ScrollableTable.tsx 同理：
 * 这个组件直接复用项目的 .data-table/.table-wrap/.muted 等 CSS class，
 * 样式和结构是它存在的全部意义，放进只该有"行为，不含样式"的共享库里
 * 是不合适的（DateInput.tsx 那条"共享组件不该带默认样式"的原则反过来看，
 * 就是重样式的组件不该塞进共享库）。
 *
 * 设计上明确不管的事：
 * - 操作列里具体是按钮组、内联编辑框还是别的，千差万别，不强行收成一个
 *   固定 slot，仍由 columns[].render 自由实现。
 * - 移动端的卡片列表（如 AdminPanel 的 .admin-user-cards）是完全不同的
 *   展示形态，不属于这个组件的范畴。
 *
 * 滚动/表头固定行为通过 scroll 参数显式选择，不是隐式全局生效：
 * - 'none'：不限高，不滚动（如数据管理总账表，配合外部分页器使用）
 * - 'fixed'：固定像素高度+内部滚动（如各处的"导入预览"小表，配合 maxHeight）
 * - 'fill'：占满父级 flex 容器分配的剩余空间（flex:1+min-height:0），用于
 *   父容器本身是 flex 列布局、高度随兄弟元素动态变化的场景（如用户管理表格，
 *   父级 .admin-tab-viewport 的实际可用高度会随数字卡片/按钮区高度变化，
 *   不能用一个孤立的固定像素数字去猜——这是之前踩过的真实坑，sticky 表头
 *   一度因为这个原因失效过，详见 src/index.css 里 .table-wrap--fill 上方
 *   的历史注释）。
 *
 * 表头 sticky 本身由全局 CSS `.data-table th { position: sticky; top: 0 }`
 * 提供，在没有高度限制的滚动容器（scroll='none'）下不会有任何视觉效果，
 * 不需要为此额外加开关。
 */
import type { CSSProperties, ReactNode } from 'react';

export interface TableColumn<T> {
  /** 列的唯一key，用作React key和th/td的key，不需要对应数据里的真实字段名 */
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
  /** 数据为空时显示的提示文案，colSpan自动按columns.length计算，不需要手填数字 */
  emptyText?: string;
  scroll?: 'none' | 'fixed' | 'fill';
  /** 仅 scroll='fixed' 时生效，单位px */
  maxHeight?: number;
  rowClassName?: (row: T, index: number) => string | undefined;
  tableStyle?: CSSProperties;
  /** 外层.table-wrap上追加的class，例如桌面/移动端切换用的desktop-only */
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
