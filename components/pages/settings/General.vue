<template>
  <div class="bg-white rounded-xl shadow-lg p-6 space-y-6 col-span-12">
    <section class="rounded-xl border border-slate-200 p-4 space-y-3">
      <div>
        <h3 class="font-semibold">{{ t('settings.languageTitle') }}</h3>
        <p class="text-sm text-slate-600">
          {{ t('settings.languageText', { language: t(`language.${language === 'de' ? 'german' : 'english'}`) }) }}
        </p>
      </div>

      <button class="btn-secondary" @click="toggleLanguage">
        {{ t('language.switchTo') }}
      </button>
    </section>

    <section class="rounded-xl border border-slate-200 p-4 space-y-3">
      <div>
        <h3 class="font-semibold">{{ t('settings.cashRegisterTitle') }}</h3>
        <p class="text-sm text-slate-600">{{ t('settings.cashRegisterText') }}</p>
      </div>

      <div class="field max-w-xs">
        <label for="fachschaft-amount">{{ t('settings.fachschaftPaymentAmount') }}</label>
        <input
          id="fachschaft-amount"
          v-model="fachschaftAmount"
          type="number"
          min="0.01"
          step="0.01"
          class="input"
          :disabled="isSaving"
        >
      </div>

      <p class="text-sm text-slate-600">{{ t('settings.fachschaftPaymentNotice') }}</p>

      <button
        class="btn-primary"
        :disabled="isSaving"
        @click="saveSettings"
      >
        {{ isSaving ? t('settings.saving') : t('settings.save') }}
      </button>
    </section>

    <section class="rounded-xl border border-slate-200 p-4 space-y-3">
      <div>
        <h3 class="font-semibold">{{ t('settings.exportTitle') }}</h3>
        <p class="text-sm text-slate-600">{{ t('settings.exportText') }}</p>
      </div>

      <button class="btn-secondary" @click="exportCSV">
        {{ t('settings.exportButton') }}
      </button>
    </section>

    <section class="rounded-xl border border-slate-200 p-4 space-y-3">
      <div>
        <h3 class="font-semibold">{{ t('settings.logoutTitle') }}</h3>
        <p class="text-sm text-slate-600">{{ t('settings.logoutText') }}</p>
      </div>

      <button class="btn-primary" @click="showLogoutConfirm = true">
        {{ t('actions.logout') }}
      </button>
    </section>
  </div>

  <FormConfirmation
    v-if="showLogoutConfirm"
    :headline="t('logout.title')"
    @cancel="showLogoutConfirm = false"
    @confirm="confirmLogout"
  >
    <template #message>
      {{ t('logout.question') }}
    </template>
  </FormConfirmation>
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'
import { useToast } from '~/composables/useToast'
import { useCashRegisterSettings } from '~/composables/useCashRegisterSettings'
import type { CashRegisterSettings } from '~/types/settings'

const { setPage } = usePage()
const { logout } = useAuth()
const { t, language, toggleLanguage } = useI18n()
const toast = useToast()
const { settings, loadSettings } = useCashRegisterSettings()

const showLogoutConfirm = ref(false)
const fachschaftAmount = ref('')
const isSaving = ref(false)

async function reloadSettings() {
  const previousLoaded = String(settings.value.fachschaft_payment_amount)
  await loadSettings(true)
  // Sync the form field only while it still shows the previously loaded value,
  // so a refresh never discards unsaved user input.
  if (!fachschaftAmount.value || fachschaftAmount.value === previousLoaded) {
    fachschaftAmount.value = String(settings.value.fachschaft_payment_amount)
  }
}

onMounted(reloadSettings)
useAppRefresh().onRefresh(reloadSettings)

function confirmLogout() {
  showLogoutConfirm.value = false
  setPage('Checkout')
  logout()
}

async function saveSettings() {
  if (isSaving.value) return

  const amount = Number(fachschaftAmount.value)
  if (!Number.isFinite(amount) || amount <= 0) {
    toast.error(t('settings.invalidAmount'))
    return
  }

  isSaving.value = true
  try {
    const res = await $fetch<{ ok: boolean, settings?: CashRegisterSettings, error?: string }>('/api/settings/save', {
      method: 'POST',
      body: { fachschaft_payment_amount: amount },
    })

    if (!res.ok) {
      toast.error(res.error || t('settings.saveFailed'))
      return
    }

    if (res.settings) {
      settings.value = res.settings
      fachschaftAmount.value = String(res.settings.fachschaft_payment_amount)
    }
    toast.success(t('settings.saved'))
  } catch {
    toast.error(t('settings.saveFailed'))
  } finally {
    isSaving.value = false
  }
}

async function exportCSV() {
  try {
    const res = await fetch('/api/export/csv')

    if (!res.ok) {
      toast.error(t('settings.exportFailed'))
      return
    }

    const blob = await res.blob()
    const url = window.URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = `kassensystem-export-${new Date().toISOString().slice(0,10)}.csv`
    a.click()

    window.URL.revokeObjectURL(url)
  } catch {
    toast.error(t('settings.exportFailed'))
  }
}
</script>
