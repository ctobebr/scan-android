export async function setImmersive(on = true) {
  try {
    // 优先使用 Capacitor 插件（如果可用）
    const cap =
      window.Capacitor && window.Capacitor.Plugins
        ? window.Capacitor.Plugins
        : window.Capacitor
          ? window.Capacitor
          : null
    if (cap && cap.ImmersiveMode && typeof cap.ImmersiveMode.setImmersive === 'function') {
      await cap.ImmersiveMode.setImmersive({ immersive: !!on })
      return
    }

    // 其次尝试 JS 接口（由 MainActivity 添加）
    if (window.AndroidImmersive && typeof window.AndroidImmersive.setImmersive === 'function') {
      try {
        window.AndroidImmersive.setImmersive(!!on)
        return
      } catch (e) {
        console.warn('AndroidImmersive call failed', e)
      }
    }

    // 最后降级到 StatusBar 覆盖/背景设置作为兼容处理
    if (cap && cap.StatusBar && typeof cap.StatusBar.setOverlaysWebView === 'function') {
      await cap.StatusBar.setOverlaysWebView({ overlay: !!on })
      if (cap.StatusBar.setBackgroundColor) {
        await cap.StatusBar.setBackgroundColor({ color: on ? '#000000' : '#ffffff' })
      }
    }
  } catch (err) {
    console.warn('setImmersive failed', err)
  }
}
