#!/bin/sh
# Copy the static site to nginx's root for /minis/ (tailnet-only).
set -e
cd "$(dirname "$0")"
sudo mkdir -p /var/www/minis
sudo rsync -a --delete web/ /var/www/minis/
echo deployed to /var/www/minis
