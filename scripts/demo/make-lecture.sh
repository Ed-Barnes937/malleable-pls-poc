#!/usr/bin/env bash
# Regenerates the demo lecture audio and its transcript fixture from the
# script text (macOS only: needs `say`).
#
#   scripts/demo/make-lecture.sh [VOICE]
#
# Writes, next to the script text in demo/:
#   lecture-mitochondrial-dna.wav            16 kHz mono 16-bit PCM
#   lecture-mitochondrial-dna.segments.json  one segment per paragraph, exact
#                                            timings, plus the wav's sha256
#
# Each paragraph is spoken separately and the clips are joined with a short
# pause, so segment timings come from sample counts rather than guesswork. The
# mock transcriber (apps/server/src/ai/demo-lecture.ts) returns these segments
# when an upload's hash matches the wav. Commit both files together.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT_MD="$ROOT/demo/lecture-mitochondrial-dna.md"
OUT_WAV="$ROOT/demo/lecture-mitochondrial-dna.wav"
OUT_JSON="$ROOT/demo/lecture-mitochondrial-dna.segments.json"

command -v say >/dev/null || { echo "make-lecture: macOS 'say' is required" >&2; exit 1; }

# Natural en-GB voices, best first; override with the first argument.
VOICE="${1:-}"
if [[ -z "$VOICE" ]]; then
  for candidate in Jamie Daniel; do
    if say -v '?' | grep -q "^$candidate "; then VOICE="$candidate"; break; fi
  done
fi
[[ -n "$VOICE" ]] || { echo "make-lecture: no en-GB voice found; pass one, e.g. make-lecture.sh Daniel" >&2; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Spoken paragraphs: blank-line separated, skipping `#` headings and `>` notes.
awk '
  /^[#>]/ { next }
  /^[[:space:]]*$/ { if (p != "") { print p; p = "" } ; next }
  { p = (p == "" ? $0 : p " " $0) }
  END { if (p != "") print p }
' "$SCRIPT_MD" > "$WORK/paragraphs.txt"

i=0
while IFS= read -r paragraph; do
  i=$((i + 1))
  clip="$WORK/$(printf '%03d' "$i").wav"
  printf '%s' "$paragraph" > "$WORK/$(printf '%03d' "$i").txt"
  say -v "$VOICE" --file-format=WAVE --data-format=LEI16@16000 -o "$clip" -f "$WORK/$(printf '%03d' "$i").txt"
done < "$WORK/paragraphs.txt"
echo "make-lecture: spoke $i paragraphs with voice $VOICE"

node "$ROOT/scripts/demo/assemble-lecture.mts" "$WORK" "$OUT_WAV" "$OUT_JSON" "$VOICE"
