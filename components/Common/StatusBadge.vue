<template>
  <span class="px-3 py-1 rounded-full text-xs font-medium" :class="toneClass">
    {{ label }}
  </span>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  label: string
  tone?: 'base' | 'warning' | 'success' | 'dangerCancelled' | 'danger' | 'baseMuted'
}>(), {
  tone: 'baseMuted',
})

const toneClass = computed(() => {
  if (props.tone === 'base') return 'bg-base-300 text-base-900'
  if (props.tone === 'warning') return 'bg-warning-300 text-warning-900'
  if (props.tone === 'success') return 'bg-success-300 text-success-900'
  if (props.tone === 'dangerCancelled') return 'bg-danger-300 text-danger-900 line-through'
  if (props.tone === 'danger') return 'bg-danger-300 text-danger-900'
  return 'bg-base-100 text-base-500'
})
</script>
