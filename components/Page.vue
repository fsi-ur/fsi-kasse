<template>
  <div class="xl:p-6">
    <div class="flex flex-wrap gap-3 justify-between">
      <div class="flex flex-row gap-3">
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
        <h1 class="text-2xl font-bold mb-4">{{ headline1 }}</h1>
      </div>
      <slot name="header"></slot>
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
const emit = defineEmits<{
  (e: 'openMenu'): void
}>()

const props = defineProps({
  headline1: String,
})
</script>