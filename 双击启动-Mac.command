#!/bin/zsh
cd -- "${0:A:h}" || exit 1
python_bin="$(command -v python3)"
if [[ -z "$python_bin" ]]; then
  python_bin="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"
fi
if [[ ! -x "$python_bin" ]]; then
  print '未找到 Python 3。请先安装 Python 3，再重新打开本文件。'
  read '?按回车关闭…'
  exit 1
fi
"$python_bin" run-demo.py
launch_status=$?
if [[ $launch_status -ne 0 ]]; then
  print '启动未完成，请查看上方提示。'
  read '?按回车关闭…'
fi
exit $launch_status
