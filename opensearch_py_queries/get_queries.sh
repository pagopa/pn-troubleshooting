#! /bin/bash -e

#!/usr/bin/env bash

set -Eeuo pipefail
trap cleanup SIGINT SIGTERM ERR EXIT

cleanup() {
  trap - SIGINT SIGTERM ERR EXIT
  # script cleanup here
}

pip install -r requirements.txt
python3 opensearch_query.py  build
./opensearch_query.py
