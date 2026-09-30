let lockCount = 0
let lockScrollY = 0

function lockBodyScroll() {
  lockCount += 1
  if (lockCount > 1) return

  lockScrollY = window.scrollY
  const body = document.body.style
  body.position = 'fixed'
  body.top = `-${lockScrollY}px`
  body.left = '0'
  body.right = '0'
  body.overflow = 'hidden'
}

function unlockBodyScroll() {
  if (lockCount === 0) return
  lockCount -= 1
  if (lockCount > 0) return

  const body = document.body.style
  body.position = ''
  body.top = ''
  body.left = ''
  body.right = ''
  body.overflow = ''
  window.scrollTo(0, lockScrollY)
}

/**
 * Locks page scrolling while `isOpen` is true. Reference-counted so multiple overlays (a modal
 * opened from within another) can be open at once without the first close re-enabling scroll.
 */
export function useBodyScrollLock(isOpen: Ref<boolean>) {
  let isLockedByThisInstance = false

  if (import.meta.client) {
    watch(isOpen, (open) => {
      if (open === isLockedByThisInstance) return
      isLockedByThisInstance = open
      if (open) lockBodyScroll()
      else unlockBodyScroll()
    }, { immediate: true })
  }

  onBeforeUnmount(() => {
    if (isLockedByThisInstance) {
      isLockedByThisInstance = false
      unlockBodyScroll()
    }
  })
}
