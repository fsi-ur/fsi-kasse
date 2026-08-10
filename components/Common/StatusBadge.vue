<template>
  <span class="px-3 py-1 rounded-full text-xs font-medium" :class="toneClass">
    {{ label }}
  </span>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  label: string
  tone?: 'slate' | 'yellow' | 'green' | 'red' | 'gray'
}>(), {
  tone: 'gray',
})

const toneClass = computed(() => {
  if (props.tone === 'slate') return 'bg-slate-300 text-slate-900'
  if (props.tone === 'yellow') return 'bg-yellow-300 text-yellow-900'
  if (props.tone === 'green') return 'bg-green-300 text-green-900'
  if (props.tone === 'red') return 'bg-red-300 text-red-900 line-through'
  return 'bg-gray-100 text-gray-500'
})
</script>
