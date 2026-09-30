import tailwindcss from "@tailwindcss/vite";

const baseURL = process.env.APP_BASE_URL || '/'
// Changes on every build, so the service worker re-fetches the app shell
// whenever the bundle it references changes.
const buildRevision = Date.now().toString(36)

export default defineNuxtConfig({
  compatibilityDate: '2025-12-05',
  devtools: { enabled: false },
  ssr: false,
  modules: ['@vite-pwa/nuxt', '@nuxt/icon'],
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    public: {
      accountingMode: process.env.ACCOUNTING_MODE || 'standalone',
    },
  },
  app: {
    // Allow hosting under a subpath like /kasse
    baseURL,
  },
  icon: {
    clientBundle: {
      scan: {
        globInclude: ['app.vue', 'components/**/*.vue', 'layouts/**/*.vue', 'config/**/*.ts', 'composables/**/*.ts'],
      },
      includeCustomCollections: true,
    },
  },
  vite: {
    plugins: [tailwindcss()]
  },
  pages: false,
  pwa: {
    registerType: 'prompt',
    workbox: {
      globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2,webmanifest}'],
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      additionalManifestEntries: [{ url: baseURL, revision: buildRevision }],
      navigateFallback: baseURL,
      navigateFallbackDenylist: [/\/api\//],
    },
    manifest: {
      name: 'Kassensystem',
      short_name: 'kassensystem',
      theme_color: '#ffffff',
      background_color: '#ffffff',
      display: 'standalone',
      orientation: 'portrait',
      icons: [
        {
          src: '/logo-192x192.png',
          sizes: '192x192',
          type: 'image/png'
        },
        {
          src: '/logo-512x512.png',
          sizes: '512x512',
          type: 'image/png'
        },
        {
          src: '/logo-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable'
        }
      ]
    }
  }
})
