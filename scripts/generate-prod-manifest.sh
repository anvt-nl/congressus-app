#!/usr/bin/env bash
# Genereert k8s-manifests/all-one.yml door de losse productie-manifests samen
# te voegen. De losse bestanden zijn de enige bron van waarheid; all-one.yml
# is puur een gegenereerd gemak-bestand om productie in één keer te kunnen
# `kubectl apply`-en op de server (die geen git-checkout heeft).
#
# Gebruik:
#   ./scripts/generate-prod-manifest.sh          # herschrijft k8s-manifests/all-one.yml
#   ./scripts/generate-prod-manifest.sh --check  # faalt als all-one.yml niet up-to-date is (voor CI)
set -euo pipefail

cd "$(dirname "$0")/.."

MANIFESTS_DIR="k8s-manifests"
OUTPUT="$MANIFESTS_DIR/all-one.yml"

# Volgorde is belangrijk voor leesbaarheid (namespace/opslag/app/proxy) maar
# niet functioneel: `kubectl apply -f` verwerkt alle resources in het bestand.
# oauth2-proxy-secret.yaml wordt bewust NIET meegenomen: dat bestand bevat
# geen manifest maar slechts een verwijzing (zie het bestand zelf) en het
# echte secret met gevoelige waarden staat niet in de repo.
FILES=(
  "namespace.yaml"
  "persistent-volume.yaml"
  "persistent-volume-claim.yaml"
  "deployment.yaml"
  "service.yaml"
  "oauth2-proxy-deployment.yaml"
  "oauth2-proxy-service.yaml"
)

generate() {
  {
    echo "# Dit bestand is GEGENEREERD door scripts/generate-prod-manifest.sh"
    echo "# op basis van de losse manifests in k8s-manifests/. Niet handmatig"
    echo "# bewerken -- pas de losse bestanden aan en draai het script opnieuw."
    echo "#"
    echo "# Alleen voor PRODUCTIE (namespace anvt), inclusief oauth2-proxy."
    echo "# Test (anvt-dev) gebruikt k8s-manifests/dev/ en heeft GEEN oauth2-proxy"
    echo "# (admin.html wordt daar met basic auth beveiligd)."
    echo "#"
    echo "# Toepassen: kubectl -n anvt apply -f k8s-manifests/all-one.yml"
    echo "# Let op: het oauth2-proxy secret (client-id/client-secret/cookie-secret)"
    echo "# staat niet in de repo, zie k8s-manifests/oauth2-proxy-secret.yaml."
    for f in "${FILES[@]}"; do
      echo "---"
      cat "$MANIFESTS_DIR/$f"
    done
  }
}

if [[ "${1:-}" == "--check" ]]; then
  tmpfile="$(mktemp)"
  trap 'rm -f "$tmpfile"' EXIT
  generate > "$tmpfile"
  if ! diff -u "$OUTPUT" "$tmpfile"; then
    echo "==> $OUTPUT is niet up-to-date. Draai ./scripts/generate-prod-manifest.sh en commit het resultaat." >&2
    exit 1
  fi
  echo "==> $OUTPUT is up-to-date."
else
  generate > "$OUTPUT"
  echo "==> $OUTPUT gegenereerd."
fi
