/**
 * Clears stale body scroll / pointer locks left by reka Dialog/Sheet/Drawer
 * (and our MediaLightbox) when overlays fail to unlock on mobile.
 * Only runs when no open modal overlay is still present.
 */
const OPEN_OVERLAY_SELECTOR = [
  '[data-slot="dialog-overlay"][data-state="open"]',
  '[data-slot="sheet-overlay"][data-state="open"]',
  '[data-slot="drawer-overlay"][data-state="open"]',
  '[data-slot="alert-dialog-overlay"][data-state="open"]',
].join(',')

export function hasOpenModalOverlay() {
  if (!import.meta.client)
    return false
  return Boolean(document.querySelector(OPEN_OVERLAY_SELECTOR))
}

export function unlockBodyScroll(options?: { force?: boolean }) {
  if (!import.meta.client)
    return

  if (!options?.force) {
    const loginOpen = useState<boolean>('login-dialog-open', () => false)
    const lightbox = useState('polox-media-lightbox', () => null)
    if (loginOpen.value || lightbox.value || hasOpenModalOverlay())
      return
  }

  const body = document.body
  body.style.pointerEvents = ''
  body.style.overflow = ''
  body.style.paddingRight = ''
  body.style.marginRight = ''
  document.documentElement.style.overflow = ''
  document.documentElement.style.removeProperty('--scrollbar-width')
}

export function useBodyScrollUnlock() {
  return {
    unlockBodyScroll,
    hasOpenModalOverlay,
  }
}
