<template>
  <div
    v-if="!readOnly"
    class="col-span-12 p-4 bg-white shadow-lg rounded-xl"
  >
    <h2 class="text-lg font-semibold mb-4">{{ t('cashiers.newCashier') }}</h2>
    <div class="flex flex-wrap gap-4 items-end">
      <div class="field w-64">
        <label>{{ t('cashiers.cashierName') }}</label>
        <input v-model="newCashier.name" class="input" />
      </div>

      <button
        @click="addCashier"
        class="btn-primary"
        :disabled="!newCashier.name"
      >
        {{ t('actions.add') }}
      </button>
    </div>
  </div>

  <div
    v-else
    class="col-span-12 p-4 bg-amber-50 text-amber-900 shadow-lg rounded-xl border border-amber-200 text-sm"
  >
    {{ t('cashiers.connectedNotice') }}
  </div>

  <div class="col-span-12 bg-white p-4 rounded-xl shadow-lg">
    <h2 class="text-lg font-semibold mb-4">{{ t('cashiers.allCashiers') }}</h2>
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-slate-300 text-slate-600">
          <th class="text-left pb-2 font-semibold">{{ t('common.name') }}</th>
          <th class="text-left pb-2 font-semibold">{{ t('common.active') }}</th>
          <th v-if="!readOnly" class="text-left pb-2"></th>
          <th v-if="!readOnly" class="text-left pb-2"></th>
        </tr>
      </thead>

      <tbody>
        <tr
          v-for="cashier in cashiers"
          :key="cashier.id"
          class="border-b border-slate-200"
        >
          <td class="py-2 text-left">{{ cashier.name }}</td>
          <td class="py-2 text-left">
            <span :class="cashier.is_active ? 'text-green-600' : 'text-red-600'">
              {{ cashier.is_active ? t('common.yes') : t('common.no') }}
            </span>
          </td>
          <td v-if="!readOnly" class="py-2 text-right">
            <button
              @click="activateCashier(cashier.id, cashier.is_active)"
              class="btn-secondary px-3 py-1"
            >
              {{ cashier.is_active == 0 ? t('actions.activate') : t('actions.deactivate') }}
            </button>
          </td>
          <td v-if="!readOnly" class="py-2 text-right">
            <button
              @click="cashierToDelete = cashier"
              class="px-3 py-1 bg-red-600 hover:bg-red-700 rounded-md text-white text-sm cursor-pointer"
            >
              {{ t('actions.remove') }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="cashiers.length === 0" class="text-gray-400 mt-4">
      {{ t('cashiers.none') }}
    </div>
  </div>

  <FormConfirmation
    v-if="cashierToDelete"
    :headline="t('cashiers.deleteConfirmTitle')"
    @confirm="deleteCashier"
    @cancel="cashierToDelete = null"
  >
    <template #message>
      {{ t('cashiers.deleteConfirmQuestion', { name: cashierToDelete.name }) }}
    </template>
  </FormConfirmation>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from '~/composables/useI18n'

const { t } = useI18n()

const cashiers = ref<any[]>([])
const readOnly = ref(false)
const cashierToDelete = ref<any | null>(null)
const newCashier = ref({
  name: ''
})

async function loadCashiers() {
  const res = await $fetch('/api/cashiers', { method: 'GET' })
  if (res.ok) {
    cashiers.value = 'cashiers' in res ? res.cashiers as any[] : []
    readOnly.value = 'read_only' in res ? Boolean(res.read_only) : false
  }
}

async function addCashier() {
  if (!newCashier.value.name) return

  await $fetch('/api/cashiers/create', {
    method: 'POST',
    body: newCashier.value
  })

  newCashier.value = { name: '' }
  await loadCashiers()
}

async function deleteCashier() {
  if (!cashierToDelete.value) return

  await $fetch('/api/cashiers/delete', {
    method: 'POST',
    body: { id: cashierToDelete.value.id }
  })

  cashierToDelete.value = null
  await loadCashiers()
}

async function activateCashier(id: number, status: number) {
  const is_active = status == 0 ? 1 : 0
  await $fetch('/api/cashiers/activate', {
    method: 'POST',
    body: { id, is_active }
  })

  await loadCashiers()
}

onMounted(loadCashiers)
useAppRefresh().onRefresh(loadCashiers)
</script>
