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
  { name: 'Home', label: 'Home', icon: '/icon-home.svg', roles: ['user', 'admin'] },
  { name: 'About', label: 'About', icon: '/icon-settings.svg', roles: ['user', 'admin'] },
  { name: 'Admin', label: 'Admin', icon: '/icon-settings.svg', roles: ['admin'] },
  { name: 'Login', label: 'Login', icon: '/icon-settings.svg', roles: ['guest'] },
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