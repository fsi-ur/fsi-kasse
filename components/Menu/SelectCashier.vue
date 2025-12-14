<template>
  <div class="mb-6">
    <select
      v-model="selectedCashier"
      class="bg-white p-2 rounded-md w-40 md:w-64 outline outline-gray-200 shadow-lg"
    >
      <option disabled value="">Choose cashier</option>
      <option v-for="c in cashiers" :key="c.id" :value="c.id">
        {{ c.name }}
      </option>
    </select>
  </div>
</template>

<script setup lang="ts">
const cashiers = ref<any[]>([])
const { selectedCashier } = useCheckout()

onMounted(async () => {
  const res = await $fetch('/api/cashiers', { method: 'GET' })
  if (res.ok) {
    const allCashiers = 'cashiers' in res ? res.cashiers as any[] : []
    cashiers.value = allCashiers.filter(i => i.is_active === 1 || i.is_active === true)
  }
})
</script>