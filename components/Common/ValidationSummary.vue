<template>
  <section
    v-if="errors.length"
    class="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700"
  >
    <p class="font-semibold mb-1">{{ title }}</p>
    <ul class="list-disc list-inside">
      <li v-for="error in errors" :key="error">{{ error }}</li>
    </ul>
  </section>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  errors: string[]
  title?: string
}>(), {
  title: 'Validation blocked',
})
</script>
