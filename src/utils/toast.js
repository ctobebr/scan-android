import { Toast } from '@capacitor/toast'

export const showToast = async (message) => {
  await Toast.show({ text: message, duration: 2000 })
}
