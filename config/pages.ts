import type { AppPage } from '~/types/page'
import LoginPage from '~/components/pages/Login.vue'
import CheckoutPage from '~/components/pages/Checkout.vue'
import HistoryPage from '~/components/pages/History.vue'
import FachschaftPage from '~/components/pages/Fachschaft.vue'
import OverviewPage from '~/components/pages/Overview.vue'
import SettingsPage from '~/components/pages/Settings.vue'

// Do not display more than 8 pages at once
export const PAGES: Record<string, AppPage> = {
  Login: { main: true, labelKey: 'pages.login', component: LoginPage, icon: 'material-symbols:login-rounded', permissions: [], allowGuest: true },
  Checkout: { main: true, labelKey: 'pages.checkout', component: CheckoutPage, icon: 'material-symbols:shopping-cart-outline-rounded', permissions: ['cash_register.use'] },
  History: { main: true, labelKey: 'pages.history', component: HistoryPage, icon: 'material-symbols:history-rounded', permissions: ['cash_register.use'] },
  Fachschaft: { main: true, labelKey: 'pages.fachschaft', component: FachschaftPage, icon: 'material-symbols:payments-outline-rounded', permissions: ['cash_register.use'] },
  Overview: { main: true, labelKey: 'pages.overview', component: OverviewPage, icon: 'material-symbols:monitoring-rounded', permissions: ['cash_register.manage'] },
  Settings: { main: true, labelKey: 'pages.settings', component: SettingsPage, icon: 'material-symbols:settings-rounded', permissions: ['cash_register.manage'], preserveOnRefresh: true },
}
