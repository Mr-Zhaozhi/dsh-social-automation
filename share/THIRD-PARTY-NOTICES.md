# 第三方组件与来源

本包使用原始公开安装文件，不包含第三方应用的用户目录、账号或登录状态。各组件仍由原作者提供，使用其原有许可与服务条款。版本、下载 URL、SHA-256/SHA-512 在 `components/components.json`。

| 组件 | 来源 / 许可说明 |
| --- | --- |
| DSH Desktop 0.13.2 | https://github.com/dataelement/dsh-desktop （MIT）；二进制含其第三方依赖许可 |
| QQ | https://im.qq.com/index/#/macos ，腾讯官方原始安装文件，使用其用户协议 |
| Microsoft Edge | https://www.microsoft.com/edge ，微软官方原始安装文件，使用其许可条款 |
| NapCat 4.18.42 | https://github.com/NapNeko/NapCatQQ/releases/tag/v4.18.42 ，归档保留上游文件及声明 |
| ffmpeg 6.1.1 构建 | https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.1.1 ，构建来源和授权见随附 LICENSE/README；FFmpeg 源码 https://ffmpeg.org/releases/ffmpeg-6.1.1.tar.xz ，构建脚本 https://github.com/eugeneware/ffmpeg-static |
| dsh-onebot-qq 0.9.17 | https://github.com/mario841859784/dsh-onebot （BSD-3-Clause） |
| dsh-douyin-browser-local 1.4.6 | https://github.com/LockyBee/dsh-douyin-agent （MIT） |
| dsh-browser-cdp 1.7.5 | https://github.com/drscrewdriver/dsh-browser-cdp （MIT） |
| dsh-any-audio 0.1.1 | https://github.com/cloudoyx/any-audio （MIT） |

公开插件源码以原始 npm tgz 随附；安装时会应用工作区 `lib/compat.py` 中可审查的兼容修正。卡通示例素材来自本工作区已授权分享的虚构角色素材，不代表任何真实用户。源码目录中的 `huohuo-*` 是兼容标识。
# Local speech recognition

SenseVoiceSmall is by Alibaba Group / FunAudioLLM (https://github.com/QwenAudio/SenseVoice). This package includes the unchanged sherpa-onnx INT8 ONNX conversion dated 2024-07-17 from https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models. Model terms are retained in licenses/SenseVoice-MODEL_LICENSE.txt.

sherpa-onnx by the next-gen Kaldi project (https://github.com/k2-fsa/sherpa-onnx) is Apache-2.0; see licenses/sherpa-onnx-LICENSE.txt. Installation downloads pinned sherpa-onnx 2.0.1 and NumPy 2.2.6 packages for the recipient's CPU architecture.
