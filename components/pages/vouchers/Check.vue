<template>
  <div class="col-span-12 bg-white p-6 rounded-xl shadow-lg flex flex-col items-center gap-4 text-center">
    <h2 class="text-lg font-semibold">{{ t('vouchers.check.title') }}</h2>
    <p class="max-w-lg text-sm text-base-600">{{ t('vouchers.check.text') }}</p>
    <button type="button" class="btn-primary inline-flex items-center gap-2 px-6! py-4! text-base!" @click="showScan = true">
      <Icon name="material-symbols:qr-code-scanner-rounded" class="h-6 w-6" aria-hidden="true" />
      {{ t('vouchers.check.scan') }}
    </button>
  </div>

  <VoucherScanModal v-model="showScan" context="check" />
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'

const { t } = useI18n()
const showScan = ref(false)
</script>
