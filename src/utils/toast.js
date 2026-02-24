import { Toast } from '@capacitor/toast'

export const showToast = async (message, duration = 2000) => {
  await Toast.show({ text: message, duration: duration })
}
