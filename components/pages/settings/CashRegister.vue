<template>
  <div class="bg-white rounded-xl shadow-lg p-6 space-y-6 col-span-12">
    <section class="rounded-xl border border-slate-200 p-4 space-y-3">
      <div>
        <h3 class="font-semibold">{{ t('settings.cashRegisterTitle') }}</h3>
        <p class="text-sm text-slate-600">{{ t('settings.cashRegisterText') }}</p>
      </div>

      <div class="field max-w-xs">
        <label for="fachschaft-amount">{{ t('settings.fachschaftPaymentAmount') }}</label>
        <input
          id="fachschaft-amount"
          v-model="fachschaftAmount"
          type="number"
          min="0.01"
          step="0.01"
          class="input"
          :disabled="isSaving"
        >
      </div>

      <p class="text-sm text-slate-600">{{ t('settings.fachschaftPaymentNotice') }}</p>

      <button
        class="btn-primary"
        :disabled="isSaving"
        @click="saveSettings"
      >
        {{ isSaving ? t('settings.saving') : t('settings.save') }}
      </button>
    </section>

    <section class="rounded-xl border border-slate-200 p-4 space-y-3">
      <div>
        <h3 class="font-semibold">{{ t('settings.exportTitle') }}</h3>
        <p class="text-sm text-slate-600">{{ t('settings.exportText') }}</p>
      </div>

      <button class="btn-secondary" @click="exportCSV">
        {{ t('settings.exportButton') }}
      </button>
    </section>

    <template v-if="canManage">
      <section class="rounded-xl border border-slate-200 p-4 space-y-3">
        <div>
          <h3 class="font-semibold">{{ t('settings.snapshot.title') }}</h3>
          <p class="text-sm text-slate-600">{{ t('settings.snapshot.text') }}</p>
        </div>

        <div class="flex flex-wrap gap-2">
          <input
            v-model="snapshotPassword"
            class="input max-w-sm"
            type="password"
            autocomplete="new-password"
            :placeholder="t('settings.snapshot.passwordPlaceholder')"
            :disabled="isDownloadingSnapshot"
          >

          <button
            class="btn-primary"
            :disabled="isDownloadingSnapshot || !canUseSnapshotPassword"
            :class="{ 'opacity-50 cursor-not-allowed': isDownloadingSnapshot || !canUseSnapshotPassword }"
            @click="downloadSnapshot"
          >
            {{ isDownloadingSnapshot ? t('settings.snapshot.downloading') : t('settings.snapshot.download') }}
          </button>
        </div>

        <p class="text-xs text-slate-500">{{ t('settings.snapshot.passwordHelp') }}</p>
      </section>

      <section class="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
        <div>
          <h3 class="font-semibold text-red-900">{{ t('settings.snapshot.restoreTitle') }}</h3>
          <p class="text-sm text-red-800">{{ t('settings.snapshot.restoreText') }}</p>
        </div>

        <label class="block space-y-1">
          <span class="text-sm font-medium text-red-900">{{ t('settings.snapshot.fileLabel') }}</span>
          <input
            ref="fileInput"
            class="input bg-white"
            type="file"
            accept=".enc,application/octet-stream"
            :disabled="isPreviewing || isRestoring"
            @change="handleFileChange"
          >
        </label>

        <input
          v-model="restorePassword"
          class="input bg-white"
          type="password"
          autocomplete="new-password"
          :placeholder="t('settings.snapshot.restorePasswordPlaceholder')"
          :disabled="isPreviewing || isRestoring"
          @input="handleRestorePasswordInput"
        >

        <button
          class="btn-primary"
          :disabled="isPreviewing || isRestoring || !selectedFile || !canUseRestorePassword"
          :class="{ 'opacity-50 cursor-not-allowed': isPreviewing || isRestoring || !selectedFile || !canUseRestorePassword }"
          @click="openRestorePreview"
        >
          {{ isPreviewing ? t('settings.snapshot.previewing') : t('settings.snapshot.previewRestore') }}
        </button>

        <div v-if="isPreviewing && uploadProgress !== null" class="space-y-1">
          <div class="h-2 overflow-hidden rounded-full bg-red-100">
            <div class="h-full bg-orange-500" :style="{ width: `${uploadProgress}%` }" />
          </div>
          <p class="text-xs text-red-800">{{ t('settings.snapshot.uploadProgress', { progress: String(uploadProgress) }) }}</p>
        </div>
      </section>
    </template>

    <section v-else class="rounded-xl border border-slate-200 p-4">
      <p class="text-sm text-slate-600">{{ t('settings.snapshot.noPermission') }}</p>
    </section>

    <CommonModal
      v-if="restorePreview"
      :model-value="!!restorePreview"
      :title="t('settings.snapshot.previewTitle')"
      width-class="max-w-2xl"
      @update:model-value="closeRestorePreview"
    >
      <p class="text-sm text-slate-600">{{ t('settings.snapshot.previewText') }}</p>

      <div class="grid md:grid-cols-2 gap-3 text-sm">
        <div class="rounded-lg border border-slate-200 p-3">
          <p class="text-xs text-slate-500">{{ t('settings.snapshot.previewCreatedAt') }}</p>
          <p class="font-medium">{{ previewCreatedAtLabel }}</p>
        </div>
        <div class="rounded-lg border border-slate-200 p-3">
          <p class="text-xs text-slate-500">{{ t('settings.snapshot.previewDatabase') }}</p>
          <p class="font-medium">{{ restorePreview.database || t('settings.snapshot.previewUnknown') }}</p>
        </div>
        <div class="rounded-lg border border-slate-200 p-3">
          <p class="text-xs text-slate-500">{{ t('settings.snapshot.previewApp') }}</p>
          <p class="font-medium">{{ previewAppLabel }}</p>
        </div>
        <div class="rounded-lg border border-slate-200 p-3">
          <p class="text-xs text-slate-500">{{ t('settings.snapshot.previewSchema') }}</p>
          <p class="font-medium">{{ restorePreview.schemaVersion || t('settings.snapshot.previewUnknown') }}</p>
        </div>
        <div class="rounded-lg border border-slate-200 p-3">
          <p class="text-xs text-slate-500">{{ t('settings.snapshot.previewTables') }}</p>
          <p class="font-medium">{{ restorePreview.tables }}</p>
        </div>
        <div class="rounded-lg border border-slate-200 p-3">
          <p class="text-xs text-slate-500">{{ t('settings.snapshot.previewRows') }}</p>
          <p class="font-medium">{{ restorePreview.rows }}</p>
        </div>
        <div class="rounded-lg border border-slate-200 p-3 md:col-span-2">
          <p class="text-xs text-slate-500">{{ t('settings.snapshot.previewIntegrity') }}</p>
          <p class="font-medium">{{ integrityLabel }}</p>
        </div>
        <div class="rounded-lg border border-slate-200 p-3 md:col-span-2">
          <p class="text-xs text-slate-500">{{ t('settings.snapshot.previewMode') }}</p>
          <p class="font-medium">{{ modeLabel(restorePreview.accountingMode) }}</p>
        </div>
      </div>

      <div v-if="modeMismatch" class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        {{ t('settings.snapshot.modeMismatchWarning', { snapshotMode: modeLabel(restorePreview.accountingMode), currentMode: modeLabel(restorePreview.currentAccountingMode) }) }}
      </div>

      <div v-if="restorePreview.currentAccountingMode === 'connected'" class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        {{ t('settings.snapshot.connectedNotice') }}
      </div>

      <div class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 space-y-2">
        <p v-if="restorePreview.currentAccountingMode === 'standalone'">{{ t('settings.snapshot.authWarning') }}</p>
        <p>{{ t('settings.snapshot.sessionsWarning') }}</p>
        <div v-if="isRestoring && uploadProgress !== null" class="space-y-1">
          <div class="h-2 overflow-hidden rounded-full bg-red-100">
            <div class="h-full bg-orange-500" :style="{ width: `${uploadProgress}%` }" />
          </div>
          <p class="text-xs text-red-800">{{ t('settings.snapshot.uploadProgress', { progress: String(uploadProgress) }) }}</p>
        </div>
        <label class="block">
          <span class="text-xs font-medium text-red-900">{{ t('settings.snapshot.confirmLabel') }}</span>
          <input v-model="restoreConfirmation" class="input mt-1 bg-white" autocomplete="off">
        </label>
      </div>

      <template #footer>
        <button class="btn-secondary" type="button" @click="closeRestorePreview">
          {{ t('actions.cancel') }}
        </button>
        <button
          class="btn-primary"
          type="button"
          :disabled="isRestoring || restoreConfirmation !== 'RESTORE' || !canRestorePreview"
          :class="{ 'opacity-50 cursor-not-allowed': isRestoring || restoreConfirmation !== 'RESTORE' || !canRestorePreview }"
          @click="restoreSnapshot"
        >
          {{ isRestoring ? t('settings.snapshot.restoring') : t('settings.snapshot.restore') }}
        </button>
      </template>
    </CommonModal>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'
import { useToast } from '~/composables/useToast'
import { useCashRegisterSettings } from '~/composables/useCashRegisterSettings'
import { useLocaleFormatters } from '~/composables/useLocaleFormatters'
import type { CashRegisterSettings } from '~/types/settings'
import type { PreviewSnapshotResponse } from '~/server/api/settings/snapshot.preview.post'
import type { RestoreSnapshotResponse } from '~/server/api/settings/snapshot.restore.post'
import type { SnapshotErrorCode } from '~/server/utils/databaseSnapshots'

const { t } = useI18n()
const toast = useToast()
const { settings, loadSettings } = useCashRegisterSettings()
const { formatDateTime } = useLocaleFormatters()
const { hasPermission, fetchSession, redirectToLogin } = useAuth()
const runtimeConfig = useRuntimeConfig()

const canManage = computed(() => hasPermission('cash_register.manage'))

const MAX_SNAPSHOT_UPLOAD_BYTES = 256 * 1024 * 1024
const MAX_SNAPSHOT_UPLOAD_LABEL = '256 MB'

const fachschaftAmount = ref('')
const isSaving = ref(false)

const snapshotPassword = ref('')
const isDownloadingSnapshot = ref(false)

const restorePassword = ref('')
const selectedFile = ref<File | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const isPreviewing = ref(false)
const isRestoring = ref(false)
const uploadProgress = ref<number | null>(null)
const restoreToken = ref('')
const restorePreview = ref<Extract<PreviewSnapshotResponse, { ok: true }> | null>(null)
const restoreConfirmation = ref('')

const canUseSnapshotPassword = computed(() => snapshotPassword.value.length >= 12)
const canUseRestorePassword = computed(() => restorePassword.value.length >= 12)

const previewAppLabel = computed(() => {
  if (!restorePreview.value) return ''
  const name = restorePreview.value.appName || t('settings.snapshot.previewUnknown')
  return restorePreview.value.appVersion ? `${name} ${restorePreview.value.appVersion}` : name
})

const previewCreatedAtLabel = computed(() => {
  if (!restorePreview.value?.createdAt) return t('settings.snapshot.previewUnknown')
  return formatDateTime(restorePreview.value.createdAt)
})

const integrityLabel = computed(() => {
  if (!restorePreview.value) return ''
  if (!restorePreview.value.integrity.present) return t('settings.snapshot.integrityMissing')
  return restorePreview.value.integrity.valid ? t('settings.snapshot.integrityValid') : t('settings.snapshot.integrityInvalid')
})

const modeMismatch = computed(() => {
  if (!restorePreview.value) return false
  return restorePreview.value.accountingMode !== restorePreview.value.currentAccountingMode
})

function modeLabel(mode: 'standalone' | 'connected' | null) {
  if (mode === 'standalone') return t('settings.snapshot.modeStandalone')
  if (mode === 'connected') return t('settings.snapshot.modeConnected')
  return t('settings.snapshot.previewUnknown')
}

const canRestorePreview = computed(() => {
  if (!restorePreview.value) return false
  return !restorePreview.value.integrity.present || restorePreview.value.integrity.valid
})

async function reloadSettings() {
  const previousLoaded = String(settings.value.fachschaft_payment_amount)
  await loadSettings(true)
  // Sync the form field only while it still shows the previously loaded value,
  // so a refresh never discards unsaved user input.
  if (!fachschaftAmount.value || fachschaftAmount.value === previousLoaded) {
    fachschaftAmount.value = String(settings.value.fachschaft_payment_amount)
  }
}

onMounted(reloadSettings)
useAppRefresh().onRefresh(reloadSettings)

async function saveSettings() {
  if (isSaving.value) return

  const amount = Number(fachschaftAmount.value)
  if (!Number.isFinite(amount) || amount <= 0) {
    toast.error(t('settings.invalidAmount'))
    return
  }

  isSaving.value = true
  try {
    const res = await $fetch<{ ok: boolean, settings?: CashRegisterSettings, error?: string }>('/api/settings/save', {
      method: 'POST',
      body: { fachschaft_payment_amount: amount },
    })

    if (!res.ok) {
      toast.error(res.error || t('settings.saveFailed'))
      return
    }

    if (res.settings) {
      settings.value = res.settings
      fachschaftAmount.value = String(res.settings.fachschaft_payment_amount)
    }
    toast.success(t('settings.saved'))
  } catch {
    toast.error(t('settings.saveFailed'))
  } finally {
    isSaving.value = false
  }
}

async function exportCSV() {
  try {
    const res = await fetch('/api/export/csv')

    if (!res.ok) {
      toast.error(t('settings.exportFailed'))
      return
    }

    const blob = await res.blob()
    const url = window.URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = `kassensystem-export-${new Date().toISOString().slice(0,10)}.csv`
    a.click()

    window.URL.revokeObjectURL(url)
  } catch {
    toast.error(t('settings.exportFailed'))
  }
}

// --- Snapshots -----------------------------------------------------------

function apiUrl(path: string) {
  const base = String(runtimeConfig.app.baseURL || '/').replace(/\/$/, '')
  return `${base}${path}`
}

interface SnapshotRequestError extends Error {
  snapshotErrorCode?: SnapshotErrorCode | 'uploadTooLarge' | 'uploadFailed'
  snapshotErrorParams?: Record<string, string | number>
}

function createSnapshotRequestError(message: string, code?: SnapshotRequestError['snapshotErrorCode'], params?: Record<string, string | number>) {
  const error = new Error(message) as SnapshotRequestError
  error.snapshotErrorCode = code
  error.snapshotErrorParams = params
  return error
}

const snapshotErrorMessageKeys: Record<SnapshotErrorCode | 'uploadTooLarge' | 'uploadFailed', string> = {
  invalidPassword: 'settings.snapshot.errors.invalidPassword',
  wrongPassword: 'settings.snapshot.errors.wrongPassword',
  notEncrypted: 'settings.snapshot.errors.notEncrypted',
  corruptedFile: 'settings.snapshot.errors.corruptedFile',
  unsupportedFormat: 'settings.snapshot.errors.unsupportedFormat',
  schemaMismatch: 'settings.snapshot.errors.schemaMismatch',
  integrityFailed: 'settings.snapshot.errors.integrityFailed',
  previewExpired: 'settings.snapshot.errors.previewExpired',
  restoreInProgress: 'settings.snapshot.errors.restoreInProgress',
  databaseDenied: 'settings.snapshot.errors.databaseDenied',
  databaseBusy: 'settings.snapshot.errors.databaseBusy',
  databaseUnavailable: 'settings.snapshot.errors.databaseUnavailable',
  databaseFull: 'settings.snapshot.errors.databaseFull',
  restoreConstraintFailed: 'settings.snapshot.errors.restoreConstraintFailed',
  restoreDataRejected: 'settings.snapshot.errors.restoreDataRejected',
  emptySnapshot: 'settings.snapshot.errors.emptySnapshot',
  uploadTooLarge: 'settings.snapshot.errors.uploadTooLarge',
  uploadFailed: 'settings.snapshot.errors.uploadFailed',
}

function snapshotErrorMessage(err: unknown, fallback: string) {
  const code = (err as SnapshotRequestError | null)?.snapshotErrorCode
  if (code && code in snapshotErrorMessageKeys) {
    return t(snapshotErrorMessageKeys[code], (err as SnapshotRequestError).snapshotErrorParams)
  }
  const message = (err as Error | null)?.message
  return message || fallback
}

/** Both endpoints can also fail with a 200 JSON `{ ok:false, error }` guard rejection — see server/utils/api/guards.ts. */
async function handleGuardOrSnapshotFailure(data: { ok: false, error?: string } | null, fallback: string) {
  const error = data?.error
  if (error === 'Not authenticated') {
    toast.error(t('settings.snapshot.sessionExpired'))
    redirectToLogin()
    return
  }
  if (error === 'Password change required') {
    toast.error(t('settings.snapshot.sessionExpired'))
    await fetchSession()
    return
  }
  if (error === 'Not authorized') {
    toast.error(t('settings.snapshot.noPermission'))
    return
  }
  toast.error(error || fallback)
}

function handleFileChange(event: Event) {
  selectedFile.value = (event.target as HTMLInputElement).files?.[0] ?? null
  restoreToken.value = ''
  restorePreview.value = null
  restoreConfirmation.value = ''
}

function handleRestorePasswordInput() {
  restoreToken.value = ''
  restorePreview.value = null
  restoreConfirmation.value = ''
}

async function downloadSnapshot() {
  if (!canUseSnapshotPassword.value || isDownloadingSnapshot.value) return

  isDownloadingSnapshot.value = true
  try {
    let res: Response
    try {
      res = await fetch(apiUrl('/api/settings/snapshot'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: snapshotPassword.value }),
      })
    } catch {
      toast.error(t('settings.snapshot.errors.networkUnavailable'))
      return
    }

    const contentType = res.headers.get('content-type') || ''
    if (!res.ok || contentType.includes('application/json')) {
      let data: any = null
      try {
        data = await res.json()
      } catch {
        toast.error(t('settings.snapshot.errors.downloadInterrupted'))
        return
      }
      if (data?.ok === false) {
        await handleGuardOrSnapshotFailure(data, t('settings.snapshot.errors.downloadInterrupted'))
      } else {
        toast.error(snapshotErrorMessage(
          createSnapshotRequestError(data?.message || data?.error, data?.data?.snapshotErrorCode, data?.data?.snapshotErrorParams),
          t('settings.snapshot.errors.downloadInterrupted'),
        ))
      }
      return
    }

    let blob: Blob
    try {
      blob = await res.blob()
    } catch {
      toast.error(t('settings.snapshot.errors.downloadInterrupted'))
      return
    }

    const url = window.URL.createObjectURL(blob)
    try {
      const a = document.createElement('a')
      a.href = url
      a.download = `kassensystem-db-${new Date().toISOString().slice(0, 10)}.json.enc`
      a.click()
      toast.success(t('settings.snapshot.downloadSuccess'))
      snapshotPassword.value = ''
    } catch {
      toast.error(t('settings.snapshot.downloadBlocked'))
    } finally {
      window.URL.revokeObjectURL(url)
    }
  } finally {
    isDownloadingSnapshot.value = false
  }
}

function sendFormData<T>(url: string, body: FormData) {
  uploadProgress.value = 0

  return new Promise<T>((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', url)
    request.responseType = 'text'

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return
      uploadProgress.value = Math.min(100, Math.round((event.loaded / event.total) * 100))
    }

    request.onload = () => {
      uploadProgress.value = 100
      try {
        const data = request.responseText ? JSON.parse(request.responseText) : null
        if (request.status >= 200 && request.status < 300) {
          resolve(data as T)
        } else {
          reject(createSnapshotRequestError(
            data?.message || data?.error || request.statusText,
            data?.data?.snapshotErrorCode,
            data?.data?.snapshotErrorParams,
          ))
        }
      } catch (err) {
        reject(err)
      }
    }

    request.onerror = () => reject(createSnapshotRequestError(t('settings.snapshot.errors.uploadFailed'), 'uploadFailed'))
    request.send(body)
  })
}

async function openRestorePreview() {
  if (!selectedFile.value) {
    toast.error(t('settings.snapshot.noFileSelected'))
    return
  }
  if (!selectedFile.value.size) {
    toast.error(t('settings.snapshot.emptyFileSelected'))
    return
  }
  if (selectedFile.value.size > MAX_SNAPSHOT_UPLOAD_BYTES) {
    toast.error(t('settings.snapshot.errors.uploadTooLarge', { size: MAX_SNAPSHOT_UPLOAD_LABEL }))
    return
  }
  if (!canUseRestorePassword.value) {
    toast.error(t('settings.snapshot.errors.invalidPassword'))
    return
  }

  isPreviewing.value = true
  try {
    const body = new FormData()
    body.append('snapshotFile', selectedFile.value)
    body.append('password', restorePassword.value)

    const res = await sendFormData<PreviewSnapshotResponse>(apiUrl('/api/settings/snapshot.preview'), body)

    if (!res.ok) {
      await handleGuardOrSnapshotFailure(res, t('settings.snapshot.previewFailed'))
      return
    }

    restoreToken.value = res.restoreToken
    restorePreview.value = res
    restoreConfirmation.value = ''
  } catch (err: any) {
    if (err?.message === 'Failed to fetch' || !navigator.onLine) {
      toast.error(t('settings.snapshot.errors.networkUnavailable'))
    } else {
      toast.error(snapshotErrorMessage(err, t('settings.snapshot.previewFailed')))
    }
  } finally {
    isPreviewing.value = false
    uploadProgress.value = null
  }
}

function closeRestorePreview() {
  restorePreview.value = null
  restoreConfirmation.value = ''
}

async function restoreSnapshot() {
  if (!restoreToken.value || !canRestorePreview.value) return
  if (restoreConfirmation.value !== 'RESTORE') {
    toast.error(t('settings.snapshot.invalidConfirmation'))
    return
  }

  isRestoring.value = true
  try {
    const body = new FormData()
    body.append('restoreToken', restoreToken.value)

    const res = await sendFormData<RestoreSnapshotResponse>(apiUrl('/api/settings/snapshot.restore'), body)

    if (!res.ok) {
      await handleGuardOrSnapshotFailure(res, t('settings.snapshot.restoreFailed'))
      return
    }

    selectedFile.value = null
    restorePassword.value = ''
    restoreToken.value = ''
    closeRestorePreview()
    if (fileInput.value) fileInput.value.value = ''

    await loadSettings(true)
    await useAppRefresh().refreshCurrentPage()
    fachschaftAmount.value = String(settings.value.fachschaft_payment_amount)

    const user = await fetchSession()
    if (!user) {
      toast.success(t('settings.snapshot.restoreSuccessLoggedOut', { tables: String(res.tables), rows: String(res.rows) }))
    } else {
      toast.success(t('settings.snapshot.restoreSuccess', { tables: String(res.tables), rows: String(res.rows) }))
    }
  } catch (err: any) {
    if (err?.message === 'Failed to fetch' || !navigator.onLine) {
      toast.error(t('settings.snapshot.errors.networkUnavailable'))
    } else {
      toast.error(snapshotErrorMessage(err, t('settings.snapshot.restoreFailed')))
    }
  } finally {
    isRestoring.value = false
    uploadProgress.value = null
  }
}
</script>
