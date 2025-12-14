<template>
  <div
    v-if="open"
    class="fixed inset bg-black/40 z-30 md:hidden"
    @click="$emit('close')"
  />

  <aside :class="[
      'fixed top-0 left-0 h-full w-30 md:w-36 bg-gray-900 text-gray-300 flex flex-col p-4 shadow-lg z-40 transition-transform',
      open ? 'translate-x-0' : '-translate-x-full',
      'md:translate-x-0'
    ]"
  >
    <ul class="flex flex-col gap-4 mt-2">
      <li
        v-for="item in items"
        :key="item.name"
        @click="handleClick(item.name)"
        class="cursor-pointer flex flex-col items-center p-3 rounded-lg"
      >
        <div
          :class="[
            'w-12 h-12 flex items-center justify-center rounded-full transition-colors',
            item.name === currentPage
              ? 'bg-cyan-600 text-white'
              : 'bg-gray-800 text-gray-400'
          ]"
        >
          <Icon :name="item.icon" class="w-10 h-10" aria-hidden="true" />
        </div>

        <span class="mt-2 text-sm text-gray-300 font-medium">
          {{ item.label }}
        </span>
      </li>
    </ul>
  </aside>
</template>

<script setup lang="ts">
import { usePage } from '~/composables/usePage'

const props = defineProps<{
  items: { name: string; label: string; icon: string }[]
  open: boolean
}>()

const emit = defineEmits(['close'])

const { currentPage, setPage } = usePage()

function handleClick(name: string) {
  setPage(name)
  emit('close')
}
</script>