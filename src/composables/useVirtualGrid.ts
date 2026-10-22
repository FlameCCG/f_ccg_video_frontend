import { computed, nextTick, onBeforeUnmount, ref, watch, type Ref, type CSSProperties } from 'vue'

/** 窗口滚动驱动的等高行虚拟网格；上下留白保留完整内容高度。 */
export const useVirtualGrid = <T>(
  items: Ref<T[]>,
  container: Readonly<Ref<HTMLElement | null>>,
  initialScrollTop = 0
) => {
  const columns = ref(5)
  const rowHeight = ref(240)
  const relativeTop = ref(initialScrollTop)
  const viewportHeight = ref(window.innerHeight)
  const gap = 16
  const overscan = 3
  let frame = 0
  let resizeObserver: ResizeObserver | undefined

  const rowCount = computed(() => Math.ceil(items.value.length / columns.value))
  const startRow = computed(() =>
    Math.max(
      0,
      Math.min(
        rowCount.value - 1,
        Math.floor(relativeTop.value / (rowHeight.value + gap)) - overscan
      )
    )
  )
  const endRow = computed(() =>
    Math.min(
      rowCount.value,
      Math.max(
        startRow.value + 1,
        Math.ceil((relativeTop.value + viewportHeight.value) / (rowHeight.value + gap)) + overscan
      )
    )
  )
  const visibleItems = computed(() =>
    items.value.slice(startRow.value * columns.value, endRow.value * columns.value)
  )
  const spacerStyle = computed<CSSProperties>(() => ({
    paddingTop: `${startRow.value * (rowHeight.value + gap)}px`,
    paddingBottom: `${Math.max(0, rowCount.value - endRow.value) * (rowHeight.value + gap)}px`,
    overflowAnchor: 'none',
  }))

  const measure = () => {
    frame = 0
    const el = container.value
    if (!el) return
    const grid = el.firstElementChild as HTMLElement | null
    if (!grid) return
    const style = getComputedStyle(grid)
    columns.value = style.gridTemplateColumns.split(' ').length
    const card = grid.firstElementChild
    if (card) rowHeight.value = card.getBoundingClientRect().height
    relativeTop.value = Math.max(0, -el.getBoundingClientRect().top)
    viewportHeight.value = window.innerHeight
  }
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(measure)
  }

  watch(
    container,
    (el) => {
      resizeObserver?.disconnect()
      if (!el) return
      resizeObserver = new ResizeObserver(schedule)
      resizeObserver.observe(el)
      measure()
    },
    { flush: 'post' }
  )
  watch(
    () => items.value.length,
    () => void nextTick(schedule)
  )
  window.addEventListener('scroll', schedule, { passive: true })
  window.addEventListener('resize', schedule)
  onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    cancelAnimationFrame(frame)
    window.removeEventListener('scroll', schedule)
    window.removeEventListener('resize', schedule)
  })

  return { visibleItems, spacerStyle }
}
