#!/usr/bin/env bash
# Docs contract: the registers stay true, and no test is ever switched off.
#
# FEATURES.md numbers every feature (`- **F<n> — ...`), TESTS.md maps every
# test to the feature number it covers (`- **F<n>** ...`). This guard fails
# when:
#   1. a feature number is defined more than once,
#   2. a feature has no test entry (an untested feature),
#   3. TESTS.md refers to a feature number that does not exist,
#   4. a test exists in the sources but is missing from TESTS.md,
#   5. a test file listed in TESTS.md does not exist,
#   6. a test carries a marker that would switch it off,
#   7. the README does not link the two registers.
#
# Usage: bash tests/docs-contract.sh

set -uo pipefail
cd "$(dirname "$0")/.."

PASS=0
FAIL=0
declare -a FAILED_NAMES

_pass() { PASS=$((PASS + 1)); echo "  PASS  $1"; }
_fail() { FAIL=$((FAIL + 1)); FAILED_NAMES+=("$1"); echo "  FAIL  $1: $2"; }

echo "==> Docs contract: feature and test registers"

for f in FEATURES.md TESTS.md README.md CHANGELOG.md CONTRIBUTING.md; do
    if [[ -f "$f" ]]; then _pass "${f}_exists"; else _fail "${f}_exists" "file missing"; fi
done

if [[ -f FEATURES.md && -f TESTS.md ]]; then
    DEFINED=$(grep -oE '^- \*\*F[0-9]+' FEATURES.md | grep -oE 'F[0-9]+')
    # an entry may cover several features: `- **F3, F7** ...`
    REFERENCED=$(grep -oE '^- \*\*[F0-9, ]+\*\*' TESTS.md | grep -oE 'F[0-9]+' | sort -u)

    DUPES=$(echo "${DEFINED}" | sort | uniq -d | tr '\n' ' ')
    if [[ -n "${DUPES// /}" ]]; then
        _fail "unique_feature_numbers" "defined more than once: ${DUPES}"
    else
        _pass "unique_feature_numbers"
    fi

    UNTESTED=""
    for n in ${DEFINED}; do
        echo "${REFERENCED}" | grep -qx "${n}" || UNTESTED="${UNTESTED} ${n}"
    done
    if [[ -n "${UNTESTED}" ]]; then
        _fail "every_feature_tested" "no test entry for:${UNTESTED}"
    else
        _pass "every_feature_tested"
    fi

    UNDEFINED=""
    for n in ${REFERENCED}; do
        echo "${DEFINED}" | grep -qx "${n}" || UNDEFINED="${UNDEFINED} ${n}"
    done
    if [[ -n "${UNDEFINED}" ]]; then
        _fail "no_dangling_references" "TESTS.md refers to unknown:${UNDEFINED}"
    else
        _pass "no_dangling_references"
    fi

    # every test in the sources is listed, so the register cannot fall behind
    MISSING=""
    while IFS= read -r title; do
        grep -qF -- "${title}" TESTS.md || MISSING="${MISSING}
    ${title}"
    done < <(grep -rhoE "^[[:space:]]*it\('[^']+'" tests --include='*.test.ts' \
        | sed -E "s/^[[:space:]]*it\('//; s/'$//" | sort -u)
    if [[ -n "${MISSING}" ]]; then
        _fail "every_test_listed" "not in TESTS.md:${MISSING}"
    else
        _pass "every_test_listed"
    fi

    # every file the register names really exists
    UNKNOWN_FILES=""
    while IFS= read -r path; do
        [[ -e "${path}" ]] || UNKNOWN_FILES="${UNKNOWN_FILES} ${path}"
    done < <(grep -oE '`tests/[a-zA-Z0-9._/-]+`' TESTS.md | tr -d '`' | sort -u)
    if [[ -n "${UNKNOWN_FILES}" ]]; then
        _fail "no_unknown_test_files" "TESTS.md names files that do not exist:${UNKNOWN_FILES}"
    else
        _pass "no_unknown_test_files"
    fi
fi

SKIPS=$(grep -rnE '(it|test|describe|suite|bench)\s*\.\s*(skip|only|todo|fails|skipIf|runIf)|x(it|test|describe)\s*\(' \
    tests --include='*.test.ts' 2>/dev/null | grep -v 'no-skipped-tests.test.ts')
if [[ -n "${SKIPS}" ]]; then
    _fail "no_skipped_tests" "markers that switch tests off: ${SKIPS}"
else
    _pass "no_skipped_tests"
fi

if grep -q 'FEATURES.md' README.md && grep -q 'TESTS.md' README.md; then
    _pass "readme_links_the_registers"
else
    _fail "readme_links_the_registers" "README.md must link FEATURES.md and TESTS.md"
fi

echo ""
echo "==> Docs contract results: ${PASS} passed, ${FAIL} failed"
if [[ ${FAIL} -gt 0 ]]; then
    echo "==> Failed contracts: ${FAILED_NAMES[*]}"
    exit 1
fi
