<template>
  <div class="flex min-h-screen">
    <MenuMain
      :items="filteredMenuItems"
      :open="menuOpen"
      :collapsed="menuCollapsed"
      @close="menuOpen = false"
      @toggle-collapse="toggleDesktopMenu"
    />

    <main :class="['flex-1 p-6 bg-gray-100 transition-[margin] duration-200', menuCollapsed ? 'md:ml-18' : 'md:ml-40']" @click="handleClick">
      <PageRenderer @open-menu="handleOpen" />
    </main>

    <ToastViewport />
  </div>
</template>

<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'

const { user, fetchSession } = useAuth()

const menuOpen = ref(false)
const openMenu = ref(false)
const menuCollapsed = ref(false)
const desktopMediaQuery = ref<MediaQueryList | null>(null)

const menuItems = [
  { name: 'Checkout', labelKey: 'pages.checkout', icon: 'ph:shopping-cart-simple', roles: ['user', 'admin'] },
  { name: 'History', labelKey: 'pages.history', icon: 'ph:clock-counter-clockwise', roles: ['user', 'admin'] },
  { name: 'Fachschaft', labelKey: 'pages.fachschaft', icon: 'fa7-solid:money-bill-1', roles: ['user', 'admin'] },
  { name: 'Overview', labelKey: 'pages.overview', icon: 'streamline-flex:subscription-cashflow', roles: ['admin'] },
  { name: 'Logout', labelKey: 'pages.logout', icon: 'fe:logout', roles: ['user'] },
  { name: 'Settings', labelKey: 'pages.settings', icon: 'material-symbols:settings-outline', roles: ['admin'] },
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

function syncMenuMode(event?: MediaQueryList | MediaQueryListEvent) {
  const matchesDesktop = event?.matches ?? desktopMediaQuery.value?.matches ?? false
  if (matchesDesktop) {
    menuOpen.value = false
    return
  }

  menuCollapsed.value = true
  menuOpen.value = false
  openMenu.value = false
}

function toggleDesktopMenu() {
  if (!desktopMediaQuery.value?.matches) return
  menuCollapsed.value = !menuCollapsed.value
}

onMounted(() => {
  fetchSession()
  desktopMediaQuery.value = window.matchMedia('(min-width: 768px)')
  syncMenuMode(desktopMediaQuery.value)
  desktopMediaQuery.value.addEventListener('change', syncMenuMode)
})

onBeforeUnmount(() => {
  desktopMediaQuery.value?.removeEventListener('change', syncMenuMode)
})
</script>
