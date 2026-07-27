<script lang="ts">
/**
 * SkeletonGroup —— 批量渲染骨架并自动错峰。
 *
 * 把默认插槽复制 count 份，逐份注入 `--skeleton-index`（该变量会沿 CSS 继承
 * 一路传给内部所有 .skeleton-shimmer 后代），于是一屏骨架是一道光斜着掠过，
 * 而不是十几块同相位齐闪。变量由全局 .skeleton-shimmer 消费；若全局尚未接入
 * 该变量，本组件依然正常渲染（只是没有相位差），不会报错。
 *
 * 不插入任何额外包裹元素：直接 clone 插槽 vnode 合并 style，
 * 因此 grid / flex 布局里子项仍是骨架本体。
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
