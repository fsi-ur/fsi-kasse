<template>
  <div class="flex flex-col items-center gap-2 px-4 py-10 text-center">
    <Icon :name="icon" class="text-3xl text-base-300" aria-hidden="true" />

    <p class="text-sm font-medium text-base-600">{{ title }}</p>
    <p v-if="hint" class="max-w-sm text-xs text-base-400">{{ hint }}</p>

    <button
      v-if="resetLabel"
      type="button"
      class="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-base-300 px-3 py-1.5 text-sm text-base-600 transition cursor-pointer hover:bg-base-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
      @click="$emit('reset')"
    >
      <Icon name="material-symbols:filter-alt-off-rounded" class="text-base" aria-hidden="true" />
      {{ resetLabel }}
    </button>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  hint?: string
  icon?: string
  resetLabel?: string
}>(), {
  hint: '',
  icon: 'material-symbols:inbox-rounded',
  resetLabel: '',
})

defineEmits<{
  (e: 'reset'): void
}>()
</script>
