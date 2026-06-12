<template>
  <div class="col-span-12 p-4 bg-white shadow-lg rounded-xl">
    <h2 class="text-lg font-semibold mb-2">{{ t('users.createUser') }}</h2>
    <p
      v-if="isConnectedMode"
      class="mb-4 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900"
    >
      {{ t('users.connectedNotice') }}
    </p>
    <div class="flex flex-col gap-3 max-w-sm">
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
      <button
        @click="registerUser"
        class="btn-primary"
        :disabled="isConnectedMode || !newUsername || !newPassword"
      >
        {{ t('users.create') }}
      </button>

      <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
      <p v-if="message" class="text-sm text-green-600">{{ message }}</p>
    </div>
  </div>

  <div class="col-span-12 p-4 bg-white shadow-lg rounded-xl">
    <h2 class="text-lg font-semibold mb-4">{{ t('users.allUsers') }}</h2>
    <table class="w-full text-sm border-collapse">
      <thead>
        <tr class="border-b border-slate-300 text-slate-600">
          <th class="text-left p-2 font-semibold">{{ t('users.id') }}</th>
          <th class="text-left p-2 font-semibold">{{ t('users.username') }}</th>
          <th class="text-left p-2 font-semibold">{{ t('users.role') }}</th>
          <th class="text-left p-2 font-semibold">{{ t('common.active') }}</th>
          <th class="text-left p-2 font-semibold">{{ t('users.createdAt') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="u in users" :key="u.id" class="border-b border-slate-200">
          <td class="p-2">{{ u.id }}</td>
          <td class="p-2">{{ u.username }}</td>
          <td class="p-2">{{ u.role }}</td>
          <td class="p-2">
            <span :class="u.is_active ? 'text-green-600' : 'text-red-600'">
              {{ u.is_active ? t('common.yes') : t('common.no') }}
            </span>
          </td>
          <td class="p-2">{{ u.created_at }}</td>
        </tr>
      </tbody>
    </table>

    <div v-if="users.length === 0" class="text-gray-400 mt-4">
      {{ t('users.none') }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'

const { t } = useI18n()

const runtimeConfig = useRuntimeConfig()
const isConnectedMode = runtimeConfig.public.accountingMode === 'connected'

const users = ref<any[]>([])
const newUsername = ref('')
const newPassword = ref('')
const role = ref('user')
const roleDropdownOpen = ref<number | null>(null)

function selectRole(next: 'user' | 'admin') {
  role.value = next
  roleDropdownOpen.value = null
}

const error = ref('')
const message = ref('')

async function loadUsers() {
  const res = await $fetch('/api/auth/users')
  if (res.ok) {
    users.value = 'users' in res ? res.users as any[] : []
  }
}

async function registerUser() {
  if (isConnectedMode) return

  error.value = ''
  message.value = ''

  const res = await $fetch('/api/auth/register', {
    method: 'POST',
    body: {
      username: newUsername.value,
      password: newPassword.value,
      role: role.value
    }
  })

  if (!res.ok) {
    error.value = 'error' in res ? res.error : t('common.unknownError')
    return
  }

  message.value = t('users.created')
  newUsername.value = ''
  newPassword.value = ''
  role.value = 'user'

  await loadUsers()
}

onMounted(() => {
  loadUsers()
})
useAppRefresh().onRefresh(loadUsers)
</script>
