<template>
  <div
    :class="[
      'xl:p-6',
      flushHeaderWithCards ? 'space-y-0' : 'space-y-5',
    ]"
  >
    <div ref="headerContainerRef" class="flex flex-wrap items-start gap-x-7 gap-y-4">
      <div ref="headlineGroupRef" class="flex min-w-0 items-center gap-3">
        <button
          class="bg-gray-900 text-white rounded-md md:hidden w-8 h-8 flex items-center justify-center cursor-pointer"
          @click="$emit('openMenu')"
        >
          <Icon
            name="material-symbols:lists-rounded"
            class="w-full h-full"
            aria-hidden="true"
          />
        </button>
        <h1 class="text-2xl font-bold">{{ headline1 }}</h1>
      </div>

      <slot name="header" v-bind="{ headerContainerRef, headlineGroupRef }"></slot>
    </div>

    <div
      v-if="$slots.cards"
      class="grid grid-cols-12 gap-4 xl:gap-6"
    >
      <slot name="cards"></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

defineEmits<{
  (e: 'openMenu'): void
}>()

defineProps({
  headline1: String,
  flushHeaderWithCards: {
    type: Boolean,
    default: false,
  },
})

const headerContainerRef = ref<HTMLElement | null>(null)
const headlineGroupRef = ref<HTMLElement | null>(null)
</script>
