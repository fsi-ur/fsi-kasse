<template>
  <div class="-mx-6 -mb-6 bg-white p-4 shadow-sm space-y-3 col-span-12 sm:mx-0 sm:space-y-6 sm:rounded-xl sm:p-6 sm:shadow-lg">
    <div class="flex justify-between items-center gap-3 flex-wrap">
      <h2 class="text-base font-semibold sm:text-lg">{{ title }}</h2>

      <div class="flex items-center gap-2 flex-wrap justify-end">
        <CommonAdvancedTableViewToggle v-if="persistKey" :persist-key="persistKey" />

        <CommonGlobalSearchBar
          :model-value="searchValue"
          :placeholder="searchPlaceholder"
          @update:model-value="$emit('update:searchValue', $event)"
        />

        <slot name="actions" />

        <button v-if="canCreate" type="button" class="btn-primary" @click="$emit('create')">
          {{ createLabel }}
        </button>
      </div>
    </div>

    <slot />
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  searchValue: string
  searchPlaceholder?: string
  canCreate?: boolean
  createLabel?: string
  /** Same key passed to the paired `CommonAdvancedTable`'s `persist-key`; shows the table/compact view toggle when set. */
  persistKey?: string
}>(), {
  searchPlaceholder: '',
  canCreate: false,
  createLabel: '',
})

defineEmits<{
  (e: 'update:searchValue', value: string): void
  (e: 'create'): void
}>()
</script>
