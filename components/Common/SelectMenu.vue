<template>
  <MenuDropdown v-model="openDropdown" id="select" :disabled="disabled" :wrapper-class="wrapperClass">
    <template #trigger="{ styling, disabled: isDisabled }">
      <button
        type="button"
        class="not-disabled:cursor-pointer disabled:cursor-not-allowed"
        :class="[styling, triggerClass]"
        :disabled="isDisabled"
      >
        <span class="truncate" :class="{ 'text-base-400': !selected && placeholder }">{{ selected?.label ?? placeholder }}</span>
        <Icon name="material-symbols:keyboard-arrow-down-rounded" class="h-4 w-4 shrink-0 text-base-400" aria-hidden="true" />
      </button>
    </template>

    <template #default="{ styling }">
      <button
        v-for="option in options"
        :key="String(option.value)"
        type="button"
        :class="[styling, option.value === modelValue ? 'font-medium text-link-600' : '']"
        @click="choose(option.value)"
      >
        {{ option.label }}
      </button>
    </template>
  </MenuDropdown>
</template>

<script setup lang="ts" generic="T extends string | number | null">
// A plain value picker on top of MenuDropdown, used instead of native <select>.
const props = withDefaults(defineProps<{
  modelValue: T
  options: Array<{ value: T, label: string }>
  placeholder?: string
  disabled?: boolean
  wrapperClass?: string
  triggerClass?: string
}>(), {
  placeholder: '',
  disabled: false,
  wrapperClass: 'relative w-full',
  triggerClass: '',
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: T): void
}>()

const openDropdown = ref<string | number | null>(null)

const selected = computed(() => props.options.find(option => option.value === props.modelValue) ?? null)

function choose(value: T) {
  openDropdown.value = null
  if (value !== props.modelValue) emit('update:modelValue', value)
}
</script>
