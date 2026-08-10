<template>
  <div
    v-if="tabs.length > 0"
    :class="[
      'relative min-w-0 max-w-full',
      isBelowHeadline ? 'basis-full w-full' : 'ml-auto shrink-0',
    ]"
    :style="containerStyle"
  >
    <div class="-mx-6 sm:mx-0 sm:rounded-xl bg-slate-200 p-2">
      <div class="space-y-2">
        <div
          v-for="(row, rowIndex) in tabRows"
          :key="`row-${rowIndex}`"
          :class="['flex gap-2', isBelowHeadline ? 'w-full' : 'w-full justify-end']"
        >
          <button
            v-for="tab in row"
            :key="tab.key"
            type="button"
            :aria-pressed="modelValue === tab.key"
            class="min-w-0 rounded-lg px-4 py-2 text-center text-sm font-medium whitespace-nowrap transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-200"
            :class="modelValue === tab.key
              ? 'bg-orange-500 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-white'"
            :style="tabStyle()"
            @click="emit('update:modelValue', tab.key)"
          >
            <span class="block truncate">{{ tab.label }}</span>
          </button>
        </div>
      </div>
    </div>

    <div class="pointer-events-none absolute left-0 top-0 -z-10 opacity-0" aria-hidden="true">
      <span
        v-for="(tab, index) in tabs"
        :key="`measure-${tab.key}`"
        :ref="element => setLabelMeasureRef(index, element)"
        class="inline-flex rounded-[1.15rem] px-4 py-2.5 text-sm font-medium whitespace-nowrap"
      >
        {{ tab.label }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, type CSSProperties, type ComponentPublicInstance } from 'vue'
import { useTabOverviewLayout, type TabOverviewItem } from '~/composables/useTabOverviewLayout'

const props = defineProps<{
  modelValue: string
  tabs: TabOverviewItem[]
  headerContainerRef: HTMLElement | null
  headlineGroupRef: HTMLElement | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const labelMeasureRefs = ref<Array<HTMLElement | null>>([])

watch(
  () => props.tabs.length,
  length => {
    labelMeasureRefs.value = Array.from({ length }, () => null)
  },
  { immediate: true },
)

const {
  inlineContainerWidth,
  isBelowHeadline,
  tabMinWidth,
  tabRows,
} = useTabOverviewLayout({
  tabs: computed(() => props.tabs),
  headerContainerRef: computed(() => props.headerContainerRef),
  headlineGroupRef: computed(() => props.headlineGroupRef),
  labelMeasureRefs,
})

const containerStyle = computed<CSSProperties>(() => {
  if (isBelowHeadline.value || inlineContainerWidth.value <= 0) return {}

  return {
    width: `${inlineContainerWidth.value}px`,
    flexBasis: `${inlineContainerWidth.value}px`,
    maxWidth: '100%',
  }
})

function tabStyle(): CSSProperties {
  if (isBelowHeadline.value) {
    return {
      flex: '1 1 0',
      minWidth: `${tabMinWidth.value}px`,
    }
  }

  return {
    width: `${tabMinWidth.value}px`,
    flex: `0 0 ${tabMinWidth.value}px`,
  }
}

function setLabelMeasureRef(index: number, element: Element | ComponentPublicInstance | null) {
  labelMeasureRefs.value[index] = element instanceof HTMLElement ? element : null
}
</script>
