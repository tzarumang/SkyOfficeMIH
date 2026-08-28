#!/bin/sh
# Writes /config.js from the environment so the built client can be pointed at a
# server without rebuilding the image. The nginx entrypoint runs everything in
# /docker-entrypoint.d before starting the server.
set -eu

: "${SERVER_URL:=}"
: "${PEER_HOST:=}"
: "${PEER_PORT:=}"
: "${PEER_PATH:=}"
: "${PEER_SECURE:=}"
: "${TURN_URL:=}"
: "${TURN_USERNAME:=}"
: "${TURN_CREDENTIAL:=}"

export SERVER_URL PEER_HOST PEER_PORT PEER_PATH PEER_SECURE
export TURN_URL TURN_USERNAME TURN_CREDENTIAL

envsubst < /etc/skyoffice/config.js.template > /usr/share/nginx/html/config.js

if [ -z "$SERVER_URL" ]; then
  echo "skyoffice: SERVER_URL is not set - the client will look for a server on its own hostname at port 2567" >&2
else
  echo "skyoffice: server url set to $SERVER_URL" >&2
fi

# Without a relay, anyone whose network will not hole-punch - most mobile data,
# and plenty of home ISPs - can be in the room and still never get a call
# through to anybody.
if [ -z "$TURN_URL" ]; then
  echo "skyoffice: TURN_URL is not set - calls will fail for people behind symmetric or carrier-grade NAT" >&2
elif [ -z "$TURN_USERNAME" ] || [ -z "$TURN_CREDENTIAL" ]; then
  echo "skyoffice: TURN_URL is set without TURN_USERNAME and TURN_CREDENTIAL, so no relay will be offered" >&2
else
  echo "skyoffice: turn relay set to $TURN_URL" >&2
fi
