<script lang="ts">
/**
 * SkeletonGroup 批量渲染骨架并自动错峰。
 * 复制默认插槽 count 份，逐份注入 --skeleton-index，供后代 skeleton-shimmer 计算延迟。
 * 直接 clone vnode 并合并 style，不添加包裹元素，保持 grid 与 flex 子项布局。
 */
import { cloneVNode, defineComponent, h, type VNode } from 'vue'

export default defineComponent({
  name: 'SkeletonGroup',
  props: {
    /** 渲染份数 */
    count: { type: Number, default: 6 },
    /** 容器标签，默认 div；列表场景可传 'ul' 等 */
    tag: { type: String, default: 'div' },
    /** 相位步进，1 = 每份 +1（默认）；想让节奏更慢可传 0.5 */
    step: { type: Number, default: 1 },
    /** 起始相位，用于与页面上另一组骨架接续 */
    start: { type: Number, default: 0 },
  },
  setup(props, { slots }) {
    return () => {
      const children: VNode[] = []
      const total = Math.max(0, Math.floor(props.count))

      for (let i = 0; i < total; i += 1) {
        const phase = props.start + i * props.step
        const nodes = slots.default?.({ index: i, phase }) ?? []

        nodes.forEach((node, nodeIndex) => {
          const nodeType = node.type
          // 只有元素 / 组件 vnode 能承载 style；Text / Comment / Fragment 原样克隆
          const stylable =
            typeof nodeType === 'string' ||
            typeof nodeType === 'function' ||
            (typeof nodeType === 'object' && nodeType !== null)

          // 始终 clone：编译期 hoist 过的静态 vnode 不能在多个位置复用
          children.push(
            cloneVNode(
              node,
              stylable
                ? { key: `${i}-${nodeIndex}`, style: { '--skeleton-index': phase } }
                : { key: `${i}-${nodeIndex}` }
            )
          )
        })
      }

      return h(props.tag, { 'aria-hidden': 'true' }, children)
    }
  },
})
</script>
