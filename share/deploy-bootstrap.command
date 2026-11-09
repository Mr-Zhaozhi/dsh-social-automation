#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$PWD"
[ "$(uname -s)" = Darwin ] || { echo '本部署包用于 macOS 13 或以上。'; exit 1; }
arch=x64
if [ "$(uname -m)" = arm64 ] || [ "$(sysctl -in sysctl.proc_translated 2>/dev/null || true)" = 1 ]; then arch=arm64; fi
if [ "$arch" = arm64 ]; then expected='@DSH_ARM64_SHA512@'; else expected='@DSH_X64_SHA512@'; fi
archive="$ROOT/components/dsh-desktop-mac-$arch.zip"
echo '检查 DSH Desktop 安装文件…'
actual=$(/usr/bin/shasum -a 512 "$archive");actual=${actual%% *}
[ "$actual" = "$expected" ] || { echo '安装包校验失败，请重新取得完整文件。'; exit 1; }
app='/Applications/DSH Desktop.app'
if [ ! -d "$app" ]; then
  temp=$(/usr/bin/mktemp -d -t dsh-deploy)
  trap 'rm -rf "$temp"' EXIT
  /usr/bin/ditto -x -k "$archive" "$temp"
  /usr/bin/codesign --verify --deep --strict "$temp/DSH Desktop.app"
  if ! /usr/bin/ditto "$temp/DSH Desktop.app" "$app"; then
    /usr/bin/osascript - "$temp/DSH Desktop.app" "$app" <<'APPLESCRIPT'
on run argv
  do shell script "/usr/bin/ditto " & quoted form of item 1 of argv & " " & quoted form of item 2 of argv with administrator privileges
end run
APPLESCRIPT
  fi
fi
python="$app/Contents/Resources/office-runtime/primary-runtime/dependencies/python/bin/python3"
[ -x "$python" ] || { echo 'DSH 未完整安装，缺少自带 Python。'; exit 1; }
"$python" "$ROOT/workspace/share/deploy_install.py" --bundle "$ROOT" "$@"
read -r -p '按回车关闭'
