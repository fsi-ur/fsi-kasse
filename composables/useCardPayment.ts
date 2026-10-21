import { usePersistedState } from '~/composables/usePersistedState'
import { cachedFetch } from '~/composables/useCachedFetch'
import { useCashRegisterSettings } from '~/composables/useCashRegisterSettings'
import { useConnectivity } from '~/composables/useConnectivity'
import { useI18n } from '~/composables/useI18n'
import type { CheckoutPayload, FachschaftPayPayload } from '~/composables/useOfflineQueue'

export type CardPaymentKind = 'checkout' | 'fachschaft_payment'
export type CardPaymentStatus = 'created' | 'processing' | 'successful' | 'failed' | 'booked' | 'booking_failed' | 'resolved'

/** What the server tells a till about its payment (serializeCardPayment). */
export interface CardPaymentState {
  client_uuid: string
  kind: CardPaymentKind
  status: CardPaymentStatus
  amount: number
  tip_amount: number | null
  charged_amount: number | null
  failure_reason: string | null
  booking_error: string | null
  transaction_code: string | null
  order_id: number | null
  fachschaft_payment_id: number | null
  /** The terminal asks for a tip on this payment. */
  tip_prompt: boolean
  stale: boolean
}

/** The payment this device is waiting for; persisted so a reload resumes it. */
export interface ActiveCardPayment {
  client_uuid: string
  kind: CardPaymentKind
  amount: number
  standName: string | null
  readerName: string | null
  startedAt: number
}

const POLL_INTERVAL_MS = 1500
export const UNCLEAR_AFTER_MS = 90_000

function restoreActive(stored: any): ActiveCardPayment | null | undefined {
  if (stored === null) return null
  if (!stored || typeof stored.client_uuid !== 'string') return undefined
  if (stored.kind !== 'checkout' && stored.kind !== 'fachschaft_payment') return undefined
  return {
    client_uuid: stored.client_uuid,
    kind: stored.kind,
    amount: Number(stored.amount) || 0,
    standName: stored.standName ?? null,
    readerName: stored.readerName ?? null,
    startedAt: Number(stored.startedAt) || Date.now(),
  }
}

// Module-level singleton: one terminal payment per device at a time, shared by
// Checkout and Fachschaft (the polling must not die with a component).
const payment = ref<CardPaymentState | null>(null)
const starting = ref(false)
const now = ref(Date.now())
let pollTimer: ReturnType<typeof setTimeout> | null = null
let clockTimer: ReturnType<typeof setInterval> | null = null

function isPending(state: CardPaymentState | null) {
  return !state || state.status === 'created' || state.status === 'processing' || state.status === 'successful'
}

export const useCardPayment = () => {
  const active = usePersistedState<ActiveCardPayment | null>('activeCardPayment', () => null, restoreActive)
  const { t } = useI18n()

  function stopPolling() {
    if (pollTimer) clearTimeout(pollTimer)
    pollTimer = null
    if (clockTimer) clearInterval(clockTimer)
    clockTimer = null
  }

  async function check() {
    const current = active.value
    if (!current) return
    try {
      const res = await $fetch<any>(`/api/card-payments/${current.client_uuid}`)
      if (active.value?.client_uuid !== current.client_uuid) return
      if (res.ok) {
        payment.value = res.payment
      } else if (res.error === 'Kartenzahlung nicht gefunden') {
        // The server never stored it (e.g. a restored snapshot): nothing was charged through us.
        payment.value = {
          client_uuid: current.client_uuid,
          kind: current.kind,
          status: 'failed',
          amount: current.amount,
          tip_amount: null,
          charged_amount: null,
          failure_reason: res.error,
          booking_error: null,
          transaction_code: null,
          order_id: null,
          fachschaft_payment_id: null,
          tip_prompt: false,
          stale: false,
        }
      }
    } catch {
      // Offline or a hiccup: keep waiting, the payment lives on the server.
    }
  }

  function schedule() {
    if (pollTimer) clearTimeout(pollTimer)
    pollTimer = setTimeout(async () => {
      await check()
      if (active.value && isPending(payment.value)) schedule()
      else stopPolling()
    }, POLL_INTERVAL_MS)
  }

  function resume() {
    if (!active.value || !import.meta.client) return
    clockTimer ??= setInterval(() => { now.value = Date.now() }, 1000)
    if (payment.value?.client_uuid !== active.value.client_uuid) payment.value = null
    if (isPending(payment.value)) schedule()
  }

  /**
   * Starts a payment on the terminal of `standId`. The server validates the
   * payload exactly like the cash endpoints and computes the amount itself.
   */
  async function start(
    kind: CardPaymentKind,
    payload: CheckoutPayload | FachschaftPayPayload,
    options: { standId: number | null, amount: number, standName: string | null, readerName: string | null },
  ): Promise<{ ok: true } | { ok: false, error: string }> {
    if (starting.value || active.value) return { ok: false, error: t('card.alreadyRunning') }
    starting.value = true
    try {
      const res = await $fetch<any>('/api/card-payments/start', {
        method: 'POST',
        body: { kind, payload, stand_id: options.standId },
      })
      if (!res.ok) return { ok: false, error: res.error || t('card.startFailed') }

      active.value = {
        client_uuid: res.payment.client_uuid,
        kind,
        amount: Number(res.payment.amount ?? options.amount),
        standName: options.standName,
        readerName: options.readerName,
        startedAt: Date.now(),
      }
      payment.value = res.payment
      now.value = Date.now()
      resume()
      return { ok: true }
    } catch {
      return { ok: false, error: t('card.startFailed') }
    } finally {
      starting.value = false
    }
  }

  async function cancel() {
    const current = active.value
    if (!current) return
    try {
      const res = await $fetch<any>(`/api/card-payments/${current.client_uuid}/cancel`, { method: 'POST' })
      if (!res.ok) return res.error as string
    } catch {
      return t('common.unknownError')
    }
    await check()
    return null
  }

  async function recheck() {
    await check()
    if (active.value && isPending(payment.value)) schedule()
  }

  /** The till is done with this payment (booked, failed and handled, or acknowledged). */
  function dismiss() {
    stopPolling()
    active.value = null
    payment.value = null
  }

  const unclear = computed(() => Boolean(active.value)
    && isPending(payment.value)
    && (now.value - (active.value?.startedAt ?? now.value) > UNCLEAR_AFTER_MS || Boolean(payment.value?.stale)))

  return { active, payment, starting, unclear, start, cancel, recheck, resume, dismiss }
}

/**
 * Mirrors the server's resolveCardAvailability for the card button: whether
 * card is shown at all, and if so why it can't be used right now.
 */
export const useCardAvailability = () => {
  const { selectedEvent } = useCheckout()
  const { effectiveStand } = useStands()
  const { settings, cardConfigured, loadSettings } = useCashRegisterSettings()
  const { isOnline } = useConnectivity()
  const { t } = useI18n()
  const eventFlags = useState<Record<number, boolean>>('card_event_flags', () => ({}))

  /** Card payments exist on this install: SumUp set up and switched on. */
  const cardVisible = computed(() => cardConfigured.value && settings.value.card_payments_enabled)

  /**
   * Card is switched on for this event and stand, so the payment method choice
   * is shown. Temporary blockers (offline, terminal missing) keep it visible
   * with a reason; a switch that is off hides it.
   */
  const cardOffered = computed(() => {
    if (!cardVisible.value) return false
    if (eventFlags.value[Number(selectedEvent.value)] === false) return false
    return Boolean(effectiveStand.value?.card_enabled)
  })

  const unavailableReason = computed<string | null>(() => {
    if (!cardVisible.value) return t('card.unavailable.disabled')
    if (!isOnline.value) return t('card.unavailable.offline')
    if (eventFlags.value[Number(selectedEvent.value)] === false) return t('card.unavailable.event')
    const stand = effectiveStand.value
    if (!stand) return t('card.unavailable.noStand')
    if (!stand.card_enabled) return t('card.unavailable.stand')
    if (!stand.card_reader_ready) return t('card.unavailable.noReader')
    return null
  })

  async function loadAvailability(force = false) {
    await Promise.allSettled([
      loadSettings(force),
      (async () => {
        const { data: res } = await cachedFetch<any>('/api/events')
        if (!res.ok || !Array.isArray(res.events)) return
        eventFlags.value = Object.fromEntries(
          res.events.map((entry: any) => [Number(entry.id), entry.card_enabled == null ? true : Boolean(Number(entry.card_enabled))]),
        )
      })(),
    ])
  }

  return { cardVisible, cardOffered, unavailableReason, loadAvailability }
}
