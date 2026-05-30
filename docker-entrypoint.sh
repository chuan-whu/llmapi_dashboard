#!/bin/sh
set -eu

exec su-exec app "$@"
