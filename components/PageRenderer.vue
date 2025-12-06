<template>
  <div class="w-full">
    <component :is="currentComponent" />
  </div>
</template>

<script setup lang="ts">
import { usePage } from '~/composables/usePage'
import { useAuth } from '~/composables/useAuth'

import HomePage from '~/components/pages/Home.vue'
import AboutPage from '~/components/pages/About.vue'
import AdminPage from '~/components/pages/Admin.vue'

const { currentPage } = usePage()
const { hasRole } = useAuth()

interface Page {
  component: any
  allowedRoles: ('guest' | 'user' | 'admin')[]
}

const pages: Record<string, Page> = {
  Home: { component: HomePage, allowedRoles: ['guest', 'user', 'admin'] },
  About: { component: AboutPage, allowedRoles: ['guest', 'user', 'admin'] },
  Admin: { component: AdminPage, allowedRoles: ['admin'] }
}

const currentComponent = computed(() => {
  const page = pages[currentPage.value]
  if (!page) return HomePage
  if (hasRole(page.allowedRoles)) return page.component
  return HomePage
})
</script>