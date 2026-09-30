<template>
  <div v-if="!disabled" class="grid gap-4" :class="saveAndExitLabel ? 'grid-cols-3' : 'grid-cols-2'">
    <button type="button" class="btn-secondary" :disabled="saving" :class="{ 'opacity-50 cursor-not-allowed': saving }" @click="$emit('cancel')">
      {{ cancelLabel }}
    </button>

    <button
      type="button"
      :class="[
        saveAndExitLabel ? 'btn-outline' : 'btn-primary',
        'inline-flex items-center justify-center gap-2',
        { 'opacity-50 cursor-not-allowed': isBlocked },
      ]"
      :disabled="isBlocked"
      @click="$emit('submit')"
    >
      <Icon v-if="saving" name="material-symbols:progress-activity" class="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
      {{ saving ? busyLabel : submitLabel }}
    </button>

    <button
      v-if="saveAndExitLabel"
      type="button"
      class="btn-primary inline-flex items-center justify-center gap-2"
      :disabled="isBlocked"
      :class="{ 'opacity-50 cursor-not-allowed': isBlocked }"
      @click="$emit('submit-and-exit')"
    >
      <Icon v-if="saving" name="material-symbols:progress-activity" class="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
      {{ saving ? busyLabel : saveAndExitLabel }}
    </button>
  </div>

  <div v-else class="grid">
    <button type="button" class="btn-secondary col-span-12" @click="$emit('cancel')">
      {{ closeLabel }}
    </button>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  disabled?: boolean
  saveDisabled?: boolean
  saving?: boolean
  cancelLabel?: string
  submitLabel?: string
  closeLabel?: string
  saveAndExitLabel?: string
  savingLabel?: string
}>(), {
  disabled: false,
  saveDisabled: false,
  saving: false,
  cancelLabel: 'Cancel',
  submitLabel: 'Save',
  closeLabel: 'Close',
  saveAndExitLabel: undefined,
  savingLabel: undefined,
})

defineEmits<{
  (e: 'cancel'): void
  (e: 'submit'): void
  (e: 'submit-and-exit'): void
}>()

const isBlocked = computed(() => props.saveDisabled || props.saving)
const busyLabel = computed(() => props.savingLabel ?? props.submitLabel)
</script>
