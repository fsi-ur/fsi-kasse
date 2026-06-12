import { nextTick, onBeforeUnmount, onMounted, ref, watch, type ComputedRef, type Ref } from 'vue'

export interface TabOverviewItem {
  key: string
  label: string
}

interface UseTabOverviewLayoutOptions {
  tabs: Ref<readonly TabOverviewItem[]> | ComputedRef<readonly TabOverviewItem[]>
  headerContainerRef: Ref<HTMLElement | null> | ComputedRef<HTMLElement | null>
  headlineGroupRef: Ref<HTMLElement | null> | ComputedRef<HTMLElement | null>
  labelMeasureRefs: Ref<Array<HTMLElement | null>>
  mobileBreakpoint?: number
  inlineGap?: number
  tabGap?: number
  containerPadding?: number
}

const FALLBACK_TAB_WIDTH = 112

export function useTabOverviewLayout({
  tabs,
  headerContainerRef,
  headlineGroupRef,
  labelMeasureRefs,
  mobileBreakpoint = 768,
  inlineGap = 28,
  tabGap = 8,
  containerPadding = 8,
}: UseTabOverviewLayoutOptions) {
  const isBelowHeadline = ref(false)
  const tabMinWidth = ref(FALLBACK_TAB_WIDTH)
  const inlineContainerWidth = ref(0)
  const tabRows = ref<TabOverviewItem[][]>([])
  const viewportWidth = ref(typeof window === 'undefined' ? mobileBreakpoint : window.innerWidth)

  let resizeObserver: ResizeObserver | null = null
  let observedHeaderContainer: HTMLElement | null = null
  let observedHeadlineGroup: HTMLElement | null = null

  function approximateTabWidth() {
    const longestLabelLength = tabs.value.reduce((max, tab) => Math.max(max, tab.label.length), 0)
    return Math.max(FALLBACK_TAB_WIDTH, longestLabelLength * 9 + 32)
  }

  function requiredRowWidth(tabCount: number, width: number) {
    if (tabCount <= 0) return 0
    return containerPadding * 2 + (tabCount * width) + (Math.max(0, tabCount - 1) * tabGap)
  }

  function maxTabsWithinWidth(availableWidth: number, width: number) {
    const innerWidth = Math.max(0, availableWidth - (containerPadding * 2))
    if (innerWidth <= width) return 1

    return Math.max(1, Math.floor((innerWidth + tabGap) / (width + tabGap)))
  }

  function distributeTabsEvenly(items: readonly TabOverviewItem[], maxTabsPerRow: number) {
    if (items.length === 0) return []

    const rowCount = Math.max(1, Math.ceil(items.length / Math.max(1, maxTabsPerRow)))
    const baseTabsPerRow = Math.floor(items.length / rowCount)
    const rowsWithExtraTab = items.length % rowCount

    let cursor = 0
    const rows: TabOverviewItem[][] = []

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const size = baseTabsPerRow + (rowIndex < rowsWithExtraTab ? 1 : 0)
      rows.push(items.slice(cursor, cursor + size))
      cursor += size
    }

    return rows
  }

  function measureTabWidth() {
    const widestMeasuredLabel = labelMeasureRefs.value.reduce((max, element) => {
      if (!element) return max
      return Math.max(max, Math.ceil(element.getBoundingClientRect().width))
    }, 0)

    return widestMeasuredLabel || approximateTabWidth()
  }

  async function recalculateLayout() {
    await nextTick()

    const tabCount = tabs.value.length
    if (tabCount === 0) {
      isBelowHeadline.value = false
      tabRows.value = []
      inlineContainerWidth.value = 0
      return
    }

    const measuredTabWidth = measureTabWidth()
    tabMinWidth.value = measuredTabWidth

    const headerWidth = headerContainerRef.value?.clientWidth ?? 0
    const headlineWidth = headlineGroupRef.value?.offsetWidth ?? 0
    const inlineAvailableWidth = Math.max(0, headerWidth - headlineWidth - inlineGap)
    const fullWidthOneRow = requiredRowWidth(tabCount, measuredTabWidth)
    const canFitInlineInOneRow = inlineAvailableWidth >= fullWidthOneRow
    const shouldMoveBelowHeadline = viewportWidth.value < mobileBreakpoint && !canFitInlineInOneRow

    isBelowHeadline.value = shouldMoveBelowHeadline

    const layoutWidth = shouldMoveBelowHeadline ? headerWidth : inlineAvailableWidth
    const maxTabsPerRow = Math.min(tabCount, maxTabsWithinWidth(layoutWidth, measuredTabWidth))

    const distributedRows = distributeTabsEvenly(tabs.value, maxTabsPerRow)
    const widestRowLength = distributedRows.reduce((max, row) => Math.max(max, row.length), 0)

    tabRows.value = distributedRows
    inlineContainerWidth.value = requiredRowWidth(widestRowLength, measuredTabWidth)
  }

  function handleWindowResize() {
    viewportWidth.value = window.innerWidth
    void recalculateLayout()
  }

  function syncResizeObserverTargets() {
    if (!resizeObserver) return

    const nextHeaderContainer = headerContainerRef.value
    if (observedHeaderContainer && observedHeaderContainer !== nextHeaderContainer) {
      resizeObserver.unobserve(observedHeaderContainer)
    }
    if (nextHeaderContainer && observedHeaderContainer !== nextHeaderContainer) {
      resizeObserver.observe(nextHeaderContainer)
    }
    observedHeaderContainer = nextHeaderContainer

    const nextHeadlineGroup = headlineGroupRef.value
    if (observedHeadlineGroup && observedHeadlineGroup !== nextHeadlineGroup) {
      resizeObserver.unobserve(observedHeadlineGroup)
    }
    if (nextHeadlineGroup && observedHeadlineGroup !== nextHeadlineGroup) {
      resizeObserver.observe(nextHeadlineGroup)
    }
    observedHeadlineGroup = nextHeadlineGroup
  }

  onMounted(() => {
    viewportWidth.value = window.innerWidth
    window.addEventListener('resize', handleWindowResize)

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        void recalculateLayout()
      })
      syncResizeObserverTargets()
    }

    void recalculateLayout()
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', handleWindowResize)
    resizeObserver?.disconnect()
  })

  watch(
    [headerContainerRef, headlineGroupRef],
    () => {
      syncResizeObserverTargets()
      void recalculateLayout()
    },
    { immediate: true },
  )

  watch(
    () => tabs.value.map(tab => `${tab.key}:${tab.label}`).join('|'),
    () => {
      void recalculateLayout()
    },
    { immediate: true },
  )

  return {
    inlineContainerWidth,
    isBelowHeadline,
    tabMinWidth,
    tabRows,
  }
}
