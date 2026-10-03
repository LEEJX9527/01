# Calorie Studio v{{VERSION}}

本地优先的食物热量计算工具。用聊天的方式描述或拍照记录饮食，自动估算热量和蛋白质、脂肪、碳水。

> ⚠️ 安装包**未做平台签名/公证**（个人开源项目的免签名分发路线），首次打开时系统的安全提示属正常现象，按下面对应平台的说明放行即可。

## 下载

| 文件 | 适用平台 |
|---|---|
| `Calorie-Studio_{{VERSION}}_aarch64.dmg` | macOS（Apple Silicon） |
| `Calorie-Studio_{{VERSION}}_x64-setup.exe` | Windows（64 位） |

## macOS

推荐一行命令安装——终端 curl 下载不触发 Gatekeeper，全程零警告：

```bash
curl -fsSL https://raw.githubusercontent.com/LEEJX9527/01/main/scripts/install-desktop.sh | sh
```

浏览器直接下载 DMG 的用户，首次打开需放行一次：

- **系统设置** → **隐私与安全性** → 下拉到「安全性」一节 → 点「**仍要打开**」；
- 或终端执行 `xattr -cr /Applications/Calorie\ Studio.app` 后正常打开。

## Windows

首次运行安装包时可能出现蓝色「Windows 已保护你的电脑」提示：点「**更多信息**」→「**仍要运行**」即可。

## 更多

- 下载页（含图文安装指引）：https://leejx9527.github.io/01/download.html
- 网页版（无需安装，数据存浏览器本地）：https://leejx9527.github.io/01/
- 问题反馈：https://github.com/LEEJX9527/01/issues
