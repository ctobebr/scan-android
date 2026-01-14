<template>
  <div id="app" style="padding: 20px; font-family: Arial, sans-serif;">

    <h1>Android Demo: Camera + Bluetooth</h1>

    <!-- 拍照区域 -->
    <section style="margin-bottom: 30px;">
      <h2>📸 拍照功能</h2>
      <button @click="takePhoto" :disabled="isTakingPhoto">
        {{ isTakingPhoto ? '拍照中...' : '点击拍照' }}
      </button>
      <br /><br />
      <img
        v-if="photo"
        :src="photo"
        alt="拍摄的照片"
        style="max-width: 100%; border: 1px solid #ccc; border-radius: 8px;"
      />
    </section>


    <section>
      <!-- <h2>🔵 蓝牙功能</h2>
      <p>状态: <strong>{{ bluetoothStatus }}</strong></p>

      <div style="margin: 10px 0;">
        <button @click="startScan" :disabled="isScanning">
          {{ isScanning ? '扫描中...' : '开始扫描设备' }}
        </button>
        <button @click="stopScan" :disabled="!isScanning" style="margin-left: 10px;">
          停止扫描
        </button>
      </div>


      <ul v-if="devices.length > 0" style="list-style-type: none; padding: 0;">
        <li
          v-for="device in devices"
          :key="device.deviceId"
          style="padding: 8px; margin: 5px 0; background: #f0f0f0; border-radius: 4px;"
        >
          {{ device.name || '未知设备' }} ({{ device.deviceId }})
          <button
            @click="connectToDevice(device.deviceId)"
            :disabled="connectingDevice === device.deviceId"
            style="margin-left: 10px; font-size: 12px;"
          >
            {{ connectingDevice === device.deviceId ? '连接中...' : '连接' }}
          </button>
        </li>
      </ul>


      <div v-if="receivedData" style="margin-top: 15px; padding: 10px; background: #e6f7ff; border-radius: 4px;">
        <strong>接收到的数据:</strong>
        <pre>{{ receivedData }}</pre>
        <button @click="saveReceivedData" style="margin-top: 8px;">💾 保存为文件</button>
      </div> -->
      <BluetoothTest />

    </section>
  </div>
</template>

<script setup>
import { ref, } from 'vue';
import { Camera, CameraResultType } from '@capacitor/camera';
// import { BleClient } from '@capacitor-community/bluetooth-le';
// import { Filesystem, Directory } from '@capacitor/filesystem';
import BluetoothTest from './components/BluetoothTest.vue';







// ===== 拍照相关 =====
const photo = ref(null);
const isTakingPhoto = ref(false);

async function takePhoto() {
  if (isTakingPhoto.value) return;
  isTakingPhoto.value = true;
  try {
    const image = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
    });
    photo.value = image.dataUrl;
  } catch (error) {
    console.error('拍照失败:', error);
    alert('拍照失败，请检查权限');
  } finally {
    isTakingPhoto.value = false;
  }
}

// ===== 蓝牙相关 =====
// const bluetoothStatus = ref('未初始化');
// const isScanning = ref(false);
// const devices = ref([]);
// const connectingDevice = ref(null);
// const receivedData = ref('');


// 初始化蓝牙

// let scanActive = false; // 标记扫描是否逻辑上活跃
// onMounted(async () => {
//   try {
//     await BleClient.initialize();
//     bluetoothStatus.value = '已就绪';
//   } catch (err) {
//     bluetoothStatus.value = '初始化失败';
//     console.error('蓝牙初始化失败:', err);
//   }
// });

// async function startScan() {
//   if (isScanning.value) return;
//   isScanning.value = true;
//   scanActive = true; // ← 启用逻辑标记
//   devices.value = [];
//   bluetoothStatus.value = '正在扫描...';

//   try {
//     await BleClient.requestLEScan({
//       onScanResult: (result) => {
//         // ✅ 关键：检查组件是否仍处于活跃扫描状态
//         if (!scanActive || !isScanning.value) return;

//         if (result?.device) {
//           const existing = devices.value.find(d => d.deviceId === result.device.deviceId);
//           if (!existing) {
//             devices.value.push(result.device);
//           }
//         }
//       }
//     });

//     setTimeout(async () => {
//       await stopScan();
//     }, 5000);
//   } catch (err) {
//     console.error('扫描失败:', err);
//     bluetoothStatus.value = '扫描失败: ' + (err.message || '');
//     isScanning.value = false;
//     scanActive = false;
//   }
// }


// async function stopScan() {
//   try {
//     scanActive = false; // ← 先标记
//     await BleClient.stopLEScan();
//     isScanning.value = false;
//     bluetoothStatus.value = '扫描已停止';
//   } catch (err) {
//     console.error('停止扫描失败:', err);
//   }
// }
// async function connectToDevice(deviceId) {
//   if (connectingDevice.value) return;
//   connectingDevice.value = deviceId;
//   bluetoothStatus.value = `正在连接 ${deviceId}...`;

//   try {
//     await BleClient.connect(deviceId);

//     // 👇 替换为你设备的实际 UUID（关键！）
//     const SERVICE_UUID = '0000180D-0000-1000-8000-00805F9B34FB'; // 示例：心率服务
//     const CHARACTERISTIC_UUID = '00002A37-0000-1000-8000-00805F9B34FB'; // 示例：心率测量

//     // 监听通知
//     await BleClient.startNotifications(
//       deviceId,
//       SERVICE_UUID,
//       CHARACTERISTIC_UUID,
//       (value) => {
//         const text = new TextDecoder().decode(value);
//         receivedData.value = text;
//         bluetoothStatus.value = '已连接并接收数据';
//       }
//     );

//     bluetoothStatus.value = '✅ 已连接';
//   } catch (err) {
//     console.error('连接失败:', err);
//     bluetoothStatus.value = '连接失败';
//     alert('连接失败：' + (err.message || '未知错误'));
//   } finally {
//     connectingDevice.value = null;
//   }
// }

// ===== 保存文件 =====
// async function saveReceivedData() {
//   if (!receivedData.value) return;

//   try {
//     const fileName = `bluetooth_data_${Date.now()}.txt`;
//     await Filesystem.writeFile({
//       path: fileName,
//       data: receivedData.value,
//       directory: Directory.Documents,
//       encoding: 'utf8'
//     });
//     alert(`文件已保存到手机“文档”目录：${fileName}`);
//   } catch (err) {
//     console.error('保存失败:', err);
//     alert('保存失败：' + (err.message || '请检查权限'));
//   }
// }
// onUnmounted(() => {
//   // 组件销毁时，确保停止扫描
//   if (isScanning.value) {
//     stopScan();
//   }
//   scanActive = false;
// });
</script>

<style>
#app {
  max-width: 600px;
  margin: 0 auto;
}
button {
  padding: 8px 16px;
  background: #42b883;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
button:disabled {
  background: #cccccc;
  cursor: not-allowed;
}
</style>
