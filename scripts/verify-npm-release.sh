#!/usr/bin/env bash
set -euo pipefail

package_name="${1:?Package name is required}"
package_version="${2:?Package version is required}"
verification_dir="$(mktemp -d)"
trap 'rm -rf "$verification_dir"' EXIT

# npm can accept a publish before its metadata and tarball are available.
# Bound both the number of attempts and each individual registry request.
for attempt in {1..20}; do
  attempt_dir="$verification_dir/$attempt"
  mkdir -p "$attempt_dir"
  npm_options=(
    --registry=https://registry.npmjs.org/
    --cache="$attempt_dir/cache"
    --prefer-online
    --fetch-retries=0
    --fetch-timeout=15000
  )

  echo "Verifying $package_name@$package_version (attempt $attempt/20)"
  if published_version="$(npm view "$package_name@$package_version" version \
      "${npm_options[@]}" 2> "$attempt_dir/metadata.log")" &&
      [[ "$published_version" == "$package_version" ]]; then
    # Download the published artifact and let npm validate its integrity.
    # Disable lifecycle scripts and require the package's runtime entry point.
    if npm pack "$package_name@$package_version" --ignore-scripts \
        --pack-destination="$attempt_dir" "${npm_options[@]}" \
        > "$attempt_dir/pack.log" 2>&1; then
      archives=("$attempt_dir"/*.tgz)
      if [[ ${#archives[@]} -eq 1 && -f "${archives[0]}" ]] &&
          tar -tzf "${archives[0]}" > "$attempt_dir/files.log" &&
          grep -Fxq 'package/dist/index.js' "$attempt_dir/files.log"; then
        echo "Verified $package_name@$package_version: registry metadata and package download are available"
        exit 0
      fi
      echo "Published tarball is missing the expected runtime entry point"
    fi
  fi

  # Keep the final diagnostics available without retaining cached 404s.
  echo "Expected version: $package_version; observed: ${published_version:-unavailable}"
  cat "$attempt_dir/metadata.log"
  if [[ -f "$attempt_dir/pack.log" ]]; then
    cat "$attempt_dir/pack.log"
  fi
  if [[ "$attempt" -lt 20 ]]; then
    sleep 15
  fi
done

echo "::error::$package_name@$package_version is not verifiably available after 20 attempts; inspect the registry and artifact errors above before retrying publication"
exit 1
