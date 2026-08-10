<template>
  <p
    v-if="isConnectedMode"
    class="col-span-12 -mb-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900"
  >
    {{ t('users.connectedNotice') }}
  </p>

  <CommonPageTableCard
    :title="t('users.allUsers')"
    persist-key="settings-users"
    :search-value="search"
    :can-create="!isConnectedMode"
    :create-label="`+ ${t('users.createUser')}`"
    @update:search-value="search = $event"
    @create="showCreateModal = true"
  >
    <CommonAdvancedTable
      v-model:search="search"
      persist-key="settings-users"
      :rows="users"
      :columns="columns"
      :empty-text="t('users.none')"
      :show-actions="!isConnectedMode"
      :can-open-row="() => false"
    >
      <template #cell-username="{ row }">
        <span class="inline-flex flex-wrap items-center gap-2">
          {{ row.username }}
          <CommonStatusBadge
            v-if="row.must_change_password"
            :label="t('users.mustChangePassword')"
            tone="yellow"
          />
        </span>
      </template>

      <template #cell-is_active="{ row }">
        <CommonStatusBadge
          :label="row.is_active ? t('common.active') : t('common.inactive')"
          :tone="row.is_active ? 'green' : 'gray'"
        />
      </template>

      <template #actions="{ row }">
        <button class="text-blue-600 hover:underline cursor-pointer" @click="openUsernameModal(row)">
          {{ t('users.changeUsername') }}
        </button>

        <button class="text-blue-600 hover:underline cursor-pointer" @click="openPasswordModal(row)">
          {{ t('users.setPassword') }}
        </button>

        <button
          v-if="!row.must_change_password"
          class="text-amber-700 hover:underline cursor-pointer"
          @click="requirePasswordChange(row)"
        >
          {{ t('users.requirePasswordChange') }}
        </button>
      </template>
    </CommonAdvancedTable>
  </CommonPageTableCard>

  <CommonModal v-model="showCreateModal" :title="t('users.createUser')" @close="resetForm">
    <div class="flex flex-col gap-3">
      <div class="field">
        <label>{{ t('users.username') }}</label>
        <input
          v-model="newUsername"
          class="input"
          autocomplete="new-username"
          :disabled="isConnectedMode"
        />
      </div>
      <div class="field">
        <label>{{ t('users.password') }}</label>
        <input
          v-model="newPassword"
          type="password"
          class="input"
          autocomplete="new-password"
          :disabled="isConnectedMode"
        />
      </div>
      <div class="field">
        <label>{{ t('users.role') }}</label>
        <MenuDropdown v-model="roleDropdownOpen" :id="1" :disabled="isConnectedMode">
          <template #trigger="{ styling, disabled }">
            <button type="button" class="not-disabled:cursor-pointer disabled:cursor-not-allowed" :class="styling" :disabled="disabled">
              <span>{{ role === 'admin' ? t('users.roleAdmin') : t('users.roleUser') }}</span>
              <Icon name="material-symbols:keyboard-arrow-down-rounded" class="w-4 h-4 shrink-0" aria-hidden="true" />
            </button>
          </template>

          <template #default="{ styling }">
            <button type="button" :class="styling" @click="selectRole('user')">
              {{ t('users.roleUser') }}
            </button>
            <button type="button" :class="styling" @click="selectRole('admin')">
              {{ t('users.roleAdmin') }}
            </button>
          </template>
        </MenuDropdown>
      </div>
    </div>

    <template #footer>
      <CommonFormActions
        :cancel-label="t('actions.cancel')"
        :submit-label="t('users.create')"
        :save-disabled="isConnectedMode || !newUsername || !newPassword"
        @cancel="showCreateModal = false; resetForm()"
        @submit="registerUser"
      />
    </template>
  </CommonModal>

  <CommonModal
    v-model="showUsernameModal"
    :title="t('users.changeUsernameTitle', { name: editedUser?.username })"
    @close="closeUsernameModal"
  >
    <div class="field">
      <label>{{ t('users.newUsername') }}</label>
      <input v-model="usernameForm" class="input" autocomplete="off" :disabled="isSavingUser">
    </div>

    <template #footer>
      <CommonFormActions
        :cancel-label="t('actions.cancel')"
        :submit-label="t('actions.save')"
        :save-disabled="isSavingUser || !usernameForm.trim()"
        @cancel="closeUsernameModal"
        @submit="changeUsername"
      />
    </template>
  </CommonModal>

  <CommonModal
    v-model="showPasswordModal"
    :title="t('users.setPasswordTitle', { name: editedUser?.username })"
    @close="closePasswordModal"
  >
    <p class="text-sm text-slate-600">{{ t('users.setPasswordText') }}</p>

    <div class="grid gap-4">
      <div class="field">
        <label>{{ t('settings.newPassword') }}</label>
        <input v-model="passwordForm.newPassword" type="password" class="input" autocomplete="new-password" :disabled="isSavingUser">
      </div>

      <div class="field">
        <label>{{ t('settings.confirmPassword') }}</label>
        <input v-model="passwordForm.confirmPassword" type="password" class="input" autocomplete="new-password" :disabled="isSavingUser">
      </div>

      <p class="text-xs text-slate-500">{{ t('settings.passwordHelp', { min: MIN_PASSWORD_LENGTH }) }}</p>
    </div>

    <template #footer>
      <CommonFormActions
        :cancel-label="t('actions.cancel')"
        :submit-label="t('actions.save')"
        :save-disabled="isSavingUser || !passwordForm.newPassword || !passwordForm.confirmPassword"
        @cancel="closePasswordModal"
        @submit="setPassword"
      />
    </template>
  </CommonModal>
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'
import { useToast } from '~/composables/useToast'
import { useLocaleFormatters } from '~/composables/useLocaleFormatters'
import { MIN_PASSWORD_LENGTH } from '~/config/validation'
import type { AdvancedTableColumn } from '~/composables/useAdvancedTable'

const { t } = useI18n()
const toast = useToast()
const { formatDateTime } = useLocaleFormatters()

const runtimeConfig = useRuntimeConfig()
const isConnectedMode = runtimeConfig.public.accountingMode === 'connected'

const users = ref<any[]>([])
const search = ref('')
const showCreateModal = ref(false)
const newUsername = ref('')
const newPassword = ref('')
const role = ref('user')
const roleDropdownOpen = ref<number | null>(null)

const editedUser = ref<any | null>(null)
const showUsernameModal = ref(false)
const showPasswordModal = ref(false)
const isSavingUser = ref(false)
const usernameForm = ref('')
const passwordForm = ref({ newPassword: '', confirmPassword: '' })

function selectRole(next: 'user' | 'admin') {
  role.value = next
  roleDropdownOpen.value = null
}

function resetForm() {
  newUsername.value = ''
  newPassword.value = ''
  role.value = 'user'
  roleDropdownOpen.value = null
}

const columns: AdvancedTableColumn<any>[] = [
  {
    key: 'id',
    label: t('users.id'),
    filterType: 'number',
    getValue: row => row.id,
  },
  {
    key: 'username',
    label: t('users.username'),
    globalSearchable: true,
    mobile: 'title',
    getValue: row => row.username,
  },
  {
    key: 'role',
    label: t('users.role'),
    getValue: row => row.role === 'admin' ? t('users.roleAdmin') : t('users.roleUser'),
  },
  {
    key: 'is_active',
    label: t('common.active'),
    filterable: false,
    sortable: false,
    getValue: row => row.is_active ? t('common.active') : t('common.inactive'),
  },
  {
    key: 'created_at',
    label: t('users.createdAt'),
    filterType: 'date',
    getValue: row => row.created_at,
    format: row => formatDateTime(row.created_at),
  },
]

async function loadUsers() {
  const res = await $fetch('/api/auth/users')
  if (res.ok) {
    users.value = 'users' in res ? res.users as any[] : []
  }
}

async function registerUser() {
  if (isConnectedMode) return

  const res = await $fetch('/api/auth/register', {
    method: 'POST',
    body: {
      username: newUsername.value,
      password: newPassword.value,
      role: role.value
    }
  })

  if (!res.ok) {
    toast.error('error' in res && res.error ? String(res.error) : t('common.unknownError'))
    return
  }

  toast.success(t('users.created'))
  showCreateModal.value = false
  resetForm()

  await loadUsers()
}

function translateUserError(error?: string) {
  if (error === 'Missing fields') return t('settings.passwordMissingFields')
  if (error === 'Password too short') return t('settings.passwordTooShort', { min: MIN_PASSWORD_LENGTH })
  if (error === 'Passwords do not match') return t('settings.passwordMismatch')
  if (error === 'Username required') return t('users.usernameRequired')
  if (error === 'Username already exists') return t('users.usernameExists')
  if (error === 'User not found') return t('users.notFound')
  if (error === 'User management is disabled in connected mode') return t('settings.credentialsConnectedNotice')
  return error || t('common.unknownError')
}

/** Runs one admin credential call, toasting either outcome and reloading the list on success. */
async function runUserAction(endpoint: string, body: Record<string, unknown>, successMessage: string) {
  if (isConnectedMode || isSavingUser.value) return false

  isSavingUser.value = true
  try {
    const res = await $fetch<{ ok: boolean, error?: string }>(endpoint, { method: 'POST', body })
    if (!res.ok) {
      toast.error(translateUserError(res.error))
      return false
    }

    toast.success(successMessage)
    await loadUsers()
    return true
  } catch {
    toast.error(t('common.unknownError'))
    return false
  } finally {
    isSavingUser.value = false
  }
}

function openUsernameModal(row: any) {
  editedUser.value = row
  usernameForm.value = row.username
  showUsernameModal.value = true
}

function closeUsernameModal() {
  if (isSavingUser.value) return
  showUsernameModal.value = false
  editedUser.value = null
  usernameForm.value = ''
}

function openPasswordModal(row: any) {
  editedUser.value = row
  passwordForm.value = { newPassword: '', confirmPassword: '' }
  showPasswordModal.value = true
}

function closePasswordModal() {
  if (isSavingUser.value) return
  showPasswordModal.value = false
  editedUser.value = null
  passwordForm.value = { newPassword: '', confirmPassword: '' }
}

async function changeUsername() {
  const target = editedUser.value
  if (!target) return

  const done = await runUserAction(
    '/api/auth/change-username',
    { user_id: target.id, username: usernameForm.value.trim() },
    t('users.usernameChanged'),
  )
  if (done) closeUsernameModal()
}

async function setPassword() {
  const target = editedUser.value
  if (!target) return

  const done = await runUserAction(
    '/api/auth/admin-set-password',
    {
      user_id: target.id,
      newPassword: passwordForm.value.newPassword,
      confirmPassword: passwordForm.value.confirmPassword,
    },
    t('users.passwordSet'),
  )
  if (done) closePasswordModal()
}

async function requirePasswordChange(row: any) {
  await runUserAction(
    '/api/auth/require-password-change',
    { user_id: row.id },
    t('users.passwordChangeRequired'),
  )
}

onMounted(() => {
  loadUsers()
})
useAppRefresh().onRefresh(loadUsers)
</script>
