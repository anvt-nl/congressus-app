#!/usr/bin/env bash
#
# Draai lokaal (een subset van) dezelfde checks die de "PR Checks" GitHub
# Actions workflow (.github/workflows/pr_checks.yml) uitvoert, zodat je
# problemen kunt vinden voordat je een PR opent.
#
# Vereist: Docker.
#
# Gebruik:
#   ./scripts/run-ci-checks.sh            # alle checks
#   ./scripts/run-ci-checks.sh lint       # alleen Hadolint + Super-linter
#   ./scripts/run-ci-checks.sh build      # alleen Docker build + Dockle + integratietest
#
# Let op: de ClamAV-scan en de "pr_summary" job worden hier niet uitgevoerd
# (ClamAV heeft een systeemdaemon/database-update nodig die niet zinvol is om
# lokaal en herhaaldelijk te draaien; pr_summary post alleen een PR-comment).

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
REPO_ROOT="$(pwd)"

run_hadolint() {
  echo "==> Hadolint (Dockerfile)"
  docker run --rm -i -v "${REPO_ROOT}:/work" -w /work \
    hadolint/hadolint hadolint Dockerfile
}

run_superlinter() {
  echo "==> Super-linter (zelfde VALIDATE_-configuratie als CI)"
  docker run --rm \
    -e RUN_LOCAL=true \
    -e DEFAULT_BRANCH=main \
    -e VALIDATE_ALL_CODEBASE=true \
    -e VALIDATE_YAML=true \
    -e VALIDATE_YAML_PRETTIER=true \
    -e VALIDATE_MARKDOWN=true \
    -e VALIDATE_MARKDOWN_PRETTIER=true \
    -e VALIDATE_JAVASCRIPT_ES=true \
    -e VALIDATE_HTML=true \
    -e VALIDATE_HTML_PRETTIER=true \
    -e VALIDATE_CSS=true \
    -e VALIDATE_PYTHON_FLAKE8=true \
    -e VALIDATE_BASH=true \
    -e VALIDATE_GITIGNORE=true \
    -e "FILTER_REGEX_EXCLUDE=(^|/)source/html/app\\.css\$|(^|/)source/html/vendor/.*" \
    -v "${REPO_ROOT}:/tmp/lint" \
    -w /tmp/lint \
    ghcr.io/super-linter/super-linter:slim-v8.3.0
}

run_docker_build() {
  echo "==> Docker build (test-image:local)"
  docker build -t test-image:local -f Dockerfile .
}

run_dockle() {
  echo "==> Dockle (container compliance)"
  docker run --rm \
    -v /var/run/docker.sock:/var/run/docker.sock \
    goodwithtech/dockle:latest \
    --exit-code 1 \
    --exit-level WARN \
    -i CIS-DI-0001 \
    -i DKL-LI-0003 \
    -i DKL-DI-0005 \
    test-image:local
}

run_integration_test() {
  echo "==> Integratietest (container start check)"
  docker rm -f test-container >/dev/null 2>&1 || true
  docker run -d --name test-container test-image:local bash -c "sleep 60"
  sleep 2
  if ! docker ps | grep -q test-container; then
    echo "Container exited unexpectedly!"
    docker logs test-container
    docker rm -f test-container >/dev/null 2>&1 || true
    exit 1
  fi
  docker exec test-container bash --version
  docker rm -f test-container >/dev/null 2>&1 || true
}

MODE="${1:-all}"

case "$MODE" in
  lint)
    run_hadolint
    run_superlinter
    ;;
  build)
    run_docker_build
    run_dockle
    run_integration_test
    ;;
  all)
    run_hadolint
    run_superlinter
    run_docker_build
    run_dockle
    run_integration_test
    ;;
  *)
    echo "Onbekende optie: $MODE (verwacht: lint | build | all)" >&2
    exit 1
    ;;
esac

echo "==> Klaar. Alle gevraagde checks zijn geslaagd."
