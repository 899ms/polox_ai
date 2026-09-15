export default defineNuxtPlugin(() => {
  const router = useRouter()
  const { close: closeLightbox } = useMediaLightbox()
  const { unlockBodyScroll } = useBodyScrollUnlock()

  function sweep() {
    // Close lightbox on navigation so its body.overflow lock cannot linger.
    closeLightbox()
    nextTick(() => {
      requestAnimationFrame(() => unlockBodyScroll())
    })
  }

  router.afterEach(() => {
    sweep()
  })

  if (!import.meta.client)
    return

  window.addEventListener('pageshow', () => {
    nextTick(() => unlockBodyScroll())
  })
})
