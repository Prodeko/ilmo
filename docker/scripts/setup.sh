set -e

# Install most things we need
# shadow: usermod, groupadd etc.
# libtool, automake, python, g++: libsodium, bufferutil, sharp
apk update
apk add --no-cache \
   bash sudo shadow alpine-sdk bash libtool autoconf automake make python3 curl git g++

# './setup.sh dev' installs more handy development utilities...
if [ "$1" = "dev" ]; then
  apk add --no-cache neovim tmux
fi

# Install docker and docker-compose (for setup)
curl https://get.docker.com/builds/Linux/x86_64/docker-latest.tgz | tar xvz -C /tmp/ && mv /tmp/docker/docker /usr/bin/docker
curl -L "https://github.com/docker/compose/releases/download/1.29.2/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod 755 /usr/local/bin/docker-compose

# on windows there is no USER_UID
if [ "$USER_UID" != "" ]; then
  echo "\$USER_UID given: $USER_UID";
  # [Optional] Update a non-root user to match UID/GID - see https://aka.ms/vscode-remote/containers/non-root-user.
  if [ "$USER_UID" != "1000" ]; then
    usermod --uid "$USER_UID" node;
  fi
fi

# [Optional] Add add sudo support for non-root user
echo node ALL=\(root\) NOPASSWD:ALL > /etc/sudoers.d/node
chmod 0440 /etc/sudoers.d/node

# Self-destruct
rm /setup.sh
