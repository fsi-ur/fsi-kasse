<template>
  <div class="flex min-h-screen">
    <MenuMain
      :pages="filteredMenuItems"
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
import { PAGES } from '~/config/pages'

const { user, fetchSession, hasPermission, hasAllPermissions } = useAuth()

const menuOpen = ref(false)
const openMenu = ref(false)
const menuCollapsed = ref(false)
const desktopMediaQuery = ref<MediaQueryList | null>(null)

const menuItems = Object.entries(PAGES).map(([name, page]) => ({ name, ...page }))

const filteredMenuItems = computed(() => {
  return menuItems.filter(it => {
    if (it.name === 'Login') return false
    if (it.allowGuest) return !user.value
    if (!user.value) return false
    if (!it.permissions.length) return true
    return it.requireAllPermissions ? hasAllPermissions(it.permissions) : hasPermission(it.permissions)
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
