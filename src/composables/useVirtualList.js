import { ref, computed, watch, onMounted, onActivated, onDeactivated, onBeforeUnmount, nextTick } from 'vue'

const ITEM_HEIGHT = 192
const VISIBLE_COUNT = 4
const BUFFER_COUNT = 2

const TAG = '[VL]'

export function useVirtualList(itemsRef, containerRef) {
  const scrollTop = ref(0)
  const initialized = ref(false)

  const startIndex = ref(0)
  const endIndex = ref(0)

  function recalcRange() {
    const el = containerRef.value
    const clientH = el ? el.clientHeight : 0
    const st = el ? el.scrollTop : scrollTop.value
    scrollTop.value = st

    const rawStart = Math.floor(st / ITEM_HEIGHT)
    const newStart = Math.max(0, rawStart - BUFFER_COUNT)
    const rawEnd = Math.ceil((st + clientH) / ITEM_HEIGHT)
    const newEnd = Math.min(itemsRef.value.length, rawEnd + BUFFER_COUNT)

    if (newStart !== startIndex.value || newEnd !== endIndex.value) {
      startIndex.value = newStart
      endIndex.value = newEnd
      console.debug(TAG, 'range changed', `start=${newStart} end=${newEnd} count=${newEnd - newStart} total=${itemsRef.value.length}`)
      return true
    }
    return false
  }

  const visibleItems = computed(() => {
    const items = itemsRef.value.slice(startIndex.value, endIndex.value)
    return items.map((item, i) => ({
      ...item,
      _virtualIndex: startIndex.value + i,
    }))
  })

  const totalHeight = computed(() => itemsRef.value.length * ITEM_HEIGHT)

  const offsetY = computed(() => startIndex.value * ITEM_HEIGHT)

  let ticking = false

  const onScroll = () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        recalcRange()
        ticking = false
      })
      ticking = true
    }
  }

  function syncFromDom() {
    const el = containerRef.value
    if (el && itemsRef.value.length > 0) {
      scrollTop.value = el.scrollTop
      recalcRange()
    }
  }

  function setup() {
    const el = containerRef.value
    if (!el) return
    el.addEventListener('scroll', onScroll, { passive: true })

    console.debug(
      TAG,
      'init',
      `items=${itemsRef.value.length} visible=${VISIBLE_COUNT} buffer=${BUFFER_COUNT} itemH=${ITEM_HEIGHT}`,
    )

    if (itemsRef.value.length > 0) {
      syncFromDom()
    }
    initialized.value = true
  }

  function teardown() {
    const el = containerRef.value
    if (!el) return
    el.removeEventListener('scroll', onScroll)
  }

  onMounted(() => {
    nextTick(() => setup())
  })

  onActivated(() => {
    nextTick(() => {
      const el = containerRef.value
      if (el && !initialized.value) {
        setup()
      } else if (el && itemsRef.value.length > 0) {
        syncFromDom()
      }
    })
  })

  onDeactivated(() => {
    teardown()
    initialized.value = false
  })

  onBeforeUnmount(() => {
    teardown()
  })

  watch(
    () => itemsRef.value.length,
    (len, oldLen) => {
      if (len > 0 && oldLen === 0) {
        nextTick(() => syncFromDom())
      }
    },
  )

  return {
    visibleItems,
    totalHeight,
    offsetY,
    initialized,
    syncFromDom,
    ITEM_HEIGHT,
  }
}
