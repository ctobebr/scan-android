<template>
  <div class="setting-container">
    <!-- 参数卡片列表 - 滚动区域 -->
    <div class="cards-scroll">
      <div class="param-card">
        <div class="card-header">
          <div class="card-title">
            <span class="title-text">标定参数</span>
          </div>
          <van-button
            size="small"
            type="primary"
            plain
            @click="saveParam('calib')"
            :loading="savingState.calib"
            :disabled="deviceDisconnected || savingState.calib || !isCalibValid"
            style="width: 64px;"
            >保存</van-button
          >
        </div>

        <div class="six-axis-grid">
          <!-- 第一行 X Y Z -->
          <div class="axis-row">
            <div class="axis-item">
              <label>X <span class="unit">(mm)</span></label>
              <van-field
                v-model="calibParams.x"
                type="text"
                placeholder="0.00"
                inputmode="decimal"
                @blur="() => validateAndFormat('calib', 'x', 2)"
                @input="handleNumberInput"
                :disabled="deviceDisconnected"
                :error="!!calibErrors.x"
              />
              <div v-if="calibErrors.x" class="field-error-hint">
                <van-icon name="warning-o" /> {{ calibErrors.x }}
              </div>
            </div>
            <div class="axis-item">
              <label>Y <span class="unit">(mm)</span></label>
              <van-field
                v-model="calibParams.y"
                type="text"
                placeholder="0.00"
                inputmode="decimal"
                @blur="() => validateAndFormat('calib', 'y', 2)"
                @input="handleNumberInput"
                :disabled="deviceDisconnected"
                :error="!!calibErrors.y"
              />
              <div v-if="calibErrors.y" class="field-error-hint">
                <van-icon name="warning-o" /> {{ calibErrors.y }}
              </div>
            </div>
            <div class="axis-item">
              <label>Z <span class="unit">(mm)</span></label>
              <van-field
                v-model="calibParams.z"
                type="text"
                placeholder="0.00"
                inputmode="decimal"
                @blur="() => validateAndFormat('calib', 'z', 2)"
                @input="handleNumberInput"
                :disabled="deviceDisconnected"
                :error="!!calibErrors.z"
              />
              <div v-if="calibErrors.z" class="field-error-hint">
                <van-icon name="warning-o" /> {{ calibErrors.z }}
              </div>
            </div>
          </div>
          <!-- 第二行 pitch roll yaw -->
          <!-- <div class="axis-row">
            <div class="axis-item">
              <label>pitch <span class="unit">(rad)</span></label>
              <van-field v-model="calibParams.pitch" type="digit" placeholder="0.00" />
            </div>
            <div class="axis-item">
              <label>roll <span class="unit">(rad)</span></label>
              <van-field v-model="calibParams.roll" type="digit" placeholder="0.00" />
            </div>
            <div class="axis-item">
              <label>yaw <span class="unit">(rad)</span></label>
              <van-field v-model="calibParams.yaw" type="digit" placeholder="0.00" />
            </div>
          </div> -->
        </div>
      </div>

      <!-- 转动速度卡片 -->
      <div class="param-card">
        <div class="card-header">
          <div class="card-title">
            <span class="title-text">转动速度</span>
          </div>
          <van-button
            size="small"
            type="primary"
            plain
            @click="saveParam('speed')"
            :loading="savingState.speed"
            :disabled="deviceDisconnected || savingState.speed || !isSpeedValid"
            style="width: 64px;"
            >保存</van-button
          >
        </div>

        <div class="dual-row">
          <div class="axis-item">
            <label>pitch <span class="unit">(rpm)</span></label>
            <van-field
              v-model="speedParams.pitchSpeed"
              type="text"
              placeholder="16.7"
              inputmode="decimal"
              @blur="() => validateAndFormat('speed', 'pitchSpeed', 1)"
              @input="handleNumberInput"
              :disabled="deviceDisconnected"
              :error="!!speedErrors.pitchSpeed"
            />
            <div v-if="speedErrors.pitchSpeed" class="field-error-hint">
              <van-icon name="warning-o" /> {{ speedErrors.pitchSpeed }}
            </div>
          </div>
          <div class="axis-item">
            <label>yaw <span class="unit">(rpm)</span></label>
            <van-field
              v-model="speedParams.yawSpeed"
              type="text"
              placeholder="2.9"
              inputmode="decimal"
              @blur="() => validateAndFormat('speed', 'yawSpeed', 1)"
              @input="handleNumberInput"
              :disabled="deviceDisconnected"
              :error="!!speedErrors.yawSpeed"
            />
            <div v-if="speedErrors.yawSpeed" class="field-error-hint">
              <van-icon name="warning-o" /> {{ speedErrors.yawSpeed }}
            </div>
          </div>
        </div>
      </div>

      <!-- 扫描时间卡片 -->
      <div class="param-card">
        <div class="card-header">
          <div class="card-title">
            <span class="title-text">扫描时间</span>
          </div>
          <van-button
            size="small"
            type="primary"
            plain
            @click="saveParam('scan')"
            :loading="savingState.scan"
            :disabled="deviceDisconnected || savingState.scan || !isScanValid"
            style="width: 64px;"
            >保存</van-button
          >
        </div>

        <div class="scan-row">
          <div class="scan-input">
            <van-field
              v-model="scanTime.seconds"
              type="text"
              placeholder="输入秒数"
              @blur="validateScanTime"
              @input="handleIntegerInput"
              :disabled="deviceDisconnected"
              :error="!!scanErrors.seconds"
            />
          </div>
          <span class="scan-unit">秒</span>
        </div>
        <div v-if="scanErrors.seconds" class="field-error-hint">
          <van-icon name="warning-o" /> {{ scanErrors.seconds }}
        </div>
      </div>

      <!-- 俯仰角限位卡片 -->
      <div class="param-card">
        <div class="card-header">
          <div class="card-title">
            <span class="title-text">俯仰角限位</span>
          </div>
          <van-button
            size="small"
            type="primary"
            plain
            @click="saveParam('pitchLimit')"
            :loading="savingState.pitchLimit"
            :disabled="deviceDisconnected || savingState.pitchLimit || !isPitchLimitValid"
            style="width: 64px;"
            >保存</van-button
          >
        </div>

        <div class="dual-row">
          <div class="axis-item">
            <label>上限 <span class="unit">(degrees)</span></label>
            <van-field
              v-model="pitchLimit.upperLimitDeg"
              type="text"
              placeholder="0.00"
              inputmode="decimal"
              @blur="() => validateAndFormat('pitchLimit', 'upperLimitDeg', 2)"
              @input="handleNumberInput"
              :disabled="deviceDisconnected"
              :error="!!pitchLimitErrors.upper"
            />
            <div v-if="pitchLimitErrors.upper" class="field-error-hint">
              <van-icon name="warning-o" /> {{ pitchLimitErrors.upper }}
            </div>
          </div>
          <div class="axis-item">
            <label>下限 <span class="unit">(degrees)</span></label>
            <van-field
              v-model="pitchLimit.lowerLimitDeg"
              type="text"
              placeholder="0.00"
              inputmode="decimal"
              @blur="() => validateAndFormat('pitchLimit', 'lowerLimitDeg', 2)"
              @input="handleNumberInput"
              :disabled="deviceDisconnected"
              :error="!!pitchLimitErrors.lower"
            />
            <div v-if="pitchLimitErrors.lower" class="field-error-hint">
              <van-icon name="warning-o" /> {{ pitchLimitErrors.lower }}
            </div>
          </div>
        </div>

        <!-- 上限小于下限的提示 -->
        <div v-if="!isPitchLimitValid && !hasPitchLimitEmptyError" class="limit-error-hint">
          <van-icon name="warning-o" /> 上限必须大于下限
        </div>
      </div>

      <!-- 俯仰角零偏卡片 -->
      <div class="param-card">
        <div class="card-header">
          <div class="card-title">
            <span class="title-text">俯仰角零偏</span>
          </div>
          <van-button
            size="small"
            type="primary"
            plain
            @click="saveParam('pitchOffset')"
            :loading="savingState.pitchOffset"
            :disabled="deviceDisconnected || savingState.pitchOffset || !isPitchOffsetValid"
            style="width: 64px;"
            >保存</van-button
          >
        </div>

        <div class="scan-row">
          <div class="scan-input">
            <van-field
              v-model="pitchOffset.value"
              type="text"
              placeholder="0.00"
              inputmode="decimal"
              @blur="() => validateAndFormat('pitchOffset', 'value', 2)"
              @input="handleNumberInput"
              :disabled="deviceDisconnected"
              :error="!!pitchOffsetErrors.value"
            />
          </div>
          <span class="scan-unit">度</span>
        </div>
        <div v-if="pitchOffsetErrors.value" class="field-error-hint">
          <van-icon name="warning-o" /> {{ pitchOffsetErrors.value }}
        </div>
      </div>

      <!-- 水平拍照角度步进卡片 -->
      <div class="param-card">
        <div class="card-header">
          <div class="card-title">
            <span class="title-text">水平拍照角度步进</span>
          </div>
          <van-button
            size="small"
            type="primary"
            plain
            @click="saveParam('yawStep')"
            :loading="savingState.yawStep"
            :disabled="deviceDisconnected || savingState.yawStep || !isYawStepValid"
            style="width: 64px;"
            >保存</van-button
          >
        </div>

        <div class="scan-row">
          <div class="scan-input">
            <van-field
              v-model="yawStep.value"
              type="text"
              placeholder="30.0"
              inputmode="decimal"
              @blur="() => validateAndFormat('yawStep', 'value', 2)"
              @input="handleNumberInput"
              :disabled="deviceDisconnected"
              :error="!!yawStepErrors.value"
            >
              <template #right-icon>
                <span class="unit">(degrees)</span>
              </template>
            </van-field>
          </div>
        </div>
        <div v-if="yawStepErrors.value" class="field-error-hint">
          <van-icon name="warning-o" /> {{ yawStepErrors.value }}
        </div>
      </div>

      <!-- 俯仰角目标卡片 -->
      <div class="param-card">
        <div class="card-header">
          <div class="card-title">
            <span class="title-text">俯仰角目标</span>
          </div>
          <van-button
            size="small"
            type="primary"
            plain
            @click="saveParam('pitchTargets')"
            :loading="savingState.pitchTargets"
            :disabled="deviceDisconnected || savingState.pitchTargets || !isPitchTargetsValid"
            style="width: 64px;"
            >保存</van-button
          >
        </div>

        <div class="multi-axis-section">
          <div class="axis-item">
            <label>目标1 <span class="unit">(degrees)</span></label>
            <van-field
              v-model="pitchTargets.pitch0"
              type="text"
              placeholder="-42.0"
              inputmode="decimal"
              @blur="() => validateAndFormat('pitchTargets', 'pitch0', 2)"
              @input="handleNumberInput"
              :disabled="deviceDisconnected"
              :error="!!pitchTargetsErrors.pitch0"
            />
            <div v-if="pitchTargetsErrors.pitch0" class="field-error-hint">
              <van-icon name="warning-o" /> {{ pitchTargetsErrors.pitch0 }}
            </div>
          </div>
          <div class="axis-item">
            <label>目标2 <span class="unit">(degrees)</span></label>
            <van-field
              v-model="pitchTargets.pitch1"
              type="text"
              placeholder="-72.0"
              inputmode="decimal"
              @blur="() => validateAndFormat('pitchTargets', 'pitch1', 2)"
              @input="handleNumberInput"
              :disabled="deviceDisconnected"
              :error="!!pitchTargetsErrors.pitch1"
            />
            <div v-if="pitchTargetsErrors.pitch1" class="field-error-hint">
              <van-icon name="warning-o" /> {{ pitchTargetsErrors.pitch1 }}
            </div>
          </div>
          <div class="axis-item">
            <label>目标3 <span class="unit">(degrees)</span></label>
            <van-field
              v-model="pitchTargets.pitch2"
              type="text"
              placeholder="-102.0"
              inputmode="decimal"
              @blur="() => validateAndFormat('pitchTargets', 'pitch2', 2)"
              @input="handleNumberInput"
              :disabled="deviceDisconnected"
              :error="!!pitchTargetsErrors.pitch2"
            />
            <div v-if="pitchTargetsErrors.pitch2" class="field-error-hint">
              <van-icon name="warning-o" /> {{ pitchTargetsErrors.pitch2 }}
            </div>
          </div>
        </div>
      </div>

      <!-- 输出格式设置卡片  目前同时开启会渲染两套点云，一个是偏移校准前一个是偏移校准后。。保存的txt一个点位也会包含两行xyz数据-->
      <div class="param-card output-format-card">
        <div class="card-header">
          <div class="card-title">
            <span class="title-text">输出格式</span>
          </div>
          <div class="output-hint">开关即时生效</div>
        </div>

        <div class="output-switch-row">
          <div class="output-switch-item">
            <div class="output-label">
              <span class="output-name">XYZ坐标</span>
            </div>
            <van-switch
              v-model="outputFormat.xyz"
              size="24px"
              active-color="#1890ff"
              :disabled="deviceDisconnected || savingState.outputFormat"
              @change="handleOutputChange('xyz', $event)"
              :loading="savingState.outputFormat"
            />
          </div>

          <div class="output-switch-item">
            <div class="output-label">
              <span class="output-name">极坐标</span>
            </div>
            <van-switch
              v-model="outputFormat.polar"
              size="24px"
              active-color="#1890ff"
              :disabled="deviceDisconnected || savingState.outputFormat"
              @change="handleOutputChange('polar', $event)"
              :loading="savingState.outputFormat"
            />
          </div>
        </div>
      </div>

      <!-- PID参数设置卡片（已注释，暂停使用）-->
      <!-- <div class="param-card">
        <div class="card-header">
          <div class="card-title">
            <span class="title-text">PID参数</span>
          </div>
          <van-button
            size="small"
            type="primary"
            plain
            @click="saveParam('pid')"
            :loading="savingState.pid"
            :disabled="deviceDisconnected || savingState.pid || !isPIDValid"
            style="width: 64px;"
            >保存</van-button
          >
        </div>

        <div class="pid-selectors">
          <div class="pid-selector-item">
            <label>环类型</label>
            <van-dropdown-menu>
              <van-dropdown-item
                v-model="pidSettings.loopType"
                :options="loopTypeOptions"
                @change="handlePIDSelectorChange"
                :disabled="deviceDisconnected"
              />
            </van-dropdown-menu>
          </div>
          <div class="pid-selector-item">
            <label>轴</label>
            <van-dropdown-menu>
              <van-dropdown-item
                v-model="pidSettings.axis"
                :options="axisOptions"
                @change="handlePIDSelectorChange"
                :disabled="deviceDisconnected"
              />
            </van-dropdown-menu>
          </div>
        </div>

        <div class="pid-params">
          <div class="pid-param-item">
            <label>P</label>
            <van-field
              v-model="pidSettings.p"
              type="text"
              placeholder="0.0000"
              inputmode="decimal"
              @blur="() => validateAndFormat('pid', 'p', 4)"
              @input="handleNumberInput"
              :disabled="deviceDisconnected"
              :error="!!pidErrors.p"
            />
            <div v-if="pidErrors.p" class="field-error-hint">
              <van-icon name="warning-o" /> {{ pidErrors.p }}
            </div>
          </div>
          <div class="pid-param-item">
            <label>I</label>
            <van-field
              v-model="pidSettings.i"
              type="text"
              placeholder="0.0000"
              inputmode="decimal"
              @blur="() => validateAndFormat('pid', 'i', 4)"
              @input="handleNumberInput"
              :disabled="deviceDisconnected"
              :error="!!pidErrors.i"
            />
            <div v-if="pidErrors.i" class="field-error-hint">
              <van-icon name="warning-o" /> {{ pidErrors.i }}
            </div>
          </div>
          <div class="pid-param-item">
            <label>D</label>
            <van-field
              v-model="pidSettings.d"
              type="text"
              placeholder="0.0000"
              inputmode="decimal"
              @blur="() => validateAndFormat('pid', 'd', 4)"
              @input="handleNumberInput"
              :disabled="deviceDisconnected"
              :error="!!pidErrors.d"
            />
            <div v-if="pidErrors.d" class="field-error-hint">
              <van-icon name="warning-o" /> {{ pidErrors.d }}
            </div>
          </div>
        </div>
      </div> -->

      <!-- 底部双按钮行：刷新和恢复默认值 -->
      <div class="bottom-actions">
        <van-button
          class="action-button refresh-button"
          type="primary"
          plain
          @click="handleManualRefresh"
          :loading="refreshing"
          loading-text="刷新中"
          :disabled="deviceDisconnected"
        >
          <template #icon>
            <van-icon name="replay" />
          </template>
          刷新
        </van-button>
        <van-button
          class="action-button reset-button"
          type="primary"
          @click="resetToDefault"
          :disabled="deviceDisconnected"
          >恢复默认值</van-button
        >
      </div>

      <!-- 底部留白，避免被按钮遮挡 -->
      <div class="bottom-spacing"></div>
    </div>
  </div>
</template>

<script setup>
defineOptions({
  name: 'SettingsView'
})

import {
  ref,
  reactive,
  onMounted,
  onActivated,
  onBeforeUnmount,
  watch,
  computed,
  onUnmounted,
} from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useBluetoothStore } from '@/stores/bluetooth'
import { bluetoothService } from '@/services/bluetooth'
import { App } from '@capacitor/app'
import { parseBleData } from '@/utils/format/bleProtocol'
import { NUS_SERVICE_UUID, NUS_NOTIFY_CHAR_UUID } from '@/constants/bluetooth'
import { showLoadingToast, closeToast, showToast } from 'vant'
import { SETTING_DEFAULT_VALUES } from '@/constants/bluetooth'
import { showConfirmDialog } from 'vant'

const bluetoothStore = useBluetoothStore()

let parser = null
let pauseListener = null
let resumeListener = null

// 设备断开相关状态
const isSubscribed = ref(false)
const deviceDisconnected = ref(false)
let disconnectUnregister = null

// 刷新状态
const refreshing = ref(false)

// 标记是否来自保存操作的响应
const isFromSaveAction = ref(false)

// 参数数据  保留 2位小数
const calibParams = reactive({
  x: SETTING_DEFAULT_VALUES.CALIB.x,
  y: SETTING_DEFAULT_VALUES.CALIB.y,
  z: SETTING_DEFAULT_VALUES.CALIB.z,
  // pitch: 0.12,
  // roll: -0.05,
  // yaw: 1.47
})
// 保留 4位小数
const speedParams = reactive({
  pitchSpeed: SETTING_DEFAULT_VALUES.SPEED.pitch,
  yawSpeed: SETTING_DEFAULT_VALUES.SPEED.yaw,
})
// 保留 0位小数
const scanTime = ref({
  seconds: SETTING_DEFAULT_VALUES.SCAN_TIME,
})
// 保留 2位小数 - 初始化时就格式化，修改 key 名以匹配返回的字段（单位：度）
const pitchLimit = reactive({
  upperLimitDeg: SETTING_DEFAULT_VALUES.PITCH_LIMIT.upper.toFixed(2),
  lowerLimitDeg: SETTING_DEFAULT_VALUES.PITCH_LIMIT.lower.toFixed(2),
})

// 输出格式设置
const outputFormat = reactive({
  xyz: SETTING_DEFAULT_VALUES.OUTPUT_FORMAT.xyz,
  polar: SETTING_DEFAULT_VALUES.OUTPUT_FORMAT.polar,
})

// // PID参数设置 - 保留4位小数
// const pidSettings = reactive({
//   loopType: SETTING_DEFAULT_VALUES.PID.loopType, // V: 速度环, A: 角度环
//   axis: SETTING_DEFAULT_VALUES.PID.axis, // X: X轴, Y: Y轴
//   p: SETTING_DEFAULT_VALUES.PID.p.toFixed(4),
//   i: SETTING_DEFAULT_VALUES.PID.i.toFixed(4),
//   d: SETTING_DEFAULT_VALUES.PID.d.toFixed(4)
// })

// 俯仰角零偏设置 - 保留2位小数
const pitchOffset = reactive({
  value: SETTING_DEFAULT_VALUES.PITCH_OFFSET.toFixed(2)
})

// 水平拍照角度步进 - 保留2位小数，范围0-360度
const yawStep = reactive({
  value: SETTING_DEFAULT_VALUES.YAW_STEP.toFixed(2)
})

// 三个俯仰角目标 - 保留2位小数，范围-180到180度
const pitchTargets = reactive({
  pitch0: SETTING_DEFAULT_VALUES.PITCH_TARGETS.pitch0.toFixed(2),
  pitch1: SETTING_DEFAULT_VALUES.PITCH_TARGETS.pitch1.toFixed(2),
  pitch2: SETTING_DEFAULT_VALUES.PITCH_TARGETS.pitch2.toFixed(2)
})

// // PID选项
// const loopTypeOptions = [
//   { text: '速度环(V)', value: 'V' },
//   { text: '角度环(A)', value: 'A' }
// ]
//
// const axisOptions = [
//   { text: 'X轴', value: 'x' },
//   { text: 'Y轴', value: 'y' }
// ]

// 保存状态
const savingState = reactive({
  calib: false,
  speed: false,
  scan: false,
  pitchLimit: false,
  pitchOffset: false, // 俯仰角零偏保存状态
  yawStep: false, // 水平拍照角度步进保存状态
  pitchTargets: false, // 俯仰角目标保存状态
  outputFormat: false, // 输出格式保存状态
  pid: false // PID保存状态
})

// ========== 错误状态管理 ==========
const calibErrors = reactive({
  x: '',
  y: '',
  z: '',
})

const speedErrors = reactive({
  pitchSpeed: '',
  yawSpeed: '',
})

const scanErrors = reactive({
  seconds: '',
})

const pitchLimitErrors = reactive({
  upper: '',
  lower: '',
})

// // PID错误状态
// const pidErrors = reactive({
//   p: '',
//   i: '',
//   d: ''
// })

// 俯仰角零偏错误状态
const pitchOffsetErrors = reactive({
  value: ''
})

// 水平拍照角度步进错误状态
const yawStepErrors = reactive({
  value: ''
})

// 俯仰角目标错误状态
const pitchTargetsErrors = reactive({
  pitch0: '',
  pitch1: '',
  pitch2: ''
})

// ========== 计算属性 - 校验状态 ==========
// 标定参数是否有效
const isCalibValid = computed(() => {
  return !calibErrors.x && !calibErrors.y && !calibErrors.z
})

// 速度参数是否有效
const isSpeedValid = computed(() => {
  return !speedErrors.pitchSpeed && !speedErrors.yawSpeed
})

// 扫描时间是否有效
const isScanValid = computed(() => {
  return !scanErrors.seconds
})

// 俯仰角限位是否有效（包含数值有效性和逻辑有效性）
const isPitchLimitValid = computed(() => {
  if (pitchLimitErrors.upper || pitchLimitErrors.lower) return false

  const upper = parseFloat(pitchLimit.upperLimitDeg)
  const lower = parseFloat(pitchLimit.lowerLimitDeg)
  return upper > lower
})

// 俯仰角限位是否有空值错误
const hasPitchLimitEmptyError = computed(() => {
  return pitchLimitErrors.upper || pitchLimitErrors.lower
})

// // PID参数是否有效
// const isPIDValid = computed(() => {
//   return !pidErrors.p && !pidErrors.i && !pidErrors.d
// })

// 俯仰角零偏是否有效
const isPitchOffsetValid = computed(() => {
  return !pitchOffsetErrors.value
})

// 水平拍照角度步进是否有效
const isYawStepValid = computed(() => {
  if (yawStepErrors.value) return false
  const val = parseFloat(yawStep.value)
  return val >= 0 && val <= 360
})

// 俯仰角目标是否有效
const isPitchTargetsValid = computed(() => {
  if (pitchTargetsErrors.pitch0 || pitchTargetsErrors.pitch1 || pitchTargetsErrors.pitch2) return false
  return true
})

// ========== 校验函数 ==========
// 校验数值是否有效
const validateNumber = (value, fieldName) => {
  if (value === undefined || value === null || value === '') {
    return `${fieldName}不能为空`
  }

  const num = parseFloat(value)
  if (isNaN(num)) {
    return `${fieldName}必须为有效数字`
  }

  return ''
}

// 校验整数
const validateInteger = (value, fieldName, min = 0, max = 65535) => {
  if (value === undefined || value === null || value === '') {
    return `${fieldName}不能为空`
  }

  const num = parseInt(value)
  if (isNaN(num)) {
    return `${fieldName}必须为有效整数`
  }

  if (num < min || num > max) {
    return `${fieldName}必须在${min}~${max}之间`
  }

  return ''
}

// 统一验证和格式化
const validateAndFormat = (category, field, decimals) => {
  let value
  let errorMsg = ''

  switch (category) {
    case 'calib':
      value = calibParams[field]
      errorMsg = validateNumber(value, field.toUpperCase())
      if (!errorMsg) {
        const num = parseFloat(value)
        calibParams[field] = num.toFixed(decimals)
        calibErrors[field] = ''
      } else {
        calibErrors[field] = errorMsg
      }
      break

    case 'speed':
      value = speedParams[field]
      errorMsg = validateNumber(value, field === 'pitchSpeed' ? 'Pitch速度' : 'Yaw速度')
      if (!errorMsg) {
        const num = parseFloat(value)
        // 添加负数校验
        if (num < 0) {
          errorMsg = field === 'pitchSpeed' ? 'Pitch速度不能为负数' : 'Yaw速度不能为负数'
          speedErrors[field] = errorMsg
        } else {
          speedParams[field] = num.toFixed(decimals)
          speedErrors[field] = ''
        }
      } else {
        speedErrors[field] = errorMsg
      }
      break

    case 'pitchLimit':
      value = pitchLimit[field]
      const label = field === 'upperLimitDeg' ? '上限' : '下限'
      errorMsg = validateNumber(value, label)
      if (!errorMsg) {
        const num = parseFloat(value)
        pitchLimit[field] = num.toFixed(decimals)
        if (field === 'upperLimitDeg') pitchLimitErrors.upper = ''
        if (field === 'lowerLimitDeg') pitchLimitErrors.lower = ''
      } else {
        if (field === 'upperLimitDeg') pitchLimitErrors.upper = errorMsg
        if (field === 'lowerLimitDeg') pitchLimitErrors.lower = errorMsg
      }
      break

    // case 'pid':
    //   value = pidSettings[field]
    //   const pidLabel = field.toUpperCase()
    //   errorMsg = validateNumber(value, pidLabel)
    //   if (!errorMsg) {
    //     const num = parseFloat(value)
    //     pidSettings[field] = num.toFixed(decimals)
    //     pidErrors[field] = ''
    //   } else {
    //     pidErrors[field] = errorMsg
    //   }
    //   break

    case 'pitchOffset':
      value = pitchOffset[field]
      errorMsg = validateNumber(value, '零偏值')
      if (!errorMsg) {
        const num = parseFloat(value)
        // 验证范围：-180.0 到 180.0 度
        if (num < -180.0 || num > 180.0) {
          errorMsg = '零偏值必须在-180.0~180.0之间'
          pitchOffsetErrors[field] = errorMsg
        } else {
          pitchOffset[field] = num.toFixed(decimals)
          pitchOffsetErrors[field] = ''
        }
      } else {
        pitchOffsetErrors[field] = errorMsg
      }
      break

    case 'yawStep':
      value = yawStep[field]
      errorMsg = validateNumber(value, '水平拍照角度步进')
      if (!errorMsg) {
        const num = parseFloat(value)
        if (num < 0 || num > 360) {
          errorMsg = '步进值必须在0~360之间'
          yawStepErrors[field] = errorMsg
        } else {
          yawStep[field] = num.toFixed(decimals)
          yawStepErrors[field] = ''
        }
      } else {
        yawStepErrors[field] = errorMsg
      }
      break

    case 'pitchTargets':
      value = pitchTargets[field]
      const targetLabel = field === 'pitch0' ? '目标1' : (field === 'pitch1' ? '目标2' : '目标3')
      errorMsg = validateNumber(value, targetLabel)
      if (!errorMsg) {
        const num = parseFloat(value)
        if (num < -180 || num > 180) {
          errorMsg = targetLabel + '必须在-180~180之间'
          pitchTargetsErrors[field] = errorMsg
        } else {
          pitchTargets[field] = num.toFixed(decimals)
          pitchTargetsErrors[field] = ''
        }
      } else {
        pitchTargetsErrors[field] = errorMsg
      }
      break
  }
}

// 修改验证扫描时间函数
const validateScanTime = () => {
  const value = scanTime.value.seconds
  const errorMsg = validateInteger(value, '扫描时间', 0, 65535)

  if (errorMsg) {
    scanErrors.seconds = errorMsg
  } else {
    let num = parseInt(value)
    if (num > 65535) num = 65535
    if (num < 0) num = 0
    scanTime.value.seconds = num
    scanErrors.seconds = ''
  }
}

// ========== 输入处理函数（保持原有过滤逻辑）==========
const handleNumberInput = (e) => {
  // 原有过滤逻辑保持不变
  const value = e.target.value
  e.target.value = value.replace(/[^\d.-]/g, '')
}

const handleIntegerInput = (e) => {
  // 原有过滤逻辑保持不变
  const value = e.target.value
  e.target.value = value.replace(/[^\d-]/g, '')
}

// 计算属性：检查俯仰角上限是否大于下限
// const isPitchLimitValid = computed(() => {
//   const upper = parseFloat(pitchLimit.upperLimitRad)
//   const lower = parseFloat(pitchLimit.lowerLimitRad)
//   return upper > lower
// })

// 获取连接状态文本
// const getConnectionStatusText = () => {
//   if (deviceDisconnected.value) return '未连接'
//   if (bluetoothStore.connectionStatus === 0) return '连接中'
//   if (bluetoothStore.connectionStatus === 2) return '已连接'
//   return '未连接'
// }
const isConnected = computed(() => {
  return !deviceDisconnected.value && bluetoothStore.connectionStatus === 2
})

// --- 监听蓝牙Store的连接状态变化 ---
watch(
  // 状态说明：
  // 0: 连接中
  // 1: 未连接
  // 2: 已连接
  () => bluetoothStore.connectionStatus,
  (newStatus, oldStatus) => {
    if (oldStatus === 2 && newStatus !== 2) {
      // 连接从已连接变为非已连接状态
      if (!deviceDisconnected.value) {
        console.log('[SettingList] 检测到全局连接状态变为未连接')
        deviceDisconnected.value = true
      }
    }
    // 从非连接状态(0或1)变为已连接(2)
    if (oldStatus !== 2 && newStatus === 2) {
      console.log('[SettingList] 检测到设备连接成功，恢复连接状态')
      deviceDisconnected.value = false
      // 重新建立连接时，重新订阅服务
      init().then(() => {
        // 重连后自动读取
        if (isSubscribed.value && !deviceDisconnected.value) {
          readAllParams()
        }
      })
    }
  },
)

onBeforeRouteLeave(async (to, from, next) => {
  console.log('[SettingList] 路由守卫：即将离开页面，开始清理')
  await cleanupResourcesForExit()
  console.log('[SettingList] 路由守卫：清理完成')
  next()
})

onMounted(async () => {
  console.log('onmounted setting')
  await init()
  registerDisconnectListener()
  // 订阅成功后自动读取所有参数
  if (isSubscribed.value && !deviceDisconnected.value) {
    await readAllParams()
  }
})

onActivated(async () => {
  console.log('[SettingList] 组件被激活，等待上一页清理完成...')
  try {
    // --- 轮询等待 ---
    // 只要 Pointcloud 还在清理，就一直等
    while (bluetoothStore.isCleanupInProgress) {
      console.log('[SettingList] 检测到上一页正在清理，等待中...')
      await new Promise((resolve) => setTimeout(resolve, 50)) // 每 50ms 检查一次
    }
    // --- 结束：轮询等待 ---
    console.log('[SettingList] 上一页清理完成，开始初始化')
    await init()
    registerDisconnectListener()
  } catch (error) {
    console.error('页面激活初始化失败', error)
  }
})

onUnmounted(async () => {
  console.log('[SettingList] 组件销毁，开始清理所有资源')
  // 退出时清理资源
  await cleanupResourcesForExit()
  console.log('[SettingList] 组件销毁，清理所有资源完毕')
})

async function handleAppResume() {
  registerDisconnectListener()
}
// 清理资源函数 (进入后台时调用)
async function cleanupResourcesForPause() {
  console.log('[SettingList] 组件进入后台，清理资源')
}
// 路由切换时彻底清理资源 停止订阅和清除监听器
async function cleanupResourcesForExit() {
  console.log('[SettingList] 组件销毁，开始清理所有资源')
  try {
    if (pauseListener) {
      pauseListener.remove()
      pauseListener = null
    }
    if (resumeListener) {
      resumeListener.remove()
      resumeListener = null
    }
    if (disconnectUnregister) {
      disconnectUnregister()
      disconnectUnregister = null
    }
    // deviceDisconnected.value = false   // 页面已经不可见，这里应该不用设置，避免闪动
    parser = null
    await unsubscribe() // unsubscribe 是异步的，可能需要一点时间
  } catch (error) {
    console.error('清理资源时出错', error)
  }
  console.log('[SettingList] 组件销毁，清理所有资源完毕')
}

const init = async () => {
  // --- 页面加载时检查连接状态 ---
  if (bluetoothStore.connectionStatus !== 2) {
    console.log('[SettingList] 页面加载时检测到设备未连接')
    deviceDisconnected.value = true
  } else {
    // 主动校验一次连接状态
    bluetoothService.checkConnectionStatus(bluetoothStore.connectedDeviceId).catch(() => {
      console.log('[SettingList] 页面加载时检测到连接已断开')
      deviceDisconnected.value = true
    })
  }

  // 先移除旧的监听器
  if (pauseListener) {
    await pauseListener.remove()
    pauseListener = null
  }
  // 再添加新的
  pauseListener = await App.addListener('pause', () => {
    cleanupResourcesForPause()
  })

  if (resumeListener) {
    await resumeListener.remove()
    resumeListener = null
  }
  resumeListener = await App.addListener('resume', async () => {
    await handleAppResume()
  })
  // 只有当已经建立连接时，才去订阅服务
  const deviceId = bluetoothStore.connectedDeviceId
  console.log('deviceID:', deviceId)
  if (!deviceId) {
    return
  }

  if (parser) {
    parser = null
  }
  try {
    await unsubscribe()
    // 等待一小会儿，让原生层有时间处理取消订阅
    await new Promise((resolve) => setTimeout(resolve, 100))
    if (parser) {
      parser = null
    }
    parser = new parseBleData({
      enableDebug: true,
      onSendAck: async (cmd) => {
        return bluetoothStore.handleSendAck(cmd)
      },
      onCalibParamResponse: (data) => {
        handleCalibParamResponse(data)
      },
      onRotateSpeedResponse: (data) => {
        handleRotateSpeedResponse(data)
      },
      onScanTimeResponse: (data) => {
        handleScanTimeResponse(data)
      },
      onPitchLimitResponse: (data) => {
        handlePitchLimitResponse(data)
      },
      onOutputXYZResponse: (data) => {
        handleOutputXYZResponse(data)
      },
      onOutputPolarResponse: (data) => {
        handleOutputPolarResponse(data)
      },
      // onVPIDResponse: (data) => {
      //   handleVPIDResponse(data)
      // },
      // onAPIDResponse: (data) => {
      //   handleAPIDResponse(data)
      // },
      onPitchOffsetResponse: (data) => {
        handlePitchOffsetResponse(data)
      },
      onYawStepResponse: (data) => {
        handleYawStepResponse(data)
      },
      onPitchTargetsResponse: (data) => {
        handlePitchTargetsResponse(data)
      },
    })

    await bluetoothService.subscribeToNotifications(
      // await 等待订阅完成
      deviceId,
      NUS_SERVICE_UUID,
      NUS_NOTIFY_CHAR_UUID,
      (uint8) => {
        parser.parse(uint8)
      },
    )
    isSubscribed.value = true
    console.log('=====订阅成功')
  } catch (e) {
    console.warn('subscribeToNotifications failed', e)
    isSubscribed.value = false
  }
}

function registerDisconnectListener() {
  if (disconnectUnregister) {
    disconnectUnregister()
    disconnectUnregister = null
  }
  disconnectUnregister = bluetoothService.onDeviceDisconnected((deviceId, isManualDisconnect) => {
    // 只处理当前连接的设备
    if (deviceId !== bluetoothStore.connectedDeviceId) {
      return
    }
    console.log('[SettingList] 设备断开连接，手动断开:', isManualDisconnect)
    deviceDisconnected.value = true

    // 显示提示
    showToast({ message: '设备已断开连接', position: 'bottom' })
  })
}

async function unsubscribe() {
  if (!isSubscribed.value) {
    console.log('[SettingList] unsubscribe: 当前未订阅，跳过取消操作')
    return
  }
  try {
    const deviceId = bluetoothStore.connectedDeviceId
    if (deviceId) {
      await bluetoothService.unsubscribeFromNotifications(
        deviceId,
        NUS_SERVICE_UUID,
        NUS_NOTIFY_CHAR_UUID,
      )
    }
  } catch (e) {
    console.warn('unsubscribe failed', e)
  } finally {
    isSubscribed.value = false
  }
}

// 通用数字格式化函数
// const formatNumber = (category, field, decimals) => {
//   let value
//   switch (category) {
//     case 'calib':
//       value = calibParams[field]
//       break
//     case 'speed':
//       value = speedParams[field]
//       break
//     case 'pitchLimit':
//       value = pitchLimit[field]
//       break
//     default:
//       return
//   }

//   if (value === undefined || value === null || value === '') return

//   const num = parseFloat(value)
//   if (!isNaN(num)) {
//     switch (category) {
//       case 'calib':
//         calibParams[field] = num.toFixed(decimals)
//         break
//       case 'speed':
//         speedParams[field] = num.toFixed(decimals)
//         break
//       case 'pitchLimit':
//         pitchLimit[field] = num.toFixed(decimals)
//         break
//     }
//   }
// }

// ：小数输入实时过滤
// const validateDecimalInput = (e) => {
//   const value = e.target.value
//   // 允许：数字、小数点、负号
//   e.target.value = value.replace(/[^\d.-]/g, '')
// }

// 整数输入实时过滤
// const validateIntegerInput = (e) => {
//   const value = e.target.value
//   // 只允许数字和负号
//   e.target.value = value.replace(/[^\d-]/g, '')
// }

// 修改验证函数 - 使用数字类型
// const validateScanTime = () => {
//   let value = parseInt(scanTime.value.seconds)
//   if (isNaN(value)) {
//     scanTime.value.seconds = 0
//   } else {
//     if (value > 65535) value = 65535
//     if (value < 0) value = 0
//     scanTime.value.seconds = value
//   }
// }

// 更新响应处理函数，将收到的数据更新到UI并格式化
// 根据 isFromSaveAction 标记决定是否显示提示
function handleCalibParamResponse(data) {
  console.log('设置标定参数成功', JSON.stringify(data))
  // 将收到的标定参数值更新到UI
  if (data && typeof data === 'object') {
    if (data.x !== undefined) calibParams.x = parseFloat(data.x).toFixed(2)
    if (data.y !== undefined) calibParams.y = parseFloat(data.y).toFixed(2)
    if (data.z !== undefined) calibParams.z = parseFloat(data.z).toFixed(2)
    // if (data.pitch !== undefined) calibParams.pitch = data.pitch
    // if (data.roll !== undefined) calibParams.roll = data.roll
    // if (data.yaw !== undefined) calibParams.yaw = data.yaw
  }
  // 清除对应字段的错误
  calibErrors.x = ''
  calibErrors.y = ''
  calibErrors.z = ''
  if (isFromSaveAction.value) {
    showToast({ message: '标定参数保存成功', position: 'bottom' })
    isFromSaveAction.value = false // 重置标记
  }
}

function handleRotateSpeedResponse(data) {
  console.log('设置转动速度成功', JSON.stringify(data))
  // 将收到的转动速度值更新到UI
  if (data && typeof data === 'object') {
    if (data.pitchSpeed !== undefined) {
      speedParams.pitchSpeed = parseFloat(data.pitchSpeed).toFixed(1)
    }
    if (data.yawSpeed !== undefined) {
      speedParams.yawSpeed = parseFloat(data.yawSpeed).toFixed(1)
    }
  }
  // 清除对应字段的错误
  speedErrors.pitchSpeed = ''
  speedErrors.yawSpeed = ''
  if (isFromSaveAction.value) {
    showToast({ message: '转动速度保存成功', position: 'bottom' })
    isFromSaveAction.value = false // 重置标记
  }
}

function handleScanTimeResponse(data) {
  console.log('设置扫描时间成功', JSON.stringify(data))
  // 将收到的扫描时间值更新到UI
  if (data && typeof data === 'object') {
    if (data.seconds !== undefined) {
      scanTime.value.seconds = parseInt(data.seconds)
    }
  } else if (typeof data === 'number') {
    scanTime.value.seconds = parseInt(data)
  }
  // 清除对应字段的错误
  scanErrors.seconds = ''
  if (isFromSaveAction.value) {
    showToast({ message: '扫描时间保存成功', position: 'bottom' })
    isFromSaveAction.value = false // 重置标记
  }
}

function handlePitchLimitResponse(data) {
  console.log('设置俯仰角上下限成功', JSON.stringify(data))
  if (data && typeof data === 'object') {
    if (data.upperLimitDeg !== undefined) {
      pitchLimit.upperLimitDeg = parseFloat(data.upperLimitDeg).toFixed(2)
    }
    if (data.lowerLimitDeg !== undefined) {
      pitchLimit.lowerLimitDeg = parseFloat(data.lowerLimitDeg).toFixed(2)
    }
  }
  // 清除对应字段的错误
  pitchLimitErrors.upper = ''
  pitchLimitErrors.lower = ''
  if (isFromSaveAction.value) {
    showToast({ message: '俯仰角限位保存成功', position: 'bottom' })
    isFromSaveAction.value = false // 重置标记
  }
}
// 处理查询输出XYZ状态响应
function handleOutputXYZResponse(data) {
  console.log('查询输出XYZ状态成功', JSON.stringify(data))
  if (data && typeof data === 'object') {
    if (data.status !== undefined) {
      outputFormat.xyz = data.status
    }
  }
  // 如果是来自保存操作的响应，显示成功提示
  if (isFromSaveAction.value) {
    showToast({ message: `XYZ坐标输出已${data.status ? '开启' : '关闭'}`, position: 'bottom' })
    isFromSaveAction.value = false
  }
}

// 处理查询输出极坐标状态响应
function handleOutputPolarResponse(data) {
  console.log('查询输出极坐标状态成功', JSON.stringify(data))
  if (data && typeof data === 'object') {
    if (data.status !== undefined) {
      outputFormat.polar = data.status
    }
  }
  // 如果是来自保存操作的响应，显示成功提示
  if (isFromSaveAction.value) {
    showToast({ message: `极坐标输出已${data.status ? '开启' : '关闭'}`, position: 'bottom' })
    isFromSaveAction.value = false
  }
}

// // 处理速度环PID响应
// function handleVPIDResponse(data) {
//   console.log('设置速度环PID成功', JSON.stringify(data))
//   if (data && typeof data === 'object') {
//     if (data.p !== undefined) pidSettings.p = parseFloat(data.p).toFixed(4)
//     if (data.i !== undefined) pidSettings.i = parseFloat(data.i).toFixed(4)
//     if (data.d !== undefined) pidSettings.d = parseFloat(data.d).toFixed(4)
//   }
//   // 清除对应字段的错误
//   pidErrors.p = ''
//   pidErrors.i = ''
//   pidErrors.d = ''
//   if (isFromSaveAction.value) {
//     showToast({ message: '速度环PID参数保存成功', position: 'bottom' })
//     isFromSaveAction.value = false // 重置标记
//   }
// }
//
// // 处理角度环PID响应
// function handleAPIDResponse(data) {
//   console.log('设置角度环PID成功', JSON.stringify(data))
//   if (data && typeof data === 'object') {
//     if (data.p !== undefined) pidSettings.p = parseFloat(data.p).toFixed(4)
//     if (data.i !== undefined) pidSettings.i = parseFloat(data.i).toFixed(4)
//     if (data.d !== undefined) pidSettings.d = parseFloat(data.d).toFixed(4)
//   }
//   // 清除对应字段的错误
//   pidErrors.p = ''
//   pidErrors.i = ''
//   pidErrors.d = ''
//   if (isFromSaveAction.value) {
//     showToast({ message: '角度环PID参数保存成功', position: 'bottom' })
//     isFromSaveAction.value = false // 重置标记
//   }
// }

// 处理俯仰角零偏响应
function handlePitchOffsetResponse(data) {
  console.log('设置俯仰角零偏成功', JSON.stringify(data))
  if (data && typeof data === 'object') {
    if (data.value !== undefined) {
      pitchOffset.value = parseFloat(data.value).toFixed(2)
    }
  }
  // 清除对应字段的错误
  pitchOffsetErrors.value = ''
  if (isFromSaveAction.value) {
    showToast({ message: '俯仰角零偏保存成功', position: 'bottom' })
    isFromSaveAction.value = false // 重置标记
  }
}

// 处理水平拍照角度步进响应
function handleYawStepResponse(data) {
  console.log('设置水平拍照角度步进成功', JSON.stringify(data))
  if (data && typeof data === 'object') {
    if (data.value !== undefined) {
      yawStep.value = parseFloat(data.value).toFixed(2)
    }
  }
  yawStepErrors.value = ''
  if (isFromSaveAction.value) {
    showToast({ message: '水平拍照角度步进保存成功', position: 'bottom' })
    isFromSaveAction.value = false
  }
}

// 处理俯仰角目标响应
function handlePitchTargetsResponse(data) {
  console.log('设置俯仰角目标成功', JSON.stringify(data))
  if (data && typeof data === 'object') {
    if (data.pitch0 !== undefined) pitchTargets.pitch0 = parseFloat(data.pitch0).toFixed(2)
    if (data.pitch1 !== undefined) pitchTargets.pitch1 = parseFloat(data.pitch1).toFixed(2)
    if (data.pitch2 !== undefined) pitchTargets.pitch2 = parseFloat(data.pitch2).toFixed(2)
  }
  pitchTargetsErrors.pitch0 = ''
  pitchTargetsErrors.pitch1 = ''
  pitchTargetsErrors.pitch2 = ''
  if (isFromSaveAction.value) {
    showToast({ message: '俯仰角目标保存成功', position: 'bottom' })
    isFromSaveAction.value = false
  }
}

// 保存单个参数 - 移除 showToast 参数，不在发送后提示
// 设置标记，表示这是来自保存操作的响应
// 添加 silent 参数，用于控制是否显示提示（恢复默认值时使用）
const saveParam = async (type, silent = false) => {
  if (deviceDisconnected.value) {
    showToast({ message: '请先连接设备', position: 'bottom' })
    return
  }

  // 保存前验证
  switch (type) {
    case 'calib':
      validateAndFormat('calib', 'x', 2)
      validateAndFormat('calib', 'y', 2)
      validateAndFormat('calib', 'z', 2)
      if (!isCalibValid.value) {
        showToast({ message: '请填写正确的标定参数', position: 'bottom' })
        return
      }
      break
    case 'speed':
      validateAndFormat('speed', 'pitchSpeed', 5)
      validateAndFormat('speed', 'yawSpeed', 5)
      if (!isSpeedValid.value) {
        showToast({ message: '请填写正确的速度参数', position: 'bottom' })
        return
      }
      break
    case 'scan':
      validateScanTime()
      if (!isScanValid.value) {
        showToast({ message: '请填写正确的扫描时间', position: 'bottom' })
        return
      }
      break
    case 'pitchLimit':
      validateAndFormat('pitchLimit', 'upperLimitDeg', 2)
      validateAndFormat('pitchLimit', 'lowerLimitDeg', 2)
      if (!isPitchLimitValid.value) {
        if (hasPitchLimitEmptyError.value) {
          showToast({ message: '请填写完整的俯仰角限位', position: 'bottom' })
        } else {
          showToast({ message: '俯仰角上限必须大于下限', position: 'bottom' })
        }
        return
      }
      break

    // case 'pid':
    //   validateAndFormat('pid', 'p', 4)
    //   validateAndFormat('pid', 'i', 4)
    //   validateAndFormat('pid', 'd', 4)
    //   if (!isPIDValid.value) {
    //     showToast({ message: '请填写正确的PID参数', position: 'bottom' })
    //     return
    //   }
    //   break

    case 'pitchOffset':
      validateAndFormat('pitchOffset', 'value', 2)
      if (!isPitchOffsetValid.value) {
        showToast({ message: '请填写正确的俯仰角零偏值', position: 'bottom' })
        return
      }
      break

    case 'yawStep':
      validateAndFormat('yawStep', 'value', 2)
      if (!isYawStepValid.value) {
        if (yawStepErrors.value) {
          showToast({ message: yawStepErrors.value, position: 'bottom' })
        } else {
          showToast({ message: '步进值必须在0~360之间', position: 'bottom' })
        }
        return
      }
      break

    case 'pitchTargets':
      validateAndFormat('pitchTargets', 'pitch0', 2)
      validateAndFormat('pitchTargets', 'pitch1', 2)
      validateAndFormat('pitchTargets', 'pitch2', 2)
      if (!isPitchTargetsValid.value) {
        showToast({ message: '请填写正确的俯仰角目标值（-180~180）', position: 'bottom' })
        return
      }
      break
  }

  try {
    savingState[type] = true
    // 只有在非静默模式时才设置标记，这样就不会触发响应中的提示
    if (!silent) {
      isFromSaveAction.value = true
    }

    switch (type) {
      case 'calib':
        await bluetoothStore.handleSendCalibParam(
          parseFloat(calibParams.x),
          parseFloat(calibParams.y),
          parseFloat(calibParams.z),
        )
        break

      case 'speed':
        await bluetoothStore.handleSendRotateSpeed(
          parseFloat(speedParams.pitchSpeed),
          parseFloat(speedParams.yawSpeed),
        )
        break

      case 'scan':
        await bluetoothStore.handleSendScanTime(scanTime.value.seconds)
        break

      case 'pitchLimit':
        await bluetoothStore.handleSendPitchLimit(
          parseFloat(pitchLimit.upperLimitDeg),
          parseFloat(pitchLimit.lowerLimitDeg),
        )
        break

      // case 'pid':
      //   if (pidSettings.loopType === 'V') {
      //     await bluetoothStore.handleSendVPID(
      //       pidSettings.axis,
      //       parseFloat(pidSettings.p),
      //       parseFloat(pidSettings.i),
      //       parseFloat(pidSettings.d),
      //     )
      //   } else {
      //     await bluetoothStore.handleSendAPID(
      //       pidSettings.axis,
      //       parseFloat(pidSettings.p),
      //       parseFloat(pidSettings.i),
      //       parseFloat(pidSettings.d),
      //     )
      //   }
      //   break

      case 'pitchOffset':
        await bluetoothStore.handleSendPitchOffset(parseFloat(pitchOffset.value))
        break

      case 'yawStep':
        await bluetoothStore.handleSendYawStep(parseFloat(yawStep.value))
        break

      case 'pitchTargets':
        await bluetoothStore.handleSendPitchTargets(
          parseFloat(pitchTargets.pitch0),
          parseFloat(pitchTargets.pitch1),
          parseFloat(pitchTargets.pitch2),
        )
        break
    }
  } catch (error) {
    console.error(`保存${type}失败:`, error)
    showToast({ message: '保存失败', position: 'bottom' })
    // 只有在非静默模式时才重置标记
    if (!silent) {
      isFromSaveAction.value = false
    }
  } finally {
    savingState[type] = false
  }
}

// // 处理PID选择器变更
// const handlePIDSelectorChange = async () => {
//   if (deviceDisconnected.value) return
//
//   try {
//     if (pidSettings.loopType === 'V') {
//       await bluetoothStore.handleReadVPID(pidSettings.axis)
//     } else {
//       await bluetoothStore.handleReadAPID(pidSettings.axis)
//     }
//   } catch (error) {
//     console.error('读取PID参数失败:', error)
//     showToast({ message: '读取PID参数失败', position: 'bottom' })
//   }
// }

// 处理输出格式开关变化
// 添加 silent 参数，保持与 saveParam 一致
const handleOutputChange = async (type, value, silent = false) => {
  if (deviceDisconnected.value) {
    showToast({ message: '请先连接设备', position: 'bottom' })
    // 如果设备未连接，恢复开关状态
    outputFormat[type] = !value
    return
  }

  try {
    savingState.outputFormat = true
    // 只有在非静默模式时才设置标记
    if (!silent) {
      isFromSaveAction.value = true
    }

    if (type === 'xyz') {
      await bluetoothStore.handleSendOutputXYZ(value)
    } else {
      await bluetoothStore.handleSendOutputPolar(value)
    }
  } catch (error) {
    console.error(`设置输出格式${type}失败:`, error)
    showToast({ message: '设置失败', position: 'bottom' })
    // 发生错误时恢复开关状态
    outputFormat[type] = !value
    // 只有在非静默模式时才重置标记
    if (!silent) {
      isFromSaveAction.value = false
    }
  } finally {
    savingState.outputFormat = false
  }
}

// 恢复默认值函数 - 修改为只显示一个提示
const resetToDefault = async () => {
  if (deviceDisconnected.value) {
    showToast({ message: '请先连接设备', position: 'bottom' })
    return
  }

  try {
    // 添加确认对话框
    const confirmed = await showConfirmDialog({
      title: '恢复默认值',
      message: '确定要恢复所有参数到默认值吗？',
    }).catch(() => false)

    if (!confirmed) return
    console.log('开始恢复默认值...')

    // 先清除所有错误
    calibErrors.x = ''
    calibErrors.y = ''
    calibErrors.z = ''
    speedErrors.pitchSpeed = ''
    speedErrors.yawSpeed = ''
    scanErrors.seconds = ''
    pitchLimitErrors.upper = ''
    pitchLimitErrors.lower = ''
    // // 清除PID错误
    // pidErrors.p = ''
    // pidErrors.i = ''
    // pidErrors.d = ''
    // 清除俯仰角零偏错误
    pitchOffsetErrors.value = ''
    // 清除水平拍照角度步进错误
    yawStepErrors.value = ''
    // 清除俯仰角目标错误
    pitchTargetsErrors.pitch0 = ''
    pitchTargetsErrors.pitch1 = ''
    pitchTargetsErrors.pitch2 = ''

    // 先更新UI显示为默认值并格式化
    calibParams.x = SETTING_DEFAULT_VALUES.CALIB.x.toFixed(2)
    calibParams.y = SETTING_DEFAULT_VALUES.CALIB.y.toFixed(2)
    calibParams.z = SETTING_DEFAULT_VALUES.CALIB.z.toFixed(2)

    speedParams.pitchSpeed = SETTING_DEFAULT_VALUES.SPEED.pitch.toFixed(1)
    speedParams.yawSpeed = SETTING_DEFAULT_VALUES.SPEED.yaw.toFixed(1)

    scanTime.value.seconds = SETTING_DEFAULT_VALUES.SCAN_TIME // 数字，不转字符串

    pitchLimit.upperLimitDeg = SETTING_DEFAULT_VALUES.PITCH_LIMIT.upper.toFixed(2)
    pitchLimit.lowerLimitDeg = SETTING_DEFAULT_VALUES.PITCH_LIMIT.lower.toFixed(2)

    // 输出格式默认值
    outputFormat.xyz = SETTING_DEFAULT_VALUES.OUTPUT_FORMAT.xyz
    outputFormat.polar = SETTING_DEFAULT_VALUES.OUTPUT_FORMAT.polar

    // // PID参数默认值 - 保留4位小数
    // pidSettings.loopType = SETTING_DEFAULT_VALUES.PID.loopType
    // pidSettings.axis = SETTING_DEFAULT_VALUES.PID.axis
    // pidSettings.p = SETTING_DEFAULT_VALUES.PID.p.toFixed(4)
    // pidSettings.i = SETTING_DEFAULT_VALUES.PID.i.toFixed(4)
    // pidSettings.d = SETTING_DEFAULT_VALUES.PID.d.toFixed(4)

    // 俯仰角零偏默认值 - 保留2位小数
    pitchOffset.value = SETTING_DEFAULT_VALUES.PITCH_OFFSET.toFixed(2)

    // 水平拍照角度步进默认值 - 保留2位小数
    yawStep.value = SETTING_DEFAULT_VALUES.YAW_STEP.toFixed(2)

    // 三个俯仰角目标默认值 - 保留2位小数
    pitchTargets.pitch0 = SETTING_DEFAULT_VALUES.PITCH_TARGETS.pitch0.toFixed(2)
    pitchTargets.pitch1 = SETTING_DEFAULT_VALUES.PITCH_TARGETS.pitch1.toFixed(2)
    pitchTargets.pitch2 = SETTING_DEFAULT_VALUES.PITCH_TARGETS.pitch2.toFixed(2)


    // 使用 silent 模式调用保存函数，不触发单个提示
    await saveParam('calib', true)
    await saveParam('speed', true)
    await saveParam('scan', true)
    await saveParam('pitchLimit', true)
    await saveParam('pitchOffset', true)
    await saveParam('yawStep', true)
    await saveParam('pitchTargets', true)
    // await saveParam('pid', true)

    // 输出格式需要单独发送，也使用 silent 模式----暂时不启用
    // await handleOutputChange('xyz', outputFormat.xyz, true)
    // await handleOutputChange('polar', outputFormat.polar, true)

    // 只保留这一个提示
    showToast({ message: '所有参数已恢复默认值', position: 'bottom' })
  } catch (error) {
    console.error('恢复默认值失败:', error)
    showToast({ message: '恢复默认值失败', position: 'bottom' })
  }
}

// 读取所有参数函数
const readAllParams = async () => {
  if (deviceDisconnected.value) {
    showToast({ message: '设备未连接', position: 'bottom' })
    return
  }

  refreshing.value = true
  try {
    console.log('开始读取所有参数...')

    // 并发读取所有参数
    await Promise.all([
      bluetoothStore.handleReadCalibParam(),
      bluetoothStore.handleReadRotateSpeed(),
      bluetoothStore.handleReadScanTime(),
      bluetoothStore.handleReadPitchLimit(),
      bluetoothStore.handleReadPitchOffset(),
      bluetoothStore.handleReadYawStep(),
      bluetoothStore.handleReadPitchTargets(),
      // bluetoothStore.handleReadOutputXYZ(),
      bluetoothStore.handleReadOutputPolar(),
      // // 读取当前选中的PID参数
      // pidSettings.loopType === 'V' ?
      //   bluetoothStore.handleReadVPID(pidSettings.axis) :
      //   bluetoothStore.handleReadAPID(pidSettings.axis)
    ])
    // 只有一个提示
    showToast({ message: '参数已刷新', position: 'bottom' })
  } catch (error) {
    console.error('读取参数失败:', error)

    showToast({ message: '读取参数失败', position: 'bottom' })
  } finally {
    refreshing.value = false
  }
}

// 手动刷新处理
const handleManualRefresh = async () => {
  await readAllParams()
}
</script>

<style scoped>
.setting-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #e6f7ff 0%, #f0f9ff 100%);
  box-sizing: border-box;
}

/* 滚动区域 */
.cards-scroll {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 16px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.cards-scroll::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

/* 参数卡片 */
.param-card {
  background: white;
  border-radius: 20px;
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: 0 4px 12px rgba(0, 40, 80, 0.08);
  border: 1px solid rgba(24, 144, 255, 0.1);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.title-text {
  font-size: 16px;
  font-weight: 600;
  color: #2c3e50;
}

/* 六轴布局 */
.six-axis-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.axis-row {
  display: flex;
  gap: 12px;
}

.axis-item {
  flex: 1;
}

.axis-item label {
  display: block;
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
  margin-left: 4px;
}

.unit {
  color: #999;
  font-size: 10px;
}

:deep(.van-field) {
  background-color: #f5f9ff;
  border-radius: 12px;
  padding: 8px 12px;
  border: 1px solid #e6f0fa;
  transition: all 0.2s;
}

:deep(.van-field:focus-within) {
  border-color: #1890ff;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.1);
}

:deep(.van-field__control) {
  color: #2c3e50;
  font-size: 14px;
}

/* 错误状态下的输入框样式 */
:deep(.van-field--error) {
  border-color: #f56c6c;
  background-color: #fef0f0;
}

/* 字段错误提示 */
.field-error-hint {
  margin-top: 4px;
  padding: 4px 8px;
  background-color: #fef0f0;
  border-radius: 4px;
  color: #f56c6c;
  font-size: 11px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.field-error-hint :deep(.van-icon) {
  font-size: 12px;
}

/* 双列布局 */
.dual-row {
  display: flex;
  gap: 16px;
}

/* 扫描时间 */
.scan-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.scan-input {
  flex: 3;
}

.scan-unit {
  flex: 0.8;
  background: #f0f9ff;
  border: 1px solid #d9e9ff;
  border-radius: 12px;
  text-align: center;
  padding: 10px 0;
  font-size: 16px;
  font-weight: 500;
  color: #1890ff;
}

.limit-error-hint {
  margin-top: 8px;
  padding: 6px 12px;
  background-color: #fff2f0;
  border: 1px solid #ffccc7;
  border-radius: 8px;
  color: #f56c6c;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.limit-error-hint :deep(.van-icon) {
  font-size: 14px;
}

/* 输出格式卡片样式 */
.output-format-card {
  /* 继承 param-card 样式 */
}

.output-hint {
  font-size: 12px;
  color: #1890ff;
  background: #e6f7ff;
  padding: 4px 10px;
  border-radius: 30px;
  border: 1px solid rgba(24, 144, 255, 0.3);
}

.output-switch-row {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 8px;
}

.output-switch-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
}

.output-label {
  display: flex;
  flex-direction: column;
}

.output-name {
  font-size: 15px;
  font-weight: 500;
  color: #2c3e50;
}

.output-desc {
  font-size: 11px;
  color: #999;
  margin-top: 2px;
}

/* PID参数设置样式 */
.pid-selectors {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.pid-selector-item {
  flex: 1;
}

.pid-selector-item label {
  display: block;
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
  margin-left: 4px;
}

/* 下拉框样式 */
:deep(.van-dropdown-menu) {
  width: 100%;
}

:deep(.van-dropdown-menu__item) {
  background-color: #f5f9ff;
  border-radius: 12px;
  padding: 8px 12px;
  border: 1px solid #e6f0fa;
  transition: all 0.2s;
  font-size: 14px;
  color: #2c3e50;
  overflow: hidden;
}

:deep(.van-dropdown-menu__bar) {
  background-color: transparent;
  box-shadow: none;
}

:deep(.van-dropdown-menu__item:focus) {
  border-color: #1890ff;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.1);
}

:deep(.van-dropdown-menu__item:active) {
  background-color: #e6f7ff;
}

:deep(.van-dropdown-menu__title) {
  background-color: transparent;
}

:deep(.van-dropdown-menu__option) {
  font-size: 14px;
  color: #2c3e50;
}

:deep(.van-dropdown-menu__option--active) {
  color: #1890ff;
}

/* 下拉框弹出层样式 - 使用van-popup类 */
:deep(.van-dropdown-item .van-popup) {
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 40, 80, 0.12);
  border: 1px solid rgba(24, 144, 255, 0.1);
  background-color: white;
  width: calc(50% - 30px) !important;
  min-width: 120px;
  max-width: 200px;
  overflow: hidden;
}

/* 环类型下拉框位置 - 左侧 */
:deep(.pid-selector-item:first-child .van-dropdown-item .van-popup) {
  left: 16px !important;
  right: auto !important;
}

/* 轴下拉框位置 - 右侧 */
:deep(.pid-selector-item:last-child .van-dropdown-item .van-popup) {
  left: auto !important;
  right: 16px !important;
}

/* 下拉框内容区域 */
:deep(.van-dropdown-item__content) {
  border-radius: 12px;
  overflow: hidden;
}

/* 下拉框遮罩层样式 - 透明背景 */
:deep(.van-dropdown-item .van-overlay) {
  background-color: transparent;
}

.pid-params {
  display: flex;
  gap: 12px;
}

.pid-param-item {
  flex: 1;
}

.pid-param-item label {
  display: block;
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
  margin-left: 4px;
}

/* 底部双按钮行 */
.bottom-actions {
  display: flex;
  gap: 12px;
  margin: 16px 0 8px 0;
  padding: 0 4px;
}

.action-button {
  flex: 1;
  height: 44px;
  border-radius: 22px;
  font-size: 15px;
  font-weight: 500;
}

.refresh-button {
  background: white;
  border: 1px solid #1890ff;
  color: #1890ff;
}

.refresh-button:active {
  background: #e6f7ff;
}

.reset-button {
  background-color: #1890ff;
  border: none;
  color: white;
}

.reset-button:active {
  opacity: 0.8;
}

.reset-button:disabled {
  background-color: #a0cfff;
}

.bottom-spacing {
  height: 20px;
}

:deep(.van-button--primary) {
  background-color: #1890ff;
  border: none;
  border-radius: 30px;
  padding: 0 16px;
  height: 36px;
}

:deep(.van-button--primary.van-button--plain) {
  background: white;
  border: 1px solid #1890ff;
  color: #1890ff;
}

:deep(.van-button--primary.van-button--plain:active) {
  background: #e6f7ff;
}
</style>
