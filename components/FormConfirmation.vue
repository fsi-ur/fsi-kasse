<template>
  <CommonModal
    :model-value="true"
    :title="headline"
    @close="$emit('cancel')"
  >
    <p class="text-sm text-slate-600">
      <slot name="message"></slot>
    </p>

    <template #footer>
      <button class="btn-secondary" @click="$emit('cancel')">
        {{ t('actions.cancel') }}
      </button>

      <button class="btn-primary" @click="$emit('confirm')">
        {{ t('actions.confirm') }}
      </button>
    </template>
  </CommonModal>
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'

defineProps({
  headline: String
})
defineEmits(['confirm', 'cancel'])

const { t } = useI18n()
</script>
