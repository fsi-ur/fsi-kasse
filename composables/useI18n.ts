type Language = 'de' | 'en'

type MessageValue = string | MessageObject

interface MessageObject {
  [key: string]: MessageValue
}

const STORAGE_KEY = 'fsi-language'

const messages = {
  de: {
    app: { title: 'Kassensystem' },
    language: {
      current: 'Deutsch',
      switchTo: 'Zu Englisch wechseln',
      english: 'Englisch',
      german: 'Deutsch',
    },
    pages: {
      login: 'Login',
      checkout: 'Kasse',
      history: 'Verlauf',
      fachschaft: 'Fachschaft',
      overview: 'Übersicht',
      items: 'Artikel',
      cashiers: 'Kassierer',
      events: 'Veranstaltungen',
      users: 'Benutzer',
      logout: 'Abmelden',
      settings: 'Einstellungen',
    },
    actions: {
      login: 'Anmelden',
      logout: 'Abmelden',
      save: 'Speichern',
      cancel: 'Abbrechen',
      close: 'Schließen',
      confirm: 'Bestätigen',
      add: 'Hinzufügen',
      remove: 'Löschen',
      activate: 'Aktivieren',
      deactivate: 'Deaktivieren',
      refresh: 'Aktualisieren',
    },
    common: {
      name: 'Name',
      price: 'Preis',
      deposit: 'Pfand',
      active: 'Aktiv',
      yes: 'Ja',
      no: 'Nein',
      total: 'Gesamt',
      loading: 'Lädt…',
      noEntries: 'Keine Einträge',
      collapseMenu: 'Einklappen',
      expandMenu: 'Ausklappen',
      notAuthorized: 'Nicht berechtigt.',
      unknownError: 'Unbekannter Fehler',
    },
    login: {
      title: 'Anmelden',
      username: 'Benutzername',
      password: 'Passwort',
      error: 'Anmeldung fehlgeschlagen',
    },
    logout: {
      title: 'Abmelden?',
      question: 'Möchtest du dich wirklich abmelden?',
    },
    select: {
      cashier: 'Kassierer wählen',
      event: 'Veranstaltung wählen',
      noCashiers: 'Keine passenden Kassierer',
      noEvents: 'Keine passenden Veranstaltungen',
    },
    checkout: {
      title: 'Kasse',
      items: 'Artikel',
      currentOrder: 'Aktuelle Bestellung',
      noItems: 'Noch keine Artikel hinzugefügt.',
      depositSuffix: '(+ {amount} € Pfand)',
      markFachschaft: 'Als Fachschaftsbestellung markieren',
      fachschaftMarked: 'Fachschaftsbestellung ✓',
      saveOrder: 'Bestellung speichern',
      confirmTitle: 'Bestellung bestätigen',
      confirmQuestion: 'Möchtest du diese Bestellung wirklich anlegen?',
      saveFailed: 'Bestellung konnte nicht gespeichert werden.',
      saved: 'Bestellung gespeichert.',
    },
    history: {
      title: 'Bestellverlauf',
      order: 'Bestellung #{id}',
      cashier: 'Kassierer: {name}',
      fachschaftBadge: 'Fachschaftsbestellung (kostenlos)',
      noOrders: 'Noch keine Bestellungen.',
    },
    fachschaft: {
      title: 'Fachschaftszahlungen',
      memberName: 'Mitglied',
      memberPlaceholder: 'Mitglied wählen',
      noMembers: 'Keine passenden Mitglieder',
      markPaid: 'Als bezahlt markieren ({amount} €)',
      paymentHistory: 'Zahlungsverlauf',
      noPayments: 'Noch keine Zahlungen.',
      confirmTitle: 'Zahlung bestätigen',
      confirmQuestion: 'Hat {name} wirklich die {amount} € bezahlt?',
      payFailed: 'Zahlung konnte nicht gespeichert werden.',
    },
    overview: {
      title: 'Übersicht',
      selectEvent: 'Bitte eine Veranstaltung auswählen.',
      regularSales: 'Reguläre Verkäufe',
      fachschaftGivenOut: 'Fachschaft (ausgegeben)',
      fachschaftPayments: 'Fachschaftszahlungen',
      paidMembers: 'Zahlende Mitglieder',
      revenue: 'Umsatz',
      lastHour: 'Letzte Stunde',
      itemsSold: 'Verkaufte Artikel',
      pcs: 'Stk.',
      hourlySales: 'Umsatz pro Stunde',
      noHourlySales: 'Noch keine Verkäufe für diese Veranstaltung.',
    },
    items: {
      title: 'Artikelverwaltung',
      newItem: 'Neuer Artikel',
      itemName: 'Artikelname',
      allItems: 'Alle Artikel',
      none: 'Keine Artikel vorhanden',
      deleteConfirmTitle: 'Artikel löschen?',
      deleteConfirmQuestion: 'Soll der Artikel {name} wirklich gelöscht werden?',
    },
    cashiers: {
      title: 'Kassiererverwaltung',
      newCashier: 'Neuer Kassierer',
      cashierName: 'Kassierername',
      allCashiers: 'Alle Kassierer',
      none: 'Keine Kassierer vorhanden',
      connectedNotice: 'Kassierer werden im verbundenen Modus von der Buchhaltung verwaltet. Das Kassensystem kann diese Mitglieder hier verwenden, aber nicht lokal anlegen, bearbeiten, aktivieren oder löschen.',
      deleteConfirmTitle: 'Kassierer löschen?',
      deleteConfirmQuestion: 'Soll der Kassierer {name} wirklich gelöscht werden?',
    },
    events: {
      title: 'Veranstaltungsverwaltung',
      newEvent: 'Neue Veranstaltung',
      eventName: 'Veranstaltungsname',
      allEvents: 'Alle Veranstaltungen',
      none: 'Keine Veranstaltungen vorhanden',
      connectedNotice: 'Veranstaltungen werden im verbundenen Modus von der Buchhaltung verwaltet. Das Kassensystem kann diese Veranstaltungen verwenden, aber nicht lokal anlegen, bearbeiten, aktivieren oder löschen.',
      deleteConfirmTitle: 'Veranstaltung löschen?',
      deleteConfirmQuestion: 'Soll die Veranstaltung {name} wirklich gelöscht werden?',
    },
    users: {
      title: 'Benutzerverwaltung',
      createUser: 'Neuen Benutzer anlegen',
      connectedNotice: 'Benutzer werden im verbundenen Modus von der Buchhaltung verwaltet und können dort angelegt werden.',
      username: 'Benutzername',
      password: 'Passwort',
      role: 'Rolle',
      roleUser: 'Benutzer',
      roleAdmin: 'Administrator',
      create: 'Benutzer anlegen',
      created: 'Benutzer erfolgreich erstellt.',
      allUsers: 'Alle Benutzer',
      id: 'ID',
      createdAt: 'Erstellt',
      none: 'Keine Benutzer vorhanden',
    },
    settings: {
      title: 'Einstellungen',
      tabs: {
        general: 'Allgemein',
        items: 'Artikel',
        cashiers: 'Kassierer',
        events: 'Veranstaltungen',
        users: 'Benutzer',
      },
      loadFailed: 'Einstellungen konnten nicht geladen werden.',
      languageTitle: 'Sprache',
      languageText: 'Aktuelle Sprache: {language}',
      cashRegisterTitle: 'Kasseneinstellungen',
      cashRegisterText: 'Diese Einstellungen gelten für das gesamte Kassensystem. Im verbundenen Modus können sie auch aus der Buchhaltung heraus bearbeitet werden.',
      fachschaftPaymentAmount: 'Betrag der Fachschaftszahlung (€)',
      save: 'Einstellungen speichern',
      saving: 'Einstellungen werden gespeichert…',
      saved: 'Einstellungen wurden gespeichert.',
      saveFailed: 'Einstellungen konnten nicht gespeichert werden.',
      invalidAmount: 'Bitte einen gültigen Betrag größer als 0 eingeben.',
      exportTitle: 'Datenexport',
      exportText: 'Lade alle Bestellungen und Zahlungen als CSV-Datei herunter.',
      exportButton: 'CSV exportieren',
      exportFailed: 'Export konnte nicht erstellt werden.',
      logoutTitle: 'Sitzung',
      logoutText: 'Melde das aktuelle Konto von dieser Anwendung ab.',
    },
  },
  en: {
    app: { title: 'Kassensystem' },
    language: {
      current: 'English',
      switchTo: 'Switch to German',
      english: 'English',
      german: 'German',
    },
    pages: {
      login: 'Login',
      checkout: 'Checkout',
      history: 'History',
      fachschaft: 'Fachschaft',
      overview: 'Overview',
      items: 'Items',
      cashiers: 'Cashiers',
      events: 'Events',
      users: 'Users',
      logout: 'Logout',
      settings: 'Settings',
    },
    actions: {
      login: 'Login',
      logout: 'Logout',
      save: 'Save',
      cancel: 'Cancel',
      close: 'Close',
      confirm: 'Confirm',
      add: 'Add',
      remove: 'Delete',
      activate: 'Activate',
      deactivate: 'Deactivate',
      refresh: 'Refresh',
    },
    common: {
      name: 'Name',
      price: 'Price',
      deposit: 'Deposit',
      active: 'Active',
      yes: 'Yes',
      no: 'No',
      total: 'Total',
      loading: 'Loading…',
      noEntries: 'No entries',
      collapseMenu: 'Collapse',
      expandMenu: 'Expand',
      notAuthorized: 'Not authorized.',
      unknownError: 'Unknown error',
    },
    login: {
      title: 'Sign in',
      username: 'Username',
      password: 'Password',
      error: 'Login failed',
    },
    logout: {
      title: 'Log out?',
      question: 'Do you really want to log out?',
    },
    select: {
      cashier: 'Choose cashier',
      event: 'Choose event',
      noCashiers: 'No matching cashiers',
      noEvents: 'No matching events',
    },
    checkout: {
      title: 'Checkout',
      items: 'Items',
      currentOrder: 'Current order',
      noItems: 'No items added yet.',
      depositSuffix: '(+ {amount} € deposit)',
      markFachschaft: 'Mark as Fachschaft order',
      fachschaftMarked: 'Fachschaft order ✓',
      saveOrder: 'Save order',
      confirmTitle: 'Confirm order',
      confirmQuestion: 'Do you really want to create this order?',
      saveFailed: 'Order could not be saved.',
      saved: 'Order saved.',
    },
    history: {
      title: 'Order history',
      order: 'Order #{id}',
      cashier: 'Cashier: {name}',
      fachschaftBadge: 'Fachschaft order (free)',
      noOrders: 'No orders yet.',
    },
    fachschaft: {
      title: 'Fachschaft payments',
      memberName: 'Member',
      memberPlaceholder: 'Choose member',
      noMembers: 'No matching members',
      markPaid: 'Mark paid ({amount} €)',
      paymentHistory: 'Payment history',
      noPayments: 'No payments yet.',
      confirmTitle: 'Confirm payment',
      confirmQuestion: 'Did {name} really pay the {amount} €?',
      payFailed: 'Payment could not be saved.',
    },
    overview: {
      title: 'Overview',
      selectEvent: 'Please select an event.',
      regularSales: 'Regular sales',
      fachschaftGivenOut: 'Fachschaft (given out)',
      fachschaftPayments: 'Fachschaft payments',
      paidMembers: 'Paid members',
      revenue: 'Revenue',
      lastHour: 'Last hour',
      itemsSold: 'Items sold',
      pcs: 'pcs',
      hourlySales: 'Revenue per hour',
      noHourlySales: 'No sales for this event yet.',
    },
    items: {
      title: 'Item management',
      newItem: 'New item',
      itemName: 'Item name',
      allItems: 'All items',
      none: 'No items yet',
      deleteConfirmTitle: 'Delete item?',
      deleteConfirmQuestion: 'Do you really want to delete the item {name}?',
    },
    cashiers: {
      title: 'Cashier management',
      newCashier: 'New cashier',
      cashierName: 'Cashier name',
      allCashiers: 'All cashiers',
      none: 'No cashiers yet',
      connectedNotice: 'Cashiers are managed by the accounting application in connected mode. The cash register can use those members here, but it cannot create, edit, activate, or delete them locally.',
      deleteConfirmTitle: 'Delete cashier?',
      deleteConfirmQuestion: 'Do you really want to delete the cashier {name}?',
    },
    events: {
      title: 'Event management',
      newEvent: 'New event',
      eventName: 'Event name',
      allEvents: 'All events',
      none: 'No events yet',
      connectedNotice: 'Events are managed by the accounting application in connected mode. The cash register can use those events, but it cannot create, edit, activate, or delete them locally.',
      deleteConfirmTitle: 'Delete event?',
      deleteConfirmQuestion: 'Do you really want to delete the event {name}?',
    },
    users: {
      title: 'User management',
      createUser: 'Create new user',
      connectedNotice: 'Users are managed by the accounting application in connected mode and can be created there.',
      username: 'Username',
      password: 'Password',
      role: 'Role',
      roleUser: 'User',
      roleAdmin: 'Administrator',
      create: 'Create user',
      created: 'User created successfully.',
      allUsers: 'All users',
      id: 'ID',
      createdAt: 'Created',
      none: 'No users yet',
    },
    settings: {
      title: 'Settings',
      tabs: {
        general: 'General',
        items: 'Items',
        cashiers: 'Cashiers',
        events: 'Events',
        users: 'Users',
      },
      loadFailed: 'Settings could not be loaded.',
      languageTitle: 'Language',
      languageText: 'Current language: {language}',
      cashRegisterTitle: 'Cash register settings',
      cashRegisterText: 'These settings apply to the whole cash register. In connected mode they can also be edited from the accounting application.',
      fachschaftPaymentAmount: 'Fachschaft payment amount (€)',
      save: 'Save settings',
      saving: 'Saving settings…',
      saved: 'Settings saved.',
      saveFailed: 'Settings could not be saved.',
      invalidAmount: 'Please enter a valid amount greater than 0.',
      exportTitle: 'Data export',
      exportText: 'Download all orders and payments as a CSV file.',
      exportButton: 'Export CSV',
      exportFailed: 'Export could not be created.',
      logoutTitle: 'Session',
      logoutText: 'Sign the current account out of this application.',
    },
  },
} as const satisfies Record<Language, Record<string, MessageValue>>

function getPathValue(source: Record<string, MessageValue>, path: string): string | undefined {
  const segments = path.split('.')
  let current: MessageValue | undefined = source

  for (const segment of segments) {
    if (!current || typeof current === 'string') return undefined
    current = current[segment]
  }

  return typeof current === 'string' ? current : undefined
}

function interpolate(template: string, params?: Record<string, string | number>) {
  if (!params) return template
  return Object.entries(params).reduce((result, [key, value]) => {
    return result.replaceAll(`{${key}}`, String(value))
  }, template)
}

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
    const current = getPathValue(messages[language.value], path)
    const fallback = getPathValue(messages.en, path) ?? path
    return interpolate(current ?? fallback, params)
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
