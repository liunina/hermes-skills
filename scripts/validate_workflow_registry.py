#!/usr/bin/env python3
"""Validate workflow skill registry files.

The validator intentionally avoids third-party dependencies so it can run in CI
with the default Python runtime.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "workflow-registry"

SECRET_PATTERNS = [
    re.compile(r"eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}"),
    re.compile(r"Bearer\s+[A-Za-z0-9._~+/=-]{20,}"),
    re.compile(r"sk-[A-Za-z0-9]{20,}"),
]

SKIP_DIRS = {".git", "__pycache__", "node_modules", "generated-images"}
SKIP_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".pack", ".idx"}


class ValidationError(Exception):
    pass


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValidationError(f"{path}: invalid JSON: {exc}") from exc


def require_string(data: dict[str, Any], path: Path, field: str) -> str:
    value = data.get(field)
    if not isinstance(value, str) or not value.strip():
        raise ValidationError(f"{path}: `{field}` must be a non-empty string")
    return value


def require_list(data: dict[str, Any], path: Path, field: str) -> list[Any]:
    value = data.get(field)
    if not isinstance(value, list):
        raise ValidationError(f"{path}: `{field}` must be a list")
    return value


def require_dict(data: dict[str, Any], path: Path, field: str) -> dict[str, Any]:
    value = data.get(field)
    if not isinstance(value, dict):
        raise ValidationError(f"{path}: `{field}` must be an object")
    return value


def validate_n8n_metadata(data: dict[str, Any], path: Path) -> None:
    n8n = data.get("n8n")
    if n8n is None:
        return
    if not isinstance(n8n, dict):
        raise ValidationError(f"{path}: n8n must be an object")
    server_url = n8n.get("serverUrl")
    if not isinstance(server_url, str) or not server_url.strip():
        raise ValidationError(f"{path}: n8n.serverUrl must be a non-empty string")
    for field in ("instanceName", "projectId"):
        if field in n8n and not isinstance(n8n[field], str):
            raise ValidationError(f"{path}: n8n.{field} must be a string")


def validate_transport(data: dict[str, Any], path: Path, required: bool) -> None:
    transport = data.get("transport")
    if transport is None:
        if required:
            raise ValidationError(f"{path}: business-skill manifests must define transport")
        return
    if not isinstance(transport, dict):
        raise ValidationError(f"{path}: transport must be an object")
    if transport.get("type") != "webhook":
        raise ValidationError(f"{path}: only transport.type=webhook is supported")
    url = transport.get("url")
    if url is not None and (not isinstance(url, str) or not url.strip()):
        raise ValidationError(f"{path}: transport.url must be a non-empty string when present")
    url_env = transport.get("urlEnv")
    if url_env is not None and (not isinstance(url_env, str) or not re.fullmatch(r"[A-Z][A-Z0-9_]+", url_env)):
        raise ValidationError(f"{path}: transport.urlEnv must be an environment variable name")
    secret_file = transport.get("secretFile")
    if secret_file is not None and (not isinstance(secret_file, str) or not re.fullmatch(r"secrets/[a-z0-9-]+\.webhook-url\.txt", secret_file)):
        raise ValidationError(f"{path}: transport.secretFile must be secrets/<id>.webhook-url.txt")
    if not any([url, url_env, secret_file]):
        raise ValidationError(f"{path}: transport must define at least one of url, urlEnv, or secretFile")
    timeout_ms = transport.get("timeoutMs")
    if not isinstance(timeout_ms, int) or timeout_ms < 1000:
        raise ValidationError(f"{path}: transport.timeoutMs must be an integer >= 1000")


def validate_manifest(path: Path, expected_manifest_type: str, component_ids: set[str]) -> None:
    data = load_json(path)
    if not isinstance(data, dict):
        raise ValidationError(f"{path}: manifest must be an object")

    skill_id = require_string(data, path, "id")
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,62}[a-z0-9]", skill_id):
        raise ValidationError(f"{path}: invalid skill id `{skill_id}`")

    manifest_type = require_string(data, path, "manifestType")
    if manifest_type not in {"business-skill", "workflow-component"}:
        raise ValidationError(f"{path}: invalid manifestType `{manifest_type}`")
    if manifest_type != expected_manifest_type:
        raise ValidationError(f"{path}: expected manifestType `{expected_manifest_type}`, got `{manifest_type}`")

    require_string(data, path, "name")
    require_string(data, path, "description")
    status = require_string(data, path, "status")
    if status not in {"active", "draft", "deprecated"}:
        raise ValidationError(f"{path}: invalid status `{status}`")

    tags = require_list(data, path, "tags")
    if not all(isinstance(tag, str) and tag for tag in tags):
        raise ValidationError(f"{path}: `tags` must contain non-empty strings")

    validate_n8n_metadata(data, path)

    if manifest_type == "business-skill":
        skill_path = require_string(data, path, "skillPath")
        if not skill_path.startswith("skills/") or not skill_path.endswith("/SKILL.md"):
            raise ValidationError(f"{path}: skillPath must look like skills/<id>/SKILL.md")
        if not (ROOT / skill_path).is_file():
            raise ValidationError(f"{path}: skillPath does not exist: {skill_path}")

        contract_path = data.get("contractPath")
        if contract_path is not None and (not isinstance(contract_path, str) or not contract_path):
            raise ValidationError(f"{path}: contractPath must be a non-empty string when present")
        if contract_path and not (ROOT / contract_path).is_file():
            raise ValidationError(f"{path}: contractPath does not exist: {contract_path}")

        dependencies = data.get("componentDependencies", [])
        if not isinstance(dependencies, list) or not all(isinstance(item, str) and item for item in dependencies):
            raise ValidationError(f"{path}: componentDependencies must contain non-empty strings")
        missing = sorted(set(dependencies) - component_ids)
        if missing:
            raise ValidationError(f"{path}: unknown componentDependencies: {', '.join(missing)}")
    else:
        if "skillPath" in data:
            raise ValidationError(f"{path}: workflow-component manifests must not define skillPath")
        if "contractPath" in data:
            raise ValidationError(f"{path}: workflow-component manifests must not define contractPath")

    workflows = require_list(data, path, "workflows")
    if not workflows:
        raise ValidationError(f"{path}: workflows must not be empty")
    for index, workflow in enumerate(workflows):
        if not isinstance(workflow, dict):
            raise ValidationError(f"{path}: workflows[{index}] must be an object")
        role = workflow.get("role")
        if role not in {"primary", "component", "wrapper", "reference"}:
            raise ValidationError(f"{path}: workflows[{index}].role is invalid")
        for field in ("name", "id"):
            if not isinstance(workflow.get(field), str) or not workflow[field]:
                raise ValidationError(f"{path}: workflows[{index}].{field} must be a non-empty string")

    validate_transport(data, path, required=manifest_type == "business-skill")

    require_dict(data, path, "defaults")
    side_effect_mode = data.get("sideEffectMode", "field")
    if side_effect_mode not in {"field", "always"}:
        raise ValidationError(f"{path}: sideEffectMode must be `field` or `always`")
    side_effect_fields = require_list(data, path, "sideEffectFields")
    if not all(isinstance(field, str) and field for field in side_effect_fields):
        raise ValidationError(f"{path}: sideEffectFields must contain non-empty strings")
    require_list(data, path, "outputFields")


def iter_text_files() -> list[Path]:
    files: list[Path] = []
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if path.suffix.lower() in SKIP_SUFFIXES:
            continue
        files.append(path)
    return files


def scan_secrets() -> None:
    findings: list[str] = []
    for path in iter_text_files():
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for pattern in SECRET_PATTERNS:
            if pattern.search(text):
                findings.append(str(path.relative_to(ROOT)))
                break
    if findings:
        joined = "\n  - ".join(sorted(findings))
        raise ValidationError(f"Potential secret-like values found:\n  - {joined}")


def main() -> int:
    business_manifest_paths = sorted(
        path for path in REGISTRY.glob("*.json") if path.name != "schema.json"
    )
    component_manifest_paths = sorted((REGISTRY / "components").glob("*.json"))
    if not business_manifest_paths:
        raise ValidationError("No workflow registry manifests found")

    component_ids = {require_string(load_json(path), path, "id") for path in component_manifest_paths}

    for path in component_manifest_paths:
        validate_manifest(path, "workflow-component", component_ids)

    for path in business_manifest_paths:
        validate_manifest(path, "business-skill", component_ids)

    scan_secrets()
    print(
        "Validated "
        f"{len(business_manifest_paths)} business workflow skill manifest(s) "
        f"and {len(component_manifest_paths)} component manifest(s)."
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ValidationError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
