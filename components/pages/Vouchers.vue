<template>
  <Page :headline1="t('vouchers.title')" flush-header-with-cards @open-menu="$emit('openMenu')">
    <template #header="{ headerContainerRef, headlineGroupRef }">
      <CommonTabOverview
        v-model="currentTab"
        :tabs="tabs"
        :header-container-ref="headerContainerRef"
        :headline-group-ref="headlineGroupRef"
      />
    </template>

    <template #cards>
      <CommonOfflineNotice v-if="!isOnline" variant="unavailable" />
      <component :is="activeComponent" v-else />
    </template>
  </Page>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '~/composables/useI18n'
import { usePage } from '~/composables/usePage'
import { useConnectivity } from '~/composables/useConnectivity'
import VoucherBatches from './vouchers/Batches.vue'
import VoucherList from './vouchers/VoucherList.vue'
import VoucherCheck from './vouchers/Check.vue'

defineEmits<{
  (e: 'openMenu'): void
}>()

type VouchersTab = 'batches' | 'vouchers' | 'check'

const currentTab = useState<VouchersTab>('vouchers-current-tab', () => 'batches')
const { t } = useI18n()
const { pageMeta, setPage } = usePage()
const { isOnline } = useConnectivity()

const tabs = computed(() => [
  { key: 'batches', label: t('vouchers.tabs.batches') },
  { key: 'vouchers', label: t('vouchers.tabs.vouchers') },
  { key: 'check', label: t('vouchers.tabs.check') },
])

const tabKeys = computed(() => tabs.value.map(tab => tab.key))

const activeComponent = computed(() => {
  switch (currentTab.value) {
    case 'vouchers':
      return VoucherList
    case 'check':
      return VoucherCheck
    case 'batches':
    default:
      return VoucherBatches
  }
})

watch([() => pageMeta.value?.tab, () => pageMeta.value?.resetTabKey], ([requestedTab, resetTabKey]) => {
  const requested = requestedTab as VouchersTab | undefined
  if (requested && tabKeys.value.includes(requested)) {
    currentTab.value = requested
    return
  }

  if (resetTabKey || !tabKeys.value.includes(currentTab.value)) currentTab.value = 'batches'
}, { immediate: true })

watch(currentTab, (tab) => {
  if (pageMeta.value?.tab === tab) return
  setPage('Vouchers', { tab })
}, { immediate: true })
</script>
