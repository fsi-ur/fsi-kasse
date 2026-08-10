<template>
  <div class="max-w-md mx-auto">
    <div class="bg-white p-6 rounded-xl shadow-lg space-y-4">
      <div>
        <h2 class="text-xl font-semibold">{{ t('passwordChangeRequired.title') }}</h2>
        <p class="mt-1 text-sm text-slate-600">
          {{ isConnectedMode ? t('passwordChangeRequired.connectedText') : t('passwordChangeRequired.text') }}
        </p>
      </div>

      <!-- Connected mode: the password lives in the accounting app, so offer no form here. -->
      <div v-if="isConnectedMode" class="flex items-center justify-between gap-3">
        <button type="button" class="btn-secondary" :disabled="isRechecking" @click="logout()">
          {{ t('actions.logout') }}
        </button>

        <button
          type="button"
          class="btn-primary"
          :disabled="isRechecking"
          :class="{ 'opacity-50 cursor-not-allowed': isRechecking }"
          @click="recheck"
        >
          {{ isRechecking ? t('common.loading') : t('passwordChangeRequired.recheck') }}
        </button>
      </div>

      <form v-else class="space-y-4" @submit.prevent="changePassword">
        <div class="field">
          <label for="required-current-password">{{ t('settings.currentPassword') }}</label>
          <input
            id="required-current-password"
            v-model="passwordForm.currentPassword"
            type="password"
            class="input"
            autocomplete="current-password"
            :disabled="isChangingPassword"
          >
        </div>

        <div class="field">
          <label for="required-new-password">{{ t('settings.newPassword') }}</label>
          <input
            id="required-new-password"
            v-model="passwordForm.newPassword"
            type="password"
            class="input"
            autocomplete="new-password"
            :disabled="isChangingPassword"
          >
        </div>

        <div class="field">
          <label for="required-confirm-password">{{ t('settings.confirmPassword') }}</label>
          <input
            id="required-confirm-password"
            v-model="passwordForm.confirmPassword"
            type="password"
            class="input"
            autocomplete="new-password"
            :disabled="isChangingPassword"
          >
        </div>

        <p class="text-xs text-slate-500">{{ t('settings.passwordHelp', { min: MIN_PASSWORD_LENGTH }) }}</p>

        <div class="flex items-center justify-between gap-3">
          <button type="button" class="btn-secondary" :disabled="isChangingPassword" @click="logout()">
            {{ t('actions.logout') }}
          </button>

          <button
            type="submit"
            class="btn-primary"
            :disabled="isChangingPassword"
            :class="{ 'opacity-50 cursor-not-allowed': isChangingPassword }"
          >
            {{ isChangingPassword ? t('settings.passwordSaving') : t('passwordChangeRequired.submit') }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'
import { useI18n } from '~/composables/useI18n'
import { usePage, parseDeepLinkHash } from '~/composables/usePage'
import { useToast } from '~/composables/useToast'
import { useChangePassword } from '~/composables/useChangePassword'
import { MIN_PASSWORD_LENGTH } from '~/config/validation'

const { fetchSession, logout } = useAuth()
const { setPage } = usePage()
const { t } = useI18n()
const toast = useToast()
const { isChangingPassword, passwordForm, submitPasswordChange } = useChangePassword()

const runtimeConfig = useRuntimeConfig()
const isConnectedMode = runtimeConfig.public.accountingMode === 'connected'
const isRechecking = ref(false)

function continueToApp() {
  const deepLink = parseDeepLinkHash()
  setPage(deepLink && deepLink.page !== 'Login' ? deepLink.page : 'Checkout', deepLink?.meta || undefined)
}

async function changePassword() {
  const changed = await submitPasswordChange()
  if (!changed) return

  await fetchSession()
  toast.success(t('passwordChangeRequired.success'))
  continueToApp()
}

/**
 * Connected mode only: the flag is cleared in the accounting app, so all this
 * page can do is re-read the session and let the user through once it is gone.
 */
async function recheck() {
  if (isRechecking.value) return

  isRechecking.value = true
  try {
    const current = await fetchSession()
    if (!current) return

    if (current.must_change_password) {
      toast.error(t('passwordChangeRequired.stillRequired'))
      return
    }

    toast.success(t('passwordChangeRequired.success'))
    continueToApp()
  } finally {
    isRechecking.value = false
  }
}
</script>
