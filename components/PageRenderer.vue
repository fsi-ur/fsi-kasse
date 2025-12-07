<template>
  <div class="w-full">
    <component v-if="loaded" :is="currentComponent" />
  </div>
</template>

<script setup lang="ts">
import { usePage } from '~/composables/usePage'
import { useAuth } from '~/composables/useAuth'

import CheckoutPage from '~/components/pages/Checkout.vue'
import AboutPage from '~/components/pages/About.vue'
import ItemsPage from '~/components/pages/Items.vue'
import CashiersPage from '~/components/pages/Cashiers.vue'
import UsersPage from '~/components/pages/Users.vue'
import LoginPage from '~/components/pages/Login.vue'

const { currentPage } = usePage()
const { user, fetchSession } = useAuth()

interface Page {
  component: any
  allowedRoles: string[]
}

const pages: Record<string, Page> = {
  Checkout: { component: CheckoutPage, allowedRoles: ['user', 'admin'] },
  About: { component: AboutPage, allowedRoles: ['user', 'admin'] },
  Items: { component: ItemsPage, allowedRoles: ['admin'] },
  Cashiers: { component: CashiersPage, allowedRoles: ['admin'] },
  Users: { component: UsersPage, allowedRoles: ['admin'] },
  Login: { component: LoginPage, allowedRoles: ['guest'] },
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