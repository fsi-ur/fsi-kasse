<template>
  <button
    type="button"
    class="group hidden h-9 w-9 items-center justify-center overflow-hidden rounded-lg border border-slate-300 cursor-pointer transition-all duration-150 hover:w-auto hover:justify-start hover:gap-1.5 hover:bg-slate-50 hover:px-3 xl:inline-flex"
    :title="label"
    @click="viewMode = viewMode === 'table' ? 'compact' : 'table'"
  >
    <Icon :name="icon" class="w-5 h-5 shrink-0 text-slate-600" />
    <span class="max-w-0 whitespace-nowrap text-sm text-slate-600 opacity-0 transition-all duration-150 group-hover:max-w-40 group-hover:opacity-100">
      {{ label }}
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '~/composables/useI18n'
import { useAdvancedTableViewMode } from '~/composables/useAdvancedTable'

const props = defineProps<{
  /** Same key passed to the paired `CommonAdvancedTable`'s `persist-key` — keeps both in sync. */
  persistKey?: string
}>()

const { t } = useI18n()

const viewMode = useAdvancedTableViewMode(props.persistKey)

const icon = computed(() => viewMode.value === 'table' ? 'material-symbols:view-list-rounded' : 'material-symbols:table-rows-rounded')
const label = computed(() => viewMode.value === 'table' ? t('common.compactView') : t('common.tableView'))
</script>
