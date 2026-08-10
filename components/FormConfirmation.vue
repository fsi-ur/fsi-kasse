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
      <CommonFormActions
        :cancel-label="t('actions.cancel')"
        :submit-label="t('actions.confirm')"
        @cancel="$emit('cancel')"
        @submit="$emit('confirm')"
      />
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
