<template>
  <div ref="rootRef" class="flex items-center">
    <button
      v-if="!isExpanded"
      type="button"
      class="w-9 h-9 rounded-lg border border-slate-300 hover:bg-slate-50 cursor-pointer inline-flex items-center justify-center"
      @click="expand"
    >
      <Icon name="material-symbols:search-rounded" class="w-5 h-5 text-slate-600" />
    </button>

    <div v-else class="relative w-66 max-w-[75vw]">
      <Icon
        name="material-symbols:search-rounded"
        class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none"
      />
      <input
        ref="inputRef"
        :value="modelValue"
        type="text"
        :placeholder="resolvedPlaceholder"
        class="w-full border border-slate-300 rounded-lg pl-9 pr-9 py-1.75 text-sm"
        @input="onInput"
      >
      <button
        v-if="modelValue"
        type="button"
        class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-700 cursor-pointer"
        @click="clear"
      >
        <Icon name="material-symbols:close-rounded" class="w-4 h-4" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from '~/composables/useI18n'

const props = defineProps<{
  modelValue: string
  placeholder?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const rootRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const isExpanded = ref(false)
const { t } = useI18n()

const resolvedPlaceholder = computed(() => props.placeholder || t('common.searchList'))
const hasValue = computed(() => props.modelValue.trim().length > 0)

function onInput(event: Event) {
  const target = event.target as HTMLInputElement
  emit('update:modelValue', target.value)
}

async function expand() {
  isExpanded.value = true
  await nextTick()
  inputRef.value?.focus()
}

function clear() {
  emit('update:modelValue', '')
  nextTick(() => inputRef.value?.focus())
}

function onDocumentClick(event: MouseEvent) {
  const target = event.target as Node | null
  if (!target || !rootRef.value) return
  if (rootRef.value.contains(target)) return
  if (!hasValue.value) {
    isExpanded.value = false
  }
}

watch(hasValue, (value) => {
  if (value) isExpanded.value = true
})

onMounted(() => {
  isExpanded.value = hasValue.value
  document.addEventListener('click', onDocumentClick, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick, true)
})
</script>
