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
// 解锁屏幕旋转，跟随系统设置
export async function unlockOrientation() {
  try {
    await ScreenOrientation.lock({ orientation: 'any' })
  } catch (error) {
    console.warn('Failed to unlock orientation:', error)
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
