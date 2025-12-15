<template>
  <FormConfirmation headline="Logout" @cancel="cancel" @confirm="confirm">
    <template #message>
      <p>Do you really want to log out?</p>
    </template>
  </FormConfirmation>
</template>
<script setup lang="ts">
const { setPage } = usePage()
const { user, logout, fetchSession } = useAuth()

function confirm() {
  setPage('Checkout')
  logout()
}
  
async function cancel() {
  await fetchSession()
  if (!user.value) { 
    setPage('Login')
  } else {
    setPage('Checkout')
  }
}
</script>