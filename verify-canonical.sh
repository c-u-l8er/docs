#!/usr/bin/env bash
# Verify that every non-canonical docs host 301s to the canonical one, and that the
# canonical host does not redirect at all.
#
# The second assertion is the one worth having. A misconfigured list that includes
# the canonical host produces a redirect loop, which takes the atlas down on all
# thirteen hostnames simultaneously — and checking any single non-canonical host
# would still look like a pass.
#
#     bash verify-canonical.sh        # from this repo
#     bash docs/verify-canonical.sh   # from the ProjectAmp2 working tree
#
# Exits non-zero if any host is wrong. See REDIRECTS.md.

CANONICAL="docs.ampersandboxdesign.com"
HOSTS=(
    docs.agentelic.com docs.agentromatic.com docs.bendscript.com
    docs.delegatic.com docs.deliberatic.com docs.fleetprompt.com
    docs.geofleetic.com docs.graphonomous.com docs.opensentience.org
    docs.specprompt.com docs.ticktickclock.com docs.webhost.systems
)
# A real document, so the check covers path preservation and not just the apex.
PROBE="/AmpersandBoxDesign/docs/registry/"

fail=0

printf '%-32s %-6s %s\n' HOST CODE LOCATION
printf '%-32s %-6s %s\n' "------------------------------" "----" "--------"

for h in "${HOSTS[@]}"; do
    read -r code loc < <(curl -sI -m 20 "https://$h$PROBE" \
        -o /dev/null -w '%{http_code} %{redirect_url}')
    want="https://$CANONICAL$PROBE"
    if [ "$code" = "301" ] && [ "$loc" = "$want" ]; then
        printf '%-32s %-6s %s\n' "$h" "$code" "ok"
    else
        printf '%-32s %-6s %s\n' "$h" "$code" "EXPECTED 301 -> $want, got '${loc:-none}'"
        fail=1
    fi
done

# The canonical host must serve, not redirect.
read -r code loc < <(curl -sI -m 20 "https://$CANONICAL$PROBE" \
    -o /dev/null -w '%{http_code} %{redirect_url}')
if [ "$code" = "200" ]; then
    printf '\n%-32s %-6s %s\n' "$CANONICAL" "$code" "serves (correct — must not redirect)"
else
    printf '\n%-32s %-6s %s\n' "$CANONICAL" "$code" "BROKEN — canonical host is redirecting to '${loc:-none}'"
    echo "  A loop here means the canonical host was included in the redirect list." >&2
    fail=1
fi

if [ "$fail" = 0 ]; then
    echo
    echo "A1b closed: 12 hosts redirect, canonical serves."
else
    echo
    echo "A1b NOT closed." >&2
fi
exit "$fail"
