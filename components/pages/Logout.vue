<template>
  <FormConfirmation :headline="t('logout.title')" @cancel="cancel" @confirm="confirm">
    <template #message>
      {{ t('logout.question') }}
    </template>
  </FormConfirmation>
</template>
<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'

const { setPage } = usePage()
const { user, logout, fetchSession } = useAuth()
const { t } = useI18n()

function confirm() {
  setPage('Checkout')
  logout()
}

async function cancel() {
  await fetchSession()
  if (!user.value) {
    setPage('Login')
  } else {
    setPage('Checkout')
  }
}
</script>
