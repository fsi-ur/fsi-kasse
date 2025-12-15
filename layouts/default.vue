<template>
  <div class="flex min-h-screen">
    <MenuMain :items="filteredMenuItems" :open="menuOpen" @close="menuOpen = false" />

    <main class="flex-1 md:ml-36 p-6 bg-gray-100" @click="handleClick">
      <PageRenderer @open-menu="handleOpen" />
    </main>
  </div>
</template>

<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'

const { user, fetchSession } = useAuth()

const menuOpen = ref(false)
const openMenu = ref(false)

const menuItems = [
  { name: 'Checkout', label: 'Checkout', icon: 'ph:shopping-cart-simple', roles: ['user', 'admin'] },
  { name: 'History', label: 'History', icon: 'ph:clock-counter-clockwise', roles: ['user', 'admin'] },
  { name: 'Fachschaft', label: 'Fachschaft', icon: 'fa7-solid:money-bill-1', roles: ['user', 'admin'] },
  { name: 'Items', label: 'Items', icon: 'ph:package', roles: ['admin'] },
  { name: 'Cashiers', label: 'Cashiers', icon: 'ph:storefront', roles: ['admin'] },
  { name: 'Users', label: 'Users', icon: 'ph:users-three', roles: ['admin'] },
  { name: 'Logout', label: 'Logout', icon: 'line-md:log-out', roles: ['user', 'admin'] },
]

const filteredMenuItems = computed(() => {
  return menuItems.filter(it => {
    if (it.roles.includes('guest')) return !user.value
    if (!user.value) return false
    return it.roles.includes(user.value.role)
  })
})

function handleOpen() {
  openMenu.value = true
  menuOpen.value = true
}

function handleClick() {
  if (openMenu.value) {
    openMenu.value = false
  } else {
    menuOpen.value = false
  }
}

onMounted(() => {
  fetchSession()
})
</script>