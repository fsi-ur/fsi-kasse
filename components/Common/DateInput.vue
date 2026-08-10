<template>
  <input
    :value="displayValue"
    type="text"
    class="input"
    :class="sizeClass"
    :placeholder="resolvedPlaceholder"
    :disabled="disabled"
    inputmode="numeric"
    autocomplete="off"
    @focus="onFocus"
    @input="onInput"
    @blur="onBlur"
  >
</template>

<script setup lang="ts">
import { focusAndSelectInput } from '~/composables/useCurrencyInput'
import { formatStoredDateInput, normalizeDateInput, type DateInputMode } from '~/composables/useDateInput'

const props = withDefaults(defineProps<{
  modelValue: string | null
  mode?: DateInputMode
  disabled?: boolean
  placeholder?: string
  emptyValue?: string | null
  size?: 'md' | 'sm'
}>(), {
  mode: 'date',
  disabled: false,
  placeholder: undefined,
  emptyValue: '',
  size: 'md',
})

const sizeClass = computed(() => props.size === 'sm' ? 'p-1 text-xs' : undefined)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | null): void
}>()

const isFocused = ref(false)
const displayValue = ref(formatStoredDateInput(props.modelValue, props.mode))

const resolvedPlaceholder = computed(() => {
  if (props.placeholder) return props.placeholder
  return props.mode === 'datetime' ? 'TT.MM.JJJJ HH:mm' : 'TT.MM.JJJJ'
})

watch(() => [props.modelValue, props.mode] as const, ([value, mode]) => {
  if (isFocused.value) return
  displayValue.value = formatStoredDateInput(value, mode)
}, { immediate: true })

function emitEmptyValue() {
  emit('update:modelValue', props.emptyValue)
}

function syncValue(rawValue: string, finalize = false) {
  const normalized = normalizeDateInput(rawValue, props.mode, finalize)
  displayValue.value = normalized.display

  if (!normalized.display) {
    emitEmptyValue()
    return
  }

  if (normalized.canonical) {
    emit('update:modelValue', normalized.canonical)
    return
  }

  emitEmptyValue()
}

function onFocus(event: FocusEvent) {
  isFocused.value = true
  focusAndSelectInput(event)
}

function onInput(event: Event) {
  syncValue((event.target as HTMLInputElement).value)
}

function onBlur(event: FocusEvent) {
  isFocused.value = false
  syncValue((event.target as HTMLInputElement).value, true)
  ;(event.target as HTMLInputElement).value = displayValue.value
}
</script>
