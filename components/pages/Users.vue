<template>
  <Page headline1="User Management" @open-menu="$emit('openMenu')">
    <template #cards>
      <div class="col-span-12 p-4 bg-white shadow-lg rounded-xl">
        <h2 class="text-xl font-semibold mb-2">Create New User</h2>
        <div class="flex flex-col gap-2 max-w-sm">
          <input
            v-model="newUsername"
            placeholder="New Username"
            class="outline outline-gray-300 bg-gray-100 p-2 rounded-md"
            autocomplete="new-username"
          />
          <input
            v-model="newPassword"
            placeholder="New Password"
            type="password"
            class="outline outline-gray-300 bg-gray-100 p-2 rounded-md"
            autocomplete="new-password"
          />
          <select v-model="role" class="outline outline-gray-300 bg-gray-100 p-2 rounded-md">
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
          <button
            @click="registerUser"
            class="bg-cyan-600 hover:bg-cyan-700 text-white px-3 py-2 rounded-md cursor-pointer"
          >
            Create User
          </button>

          <p v-if="error" class="text-red-500">{{ error }}</p>
          <p v-if="message" class="text-green-600">{{ message }}</p>
        </div>
      </div>

      <div class="col-span-12 p-4 bg-white shadow-lg rounded-xl">
        <h2 class="text-xl font-semibold mb-4">All Users</h2>
        <table class="w-full border-collapse">
          <thead>
            <tr class="border-b font-semibold">
              <th class="text-left p-2">ID</th>
              <th class="text-left p-2">Username</th>
              <th class="text-left p-2">Role</th>
              <th class="text-left p-2">Active</th>
              <th class="text-left p-2">Created</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in users" :key="u.id" class="border-b">
              <td class="p-2">{{ u.id }}</td>
              <td class="p-2">{{ u.username }}</td>
              <td class="p-2">{{ u.role }}</td>
              <td class="p-2">
                <span :class="u.is_active ? 'text-green-600' : 'text-red-600'">
                  {{ u.is_active ? 'Yes' : 'No' }}
                </span>
              </td>
              <td class="p-2">{{ u.created_at }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </Page>
</template>

<script setup lang="ts">
const emit = defineEmits<{
  (e: 'openMenu'): void
}>()

const users = ref<any[]>([])
const newUsername = ref('')
const newPassword = ref('')
const role = ref('user')

const error = ref('')
const message = ref('')

async function loadUsers() {
  const res = await $fetch('/api/auth/users')
  if (res.ok) {
    users.value = 'users' in res ? res.users as any[] : []
  }
}

async function registerUser() {
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
    error.value = 'error' in res ? res.error : 'Unknown error'
    return
  }

  message.value = 'User created!'
  newUsername.value = ''
  newPassword.value = ''
  role.value = 'user'

  await loadUsers()
}

onMounted(() => {
  loadUsers()
})
</script>