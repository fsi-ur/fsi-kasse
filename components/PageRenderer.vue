<template>
  <div class="w-full">
    <component v-if="loaded" :is="currentComponent" :key="currentPage" @open-menu="$emit('openMenu')"/>
  </div>
</template>

<script setup lang="ts">
import { usePage } from '~/composables/usePage'
import { useAuth } from '~/composables/useAuth'

import CheckoutPage from '~/components/pages/Checkout.vue'
import HistoryPage from '~/components/pages/History.vue'
import FachschaftPage from '~/components/pages/Fachschaft.vue'
import OverviewPage from '~/components/pages/Overview.vue'
import LoginPage from '~/components/pages/Login.vue'
import LogoutPage from '~/components/pages/Logout.vue'
import SettingsPage from '~/components/pages/Settings.vue'

const emit = defineEmits<{
  (e: 'openMenu'): void
}>()

const { currentPage } = usePage()
const { user, fetchSession } = useAuth()

interface Page {
  component: any
  allowedRoles: string[]
}

const pages: Record<string, Page> = {
  Checkout: { component: CheckoutPage, allowedRoles: ['user', 'admin'] },
  History: { component: HistoryPage, allowedRoles: ['user', 'admin'] },
  Fachschaft: { component: FachschaftPage, allowedRoles: ['user', 'admin'] },
  Overview: { component: OverviewPage, allowedRoles: ['admin'] },
  Login: { component: LoginPage, allowedRoles: ['guest'] },
  Logout: { component: LogoutPage, allowedRoles: ['user'] },
  Settings: { component: SettingsPage, allowedRoles: ['admin'] },
}

const loaded = ref(false)

onMounted(async () => {
  await fetchSession()
  loaded.value = true

  watch(currentPage, async () => {
    if (user.value) await $fetch('/api/auth/session')
  })
})

const currentComponent = computed(() => {
  const page = pages[currentPage.value]
  if (!user.value) return LoginPage
  if (!page) return CheckoutPage

  if (page.allowedRoles.includes('guest')) return page.component

  if (page.allowedRoles.includes(user.value.role)) return page.component
  
  return LoginPage
})
</script>