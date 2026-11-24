#!/bin/sh
# Use the free Hugging Face GPU quota to illustrate the next few people, then
# redeploy. Run by hand (roughly once a day; the free quota resets daily).
set -e
cd "$(dirname "$0")/.."
/home/arsh/.local/bin/uv run -q --with gradio_client --with pillow --with numpy python gen/generate.py
./deploy.sh
