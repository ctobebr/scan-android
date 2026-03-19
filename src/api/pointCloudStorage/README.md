# PointCloudStorage API 使用文档

## 概述

PointCloudStorage API 是点云数据存储管理的统一对外接口，采用规范的 **API/Service/Util** 分层架构设计。

```
src/
├── api/pointCloudStorage/   # API 层 - 对外暴露的统一接口 (本模块)
│   ├── index.js             # 统一导出入口
│   ├── session.js           # 会话管理命名空间
│   ├── batch.js             # 批次管理命名空间
│   ├── file.js              # 文件操作命名空间
│   ├── export.js            # 导出功能命名空间
│   ├── path.js              # 路径工具命名空间
│   ├── validate.js          # 验证工具命名空间
│   └── README.md            # API使用文档
├── services/                # Service 层 - 业务逻辑
│   ├── fileSystemService.js
│   └── pointCloudService.js
├── utils/                   # Util 层 - 纯工具函数
│   ├── pathUtils.js
│   └── validators.js
└── constants/               # 常量层
    └── fileSystem.js
```

## 快速开始

### 安装

无需额外安装，本项目内置模块。

### 基本使用

#### 方式1：命名空间导入（推荐）

```javascript
import * as storage from '@/api/pointCloudStorage'

// 会话管理
const sessions = await storage.session.listAll()
await storage.session.rename('oldName', 'newName')

// 批次管理
await storage.batch.save(sessionId, batchId, dataLines, photos)
const batches = await storage.batch.list(sessionId)

// 导出功能
const zipResult = await storage.exportData.toZip(sessionName)
```

#### 方式2：按需导入特定命名空间

```javascript
import { session, batch, file } from '@/api/pointCloudStorage'

const sessions = await session.listAll()
await batch.save(sessionId, batchId, dataLines)
const content = await file.read(filePath)
```

#### 方式3：按需导入具体函数

```javascript
import { 
  listSessions, 
  saveBatch, 
  zipSessionToFile,
  POINTCLOUD_ROOT 
} from '@/api/pointCloudStorage'
```

## API 命名空间

### 1. session - 会话管理

用于管理点云数据会话（项目文件夹）。

| 函数 | 描述 | 参数 | 返回值 |
|------|------|------|--------|
| `session.listAll()` | 列出所有会话 | - | `Promise<string[]>` |
| `session.listFolders(includeAll?)` | 列出点云文件夹 | `boolean` | `Promise<Array>` |
| `session.filterDisplayable(folders)` | 过滤可显示的文件夹 | `Array` | `Array` |
| `session.rename(oldName, newName)` | 重命名会话 | `string, string` | `Promise<boolean>` |
| `session.delete(sessionId)` | 删除会话 | `string` | `Promise<void>` |
| `session.deleteFolder(folderOrRel)` | 删除点云文件夹 | `string` | `Promise<boolean>` |
| `session.ensureDir(sessionId)` | 确保会话目录存在 | `string` | `Promise<string>` |

**示例：**

```javascript
import { session } from '@/api/pointCloudStorage'

// 列出所有会话
const sessions = await session.listAll()
console.log('会话列表:', sessions)

// 重命名会话
await session.rename('20250319_143022', '我的项目')

// 删除会话
await session.delete('20250319_143022')
```

### 2. batch - 批次管理

用于管理会话内的数据批次（点位）。

| 函数 | 描述 | 参数 | 返回值 |
|------|------|------|--------|
| `batch.save(sessionID, batchId, dataLines, photos?)` | 保存批次数据 | `string, string/number, string[], Array?` | `Promise<Object>` |
| `batch.list(sessionId)` | 列出会话下的所有批次 | `string` | `Promise<string[]>` |
| `batch.read(sessionId, batchId)` | 读取批次数据 | `string, string/number` | `Promise<{lines, photos}>` |
| `batch.delete(sessionId, batchId)` | 删除批次 | `string, string/number` | `Promise<void>` |
| `batch.reindex(sessionId)` | 重索引批次 | `string` | `Promise<void>` |
| `batch.ensureDir(sessionId, batchId)` | 确保批次目录存在 | `string, string/number` | `Promise<string>` |

**示例：**

```javascript
import { batch } from '@/api/pointCloudStorage'

// 保存批次
const result = await batch.save(
  '20250319_143022',
  1,
  ['x,y,z', '1.0,2.0,3.0'],
  [{ name: 'photo1.jpg', base64: '...' }]
)
console.log('保存结果:', result)

// 列出批次
const batches = await batch.list('20250319_143022')
console.log('批次列表:', batches)

// 读取批次数据
const data = await batch.read('20250319_143022', 1)
console.log('数据行:', data.lines)
console.log('照片:', data.photos)
```

### 3. file - 文件操作

底层文件系统操作接口。

| 函数 | 描述 | 参数 | 返回值 |
|------|------|------|--------|
| `file.read(path, opts?)` | 读取文件 | `string, Object?` | `Promise<Object>` |
| `file.write(path, data, opts?)` | 写入文件 | `string, string, Object?` | `Promise<void>` |
| `file.delete(path)` | 删除文件 | `string` | `Promise<void>` |
| `file.getUri(path)` | 获取文件 URI | `string` | `Promise<{uri}>` |
| `file.stat(path)` | 获取文件状态 | `string` | `Promise<Object>` |
| `file.readDir(path)` | 读取目录 | `string` | `Promise<{files}>` |
| `file.makeDir(path, opts?)` | 创建目录 | `string, Object?` | `Promise<void>` |
| `file.removeDir(path, opts?)` | 删除目录 | `string, Object?` | `Promise<void>` |
| `file.rename(oldPath, newPath)` | 重命名 | `string, string` | `Promise<void>` |
| `file.ensureDir(path)` | 确保目录存在 | `string` | `Promise<string>` |
| `file.deletePath(path)` | 删除路径 | `string` | `Promise<void>` |
| `file.listRecursive(path, maxDepth?)` | 递归列出文件 | `string, number?` | `Promise<string[]>` |
| `file.listInFolder(path)` | 列出文件夹内容 | `string` | `Promise<Array>` |
| `file.ensureNoMedia(basePath)` | 确保 .nomedia 标记 | `string` | `Promise<void>` |
| `file.exists(path)` | 检查文件是否存在 | `string` | `Promise<boolean>` |
| `file.copy(fromPath, toPath)` | 复制文件 | `string, string` | `Promise<void>` |
| `file.move(fromPath, toPath)` | 移动文件 | `string, string` | `Promise<void>` |

**示例：**

```javascript
import { file } from '@/api/pointCloudStorage'

// 读取文件
const result = await file.read('pointcloud/data.txt', { encoding: 'utf8' })
console.log(result.data)

// 写入文件
await file.write('pointcloud/output.txt', 'Hello World')

// 检查文件是否存在
const exists = await file.exists('pointcloud/data.txt')
```

### 4. exportData - 导出功能

| 函数 | 描述 | 参数 | 返回值 |
|------|------|------|--------|
| `exportData.toZip(sessionFolderName, zipFileName?)` | 打包为 ZIP | `string, string?` | `Promise<{uri, path, relativePath}>` |
| `exportData.getThumbnail(sessionId)` | 获取项目缩略图 | `string` | `Promise<{uri, path, hasPhoto, batchInfo}>` |
| `exportData.getBatchInfo(sessionId)` | 获取批次信息 | `string` | `Promise<Array>` |
| `exportData.getFirstPhotoUri(sessionId)` | 获取第一张照片URI | `string` | `Promise<string\|null>` |

**示例：**

```javascript
import { exportData } from '@/api/pointCloudStorage'

// 导出为 ZIP
const zipResult = await exportData.toZip('20250319_143022', '我的项目备份')
console.log('ZIP 文件URI:', zipResult.uri)

// 获取缩略图
const thumbnail = await exportData.getThumbnail('20250319_143022')
if (thumbnail.hasPhoto) {
  console.log('缩略图URI:', thumbnail.uri)
}
```

### 5. path - 路径工具

纯工具函数，无副作用。

| 函数 | 描述 | 参数 | 返回值 |
|------|------|------|--------|
| `path.isSessionId(folderName)` | 判断是否为会话ID格式 | `string` | `boolean` |
| `path.isProjectWithSessionFormat(folderName)` | 判断是否为项目-会话格式 | `string` | `boolean` |
| `path.isCustomFolder(folderName)` | 判断是否为自定义文件夹 | `string` | `boolean` |
| `path.parseFolderName(folderName)` | 解析文件夹名称 | `string` | `Object` |
| `path.getDisplayName(folderName)` | 获取显示名称 | `string` | `string` |
| `path.sessionFolder(sessionId)` | 构建会话文件夹路径 | `string` | `string` |
| `path.batchFolder(sessionId, batchId)` | 构建批次文件夹路径 | `string, string/number` | `string` |
| `path.buildDataFileName()` | 构建点云数据文件名 | - | `string` |
| `path.isTempSession(folderName)` | 判断是否为临时会话 | `string` | `boolean` |
| `path.getTempSessionName()` | 获取临时会话名称 | - | `string` |
| `path.extractSessionIdFromTemp(folderName)` | 从临时会话名提取会话ID | `string` | `string\|null` |
| `path.parsePhotoFileName(fileName)` | 解析照片文件名 | `string` | `Object\|null` |
| `path.normalizeBatchId(batchId)` | 规范化批次ID | `string/number` | `string` |
| `path.extractBatchNumber(batchFolderName)` | 提取批次编号 | `string` | `number\|null` |
| `path.getFileNameFromPath(filePath)` | 从路径获取文件名 | `string` | `string` |
| `path.getDirectoryFromPath(filePath)` | 从路径获取目录 | `string` | `string` |
| `path.getFileExtension(fileName)` | 获取文件扩展名 | `string` | `string` |
| `path.isImageFile(fileName)` | 判断是否为图片文件 | `string` | `boolean` |
| `path.isDataFile(fileName)` | 判断是否为数据文件 | `string` | `boolean` |
| `path.build(...parts)` | 构建路径 | `...string` | `string` |

**示例：**

```javascript
import { path } from '@/api/pointCloudStorage'

// 判断文件夹名格式
console.log(path.isSessionId('20250319_143022')) // true
console.log(path.isSessionId('MyProject')) // false

// 解析文件夹名
const info = path.parseFolderName('ProjectA_20250319_143022')
console.log(info.projectName) // 'ProjectA'
console.log(info.sessionId) // '20250319_143022'

// 构建路径
console.log(path.sessionFolder('20250319_143022'))
// 'pointcloud/20250319_143022'

console.log(path.batchFolder('20250319_143022', 1))
// 'pointcloud/20250319_143022/Batch_001'

// 判断文件类型
console.log(path.isImageFile('photo.jpg')) // true
console.log(path.isDataFile('data.txt')) // false
```

### 6. validate - 验证工具

| 函数/属性 | 描述 | 参数 | 返回值 |
|-----------|------|------|--------|
| `validate.Error` | 错误类 | - | Error |
| `validate.session(sessionId)` | 验证会话ID | `string` | `void` |
| `validate.batch(batchId)` | 验证批次ID | `string/number` | `void` |
| `validate.sanitizePath(inputPath)` | 清理路径 | `string` | `string\|null` |
| `validate.folder(name)` | 验证文件夹名称 | `string` | `void` |
| `validate.photos(photos)` | 验证照片数组 | `Array` | `void` |
| `validate.data(dataLines)` | 验证数据行 | `string[]` | `void` |
| `validate.parameters(validations)` | 验证多个参数 | `Array` | `void` |

**示例：**

```javascript
import { validate } from '@/api/pointCloudStorage'

try {
  validate.session('20250319_143022')
  console.log('会话ID有效')
} catch (error) {
  if (error instanceof validate.Error) {
    console.error('验证失败:', error.message)
  }
}

// 清理路径
const safePath = validate.sanitizePath('../../../etc/passwd')
console.log(safePath) // null (非法路径)
```

## 常量

```javascript
import { 
  POINTCLOUD_ROOT,      // 'pointcloud'
  TEMP_PREFIX,          // 'Temp_'
  BATCH_PREFIX,         // 'Batch_'
  BATCH_NUMBER_LENGTH,  // 3
  IMAGE_EXTENSIONS,     // ['.jpg', '.jpeg', '.png', '.webp']
  DATA_EXTENSIONS,      // ['.txt', '.csv', '.json']
  MAX_RECURSION_DEPTH,  // 10
  ErrorCodes,           // 错误码枚举
  FeatureFlags          // 功能标志
} from '@/api/pointCloudStorage'
```

## 错误处理

所有 API 都可能抛出 `validate.Error`，建议使用 try-catch 处理：

```javascript
import { validate } from '@/api/pointCloudStorage'

try {
  await storage.batch.save(sessionId, batchId, dataLines, photos)
} catch (error) {
  if (error instanceof validate.Error) {
    console.error('操作失败:', error.message)
    console.error('错误码:', error.code)
  } else {
    console.error('未知错误:', error)
  }
}
```

### 错误码

| 错误码 | 描述 |
|--------|------|
| `INVALID_SESSION_ID` | 无效的会话ID |
| `INVALID_BATCH_ID` | 无效的批次ID |
| `INVALID_PATH` | 无效的路径 |
| `VALIDATION_ERROR` | 验证错误 |
| `FILESYSTEM_ERROR` | 文件系统错误 |
| `NOT_FOUND` | 资源不存在 |
| `ALREADY_EXISTS` | 资源已存在 |
| `PERMISSION_DENIED` | 权限拒绝 |

## 向后兼容

以下函数为向后兼容保留，建议迁移到新 API：

| 旧函数 | 新函数 | 状态 |
|--------|--------|------|
| `saveBleDataToFileWithSessionStructure` | `batch.save` | 已弃用 |
| `listBleDataFiles` | `session.listAll` | 已弃用 |
| `readBleDataFile` | `batch.read` | 已弃用 |

## 版本信息

```javascript
import { VERSION, BUILD_DATE, getModuleInfo } from '@/api/pointCloudStorage'

console.log('API 版本:', VERSION) // '3.0.0'
console.log('构建日期:', BUILD_DATE) // '2026-03-19'
console.log('模块信息:', getModuleInfo())
```

## 最佳实践

### 1. 使用命名空间（推荐）

```javascript
// 推荐：使用命名空间，代码更清晰
import * as storage from '@/api/pointCloudStorage'

await storage.session.rename('old', 'new')
await storage.batch.save(sessionId, batchId, data)
const uri = await storage.exportData.toZip(sessionName)
```

### 2. 统一错误处理

```javascript
import * as storage from '@/api/pointCloudStorage'

async function handleStorageOperation(operation) {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof storage.validate.Error) {
      showToast(error.message)
    } else {
      console.error('意外错误:', error)
      showToast('操作失败，请重试')
    }
  }
}
```

### 3. 路径构建

```javascript
import * as storage from '@/api/pointCloudStorage'

// 使用工具函数构建路径，避免硬编码
const sessionPath = storage.path.sessionFolder('20250319_143022')
const batchPath = storage.path.batchFolder('20250319_143022', 1)
const filePath = storage.path.build(sessionPath, 'data.txt')
```

## 迁移指南

### 从 filePathUtils 迁移

**旧代码：**
```javascript
import * as filePathUtils from '@/utils/filePathUtils'

await filePathUtils.renameSession('old', 'new')
await filePathUtils.saveBatch(sessionId, batchId, data)
```

**新代码：**
```javascript
import * as storage from '@/api/pointCloudStorage'

await storage.session.rename('old', 'new')
await storage.batch.save(sessionId, batchId, data)
```

### 从 filePath API 迁移

**旧代码：**
```javascript
import * as filePathUtils from '@/api/filePath'

await filePathUtils.renameSession('old', 'new')
await filePathUtils.saveBatch(sessionId, batchId, data)
```

**新代码：**
```javascript
import * as storage from '@/api/pointCloudStorage'

await storage.session.rename('old', 'new')
await storage.batch.save(sessionId, batchId, data)
```

## 更新日志

### v3.0.0 (2026-03-19)

- 重构为 API/Service/Util 分层架构
- 创建 `@/api/pointCloudStorage` 作为统一对外接口
- 采用命名空间导出方式（session, batch, file, exportData, path, validate）
- 完善 JSDoc 文档
- 添加版本信息和模块信息

---

**文档版本**: 1.0.0  
**最后更新**: 2026-03-19
