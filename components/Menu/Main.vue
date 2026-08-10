<template>
  <div
    v-if="open"
    class="fixed inset bg-black/40 z-30 md:hidden"
    @click="$emit('close')"
  />

  <aside :class="[
      'fixed top-0 left-0 h-full bg-gray-900 text-gray-300 flex flex-col p-4 shadow-lg z-40 transition-[width,transform] duration-200',
      collapsed ? 'md:w-18' : 'md:w-40',
      'w-18',
      open ? 'translate-x-0' : '-translate-x-full',
      'md:translate-x-0'
    ]"
  >
    <ul
      class="flex flex-1 flex-col mt-2 mb-4 sm:mb-2"
      :class="pages.length > 6 ? 'justify-between' : 'justify-start gap-4'"
    >
      <li
        v-for="page in mainPages"
        :key="page.name"
        @click="handleClick(page.name)"
        class="cursor-pointer flex flex-col items-center rounded-lg p-1 md:p-3"
      >
        <div
          :class="[
            'w-12 h-12 flex items-center justify-center rounded-full transition-colors',
            page.name === currentPage
              ? 'bg-cyan-600 text-white'
              : 'bg-gray-800 text-gray-400'
          ]"
        >
          <Icon :name="page.icon" size="30" class="shrink-0" aria-hidden="true" />
        </div>

        <span v-if="!collapsed" class="mt-2 text-sm text-gray-300 font-medium text-center">
          {{ t(page.labelKey) }}
        </span>
      </li>
    </ul>

    <div class="mt-auto flex flex-col gap-2">
      <button
        v-if="user"
        type="button"
        :class="[
          'flex mb-4 sm:mb-0 items-center justify-center gap-2 rounded-lg bg-gray-800 px-3 py-2 text-sm font-medium text-gray-300 transition hover:bg-gray-700 disabled:cursor-wait disabled:opacity-60 cursor-pointer',
          isRefreshing ? 'animate-pulse' : '',
        ]"
        :disabled="isRefreshing"
        :aria-label="t('actions.refresh')"
        :title="t('actions.refresh')"
        @click="refreshCurrentPage"
      >
        <Icon
          name="material-symbols:refresh-rounded"
          :class="['h-5 w-5 shrink-0', isRefreshing ? 'animate-spin' : '']"
          aria-hidden="true"
        />
        <span v-if="!collapsed">{{ t('actions.refresh') }}</span>
      </button>

      <button
        type="button"
        class="hidden md:flex items-center justify-center gap-2 rounded-lg bg-gray-800 px-3 py-2 text-sm font-medium text-gray-300 transition hover:bg-gray-700 cursor-pointer"
        :title="collapsed ? t('common.expandMenu') : t('common.collapseMenu')"
        @click="$emit('toggle-collapse')"
      >
        <Icon
          :name="collapsed ? 'material-symbols:keyboard-double-arrow-right-rounded' : 'material-symbols:keyboard-double-arrow-left-rounded'"
          class="h-5 w-5 shrink-0"
          aria-hidden="true"
        />
        <span v-if="!collapsed">{{ t('common.collapseMenu') }}</span>
      </button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { usePage } from '~/composables/usePage'
import { useI18n } from '~/composables/useI18n'
import { useAppRefresh } from '~/composables/useAppRefresh'
import { useAuth } from '~/composables/useAuth'
import type { AppPage, PageName } from '~/types/page'

const props = defineProps<{
  pages: Array<{ name: PageName } & AppPage>
  open: boolean
  collapsed?: boolean
}>()

const emit = defineEmits(['close', 'toggle-collapse'])

const { currentPage, setPage } = usePage()
const { t } = useI18n()
const { isRefreshing, refreshCurrentPage } = useAppRefresh()
const { user } = useAuth()

const mainPages = computed(() => {
  return props.pages.filter(page => page.main === true)
})

const collapsed = computed(() => props.collapsed === true)

function handleClick(name: PageName) {
  setPage(name, name === currentPage.value ? { resetTabKey: Date.now() } : undefined)
  emit('close')
}
</script>
