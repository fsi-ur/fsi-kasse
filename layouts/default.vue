<template>
  <div class="flex min-h-screen">
    <MenuMain :items="filteredMenuItems" />

    <main class="flex-1 ml-36 p-6 bg-gray-100">
      <PageRenderer />
    </main>
  </div>
</template>

<script setup lang="ts">
import { useAuth, type UserRole } from '~/composables/useAuth'

const { hasRole } = useAuth()

const menuItems = [
  { name: 'Home', label: 'Home', icon: '/icons/home.svg', roles: ['guest' as UserRole, 'user' as UserRole, 'admin' as UserRole] },
  { name: 'About', label: 'About', icon: '/icons/about.svg', roles: ['guest' as UserRole, 'user' as UserRole, 'admin' as UserRole] },
  { name: 'Admin', label: 'Admin', icon: '/icons/settings.svg', roles: ['admin' as UserRole] }
]

const filteredMenuItems = menuItems.filter(item => hasRole(item.roles))
</script>