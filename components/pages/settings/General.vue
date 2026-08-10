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
        <h3 class="font-semibold">{{ t('settings.passwordTitle') }}</h3>
        <p class="text-sm text-slate-600">
          {{ isConnectedMode ? t('settings.credentialsConnectedNotice') : t('settings.passwordText') }}
        </p>
      </div>

      <button class="btn-secondary" :disabled="isConnectedMode" @click="openPasswordModal">
        {{ t('settings.passwordOpen') }}
      </button>
    </section>

    <section class="rounded-xl border border-slate-200 p-4 space-y-3">
      <div>
        <h3 class="font-semibold">{{ t('settings.logoutTitle') }}</h3>
        <p class="text-sm text-slate-600">{{ t('settings.logoutText') }}</p>
      </div>

      <div class="flex flex-col gap-3 sm:flex-row">
        <button class="btn-primary" @click="showLogoutConfirm = true">
          {{ t('actions.logout') }}
        </button>

        <button
          v-if="!isConnectedMode"
          class="btn-secondary"
          :disabled="isLoggingOutAll"
          :class="{ 'opacity-50 cursor-not-allowed': isLoggingOutAll }"
          @click="showLogoutAllConfirm = true"
        >
          {{ isLoggingOutAll ? t('settings.logoutAllLoading') : t('settings.logoutAll') }}
        </button>
      </div>
    </section>
  </div>

  <CommonModal v-model="showPasswordModal" :title="t('settings.passwordTitle')" @close="closePasswordModal">
    <p class="text-sm text-slate-600">{{ t('settings.passwordSessionText') }}</p>

    <form class="grid gap-4" @submit.prevent="changePassword">
      <div class="field">
        <label for="current-password">{{ t('settings.currentPassword') }}</label>
        <input
          id="current-password"
          v-model="passwordForm.currentPassword"
          type="password"
          class="input"
          autocomplete="current-password"
          :disabled="isChangingPassword"
        >
      </div>

      <div class="field">
        <label for="new-password">{{ t('settings.newPassword') }}</label>
        <input
          id="new-password"
          v-model="passwordForm.newPassword"
          type="password"
          class="input"
          autocomplete="new-password"
          :disabled="isChangingPassword"
        >
      </div>

      <div class="field">
        <label for="confirm-password">{{ t('settings.confirmPassword') }}</label>
        <input
          id="confirm-password"
          v-model="passwordForm.confirmPassword"
          type="password"
          class="input"
          autocomplete="new-password"
          :disabled="isChangingPassword"
        >
      </div>

      <p class="text-xs text-slate-500">{{ t('settings.passwordHelp', { min: MIN_PASSWORD_LENGTH }) }}</p>
    </form>

    <template #footer>
      <CommonFormActions
        :cancel-label="t('actions.cancel')"
        :submit-label="isChangingPassword ? t('settings.passwordSaving') : t('settings.passwordSave')"
        :save-disabled="isChangingPassword"
        @cancel="closePasswordModal"
        @submit="changePassword"
      />
    </template>
  </CommonModal>

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

  <FormConfirmation
    v-if="showLogoutAllConfirm"
    :headline="t('settings.logoutAllConfirmTitle')"
    @cancel="showLogoutAllConfirm = false"
    @confirm="confirmLogoutAll"
  >
    <template #message>
      {{ t('settings.logoutAllConfirmText') }}
    </template>
  </FormConfirmation>
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'
import { useToast } from '~/composables/useToast'
import { useChangePassword } from '~/composables/useChangePassword'
import { MIN_PASSWORD_LENGTH } from '~/config/validation'
import type { LogoutAllResponse } from '~/server/api/auth/logout-all.post'

const { setPage } = usePage()
const { logout, redirectToLogin } = useAuth()
const { t, language, toggleLanguage } = useI18n()
const toast = useToast()
const { isChangingPassword, passwordForm, resetPasswordForm, submitPasswordChange } = useChangePassword()

const runtimeConfig = useRuntimeConfig()
const isConnectedMode = runtimeConfig.public.accountingMode === 'connected'

const showLogoutConfirm = ref(false)
const showLogoutAllConfirm = ref(false)
const showPasswordModal = ref(false)
const isLoggingOutAll = ref(false)

function openPasswordModal() {
  if (isConnectedMode) return
  resetPasswordForm()
  showPasswordModal.value = true
}

function closePasswordModal() {
  if (isChangingPassword.value) return
  showPasswordModal.value = false
  resetPasswordForm()
}

async function changePassword() {
  const changed = await submitPasswordChange()
  if (!changed) return

  showPasswordModal.value = false
  toast.success(t('settings.passwordSaved'))
}

function confirmLogout() {
  showLogoutConfirm.value = false
  setPage('Checkout')
  logout()
}

async function confirmLogoutAll() {
  if (isLoggingOutAll.value) return

  isLoggingOutAll.value = true
  try {
    const res = await $fetch<LogoutAllResponse>('/api/auth/logout-all', { method: 'POST' })
    if (!res.ok) {
      toast.error(res.error || t('settings.logoutAllFailed'))
      return
    }

    showLogoutAllConfirm.value = false
    setPage('Checkout')
    redirectToLogin()
  } catch {
    toast.error(t('settings.logoutAllFailed'))
  } finally {
    isLoggingOutAll.value = false
  }
}
</script>
