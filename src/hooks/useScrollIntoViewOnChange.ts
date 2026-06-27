import { useEffect, type RefObject } from 'react';

/**
 * 当 watch 的值变为"真值"时，把 ref 对应的元素平滑滚动到可见区域。
 *
 * 适用场景：触发点位于一个有独立内部滚动的列表/表格里（比如 Table 组件的
 * scroll="fixed"/"fill" 模式），但触发后展示的结果（表单、面板等）渲染在
 * 列表外部的固定位置——这种组合下，点击深处某一行触发的操作，结果可能落在
 * 当前视野之外，用户会有"点了之后东西跑哪去了"的错位感。
 *
 * 不属于 Table 组件本身的能力：Table 不知道、也管不到外部表单的位置，
 * 这个 hook 由"拥有那个外部表单"的父组件调用，监听驱动表单显隐/内容的状态，
 * 跟 Table 配合使用，但物理上独立、可被任何组件复用。
 *
 * @example
 * const formRef = useRef<HTMLDivElement>(null);
 * useScrollIntoViewOnChange(formRef, editingRecord); // editingRecord 从 null 变为某条记录时自动滚入可见区域
 */
export function useScrollIntoViewOnChange<T>(
  ref: RefObject<HTMLElement | null>,
  watch: T,
  options: ScrollIntoViewOptions = { behavior: 'smooth', block: 'start' },
) {
  useEffect(() => {
    if (watch) ref.current?.scrollIntoView(options);
    // options 通常是字面量、每次渲染都是新引用，故意不放进依赖数组，
    // 只在 watch 真正变化时触发一次滚动
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch]);
}
