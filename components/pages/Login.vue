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
          <div v-if="error" class="text-sm text-red-600">{{ error }}</div>
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

const username = ref('')
const password = ref('')
const error = ref('')

const { login, fetchSession } = useAuth()
const { t } = useI18n()

async function doLogin() {
  error.value = ''
  const res = await login(username.value, password.value)
  if (res?.ok) {
    await fetchSession()
    return
  }
  error.value = res?.error || t('login.error')
}
</script>
