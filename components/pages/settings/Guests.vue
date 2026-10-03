<template>
  <CommonPageTableCard
    :title="t('guests.accounts.title')"
    persist-key="settings-guest-accounts"
    :search-value="search"
    can-create
    :create-label="`+ ${t('guests.accounts.create')}`"
    @update:search-value="search = $event"
    @create="openCreateModal"
  >
    <CommonAdvancedTable
      :loading="loading"
      v-model:search="search"
      persist-key="settings-guest-accounts"
      :rows="guests"
      :columns="accountColumns"
      :empty-text="t('guests.accounts.none')"
      show-actions
      :can-open-row="() => true"
      @row-open="openEditModal($event)"
    >
      <template #cell-username="{ row }">
        <span class="inline-flex flex-wrap items-center gap-2">
          {{ row.username }}
          <CommonStatusBadge v-if="isOwnAccount(row)" :label="t('guests.accounts.ownAccount')" tone="base" />
          <CommonStatusBadge
            v-if="row.must_change_password"
            :label="t('users.mustChangePassword')"
            tone="warning"
          />
        </span>
      </template>

      <template #cell-is_active="{ row }">
        <CommonStatusBadge
          :label="row.is_active ? t('common.active') : t('common.inactive')"
          :tone="row.is_active ? 'success' : 'baseMuted'"
        />
      </template>

      <template #actions="{ row }">
        <button class="text-link-600 hover:underline cursor-pointer" @click="openEditModal(row)">
          {{ t('guests.accounts.edit') }}
        </button>

        <button class="text-link-600 hover:underline cursor-pointer" @click="openPasswordModal(row)">
          {{ t('users.setPassword') }}
        </button>

        <template v-if="!isOwnAccount(row)">
          <button
            v-if="!row.must_change_password"
            class="text-warning-700 hover:underline cursor-pointer"
            @click="requirePasswordChange(row)"
          >
            {{ t('users.requirePasswordChange') }}
          </button>

          <button
            class="hover:underline cursor-pointer"
            :class="row.is_active ? 'text-danger-500' : 'text-base-500'"
            @click="toggleActive(row)"
          >
            {{ row.is_active ? t('actions.deactivate') : t('actions.activate') }}
          </button>

          <button class="text-danger-600 hover:underline cursor-pointer" @click="guestToDelete = row">
            {{ t('actions.remove') }}
          </button>
        </template>
      </template>
    </CommonAdvancedTable>
  </CommonPageTableCard>

  <PagesSettingsEntityManager
    ref="cashierManagerRef"
    :title="t('guests.cashiers.title')"
    :singular-label="t('guests.cashiers.singular')"
    :add-label="t('guests.cashiers.new')"
    :empty-label="t('guests.cashiers.none')"
    persist-key="settings-guest-cashiers"
    list-endpoint="/api/guests/cashiers"
    save-endpoint="/api/guests/cashiers/create"
    update-endpoint="/api/guests/cashiers/update"
    activate-endpoint="/api/guests/cashiers/activate"
    delete-endpoint="/api/guests/cashiers/delete"
    :delete-confirm-title="t('guests.cashiers.deleteConfirmTitle')"
    :delete-confirm-question="(item) => t('guests.cashiers.deleteConfirmQuestion', { name: item.name })"
    response-list-key="cashiers"
    :extra-columns="cashierColumns"
    :create-item="() => ({ name: '', affiliation_id: defaultAffiliationId })"
    :map-edit-item="(item) => ({ id: item.id, name: item.name, affiliation_id: (item as GuestCashierRow).affiliation_id })"
    :on-error="handleError"
  >
    <template #cell-is_active="{ item }">
      <CommonStatusBadge
        :label="item.is_active ? t('common.active') : t('common.inactive')"
        :tone="item.is_active ? 'success' : 'baseMuted'"
      />
    </template>

    <template #modal-fields="{ editingItem }">
      <PagesSettingsAffiliationSelect
        v-if="showAffiliations"
        :model-value="(editingItem.affiliation_id as number | null) ?? null"
        :affiliations="affiliations"
        :locked="isScoped"
        @update:model-value="editingItem.affiliation_id = $event"
      />
    </template>
  </PagesSettingsEntityManager>

  <CommonModal
    v-model="showAccountModal"
    :title="editedGuest ? t('guests.accounts.editTitle', { name: editedGuest.username }) : t('guests.accounts.create')"
    @close="closeAccountModal"
  >
    <div class="flex flex-col gap-3">
      <div class="field">
        <label>{{ t('guests.accounts.username') }}</label>
        <input v-model="accountForm.username" class="input" autocomplete="off" :disabled="isSaving">
      </div>

      <div v-if="!editedGuest" class="field">
        <label>{{ t('guests.accounts.password') }}</label>
        <input v-model="accountForm.password" type="password" class="input" autocomplete="new-password" :disabled="isSaving">
        <p class="text-xs text-base-500">{{ t('settings.passwordHelp', { min: MIN_PASSWORD_LENGTH }) }}</p>
      </div>

      <label v-if="!editedGuest" class="flex cursor-pointer items-center gap-2 text-sm">
        <input v-model="accountForm.must_change_password" type="checkbox" class="checkbox shrink-0" :disabled="isSaving">
        {{ t('guests.accounts.mustChangePasswordOption') }}
      </label>

      <div class="field">
        <label>{{ t('guests.accounts.level') }}</label>
        <MenuDropdown v-model="levelDropdownOpen" :id="1" :disabled="isSaving">
          <template #trigger="{ styling, disabled }">
            <button type="button" class="not-disabled:cursor-pointer disabled:cursor-not-allowed" :class="styling" :disabled="disabled">
              <span>{{ levelLabel(accountForm.access_level) }}</span>
              <Icon name="material-symbols:keyboard-arrow-down-rounded" class="w-4 h-4 shrink-0" aria-hidden="true" />
            </button>
          </template>

          <template #default="{ styling }">
            <button type="button" :class="styling" @click="selectLevel('use')">
              {{ t('guests.accounts.levelUse') }}
            </button>
            <button type="button" :class="styling" @click="selectLevel('manage')">
              {{ t('guests.accounts.levelManage') }}
            </button>
          </template>
        </MenuDropdown>
        <p class="text-xs text-base-500">
          {{ accountForm.access_level === 'manage' ? t('guests.accounts.levelManageHint') : t('guests.accounts.levelUseHint') }}
        </p>
      </div>

      <PagesSettingsAffiliationSelect
        v-if="showAffiliations"
        v-model="accountForm.affiliation_id"
        :affiliations="affiliations"
        :locked="isScoped"
      />
    </div>

    <template #footer>
      <CommonFormActions
        :cancel-label="t('actions.cancel')"
        :submit-label="editedGuest ? t('actions.save') : t('guests.accounts.create')"
        :save-disabled="!accountForm.username.trim() || (!editedGuest && !accountForm.password)"
        :saving="isSaving"
        @cancel="closeAccountModal"
        @submit="saveAccount"
      />
    </template>
  </CommonModal>

  <CommonModal
    v-model="showPasswordModal"
    :title="t('users.setPasswordTitle', { name: editedGuest?.username ?? '' })"
    @close="closePasswordModal"
  >
    <p class="text-sm text-base-600">
      {{ editedGuest && isOwnAccount(editedGuest) ? t('guests.accounts.setOwnPasswordText') : t('guests.accounts.setPasswordText') }}
    </p>

    <div class="grid gap-4">
      <div class="field">
        <label>{{ t('settings.newPassword') }}</label>
        <input v-model="passwordForm.newPassword" type="password" class="input" autocomplete="new-password" :disabled="isSaving">
      </div>

      <div class="field">
        <label>{{ t('settings.confirmPassword') }}</label>
        <input v-model="passwordForm.confirmPassword" type="password" class="input" autocomplete="new-password" :disabled="isSaving">
      </div>

      <p class="text-xs text-base-500">{{ t('settings.passwordHelp', { min: MIN_PASSWORD_LENGTH }) }}</p>

      <label v-if="editedGuest && !isOwnAccount(editedGuest)" class="flex cursor-pointer items-center gap-2 text-sm">
        <input v-model="passwordForm.must_change_password" type="checkbox" class="checkbox shrink-0" :disabled="isSaving">
        {{ t('guests.accounts.mustChangePasswordOption') }}
      </label>
    </div>

    <template #footer>
      <CommonFormActions
        :cancel-label="t('actions.cancel')"
        :submit-label="t('actions.save')"
        :save-disabled="!passwordForm.newPassword || !passwordForm.confirmPassword"
        :saving="isSaving"
        @cancel="closePasswordModal"
        @submit="setPassword"
      />
    </template>
  </CommonModal>

  <FormConfirmation
    v-if="guestToDelete"
    :headline="t('guests.accounts.deleteConfirmTitle')"
    @confirm="confirmDelete"
    @cancel="guestToDelete = null"
  >
    <template #message>
      {{ t('guests.accounts.deleteConfirmQuestion', { name: guestToDelete.username }) }}
    </template>
  </FormConfirmation>
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'
import { useToast } from '~/composables/useToast'
import { useLocaleFormatters } from '~/composables/useLocaleFormatters'
import { MIN_PASSWORD_LENGTH } from '~/config/validation'
import type { AdvancedTableColumn } from '~/composables/useAdvancedTable'
import type { EntityManagerColumn, SettingsEntityRow } from './EntityManager.vue'
import type { AffiliationOption } from './AffiliationSelect.vue'

type GuestAccessLevel = 'use' | 'manage'

interface GuestAccountRow {
  id: number
  username: string
  access_level: GuestAccessLevel
  affiliation_id: number | null
  affiliation_name: string | null
  is_active: boolean
  must_change_password: boolean
  created_by: string | null
  created_at: string
}

interface GuestCashierRow extends SettingsEntityRow {
  affiliation_id: number | null
  affiliation_name: string | null
}

const { t } = useI18n()
const toast = useToast()
const { formatDateTime } = useLocaleFormatters()
const { user, fetchSession } = useAuth()

const guests = ref<GuestAccountRow[]>([])
const affiliations = ref<AffiliationOption[]>([])
const loading = ref(true)
const search = ref('')
const isSaving = ref(false)

const cashierManagerRef = ref<{ loadItems: () => Promise<void> } | null>(null)

// A guest with an affiliation is scoped to it; regular users never are.
const isScoped = computed(() => user.value?.kind === 'guest' && user.value.affiliation_id != null)
const defaultAffiliationId = computed(() => isScoped.value ? user.value!.affiliation_id : null)
const showAffiliations = computed(() => affiliations.value.length > 0)

function isOwnAccount(row: GuestAccountRow) {
  return user.value?.kind === 'guest' && user.value.id === row.id
}

function levelLabel(level: GuestAccessLevel) {
  return level === 'manage' ? t('guests.accounts.levelManage') : t('guests.accounts.levelUse')
}

function affiliationLabel(name: string | null) {
  return name || t('affiliations.noneOption')
}

const accountColumns = computed<AdvancedTableColumn<GuestAccountRow>[]>(() => [
  {
    key: 'username',
    label: t('guests.accounts.username'),
    globalSearchable: true,
    mobile: 'title',
    getValue: row => row.username,
  },
  {
    key: 'access_level',
    label: t('guests.accounts.level'),
    getValue: row => levelLabel(row.access_level),
  },
  ...(showAffiliations.value
    ? [{
        key: 'affiliation',
        label: t('affiliations.label'),
        globalSearchable: true,
        getValue: (row: GuestAccountRow) => affiliationLabel(row.affiliation_name),
      }]
    : []),
  {
    key: 'is_active',
    label: t('common.active'),
    filterable: false,
    sortable: false,
    getValue: row => row.is_active ? t('common.active') : t('common.inactive'),
  },
  {
    key: 'created_by',
    label: t('guests.accounts.createdBy'),
    getValue: row => row.created_by || t('common.notAvailable'),
  },
  {
    key: 'created_at',
    label: t('users.createdAt'),
    filterType: 'date',
    getValue: row => row.created_at,
    format: row => formatDateTime(row.created_at),
  },
])

const cashierColumns = computed<EntityManagerColumn[]>(() => [
  ...(showAffiliations.value
    ? [{
        key: 'affiliation',
        label: t('affiliations.label'),
        globalSearchable: true,
        getValue: (item: SettingsEntityRow) => affiliationLabel((item as GuestCashierRow).affiliation_name),
      }]
    : []),
  {
    key: 'is_active',
    label: t('common.active'),
    filterable: false,
    sortable: false,
    getValue: item => item.is_active ? t('common.active') : t('common.inactive'),
  },
])

function handleError(context: { message?: string }) {
  toast.error(context.message || t('common.unknownError'))
}

async function loadGuests() {
  try {
    const res = await $fetch<{ ok: boolean, error?: string, guests?: GuestAccountRow[] }>('/api/guests/accounts')
    if (res.ok) guests.value = res.guests ?? []
    else toast.error(res.error || t('common.unknownError'))
  } catch {
    toast.error(t('common.unknownError'))
  } finally {
    loading.value = false
  }
}

async function loadAffiliations() {
  try {
    const res = await $fetch<{ ok: boolean, error?: string, affiliations?: AffiliationOption[] }>('/api/affiliations')
    if (res.ok) affiliations.value = res.affiliations ?? []
    else toast.error(res.error || t('common.unknownError'))
  } catch {
    toast.error(t('common.unknownError'))
  }
}

/** Runs one guest account call, toasting either outcome and reloading the list on success. */
async function runGuestAction(endpoint: string, body: Record<string, unknown>, successMessage: string) {
  if (isSaving.value) return false

  isSaving.value = true
  try {
    const res = await $fetch<{ ok: boolean, error?: string }>(endpoint, { method: 'POST', body })
    if (!res.ok) {
      toast.error(res.error || t('common.unknownError'))
      return false
    }

    toast.success(successMessage)
    await loadGuests()
    return true
  } catch {
    toast.error(t('common.unknownError'))
    return false
  } finally {
    isSaving.value = false
  }
}

// Create / edit modal
const showAccountModal = ref(false)
const editedGuest = ref<GuestAccountRow | null>(null)
const levelDropdownOpen = ref<number | null>(null)
const accountForm = ref({
  username: '',
  password: '',
  access_level: 'use' as GuestAccessLevel,
  affiliation_id: null as number | null,
  must_change_password: false,
})

function selectLevel(level: GuestAccessLevel) {
  accountForm.value.access_level = level
  levelDropdownOpen.value = null
}

function openCreateModal() {
  editedGuest.value = null
  accountForm.value = { username: '', password: '', access_level: 'use', affiliation_id: defaultAffiliationId.value, must_change_password: false }
  showAccountModal.value = true
}

function openEditModal(row: GuestAccountRow) {
  editedGuest.value = row
  accountForm.value = { username: row.username, password: '', access_level: row.access_level, affiliation_id: row.affiliation_id, must_change_password: false }
  showAccountModal.value = true
}

function closeAccountModal() {
  if (isSaving.value) return
  showAccountModal.value = false
  editedGuest.value = null
  levelDropdownOpen.value = null
}

async function saveAccount() {
  const form = accountForm.value
  const target = editedGuest.value

  const done = target
    ? await runGuestAction('/api/guests/accounts/update', {
        id: target.id,
        username: form.username.trim(),
        access_level: form.access_level,
        affiliation_id: form.affiliation_id,
      }, t('guests.accounts.updated'))
    : await runGuestAction('/api/guests/accounts/create', {
        username: form.username.trim(),
        password: form.password,
        access_level: form.access_level,
        affiliation_id: form.affiliation_id,
        must_change_password: form.must_change_password,
      }, t('guests.accounts.created'))

  if (done) {
    showAccountModal.value = false
    editedGuest.value = null
    // Own username, level or affiliation changed - the UI must follow at once.
    if (target && isOwnAccount(target)) await fetchSession()
  }
}

// Set password modal
const showPasswordModal = ref(false)
const passwordForm = ref({ newPassword: '', confirmPassword: '', must_change_password: false })

function openPasswordModal(row: GuestAccountRow) {
  editedGuest.value = row
  passwordForm.value = { newPassword: '', confirmPassword: '', must_change_password: false }
  showPasswordModal.value = true
}

function closePasswordModal() {
  if (isSaving.value) return
  showPasswordModal.value = false
  editedGuest.value = null
  passwordForm.value = { newPassword: '', confirmPassword: '', must_change_password: false }
}

async function setPassword() {
  const target = editedGuest.value
  if (!target) return

  const done = await runGuestAction('/api/guests/accounts/set-password', {
    id: target.id,
    newPassword: passwordForm.value.newPassword,
    confirmPassword: passwordForm.value.confirmPassword,
    must_change_password: passwordForm.value.must_change_password,
  }, t('users.passwordSet'))

  if (done) {
    showPasswordModal.value = false
    editedGuest.value = null
  }
}

async function requirePasswordChange(row: GuestAccountRow) {
  await runGuestAction('/api/guests/accounts/require-password-change', { id: row.id }, t('users.passwordChangeRequired'))
}

async function toggleActive(row: GuestAccountRow) {
  await runGuestAction(
    '/api/guests/accounts/activate',
    { id: row.id, is_active: row.is_active ? 0 : 1 },
    row.is_active ? t('guests.accounts.deactivated') : t('guests.accounts.activated'),
  )
}

// Delete
const guestToDelete = ref<GuestAccountRow | null>(null)

async function confirmDelete() {
  const target = guestToDelete.value
  guestToDelete.value = null
  if (!target) return

  await runGuestAction('/api/guests/accounts/delete', { id: target.id }, t('common.deleted'))
}

async function reloadAll() {
  await Promise.all([loadAffiliations(), loadGuests(), cashierManagerRef.value?.loadItems()])
}

onMounted(() => {
  loadAffiliations()
  loadGuests()
})
useAppRefresh().onRefresh(reloadAll)
</script>
