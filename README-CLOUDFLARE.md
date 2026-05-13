# 安环巡检打卡系统 - Cloudflare 完整部署指南

> 🎯 **零成本部署方案**：Cloudflare Workers（后端）+ Cloudflare Pages（前端）+ 飞书多维表格（数据存储）
> 
> ✅ 无需服务器 ✅ 无需飞书云函数 ✅ 每月 10 万次免费请求 ✅ 全球 CDN 加速

---

## 📁 项目结构

```
inspection-checkin-h5/
├── index.html              # 主页面（Vue 3 + 移动端 UI）
├── style.css               # 样式文件
├── utils.js                # 工具函数（NFC+GPS+ 照片压缩）
├── checkin.js              # 打卡核心逻辑
├── admin.html              # 管理后台（巡检点配置、记录查询）
├── admin.js                # 管理后台逻辑
├── functions/              # Cloudflare Pages Functions 后端 API
│   ├── _lib/feishu.js      # 飞书 API 共享工具库
│   └── api/
│       ├── checkin.js      # POST /api/checkin
│       ├── checkpoints.js  # GET /api/checkpoints
│       └── records.js      # GET /api/records
├── NFC 标签台账模板.csv     # NFC 标签配置模板
└── README.md               # 本文档
```

---

## 🚀 快速部署（5 分钟完成）

### 步骤 1：准备飞书多维表格

已创建好的多维表格：
- **名称**: 安环巡检打卡台账
- **链接**: https://orinko-ht.feishu.cn/base/Sxyfb52XWaXjcdsEngtcwuU8nPf
- **Token**: `Sxyfb52XWaXjcdsEngtcwuU8nPf`
- **Table ID**: `tblsa3dcOVTfIExy`

**需要开通的权限**（在飞书开放平台应用权限管理）：
- ✅ `bitable:app:readonly` - 读取多维表格
- ✅ `bitable:app:write` - 写入多维表格
- ✅ `contact:user:readonly` - 获取用户信息
- ✅ `drive:file:write` - 上传照片（可选，如不需要拍照可省略）

### 步骤 2：获取飞书应用凭证

1. 访问 https://open.feishu.cn/app
2. 进入你的应用（或创建新应用）
3. 在「凭证与基础信息」页面获取：
   - **App ID**（格式：`cli_xxxxxxxxxxxxx`）
   - **App Secret**（点击复制）

### 步骤 3：部署到 Cloudflare Pages（前后端一体）

> 不再需要单独的 Worker！使用 **Cloudflare Pages + Pages Functions**，
> API 后端和前端部署在同一个域名下，不会被公司网络屏蔽。

1. 访问 https://dash.cloudflare.com
2. 用 GitHub 账号登录（或在 Pages 中直接上传文件）
3. 左侧菜单：**Workers & Pages** → **Create application** → **Pages**
4. 选择 **Upload assets**（直接上传文件，不需要 Git 连接）
5. 项目名称：`inspection-checkin`
6. 上传以下 **所有文件**（保持目录结构）：

```
index.html
style.css
checkin.js
admin.html
admin-style.css
admin.js
utils.js
sw.js
DEPLOYMENT.md
PROJECT_SUMMARY.md
README-CLOUDFLARE.md
"NFC 标签台账模板.csv"
functions/_lib/feishu.js      ← API 后端
functions/api/checkin.js       ← POST /api/checkin
functions/api/checkpoints.js   ← GET /api/checkpoints
functions/api/records.js       ← GET /api/records
```

7. 点击 **Deploy**
8. 部署完成后，进入 Pages 项目 → **Settings** → **Environment variables**（环境变量）
9. 添加以下环境变量（替换为你的实际值）：

| 变量名 | 值 |
|--------|-----|
| `FEISHU_APP_ID` | `cli_aa887dea8978dcc3` |
| `FEISHU_APP_SECRET` | `XcUxzHhk0sNaKsBPzAsY4em1KssocVAO` |
| `BITABLE_APP_TOKEN` | `Sxyfb52XWaXjcdsEngtcwuU8nPf` |
| `BITABLE_TABLE_ID` | `tblsa3dcOVTfIExy` |
| `CHECKPOINTS_TABLE_ID` | `tblN3ji5dmsQzusX` |
| `GPS_THRESHOLD` | `100` |

10. 点击 **Save**
11. 回到 **Deployments** 页面，重新部署一次让环境变量生效

> 部署完成后访问 `https://inspection-checkin.pages.dev` 即可使用。所有 API 请求都在同一域名下（`/api/*`），不会再被公司网络拦截。
1. 访问 https://open.feishu.cn/app
2. 进入你的应用
3. **应用首页地址**: 填入 Pages URL（`https://inspection-checkin-h5.pages.dev`）
4. **权限管理**: 确保开通步骤 1 中的权限
5. **发布应用**

### 步骤 5：配置巡检点（两种方式任选）

#### 方式 A：在管理后台配置（推荐）

1. 访问管理后台：`https://inspection-checkin-h5.pages.dev/admin.html`
2. 用飞书扫码登录
3. 添加巡检点信息：
   - 巡检点名称
   - NFC 标签 UID
   - GPS 经纬度
   - 偏差阈值（米）
4. 点击保存，自动同步到多维表格

#### 方式 B：直接在多维表格配置

1. 打开多维表格：https://orinko-ht.feishu.cn/base/Sxyfb52XWaXjcdsEngtcwuU8nPf
2. 在「巡检点配置」表中添加记录
3. 字段：巡检点名称、NFC 标签 UID、GPS 经度、GPS 纬度、偏差阈值

### 步骤 6：准备 NFC 标签

1. 购买 NFC 标签（推荐 NTAG213/215/216，淘宝约 1-2 元/个）
2. 用手机 NFC 功能读取每个标签的 UID
3. 在管理后台或多元表格中录入：
   - 标签 UID（格式：`04:5A:2B:3C:4D:5E`）
   - 对应的巡检点名称
   - GPS 坐标

### 步骤 7：测试打卡

1. 在飞书内打开应用（或访问 Pages URL）
2. 用手机贴近 NFC 标签
3. 自动读取 UID → GPS 定位 → 拍照 → 提交
4. 查看打卡结果和多维表格记录

---

## 📱 功能清单

### ✅ 已实现功能

#### 前端（H5 页面）
- [x] 首页概览（今日打卡统计、完成率图表）
- [x] 巡检点列表（状态展示、一键打卡）
- [x] NFC 读取（Android Web NFC API）
- [x] GPS 定位与距离校验
- [x] 现场拍照与压缩（自动压缩到 1920px）
- [x] 打卡记录查询（支持筛选、照片查看）
- [x] 离线缓存（Service Worker，支持弱网环境）
- [x] 移动端适配（响应式设计）
- [x] 深色工业安全风格

#### 后端（Cloudflare Worker）
- [x] HTTP API 接口
- [x] NFC 标签校验
- [x] GPS 距离计算（Haversine 公式）
- [x] 照片上传到飞书云文档
- [x] 写入多维表格
- [x] 异常打卡自动标记
- [x] 巡检点配置读取
- [x] 打卡记录查询接口

#### 管理后台
- [x] 巡检点配置管理（增删改查）
- [x] 打卡记录查询与导出
- [x] 统计数据展示
- [x] NFC 标签批量导入

---

## 🔧 配置说明

### 环境变量（Cloudflare Pages）

在 Cloudflare Pages 设置中添加：

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `FEISHU_APP_ID` | 飞书应用 App ID | `cli_aa887dea8978dcc3` |
| `FEISHU_APP_SECRET` | 飞书应用 App Secret | `XcUxzHhk0sNaKsBPzAsY4em1KssocVAO` |
| `BITABLE_APP_TOKEN` | 多维表格 Token | `Sxyfb52XWaXjcdsEngtcwuU8nPf` |
| `BITABLE_TABLE_ID` | 打卡记录表 ID | `tblsa3dcOVTfIExy` |
| `CHECKPOINTS_TABLE_ID` | 巡检点配置表 ID | `tblN3ji5dmsQzusX` |
| `GPS_THRESHOLD` | GPS 偏差阈值（米） | `100` |

---

## 📊 多维表格结构

### 表 1：打卡记录（tblsa3dcOVTfIExy）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| 打卡时间 | 日期 | 打卡时间戳 |
| 用户姓名 | 文本 | 打卡人姓名 |
| 用户工号 | 文本 | 打卡人工号 |
| 巡检点名称 | 文本 | 巡检点名称 |
| NFC 标签 UID | 文本 | NFC 标签唯一标识 |
| GPS 坐标 | 文本 | 格式：lat,lng |
| 现场照片 | 附件 | 上传的照片 |
| GPS 校验结果 | 文本 | 通过/异常 |
| 打卡状态 | 文本 | 成功/失败/超时 |
| 备注 | 文本 | 异常说明等 |

### 表 2：巡检点配置（需创建）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| 巡检点名称 | 文本 | 主键 |
| NFC 标签 UID | 文本 | 唯一标识 |
| GPS 经度 | 数字 | 标准经度 |
| GPS 纬度 | 数字 | 标准纬度 |
| 偏差阈值 | 数字 | 允许偏差（米） |
| 启用状态 | 复选框 | 是否启用 |
| 备注 | 文本 | 位置描述等 |

---

## 🎨 待办功能完善说明

### 1. 从后端 API 动态获取巡检点配置 ✅

**实现方式**：
- Worker 提供 `/api/checkpoints` 接口
- 前端页面加载时自动获取配置
- 支持热更新，无需重新部署

**使用**：
```javascript
// checkin.js 中已实现
async function loadCheckpoints() {
  const response = await fetch(API_URL + '/api/checkpoints');
  const data = await response.json();
  return data.data;
}
```

### 2. 支持 iPhone NFC 读取（飞书 SDK）✅

**实现方式**：
- 检测 iOS 设备时，使用飞书原生 NFC 能力
- 通过飞书 JS-SDK 调用 `lark.nfc.scan()`
- 降级方案：手动输入 NFC 标签编号

**使用**：
- iPhone 用户在飞书内打开应用
- 点击「去打卡」→ 自动调用飞书 NFC 扫描
- 或手动输入标签编号（最后 6 位）

### 3. 离线缓存功能 ✅

**实现方式**：
- Service Worker 缓存静态资源
- IndexedDB 存储打卡记录（弱网时暂存）
- 网络恢复后自动同步

**使用**：
- 首次访问自动缓存
- 无网络时仍可打卡（记录暂存本地）
- 有网络时自动上传

### 4. 打卡记录查询页面 ✅

**实现方式**：
- 前端页面 `/admin.html` 提供查询界面
- 支持按日期、人员、巡检点筛选
- 支持导出 Excel

**使用**：
- 访问 `https://xxxx.pages.dev/admin.html`
- 飞书扫码登录
- 选择筛选条件 → 查询 → 导出

---

## 🧪 测试清单

### 功能测试
- [ ] NFC 标签读取（Android）
- [ ] NFC 标签读取（iPhone + 飞书 SDK）
- [ ] GPS 定位与距离校验
- [ ] 拍照与压缩
- [ ] 打卡提交与反馈
- [ ] 异常打卡标记（超出距离）
- [ ] 打卡记录查询
- [ ] 管理后台配置巡检点

### 兼容性测试
- [ ] Android Chrome
- [ ] iPhone Safari
- [ ] 飞书内嵌浏览器
- [ ] 弱网环境
- [ ] 离线环境

---

## ⚠️ 注意事项

### NFC 支持
- **Android**: Chrome for Android 支持 Web NFC
- **iPhone**: 
  - iPhone X 及更早：不支持 Web NFC，需用飞书 SDK
  - iPhone XS 及更新：支持 Web NFC，但需要 HTTPS
- **建议**: 先用 Android 手机测试

### GPS 精度
- 室外：5-20 米
- 室内：20-100 米（可能漂移）
- **建议阈值**: 50-100 米

### 照片大小
- 自动压缩到 1920px 宽度
- 单张 < 5MB（飞书云文档限制）
- 弱网环境建议关闭拍照

### Cloudflare 免费额度
- Workers: 10 万次请求/天
- Pages: 500 次构建/月
- **足够**: 100 人 × 4 次/天 × 30 天 = 12,000 次/月

---

## 🔗 相关链接

- **前端页面**: `https://inspection-checkin-h5.pages.dev`
- **管理后台**: `https://inspection-checkin-h5.pages.dev/admin.html`
- **Worker API**: `https://inspection-checkin-api.xxxx.workers.dev`
- **多维表格**: https://orinko-ht.feishu.cn/base/Sxyfb52XWaXjcdsEngtcwuU8nPf
- **飞书开放平台**: https://open.feishu.cn/app
- **Cloudflare 控制台**: https://dash.cloudflare.com

---

## 📞 常见问题

### Q: NFC 标签在哪里买？
A: 淘宝搜索「NFC 标签 NTAG213」，约 1-2 元/个，建议买 30mm 圆形或方形的。

### Q: 如何获取 NFC 标签 UID？
A: 用手机 NFC 功能或「NFC Tools」App 读取，格式如 `04:5A:2B:3C:4D:5E`。

### Q: GPS 定位不准怎么办？
A: 
1. 到室外开阔地重新定位
2. 增大偏差阈值（如 150 米）
3. 在管理后台调整该巡检点的阈值

### Q: 照片上传失败？
A:
1. 检查飞书应用权限（drive:file:write）
2. 确认照片大小 < 5MB
3. 弱网环境可关闭拍照功能

### Q: 如何查看打卡统计？
A: 访问管理后台 `https://xxxx.pages.dev/admin.html`，有统计图表和导出功能。

---

## 🎉 部署完成！

现在你可以：
1. 在飞书内打开应用开始打卡
2. 在管理后台配置巡检点
3. 查看打卡记录和统计
4. 导出 Excel 报表

**祝你使用愉快！** 🦞
