---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 5a51df6f04161745a0f2f2e3ab237503_7a9c6752e74311f18e5a525400de85a5
    ReservedCode1: uvtADu8r/BCTXQ2Nfyxl3EqrzbdM5+qbcVgduFJoEQcpyth5p/b4wMi727NMI09ljxyD8doW+Cihfwjq8WuyzKm+TfhZscicBrJe7qX/+ktagucp97yPJzuJ/JZtqAL5CimMi49Cn/FR2elUrWM8OOsHmVOkRAWOYFv/czuRHnjUZP2PL8eHto0LpGA=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 5a51df6f04161745a0f2f2e3ab237503_7a9c6752e74311f18e5a525400de85a5
    ReservedCode2: uvtADu8r/BCTXQ2Nfyxl3EqrzbdM5+qbcVgduFJoEQcpyth5p/b4wMi727NMI09ljxyD8doW+Cihfwjq8WuyzKm+TfhZscicBrJe7qX/+ktagucp97yPJzuJ/JZtqAL5CimMi49Cn/FR2elUrWM8OOsHmVOkRAWOYFv/czuRHnjUZP2PL8eHto0LpGA=
---

# 数理无限画布 · 网页版（2.2.9）

由官方桌面安装包 `数理无限画布 Setup 2.2.9.exe` 解包重建的**纯静态网页版**，无需安装、双击即用，
Windows / Mac / iPad / 安卓平板 / 教室一体机，只要能开浏览器就能跑。

---

## 一、快速开始

### 方式 1：本机双击（推荐，Windows）

双击 **`启动网页版.bat`** —— 自动起本地服务并打开浏览器（需要电脑已安装 Python 3）。

### 方式 2：命令行

```bash
python serve.py            # 默认 8776 起，自动选空闲端口
PORT=9000 python serve.py  # 指定起始端口（Windows 用 set PORT=9000 再运行）
```

### 方式 3：放到服务器 / 学校内网 / GitHub Pages

整个文件夹是一个**纯静态站点**，直接上传即可，无需任何后端：

- **nginx**：`root` 指向本目录即可（建议给 `.wasm` 加 `application/wasm`）。
- **GitHub Pages**：整个目录推到仓库 → Settings → Pages → 选分支根目录。
  （已内置 `.nojekyll`，目录可正常发布。）
- 首次首次访问会缓存到浏览器的离线存储，之后断网也能用。

> ⚠️ **不要直接双击 `index.html`**。本项目用 `fetch` 读取页面配置、注册 Service Worker，
> 走 `file://` 会被浏览器安全策略拦截，表现为空白或功能残缺。必须通过 `http://` 访问。

---

## 二、功能对照（实测）

| 功能 | 网页版 | 说明 |
|---|---|---|
| 粉笔笔迹 / 荧光笔 / 橡皮 / 图形 / 激光笔 | ✅ 正常 | 压感式笔迹、墨迹层完整 |
| 尺规工具（直尺、圆规、量角器） | ✅ 正常 | |
| 物理仿真（24 个交互模型） | ✅ 正常 | 匀变速、抛体、碰撞、圆周、电场、电路、光学…均可在画布内交互 |
| 数学仿真（12 类） | ✅ 正常 | 函数图像、三角函数、圆锥曲线、立体几何、向量、概率统计… |
| GeoGebra（7 种计算器） | ✅ 正常 | 内置离线包，画布内 iframe 运行，代数区/工具区齐全 |
| 文本 / 公式（KaTeX） | ✅ 正常 | |
| 图片 / GIF 插入 | ✅ 正常 | 点击后在系统文件框选图 |
| 保存板书 | ✅ 正常 | `Ctrl+S` → 下载 `课堂板书-日期.gewu` |
| 打开板书 | ✅ 正常 | `Ctrl+O` → 选 `.gewu` 文件（实测笔迹与对象完整还原） |
| PDF 导入 | ✅ 按页转图 | 由 pdf.js 渲染，逐页贴入画布 |
| 多页 / 页面索引 / 便签 / 评论灯 / 资源库 | ✅ 正常 | |
| PPT / Word 导入 | ⚠️ 不支持 | 需 LibreOffice 转换，网页版会明确提示「请先转成 PDF 或图片再插入」 |
| Flash（SWF） | ✅ 正常 | 内置 Ruffle 离线运行，无需装 Flash |
| AI 助手 | ✅ 可用 | 需自备 API Key（在设置里填） |
| 局域网投屏 / 手机遥控（课堂） | ❌ 不可用 | 依赖桌面端网络服务 |
| 桌面批注浮层 / 全屏截屏 / 录屏 | ❌ 不可用 | 依赖系统级权限 |
| 打印导出 PDF | ❌ 不可用 | 可用浏览器「打印 → 另存为 PDF」代替 |
| 自动更新 | ❌ 不适用 | 网页版随站点内容更新 |

**其它差异**：桌面版可直接读写硬盘上的 `.gewu`，网页版改为「下载 / 打开文件」，
所以浏览器每次只持有一份当前板书，**务必及时 `Ctrl+S` 下载保存**。

---

## 三、iPad / 平板使用

1. 把整个文件夹部署到任意 http 站点（校内服务器、GitHub Pages、对象存储均可）。
2. iPad Safari 打开该网址 → 分享 → **添加到主屏幕**，即变成全屏 App 图标。
3. Apple Pencil 直接写；建议在「设置 → 显示与亮度」里关闭「台前调度」以外的缩放干扰。

---

## 四、目录说明

```
index.html          主页面（已内置 mobile-shim.js 桥接）
mobile-shim.js      网页版桥接层：把原本依赖 Electron 的 56 个能力改写成浏览器实现
sw.js              Service Worker：离线缓存 + 版本校验
version.json       版本握手文件（版本不一致会自动清缓存重载）
core/              画布引擎、对象系统、导入导出
sims/              数学 / 物理仿真的 JS 模型
simhtml/           仿真播放页（simhtml/sims/ 下为 24 个物理实验）
ggb/               GeoGebra 离线包（HTML5 web3d）
vendor/            KaTeX、pdf.js、Ruffle(Flash)、字体等
serve.py           零依赖本地静态服务器
启动网页版.bat      Windows 一键启动
```

---

## 五、常见问题

**白屏 / 一直转圈？**
先刷新一次（`Ctrl+F5`）。本项目首屏会并发拉取上百个资源，若用自己搭的服务器，
请把监听队列（backlog）调大；`serve.py` 已设 `request_queue_size = 512`。
用 nginx 时确认 `worker_connections` 足够，且未开启过激的限流。

**改了文件但页面还是旧的？**
Service Worker 会缓存。`version.json` 里的 `build` 改一个值即可触发自动更新；
或浏览器里 `F12 → Application → Service Workers → Unregister` 手动清一次。

**GeoGebra 打开慢？**
离线包约 48 MB，首次加载需要几秒（之后走缓存秒开）。建议部署在带宽较好的位置。

**学生端要不要装东西？**
不用。给个网址就行，平板、手机、教室电脑都能打开同一份板书。

---

原版桌面程序版权归原作者（唐波，MIT 许可）所有，本项目仅做运行环境转换，未修改教学逻辑与内容。
*（内容由AI生成，仅供参考）*
