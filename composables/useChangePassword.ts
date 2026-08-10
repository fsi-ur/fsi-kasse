import { ref } from 'vue'
import { useI18n } from '~/composables/useI18n'
import { useToast } from '~/composables/useToast'
import { MIN_PASSWORD_LENGTH } from '~/config/validation'
import type { ChangePasswordResponse } from '~/server/api/auth/change-password.post'

/**
 * Shared by the Settings modal and the forced-change page — both post the same
 * body to the same endpoint and have to translate the same server error strings.
 */
export function useChangePassword() {
  const { t } = useI18n()
  const toast = useToast()

  const isChangingPassword = ref(false)
  const passwordForm = ref({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })

  function resetPasswordForm() {
    passwordForm.value = {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    }
  }

  function translatePasswordError(error?: string) {
    if (error === 'Missing fields') return t('settings.passwordMissingFields')
    if (error === 'Password too short') return t('settings.passwordTooShort', { min: MIN_PASSWORD_LENGTH })
    if (error === 'Passwords do not match') return t('settings.passwordMismatch')
    if (error === 'Invalid current password') return t('settings.currentPasswordInvalid')
    if (error === 'User management is disabled in connected mode') return t('settings.credentialsConnectedNotice')
    return error || t('settings.passwordFailed')
  }

  /** Returns true when the password was actually changed. Toasts on every failure. */
  async function submitPasswordChange(): Promise<boolean> {
    if (isChangingPassword.value) return false

    const form = passwordForm.value

    if (!form.currentPassword || !form.newPassword || !form.confirmPassword) {
      toast.error(t('settings.passwordMissingFields'))
      return false
    }

    if (form.newPassword.length < MIN_PASSWORD_LENGTH) {
      toast.error(t('settings.passwordTooShort', { min: MIN_PASSWORD_LENGTH }))
      return false
    }

    if (form.newPassword !== form.confirmPassword) {
      toast.error(t('settings.passwordMismatch'))
      return false
    }

    isChangingPassword.value = true
    try {
      const res = await $fetch<ChangePasswordResponse>('/api/auth/change-password', {
        method: 'POST',
        body: {
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
          confirmPassword: form.confirmPassword,
        },
      })

      if (!res.ok) {
        toast.error(translatePasswordError(res.error))
        return false
      }

      resetPasswordForm()
      return true
    } catch {
      toast.error(t('settings.passwordFailed'))
      return false
    } finally {
      isChangingPassword.value = false
    }
  }

  return { isChangingPassword, passwordForm, resetPasswordForm, submitPasswordChange }
}
