#!/usr/bin/env bash
set -euo pipefail

# install backend dependencies
if [ -d "backend" ]; then
  (cd backend && npm install)
  if [ -f "backend/.env.conduit-user.example" ]; then
    cp -n backend/.env.conduit-user.example backend/.env.conduit-user || true
  fi
fi

# install dashboard dependencies
if [ -d "dashboard" ]; then
  (cd dashboard && npm install)
fi

# install example dependencies
if [ -d "examples/use-cases/contact-validation-flow" ]; then
  (cd examples/use-cases/contact-validation-flow && npm ci)
fi

