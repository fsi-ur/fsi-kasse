<template>
  <section
    v-if="errors.length"
    class="bg-danger-50 border border-danger-200 rounded-xl p-3 text-sm text-danger-700"
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
