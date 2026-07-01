#!/usr/bin/env python3
"""Build and display Wiki.js page tree from GraphQL API.

Usage:
  python3 scripts/wiki-tree.py [--api-key KEY] [--url URL]

Environment variables:
  WIKIJS_API_KEY  — Wiki.js API key (required if not passed via --api-key)
  WIKIJS_URL      — Wiki.js GraphQL endpoint (default: https://your-wiki-domain.com/graphql)
"""

import json
import os
import sys
import urllib.request


def fetch_pages(url: str, api_key: str) -> list[dict]:
    query = json.dumps({
        "query": "{ pages { list { id path title locale } } }"
    }).encode()

    req = urllib.request.Request(
        url,
        data=query,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())

    if "errors" in data:
        raise RuntimeError(f"GraphQL errors: {data['errors']}")

    return data["data"]["pages"]["list"]


def build_tree(pages: list[dict]) -> dict:
    tree = {}
    for p in pages:
        parts = p["path"].split("/")
        node = tree
        for part in parts:
            node = node.setdefault(part, {})
    return tree


def print_tree(node: dict, indent: int = 0, pages: list[dict] | None = None):
    path_map = {p["path"]: p["title"] for p in (pages or [])}
    for name in sorted(node.keys()):
        key = name
        # walk up to find full path
        title = path_map.get(name, name)
        prefix = "  " * indent + "├── "
        print(f"{prefix}{title}")
        print_tree(node[name], indent + 1, pages)


def main():
    url = os.environ.get("WIKIJS_URL", "https://your-wiki-domain.com/graphql")
    api_key = os.environ.get("WIKIJS_API_KEY", "")

    # Parse CLI args
    args = sys.argv[1:]
    i = 0
    while i < len(args):
        if args[i] == "--api-key" and i + 1 < len(args):
            api_key = args[i + 1]
            i += 2
        elif args[i] == "--url" and i + 1 < len(args):
            url = args[i + 1]
            i += 2
        else:
            print(f"Unknown arg: {args[i]}", file=sys.stderr)
            sys.exit(1)

    if not api_key:
        print("ERROR: WIKIJS_API_KEY not set. Pass --api-key or set env var.", file=sys.stderr)
        sys.exit(1)

    pages = fetch_pages(url, api_key)
    tree = build_tree(pages)

    print(f"Wiki.js 目录结构 ({url.replace('/graphql', '')})")
    print("=" * 50)
    print_tree(tree, pages=pages)
    print(f"\n共 {len(pages)} 个页面")


if __name__ == "__main__":
    main()
