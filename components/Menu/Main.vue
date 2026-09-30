<template>
  <div
    v-if="open"
    class="fixed inset-0 bg-black/40 z-30 md:hidden"
    @click="$emit('close')"
  />

  <aside
    role="navigation"
    :aria-label="t('common.mainNavigation')"
    :class="[
      'fixed top-0 left-0 h-full bg-base-900 text-base-300 flex flex-col gap-4 p-4 shadow-lg z-40 transition-[width,transform] duration-200',
      collapsed ? 'md:w-20' : 'md:w-40',
      'w-40',
      open ? 'translate-x-0' : '-translate-x-full',
      'md:translate-x-0'
    ]"
  >
    <ul
      class="-mx-4 flex w-[calc(100%+2rem)] flex-1 min-h-0 flex-col overflow-y-auto px-4"
      :class="pages.length > 6 ? 'justify-between' : 'justify-start gap-2'"
    >
      <li v-for="page in mainPages" :key="page.name">
        <button
          type="button"
          class="group flex w-full flex-col items-center cursor-pointer focus-visible:outline-none"
          :aria-current="page.name === currentPage ? 'page' : undefined"
          :title="collapsedLabel(page.labelKey)"
          @click="handleClick(page.name)"
        >
          <span
            :class="[
              'flex w-full flex-col items-center rounded-lg p-2 transition-colors group-hover:bg-base-800 group-focus-visible:ring-2 group-focus-visible:ring-secondary-400',
              collapsed ? 'md:w-auto' : '',
            ]"
          >
            <span
              :class="[
                'w-11 h-11 flex items-center justify-center rounded-full transition-colors',
                page.name === currentPage
                  ? 'bg-secondary-600 text-white'
                  : 'bg-base-800 text-base-400 group-hover:bg-base-700 group-hover:text-base-200'
              ]"
            >
              <Icon :name="page.icon" size="30" class="shrink-0" aria-hidden="true" />
            </span>

            <span
              :class="[
                'mt-1 text-sm font-medium text-center transition-colors',
                page.name === currentPage ? 'text-white' : 'text-base-300 group-hover:text-white',
                collapsed ? 'md:hidden' : '',
              ]"
            >
              {{ t(page.labelKey) }}
            </span>
          </span>
        </button>
      </li>
    </ul>

    <div class="flex shrink-0 flex-col gap-2">
      <button
        v-if="user"
        type="button"
        :class="[
          'flex w-full items-center justify-center gap-2 rounded-lg bg-base-800 px-3 py-2 text-sm font-medium text-base-300 transition hover:bg-base-700 disabled:cursor-wait disabled:opacity-60 cursor-pointer',
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
        <span :class="collapsed ? 'md:hidden' : ''">{{ t('actions.refresh') }}</span>
      </button>

      <button
        type="button"
        class="hidden md:flex w-full items-center justify-center gap-2 rounded-lg bg-base-800 px-3 py-2 text-sm font-medium text-base-300 transition hover:bg-base-700 cursor-pointer"
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

function collapsedLabel(labelKey: string) {
  return collapsed.value ? t(labelKey) : undefined
}

function handleClick(name: PageName) {
  setPage(name, name === currentPage.value ? { resetTabKey: Date.now() } : undefined)
  emit('close')
}
</script>
