import { ScreenOrientation } from '@capacitor/screen-orientation'

export async function lockToPortrait() {
  try {
    await ScreenOrientation.lock({ orientation: 'portrait' })
  } catch (error) {
    console.warn('Failed to lock to portrait:', error)
  }
}

export async function lockToLandscape() {
  try {
    await ScreenOrientation.lock({ orientation: 'landscape' })
  } catch (error) {
    console.warn('Failed to lock to landscape:', error)
  }
}
