# TOTP Generator

一个无需后端的静态 TOTP 验证码生成器，可直接部署到 GitHub Pages。

## 部署到 GitHub Pages

1. 将仓库推送到 GitHub。
2. 打开仓库的 **Settings → Pages**。
3. 在 **Build and deployment** 中选择 **Deploy from a branch**。
4. 选择 `main` 分支和 `/ (root)` 目录，然后保存。
5. 等待部署完成后，访问 GitHub Pages 提供的地址。

项目包含 `.nojekyll`，因此 GitHub Pages 不会使用 Jekyll 处理静态文件。

## 使用方式

直接打开页面后输入 Base32 密钥，也可以使用 URL 参数：

```text
https://<用户名>.github.io/<仓库名>/?key=JBSWY3DPEHPK3PXP&digits=6&period=30&algorithm=SHA1
```

也支持使用 URL hash 传入密钥：

```text
https://<用户名>.github.io/<仓库名>/#JBSWY3DPEHPK3PXP
```

支持的算法为 `SHA1`、`SHA256` 和 `SHA512`。验证码位数支持 6–8 位，周期支持 1–86400 秒。

## 本地验证

无需安装 npm 依赖，使用 Node.js 18 或更新版本运行：

```sh
node --test tests/app.test.cjs
```

也可以在仓库根目录启动静态服务器（例如 `python -m http.server 8000`），然后访问 `http://localhost:8000/`。项目使用相对资源路径，兼容 GitHub Pages 的仓库子路径。首次需要下载页面内的本地资源，加载完成后生成验证码无需网络。请保证设备时间准确。

> 应用只在浏览器本地计算验证码，不会主动上传或保存密钥。但 `?key=...` 查询参数会随页面请求发送给静态托管服务器，并可能进入访问日志；建议手动输入密钥，或优先使用 `#密钥` 片段（片段不随 HTTP 请求发送，但仍可能保留在历史或书签中）。请仅在可信设备上使用，不要分享包含真实密钥的 URL。示例密钥是公开的，不能用于真实账号。
