<template>
  <div class="max-w-md mx-auto">
    <div class="bg-white p-6 rounded-xl shadow-lg">
      <h2 class="text-xl font-semibold mb-4">{{ t('login.title') }}</h2>

      <form @submit.prevent="doLogin" class="space-y-4">
        <div class="field">
          <label>{{ t('login.username') }}</label>
          <input v-model="username" class="input" />
        </div>

        <div class="field">
          <label>{{ t('login.password') }}</label>
          <input v-model="password" type="password" class="input" />
        </div>

        <div class="flex items-center justify-between">
          <div v-if="error" class="text-sm text-danger-600">{{ error }}</div>
          <button type="submit" class="btn-primary ml-auto">{{ t('actions.login') }}</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useAuth } from '~/composables/useAuth'
import { useI18n } from '~/composables/useI18n'
import { usePage, parseDeepLinkHash } from '~/composables/usePage'

const username = ref('')
const password = ref('')
const error = ref('')

const { login } = useAuth()
const { setPage, consumePendingLoginTarget } = usePage()
const { t } = useI18n()

const errorMessagesByCode: Record<string, string> = {
  missing_credentials: 'login.errorMissingCredentials',
  invalid_credentials: 'login.errorInvalidCredentials',
  inactive_user: 'login.errorInactiveUser',
  not_authorized: 'login.errorNotAuthorized',
  password_change_required: 'login.passwordChangeRequiredConnected',
  server_error: 'login.errorServer',
  network_error: 'login.errorNetwork',
  session_not_established: 'login.errorSessionNotEstablished',
}

async function doLogin() {
  error.value = ''
  const res = await login(username.value, password.value)
  if (res.ok) {
    // Return to the page the session was lost on, then fall back to the URL hash
    const pendingTarget = consumePendingLoginTarget()
    if (pendingTarget) {
      setPage(pendingTarget.page, pendingTarget.meta || undefined)
      return
    }

    const deepLink = parseDeepLinkHash()
    if (deepLink && deepLink.page !== 'Login') {
      setPage(deepLink.page, deepLink.meta || undefined)
    } else {
      setPage('Checkout')
    }
  } else {
    const key = res.code ? errorMessagesByCode[res.code] : undefined
    error.value = key ? t(key) : (res.error || t('login.error'))
  }
}
</script>
