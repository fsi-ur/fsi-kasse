import { translate, type Language } from '~/shared/i18n'

const STORAGE_KEY = 'fsi-language'

export const useI18n = () => {
  const language = useState<Language>('app_language', () => 'de')
  const locale = computed(() => language.value === 'de' ? 'de-DE' : 'en-US')

  function setLanguage(next: Language) {
    language.value = next
    if (import.meta.client) {
      localStorage.setItem(STORAGE_KEY, next)
      document.documentElement.lang = next
    }
  }

  function toggleLanguage() {
    setLanguage(language.value === 'de' ? 'en' : 'de')
  }

  function t(path: string, params?: Record<string, string | number>) {
    return translate(language.value, path, params)
  }

  if (import.meta.client) {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'de' || stored === 'en') {
      language.value = stored
    }
    document.documentElement.lang = language.value
  }

  return {
    language,
    locale,
    t,
    setLanguage,
    toggleLanguage,
  }
}
