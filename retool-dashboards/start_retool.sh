#!/bin/sh

cd docker

# Check if Docker is installed
if command -v docker &>/dev/null; then
    echo "Docker found, running docker-compose..."
    docker compose up -d
# Check if Podman is installed
elif command -v podman &>/dev/null; then
    echo "Podman found, running podman-compose..."
    podman compose up -d
else
    echo "Error: Neither Docker nor Podman is installed. Please install one of them to proceed."
    exit 1
fi
