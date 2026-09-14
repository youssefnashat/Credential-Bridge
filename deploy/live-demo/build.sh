#!/usr/bin/env bash
# Build the live-demo Lambda zip: handler.py + the static frontend from the repo root,
# with agent.js defaulting to this same origin and a disclosure banner on the page.
set -euo pipefail
cd "$(dirname "$0")"
ROOT=../..
rm -rf build live-demo.zip && mkdir -p build/static
cp handler.py build/
cp "$ROOT"/index.html "$ROOT"/styles.css "$ROOT"/app.js "$ROOT"/agent.js "$ROOT"/pathways.js build/static/
python3 - <<'EOF'
import pathlib, re
s = pathlib.Path("build/static")

a = (s / "agent.js").read_text()
old = "(params.get('api') || 'http://localhost:8000')"
assert old in a, "agent.js default-API line changed; update build.sh"
(s / "agent.js").write_text(a.replace(old, "(params.get('api') || window.location.origin)"))

banner = (
    '<div role="note" style="background:#1f3b35;color:#fff;font:14px/1.5 \'IBM Plex Sans\',system-ui,sans-serif;'
    'padding:10px 16px;text-align:center">'
    '<strong>Live demo.</strong> The agent runs on Amazon Bedrock AgentCore Runtime. Claude Sonnet 4.6 is '
    'currently served through the Anthropic API while our Bedrock model access is under review. '
    'Each agent step takes about a minute, and usage is capped. '
    '<a href="https://github.com/youssefnashat/Credential-Bridge" style="color:#fff">Code</a>'
    '</div>'
)
h = (s / "index.html").read_text()
h, n = re.subn(r"(<body[^>]*>)", lambda m: m.group(1) + "\n" + banner, h, count=1)
assert n == 1, "no <body> tag in index.html"
(s / "index.html").write_text(h)
EOF
(cd build && zip -qr ../live-demo.zip .)
echo "built $(pwd)/live-demo.zip"
