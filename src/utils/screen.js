import { ScreenOrientation } from '@capacitor/screen-orientation'
import { KeepAwake } from '@capacitor-community/keep-awake'

// 竖屏
export async function lockToPortrait() {
  try {
    await ScreenOrientation.lock({ orientation: 'portrait' })
  } catch (error) {
    console.warn('Failed to lock to portrait:', error)
  }
}
// 横屏
export async function lockToLandscape() {
  try {
    await ScreenOrientation.lock({ orientation: 'landscape' })
  } catch (error) {
    console.warn('Failed to lock to landscape:', error)
  }
}


// 进入页面时保持常亮
export async function enableScreenKeepAwake() {
  await KeepAwake.keepAwake()
}

// 离开页面时恢复自动息屏
export async function disableScreenKeepAwake() {
  await KeepAwake.allowSleep()
}
