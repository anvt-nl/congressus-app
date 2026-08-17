#!/usr/bin/env bash
# Genereert het productie-manifest (namespace, opslag, congressus-app en
# oauth2-proxy) door de losse manifests in k8s-manifests/ samen te voegen en
# naar stdout te schrijven. Er wordt bewust GEEN bestand in de repo
# bijgehouden: de losse manifests zijn de enige bron van waarheid en dit
# script voorkomt dat je ze los na elkaar moet `kubectl apply`-en.
#
# Gebruik:
#   ./scripts/generate-prod-manifest.sh > /tmp/all-one.yml
#   ./scripts/generate-prod-manifest.sh | kubectl -n anvt apply -f -
set -euo pipefail

cd "$(dirname "$0")/.."

MANIFESTS_DIR="k8s-manifests"

# Volgorde is voor de leesbaarheid (namespace/opslag/app/proxy), niet
# functioneel: `kubectl apply -f` verwerkt alle resources in het bestand.
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

echo "# Gegenereerd door scripts/generate-prod-manifest.sh -- niet bewerken."
echo "# Alleen voor PRODUCTIE (namespace anvt), inclusief oauth2-proxy."
echo "# Test (anvt-dev) gebruikt k8s-manifests/dev/ en heeft GEEN oauth2-proxy"
echo "# (admin.html wordt daar met basic auth beveiligd)."
echo "#"
echo "# Let op: het oauth2-proxy secret (client-id/client-secret/cookie-secret)"
echo "# staat niet in de repo, zie k8s-manifests/oauth2-proxy-secret.yaml."
for f in "${FILES[@]}"; do
  echo "---"
  cat "$MANIFESTS_DIR/$f"
done
