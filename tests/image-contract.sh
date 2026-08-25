#!/usr/bin/env bash
# Image contract: what the delivered image promises about itself.
#
# It is a one-shot job image, not a service and not a base image: it runs as
# an unprivileged user, it brings the browser and the pdf toolchain it needs,
# and it starts the scanner without any command being given.
#
# Usage: bash tests/image-contract.sh [image]

set -uo pipefail
cd "$(dirname "$0")/.."

IMAGE="${1:-mwaeckerlin/webdesign-scanner}"
PASS=0
FAIL=0
declare -a FAILED_NAMES

_pass() { PASS=$((PASS + 1)); echo "  PASS  $1"; }
_fail() { FAIL=$((FAIL + 1)); FAILED_NAMES+=("$1"); echo "  FAIL  $1: $2"; }

_check() {
    local name="$1" expected="$2" actual="$3"
    if [[ "${actual}" == "${expected}" ]]; then _pass "${name}"
    else _fail "${name}" "expected '${expected}', got '${actual}'"; fi
}

echo "==> Image contract of ${IMAGE}"

if ! docker image inspect "${IMAGE}" >/dev/null 2>&1; then
    echo "  FAIL  image_exists: ${IMAGE} was not built"
    exit 1
fi
_pass "image_exists"

# never root: the container writes files into a mounted volume
USER_ID="$(docker run --rm --entrypoint /usr/bin/id "${IMAGE}" -u)"
if [[ "${USER_ID}" == "0" ]]; then _fail "runs_unprivileged" "the image runs as root"
else _pass "runs_unprivileged"; fi

# the entry point starts the scanner, no command needed
ENTRY="$(docker image inspect --format '{{join .Config.Entrypoint " "}}' "${IMAGE}")"
_check "entrypoint_is_the_scanner" "/usr/bin/node /app/dist/main.js" "${ENTRY}"

# a missing target url is a configuration error, and it says so
OUTPUT="$(docker run --rm "${IMAGE}" 2>&1)"
CODE=$?
_check "no_url_is_a_configuration_error" "2" "${CODE}"
if [[ "${OUTPUT}" == *"no target url"* ]]; then _pass "no_url_is_explained"
else _fail "no_url_is_explained" "unexpected output: ${OUTPUT}"; fi

# everything the run needs has to be inside the image
for tool in /usr/bin/node /usr/bin/pdftoppm /usr/bin/pdfinfo; do
    if docker run --rm --entrypoint /usr/bin/test "${IMAGE}" -x "${tool}"; then
        _pass "ships_${tool##*/}"
    else
        _fail "ships_${tool##*/}" "${tool} is missing"
    fi
done

# the browser is installed once, for everyone, not per home directory
if docker run --rm --entrypoint /usr/bin/test "${IMAGE}" -d /opt/ms-playwright; then
    _pass "ships_the_browser"
else
    _fail "ships_the_browser" "/opt/ms-playwright is missing"
fi

# the compiler and the test runner have no business in a delivered image
for module in typescript vitest; do
    if docker run --rm --entrypoint /usr/bin/test "${IMAGE}" -d "/app/node_modules/${module}"; then
        _fail "no_build_tools_${module}" "/app/node_modules/${module} was delivered"
    else
        _pass "no_build_tools_${module}"
    fi
done

# the output directory exists and belongs to the runtime user
if docker run --rm --entrypoint /usr/bin/test "${IMAGE}" -w /out; then
    _pass "output_directory_is_writable"
else
    _fail "output_directory_is_writable" "/out is not writable for the runtime user"
fi

echo ""
echo "==> Image contract results: ${PASS} passed, ${FAIL} failed"
if [[ ${FAIL} -gt 0 ]]; then
    echo "==> Failed contracts: ${FAILED_NAMES[*]}"
    exit 1
fi
