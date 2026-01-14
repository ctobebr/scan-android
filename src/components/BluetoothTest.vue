<template>
  <div class="container">
    <h1>蓝牙设备管理</h1>

    <div class="control-panel">
      <button @click="handleInit" :disabled="loading">初始化蓝牙</button>
      <button @click="handleScan" :disabled="scanning || loading">
        {{ scanning ? '扫描中...' : '扫描设备' }}
      </button>
      <button @click="handleStopScan" :disabled="!scanning || loading">停止扫描</button>
      <button @click="clearDevices" :disabled="loading">清空列表</button>
    </div>

    <div v-if="error" class="error-alert">
      {{ error }}
    </div>

    <div class="device-section">
      <h3>设备列表 ({{ devices.length }})</h3>
      <div v-if="devices.length === 0" class="empty-state">
        暂无设备，点击扫描按钮开始搜索
      </div>

      <div v-else class="device-list">
        <div v-for="device in devices" :key="device.deviceId" class="device-card">
          <div class="device-info">
            <div class="device-name">{{ device.name || '未知设备' }}</div>
            <div class="device-id">{{ device.deviceId }}</div>
            <div v-if="device.rssi" class="device-rssi">
              信号: {{ device.rssi }} dBm
            </div>
          </div>

          <div class="device-actions">
            <button
              @click="connectDevice(device)"
              :disabled="loading || connectedDeviceId === device.deviceId"
              class="btn-connect"
            >
              {{ connectedDeviceId === device.deviceId ? '已连接' : '连接' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="connectedDeviceId" class="connection-section">
      <h3>已连接设备</h3>
      <div class="connected-info">
        <div>设备ID: {{ connectedDeviceId }}</div>
        <div>状态: <span class="status-connected">已连接</span></div>
        <button @click="disconnectDevice" class="btn-disconnect">断开连接</button>
      </div>

      <div class="data-section">
        <h4>数据通信</h4>
        <div class="input-group">
          <input
            v-model="sendData"
            placeholder="输入要发送的数据"
            :disabled="loading"
          />
          <button @click="sendDataToDevice" :disabled="!sendData || loading">
            发送
          </button>
        </div>

        <div class="received-data">
          <h5>接收到的数据:</h5>
          <pre>{{ receivedData }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { bluetoothService } from '../services/bluetoothService';

const bluetoothState = ref({
  enabled: false,     // 蓝牙是否开启
  initialized: false, // 是否完成初始化
  error: null,
  loading: true
});
const scanning = ref(false);
const loading = ref(false);
const error = ref('');
const devices = ref([]);
const connectedDeviceId = ref('');
const sendData = ref('');
const receivedData = ref('');

onMounted(async () => {
  try {
    // 1. 检查蓝牙是否开启
    const enabled = await bluetoothService.isBluetoothEnabled();
    if (!enabled) {
      bluetoothState.value.error = '请先打开手机蓝牙';
      bluetoothState.value.loading = false;
      alert('请先打开手机蓝牙')
      return;
    }

    // 2. 初始化 BLE
    await bluetoothService.requestPermissions();
    await bluetoothService.initBluetooth();

    // 3. 更新状态
    bluetoothState.value.enabled = true;
    bluetoothState.value.initialized = true;
  } catch (err) {
    bluetoothState.value.error = err.message || '蓝牙初始化失败';
  } finally {
    bluetoothState.value.loading = false;
  }
})

// const handleInit = async () => {
//   try {
//     loading.value = true;
//     error.value = '';
//     await bluetoothService.requestPermissions();
//     await bluetoothService.initBluetooth();
//     alert('蓝牙初始化成功');
//   } catch (err) {
//     error.value = err.message || '初始化失败';
//   } finally {
//     loading.value = false;
//   }
// };

const handleScan = async () => {
  try {
    scanning.value = true;
    loading.value = true;
    devices.value = [];

    const foundDevices = await bluetoothService.scanDevices(10000);
    devices.value = foundDevices; // ✅ 等待扫描结束再赋值

  } catch (err) {
    error.value = err.message || '扫描失败';
  } finally {
    alert('扫描结束');
    scanning.value = false;
    loading.value = false;
  }
};

const handleStopScan = async () => {
  await bluetoothService.stopScan();
  scanning.value = false;
  loading.value = false;
};

const clearDevices = () => {
  devices.value = [];
  bluetoothService.clearDevices();
};

const connectDevice = async (device) => {
  try {
    loading.value = true;
    error.value = '';
    await bluetoothService.connectDevice(device.deviceId);
    connectedDeviceId.value = device.deviceId;

    // 示例：订阅通知（需要实际的UUID）
    // await bluetoothService.subscribeToNotifications(
    //   device.deviceId,
    //   '0000ffe0-0000-1000-8000-00805f9b34fb',
    //   '0000ffe1-0000-1000-8000-00805f9b34fb',
    //   (value) => {
    //     receivedData.value += value + '\n';
    //   }
    // );

  } catch (err) {
    error.value = err.message || '连接失败';
  } finally {
    loading.value = false;
  }
};

const disconnectDevice = async () => {
  try {
    loading.value = true;
    await bluetoothService.disconnectDevice(connectedDeviceId.value);
    connectedDeviceId.value = '';
    receivedData.value = '';
  } catch (err) {
    error.value = err.message || '断开连接失败';
  } finally {
    loading.value = false;
  }
};

const sendDataToDevice = async () => {
  if (!connectedDeviceId.value || !sendData.value) return;

  try {
    loading.value = true;
    // 示例：发送数据到特定特征（需要实际的UUID）
    // await bluetoothService.writeData(
    //   connectedDeviceId.value,
    //   '0000ffe0-0000-1000-8000-00805f9b34fb',
    //   '0000ffe1-0000-1000-8000-00805f9b34fb',
    //   sendData.value
    // );

    receivedData.value += `发送: ${sendData.value}\n`;
    sendData.value = '';
  } catch (err) {
    error.value = err.message || '发送失败';
  } finally {
    loading.value = false;
  }
};

onUnmounted(() => {
  if (connectedDeviceId.value) {
    bluetoothService.disconnectDevice(connectedDeviceId.value);
  }
  bluetoothService.stopScan();
});
</script>

<style scoped>
.container {
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
}

.control-panel {
  display: flex;
  gap: 10px;
  margin: 20px 0;
  flex-wrap: wrap;
}

.control-panel button {
  padding: 10px 20px;
  border: none;
  border-radius: 5px;
  background: #007bff;
  color: white;
  cursor: pointer;
  font-size: 14px;
}

.control-panel button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.error-alert {
  background: #f8d7da;
  color: #721c24;
  padding: 10px;
  border-radius: 5px;
  margin: 10px 0;
}

.device-section, .connection-section {
  margin-top: 30px;
  padding: 20px;
  border: 1px solid #ddd;
  border-radius: 8px;
}

.empty-state {
  text-align: center;
  color: #999;
  padding: 40px;
}

.device-list {
  margin-top: 15px;
}

.device-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  border: 1px solid #eee;
  border-radius: 5px;
  margin-bottom: 10px;
  background: #f9f9f9;
}

.device-info .device-name {
  font-weight: bold;
  margin-bottom: 5px;
}

.device-info .device-id {
  font-family: monospace;
  font-size: 12px;
  color: #666;
  margin: 5px 0;
}

.device-rssi {
  font-size: 12px;
  color: #888;
}

.btn-connect {
  padding: 8px 15px;
  background: #28a745;
  color: white;
  border: none;
  border-radius: 3px;
  cursor: pointer;
}

.btn-connect:disabled {
  background: #6c757d;
}

.connected-info {
  background: #e7f3ff;
  padding: 15px;
  border-radius: 5px;
  margin: 10px 0;
}

.status-connected {
  color: #28a745;
  font-weight: bold;
}

.btn-disconnect {
  padding: 8px 15px;
  background: #dc3545;
  color: white;
  border: none;
  border-radius: 3px;
  margin-top: 10px;
  cursor: pointer;
}

.data-section {
  margin-top: 20px;
}

.input-group {
  display: flex;
  gap: 10px;
  margin: 10px 0;
}

.input-group input {
  flex: 1;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 5px;
}

.received-data {
  margin-top: 20px;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 5px;
}

.received-data pre {
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: monospace;
  font-size: 14px;
}
</style>
