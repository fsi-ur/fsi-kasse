<template>
  <div class="flex min-h-screen">
    <MenuMain :items="filteredMenuItems" />

    <main class="flex-1 ml-36 p-6 bg-gray-100">
      <PageRenderer />
    </main>
  </div>
</template>

<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'

const { user, fetchSession } = useAuth()

const menuItems = [
  { name: 'Checkout', label: 'Checkout', icon: '/icon-checkout.svg', roles: ['user', 'admin'] },
  { name: 'History', label: 'History', icon: '/icon-history.svg', roles: ['user', 'admin'] },
  { name: 'Fachschaft', label: 'Fachschaft', icon: 'icon-fachschaft.svg', roles: ['user', 'admin'] },
  { name: 'Items', label: 'Items', icon: '/icon-items.svg', roles: ['admin'] },
  { name: 'Cashiers', label: 'Cashiers', icon: '/icon-cashiers.svg', roles: ['admin'] },
  { name: 'Users', label: 'Users', icon: '/icon-users.svg', roles: ['admin'] },
]

const filteredMenuItems = computed(() => {
  return menuItems.filter(it => {
    if (it.roles.includes('guest')) return !user.value
    if (!user.value) return false
    return it.roles.includes(user.value.role)
  })
})

onMounted(() => {
  fetchSession()
})
</script>