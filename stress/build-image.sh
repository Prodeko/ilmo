#!/usr/bin/env bash
# Builds the production image of a source tree for the stress stack.
#
# sharp 0.30 downloads its native binaries from GitHub during `pnpm install`
# and gives up on slow links, so they are fetched once into stress/.cache
# and handed to the build as local prebuilds. The app's Dockerfile is used
# as-is apart from that injection.
#
# Usage: stress/build-image.sh <source-dir> <tag>
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
src=$(cd "$1" && pwd)
tag=$2

cache="$here/.cache/sharp"
libvips="$cache/v8.12.2/libvips-8.12.2-linux-x64.tar.br"
binary="$cache/sharp-v0.30.7-napi-v5-linux-x64.tar.gz"
mkdir -p "$(dirname "$libvips")"
[[ -s $libvips ]] || curl -fsSL --retry 3 -o "$libvips" \
  https://github.com/lovell/sharp-libvips/releases/download/v8.12.2/libvips-8.12.2-linux-x64.tar.br
[[ -s $binary ]] || curl -fsSL --retry 3 -o "$binary" \
  https://github.com/lovell/sharp/releases/download/v0.30.7/sharp-v0.30.7-napi-v5-linux-x64.tar.gz

dockerfile="$here/.cache/Dockerfile.$$"
sed '/^WORKDIR \/app$/a\
COPY --from=sharp . /sharp-prebuilds/\
ENV npm_config_sharp_libvips_local_prebuilds=/sharp-prebuilds\
ENV npm_config_sharp_local_prebuilds=/sharp-prebuilds' "$src/Dockerfile" > "$dockerfile"
trap 'rm -f "$dockerfile"' EXIT

docker build \
  --build-context sharp="$cache" \
  --build-arg ROOT_URL=http://localhost:5678 \
  -f "$dockerfile" -t "$tag" "$src"
