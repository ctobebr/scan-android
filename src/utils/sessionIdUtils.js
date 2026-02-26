// src/utils/sessionIdUtils.js

// 由 generateOptimizedSessionId 生成的 base36 会话 ID 解析回时间，
// 同时支持将 Date 转为相同格式的 sessionId。兼容 14 位（无毫秒）和 17 位（含毫秒）时间戳。

function pad(num, size) {
  return num.toString().padStart(size, '0')
}

function dateToTimestampString(date, includeMillis = true) {
  const year = date.getUTCFullYear()
  const month = pad(date.getUTCMonth() + 1, 2)
  const day = pad(date.getUTCDate(), 2)
  const hours = pad(date.getUTCHours(), 2)
  const minutes = pad(date.getUTCMinutes(), 2)
  const seconds = pad(date.getUTCSeconds(), 2)
  if (includeMillis) {
    const milliseconds = pad(date.getUTCMilliseconds(), 3)
    return `${year}${month}${day}${hours}${minutes}${seconds}${milliseconds}`
  }
  return `${year}${month}${day}${hours}${minutes}${seconds}`
}

function timestampStringToDateFlexible(s) {
  if (typeof s !== 'string' || s.length < 14) return null

  const year = parseInt(s.substring(0, 4), 10)
  const month = parseInt(s.substring(4, 6), 10) - 1
  const day = parseInt(s.substring(6, 8), 10)
  const hour = parseInt(s.substring(8, 10), 10)
  const minute = parseInt(s.substring(10, 12), 10)
  const second = parseInt(s.substring(12, 14), 10)

  let millisecond = 0
  if (s.length > 14) {
    const msPart = s.substring(14)
    const msFilled = (msPart + '000').substring(0, 3)
    millisecond = parseInt(msFilled, 10)
  }

  const date = new Date(Date.UTC(year, month, day, hour, minute, second, millisecond))
  if (isNaN(date.getTime())) return null
  return date
}

function charToBase36Value(ch) {
  const c = ch.toLowerCase()
  if (c >= '0' && c <= '9') return c.charCodeAt(0) - 48
  if (c >= 'a' && c <= 'z') return c.charCodeAt(0) - 97 + 10
  return -1
}

function base36ToBigInt(str) {
  if (typeof str !== 'string' || str.length === 0) throw new Error('Invalid base36 string')
  let acc = 0n
  for (let i = 0; i < str.length; i++) {
    const v = charToBase36Value(str[i])
    if (v < 0) throw new Error(`Invalid character for base36: ${str[i]}`)
    acc = acc * 36n + BigInt(v)
  }
  return acc
}

export function parseSessionIdToDate(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') return null
  try {
    let decimalStr = null

    if (/^[0-9]+$/.test(sessionId)) {
      // already decimal representation
      decimalStr = BigInt(sessionId).toString()
    } else {
      // base36 -> BigInt -> decimal string
      const big = base36ToBigInt(sessionId)
      decimalStr = big.toString()
    }

    // 支持 14 位（无毫秒）和 17 位（含毫秒），以及 15/16 的情况
    if (decimalStr.length < 14) return null

    return timestampStringToDateFlexible(decimalStr)
  } catch (err) {
    console.error(
      `解析 sessionId "${sessionId}" 时发生错误:`,
      err && err.message ? err.message : err,
    )
    return null
  }
}

export function parseSessionIdToFormattedTime(sessionId) {
  const date = parseSessionIdToDate(sessionId)
  if (!date) return null
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

export function dateToSessionId(date, includeMillis = true) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return null
  const ts = dateToTimestampString(date, includeMillis)
  try {
    const big = BigInt(ts)
    return big.toString(36)
  } catch (err) {
    console.error('Error converting date to sessionId:', err && err.message ? err.message : err)
    return null
  }
}

/**
 * 生成当前时间对应的优化后 sessionId（便于外部直接调用）
 */
export function generateOptimizedSessionId(includeMillis = true) {
  return dateToSessionId(new Date(), includeMillis)
}
