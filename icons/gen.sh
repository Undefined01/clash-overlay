#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

PROMPTS_FILE="${PROMPTS_FILE:-$SCRIPT_DIR/prompts.json}"
OUT_DIR="${OUT_DIR:-$SCRIPT_DIR/generated}"
API_URL="${API_URL:-https://api.infiniteai.cc/v1/svgs/generations}"
MODEL="${MODEL:-arrow-preview}"

API_KEY="${INFINITEAI_API_KEY:-${SVG_API_KEY:-${API_KEY:-}}}"

usage() {
    cat <<'EOF'
Usage:
  ./gen.sh list
  ./gen.sh prompt <name>
  ./gen.sh one <name>
  ./gen.sh all

Environment:
  INFINITEAI_API_KEY  (required for generating)
  PROMPTS_FILE        (default: ./prompts.json)
  OUT_DIR             (default: ./generated)
  API_URL             (default: https://api.infiniteai.cc/v1/svgs/generations)
  MODEL               (default: arrow-preview)
EOF
}

need_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "Missing dependency: $1" >&2
        exit 1
    fi
}

require_prompts_file() {
    if [[ ! -f "$PROMPTS_FILE" ]]; then
        echo "Prompts file not found: $PROMPTS_FILE" >&2
        exit 1
    fi
}

system_prompt() {
    jq -r '.system | join("\n")' "$PROMPTS_FILE"
}

icon_prompt() {
    local name="$1"
    jq -r --arg name "$name" '.icons[] | select(.name == $name) | .prompt | join("\n")' "$PROMPTS_FILE"
}

icon_exists() {
    local name="$1"
    jq -e --arg name "$name" '.icons[] | select(.name == $name) | true' "$PROMPTS_FILE" >/dev/null
}

combined_prompt() {
    local name="$1"
    printf '%s\n\n%s\n' "$(system_prompt)" "$(icon_prompt "$name")"
}

list_icons() {
    jq -r '.icons[] | "\(.name)\t\(.label)"' "$PROMPTS_FILE"
}

generate_one() {
    local name="$1"
    local prompt body svg out

    if [[ -z "${API_KEY:-}" ]]; then
        echo "INFINITEAI_API_KEY is required to generate icons." >&2
        exit 1
    fi

    prompt="$(combined_prompt "$name")"
    body="$(jq -n --arg model "$MODEL" --arg prompt "$prompt" '{model: $model, prompt: $prompt, n: 1, stream: false}')"

    svg="$(
        curl -v "$API_URL" \
            -H "Authorization: Bearer $API_KEY" \
            -H "Content-Type: application/json" \
            -d "$body" \
        | jq -r '.data[0].svg // empty'
    )"

    if [[ -z "$svg" ]]; then
        echo "No SVG returned for: $name" >&2
        exit 1
    fi

    case "$svg" in
        \<svg*) ;;
        *)
            echo "Unexpected response (not an SVG) for: $name" >&2
            exit 1
            ;;
    esac

    mkdir -p "$OUT_DIR"
    out="$OUT_DIR/$name.svg"
    printf '%s\n' "$svg" > "$out"
    echo "Wrote: $out"
}

main() {
    local cmd="${1:-all}"

    need_cmd jq
    require_prompts_file

    case "$cmd" in
        -h|--help|help)
            usage
            ;;
        list|--list)
            list_icons
            ;;
        prompt)
            if [[ $# -ne 2 ]]; then
                usage
                exit 1
            fi
            if ! icon_exists "$2"; then
                echo "Unknown icon name: $2" >&2
                exit 1
            fi
            combined_prompt "$2"
            ;;
        one)
            need_cmd curl
            if [[ $# -ne 2 ]]; then
                usage
                exit 1
            fi
            if ! icon_exists "$2"; then
                echo "Unknown icon name: $2" >&2
                exit 1
            fi
            generate_one "$2"
            ;;
        all)
            need_cmd curl
            while IFS=$'\t' read -r name _label; do
                generate_one "$name"
            done < <(list_icons)
            ;;
        *)
            usage
            exit 1
            ;;
    esac
}

main "$@"
