<template>
  <div v-if="!disabled" class="grid gap-4" :class="saveAndExitLabel ? 'grid-cols-3' : 'grid-cols-2'">
    <button type="button" class="btn-secondary" @click="$emit('cancel')">
      {{ cancelLabel }}
    </button>

    <button
      type="button"
      :class="[
        saveAndExitLabel ? 'btn-outline' : 'btn-primary',
        { 'opacity-50 cursor-not-allowed': saveDisabled },
      ]"
      :disabled="saveDisabled"
      @click="$emit('submit')"
    >
      {{ submitLabel }}
    </button>

    <button
      v-if="saveAndExitLabel"
      type="button"
      class="btn-primary"
      :disabled="saveDisabled"
      :class="{ 'opacity-50 cursor-not-allowed': saveDisabled }"
      @click="$emit('submit-and-exit')"
    >
      {{ saveAndExitLabel }}
    </button>
  </div>

  <div v-else class="grid">
    <button type="button" class="btn-secondary col-span-12" @click="$emit('cancel')">
      {{ closeLabel }}
    </button>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  disabled?: boolean
  saveDisabled?: boolean
  cancelLabel?: string
  submitLabel?: string
  closeLabel?: string
  saveAndExitLabel?: string
}>(), {
  disabled: false,
  saveDisabled: false,
  cancelLabel: 'Cancel',
  submitLabel: 'Save',
  closeLabel: 'Close',
  saveAndExitLabel: undefined,
})

defineEmits<{
  (e: 'cancel'): void
  (e: 'submit'): void
  (e: 'submit-and-exit'): void
}>()
</script>
