<template>
  <div class="w-full">
    <component v-if="loaded" :is="currentComponent" :key="componentKey" @open-menu="$emit('openMenu')"/>
  </div>
</template>

<script setup lang="ts">
import { usePage } from '~/composables/usePage'
import { useAuth } from '~/composables/useAuth'
import { useAppRefresh } from '~/composables/useAppRefresh'
import { PAGES } from '~/config/pages'

import LoginPage from '~/components/pages/Login.vue'
import CheckoutPage from '~/components/pages/Checkout.vue'
import ChangePasswordRequiredPage from '~/components/pages/ChangePasswordRequired.vue'

const emit = defineEmits<{
  (e: 'openMenu'): void
}>()

const { currentPage } = usePage()
const { user, fetchSession, hasPermission, hasAllPermissions } = useAuth()
const { refreshKey } = useAppRefresh()

const loaded = ref(false)

onMounted(async () => {
  await fetchSession()
  loaded.value = true

  watch(currentPage, async () => {
    if (user.value) await fetchSession()
  })
})

const currentComponent = computed(() => {
  const page = PAGES[currentPage.value]
  if (!user.value) return LoginPage
  if (user.value.must_change_password) return ChangePasswordRequiredPage
  if (!page) return CheckoutPage
  if (page.allowGuest) return page.component
  if (!page.permissions.length) return page.component
  if (page.requireAllPermissions ? hasAllPermissions(page.permissions) : hasPermission(page.permissions)) {
    return page.component
  }

  return LoginPage
})

const componentKey = computed(() => {
  const page = PAGES[currentPage.value]
  if (page?.preserveOnRefresh) return currentPage.value

  return `${currentPage.value}:${refreshKey.value}`
})
</script>
