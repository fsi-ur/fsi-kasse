<script setup lang="ts">
const { baseURL } = useRuntimeConfig().app

useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no'},
    { name: 'theme-color', content: '#ffffff' },
    { name: 'mobile-web-app-capable', content: 'yes' },
    { name: 'apple-mobile-web-app-capable', content: 'yes' },
    { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
    { name: 'apple-mobile-web-app-title', content: 'Kassensystem' }
  ],
  link: [
    { rel: 'apple-touch-icon', href: `${baseURL}logo-192x192.png` }
  ]
})
</script>
<template>
  <NuxtPwaManifest />
  <NuxtLayout />
</template>
