#!/usr/bin/env python3
"""电商图片生成脚本。

支持三类图片提供方：
  - openai：OpenAI / ChatGPT 图片 API，同步返回图片结果。
  - gemini：Google Gemini Interactions API，同步返回 output_image。
  - apimart：apimart.ai 兼容接口，异步任务轮询。

设计目标：
  - 不依赖第三方 Python 包。
  - `.env` 配置清晰，优先用 IMG_PROVIDER 指定提供方。
  - 参考产品图统一用 `--image` 传入。
"""

from __future__ import annotations

import argparse
import base64
import binascii
import http.client
import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from typing import Any


ENV_PROVIDER = "IMG_PROVIDER"
ENV_BASE_URL = "IMG_BASE_URL"
ENV_MODEL = "IMG_MODEL"
ENV_API_KEY = "IMG_API_KEY"
ENV_API_MODE = "IMG_API_MODE"

PROVIDERS = ("openai", "gemini", "apimart")
DEFAULT_BASE_URLS = {
    "openai": "https://api.openai.com/v1",
    "gemini": "https://generativelanguage.googleapis.com/v1beta",
    "apimart": "https://api.apimart.ai/v1",
}
DEFAULT_MODELS = {
    "openai": "gpt-image-2",
    "gemini": "gemini-3.1-flash-image",
    "apimart": "gpt-image-2",
}

PROVIDER_ALIASES = {
    "chatgpt": "openai",
    "gpt": "openai",
    "openai": "openai",
    "google": "gemini",
    "gemini": "gemini",
    "apimart": "apimart",
}

BASE_URL_ALIASES = ("OPENAI_BASE_URL", "OPENAI_API_BASE", "BASE_URL", "GEMINI_BASE_URL")
MODEL_ALIASES = ("OPENAI_IMAGE_MODEL", "IMAGE_MODEL", "OPENAI_MODEL", "GEMINI_MODEL")
OPENAI_KEY_ALIASES = ("OPENAI_API_KEY", "API_KEY")
GEMINI_KEY_ALIASES = ("GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENAI_API_KEY", "API_KEY")
APIMART_KEY_ALIASES = ("APIMART_API_KEY", "OPENAI_API_KEY", "API_KEY")

VALID_RATIOS = (
    "auto", "1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5",
    "16:9", "9:16", "2:1", "1:2", "21:9", "9:21",
)
VALID_RESOLUTIONS = ("1k", "2k", "4k")

PIXEL_TO_RATIO: dict[str, str] = {
    "1024x1024": "1:1", "2048x2048": "1:1",
    "1536x1024": "3:2", "2048x1360": "3:2",
    "1024x1536": "2:3", "1360x2048": "2:3",
    "1024x768": "4:3", "2048x1536": "4:3",
    "768x1024": "3:4", "1536x2048": "3:4",
    "1280x1024": "5:4", "2560x2048": "5:4",
    "1024x1280": "4:5", "2048x2560": "4:5",
    "1536x864": "16:9", "2048x1152": "16:9", "3840x2160": "16:9",
    "864x1536": "9:16", "1152x2048": "9:16", "2160x3840": "9:16",
    "2048x1024": "2:1", "2688x1344": "2:1", "3840x1920": "2:1",
    "1024x2048": "1:2", "1344x2688": "1:2", "1920x3840": "1:2",
    "2016x864": "21:9", "2688x1152": "21:9", "3840x1648": "21:9",
    "864x2016": "9:21", "1152x2688": "9:21", "1648x3840": "9:21",
}

RATIO_TO_PIXEL: dict[str, str] = {
    "1:1": "1024x1024",
    "3:2": "1536x1024",
    "2:3": "1024x1536",
    "4:3": "1024x768",
    "3:4": "768x1024",
    "5:4": "1280x1024",
    "4:5": "1024x1280",
    "16:9": "1536x864",
    "9:16": "864x1536",
    "2:1": "2048x1024",
    "1:2": "1024x2048",
    "21:9": "2016x864",
    "9:21": "864x2016",
}

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)


def fail(message: str, exit_code: int = 1) -> None:
    print(f"错误：{message}", file=sys.stderr)
    raise SystemExit(exit_code)


# ── 配置与环境 ──────────────────────────────────────────────

def read_prompt(args: argparse.Namespace) -> str:
    if args.prompt:
        prompt = args.prompt.strip()
    else:
        try:
            prompt = Path(args.prompt_file).read_text(encoding="utf-8").strip()
        except OSError as exc:
            fail(f"无法读取 prompt 文件：{exc}")
    if not prompt:
        fail("prompt 不能为空。")
    return prompt


def strip_env_value(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def find_default_env_file() -> Path | None:
    for directory in (Path.cwd(), *Path.cwd().parents):
        env_file = directory / ".env"
        if env_file.is_file():
            return env_file
    return None


def load_env_file(env_file: Path | None) -> None:
    if env_file is None:
        return
    try:
        lines = env_file.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        fail(f"无法读取 .env 文件：{exc}")
    for line_number, raw_line in enumerate(lines, start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export "):].strip()
        if "=" not in line:
            fail(f".env 第 {line_number} 行格式不正确，应为 KEY=value。")
        key, value = line.split("=", 1)
        key = key.strip()
        if not key:
            fail(f".env 第 {line_number} 行缺少变量名。")
        if key not in os.environ:
            os.environ[key] = strip_env_value(value)


def env_first(names: tuple[str, ...] | list[str]) -> str:
    for name in names:
        value = os.environ.get(name, "").strip()
        if value:
            return value
    return ""


def normalize_provider(value: str) -> str:
    provider = PROVIDER_ALIASES.get(value.strip().lower(), "")
    if provider:
        return provider
    accepted = "、".join(sorted(PROVIDER_ALIASES))
    fail(f"不支持的 IMG_PROVIDER：{value}。可选值/别名：{accepted}。")


def resolve_provider(args: argparse.Namespace) -> str:
    if args.provider:
        return normalize_provider(args.provider)

    env_provider = os.environ.get(ENV_PROVIDER, "").strip()
    if env_provider:
        return normalize_provider(env_provider)

    base_hint = env_first((ENV_BASE_URL, *BASE_URL_ALIASES)).lower()
    if "googleapis" in base_hint or "generativelanguage" in base_hint:
        return "gemini"
    if "apimart" in base_hint:
        return "apimart"

    mode_hint = os.environ.get(ENV_API_MODE, "").strip().lower()
    if mode_hint == "async":
        return "apimart"

    has_gemini_key = bool(env_first(GEMINI_KEY_ALIASES))
    has_openai_key = bool(env_first(OPENAI_KEY_ALIASES))
    if has_gemini_key and not has_openai_key:
        return "gemini"
    return "openai"


def resolve_base_url(provider: str) -> str:
    return env_first((ENV_BASE_URL, *BASE_URL_ALIASES)) or DEFAULT_BASE_URLS[provider]


def resolve_model(provider: str) -> str:
    return env_first((ENV_MODEL, *MODEL_ALIASES)) or DEFAULT_MODELS[provider]


def resolve_api_key(provider: str) -> str:
    if provider == "gemini":
        candidates = (ENV_API_KEY, *GEMINI_KEY_ALIASES)
    elif provider == "apimart":
        candidates = (ENV_API_KEY, *APIMART_KEY_ALIASES)
    else:
        candidates = (ENV_API_KEY, *OPENAI_KEY_ALIASES)
    api_key = env_first(candidates)
    if not api_key:
        fail(f"缺少 API Key。当前提供方 {provider} 支持这些变量名：{', '.join(candidates)}。")
    return api_key


def resolve_apimart_mode(base_url: str, explicit_mode: str | None) -> str:
    if explicit_mode in ("sync", "async"):
        return explicit_mode
    env_mode = os.environ.get(ENV_API_MODE, "").strip().lower()
    if env_mode in ("sync", "async"):
        return env_mode
    if env_mode:
        fail("IMG_API_MODE 只能设置为 sync 或 async。")
    if "apimart" in base_url.lower():
        return "async"
    return "sync"


# ── 尺寸、格式与图片编码 ──────────────────────────────────────

def size_to_ratio(size: str) -> str:
    if ":" in size:
        if size not in VALID_RATIOS:
            fail(f"不支持的图片比例 '{size}'。可选值：{', '.join(VALID_RATIOS)}。")
        return size
    lower = size.lower()
    if lower == "auto":
        return "auto"
    if lower in PIXEL_TO_RATIO:
        return PIXEL_TO_RATIO[lower]
    fail(f"无法将尺寸 '{size}' 转换为比例。请使用 1:1、16:9、2:3 或 1024x1024 这类格式。")


def size_to_openai_size(size: str) -> str:
    if size == "auto":
        return "auto"
    if ":" in size:
        return RATIO_TO_PIXEL.get(size) or fail(f"OpenAI 模式不支持比例 '{size}'。")
    if "x" in size.lower():
        return size.lower()
    fail(f"OpenAI 模式不支持尺寸 '{size}'。请使用 1:1、4:5、1024x1024 或 auto。")


def normalize_mime_format(fmt: str) -> str:
    return "jpeg" if fmt in {"jpg", "jpeg"} else fmt


def mime_for_format(fmt: str) -> str:
    return f"image/{normalize_mime_format(fmt)}"


def image_mime_for_path(path: Path) -> str:
    suffix = path.suffix.lower().lstrip(".")
    mime_map = {
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "webp": "image/webp",
        "gif": "image/gif",
    }
    mime = mime_map.get(suffix) or mimetypes.guess_type(path.name)[0]
    if not mime or not mime.startswith("image/"):
        fail(f"不支持的图片格式：.{suffix}，仅支持 png/jpg/jpeg/webp/gif。")
    return mime


def read_image_bytes(image_path: str) -> tuple[str, bytes, str]:
    path = Path(image_path)
    if not path.is_file():
        fail(f"参考图片不存在：{image_path}")
    mime = image_mime_for_path(path)
    try:
        data = path.read_bytes()
    except OSError as exc:
        fail(f"无法读取参考图片：{exc}")
    return path.name, data, mime


def encode_image_data_uri(image_path: str) -> str:
    _filename, data, mime = read_image_bytes(image_path)
    b64 = base64.b64encode(data).decode("ascii")
    return f"data:{mime};base64,{b64}"


def encode_gemini_image_block(image_path: str) -> dict[str, str]:
    _filename, data, mime = read_image_bytes(image_path)
    return {
        "type": "image",
        "mime_type": mime,
        "data": base64.b64encode(data).decode("ascii"),
    }


# ── HTTP 工具 ──────────────────────────────────────────────

def http_post_json(url: str, headers: dict[str, str], payload: dict[str, Any],
                   timeout: int = 120) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={**headers, "Content-Type": "application/json", "User-Agent": UA},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        fail(f"接口返回 HTTP {exc.code}：{detail}")
    except urllib.error.URLError as exc:
        fail(f"无法连接接口：{exc.reason}")
    except (http.client.RemoteDisconnected, TimeoutError):
        fail("接口连接失败或超时，请稍后重试。")
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        fail(f"接口返回的不是有效 JSON：{raw[:500]}")
    if not isinstance(parsed, dict):
        fail("接口返回格式不正确：顶层结果不是对象。")
    return parsed


def http_post_bearer(url: str, api_key: str, payload: dict[str, Any],
                     timeout: int = 120) -> dict[str, Any]:
    return http_post_json(url, {"Authorization": f"Bearer {api_key}"}, payload, timeout=timeout)


def http_post_multipart(url: str, api_key: str, fields: dict[str, str],
                        files: list[tuple[str, str, bytes, str]],
                        timeout: int = 120) -> dict[str, Any]:
    boundary = f"----hermes-skill-{uuid.uuid4().hex}"
    chunks: list[bytes] = []

    for name, value in fields.items():
        chunks.append(f"--{boundary}\r\n".encode("utf-8"))
        chunks.append(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"))
        chunks.append(str(value).encode("utf-8"))
        chunks.append(b"\r\n")

    for field_name, filename, data, mime in files:
        safe_name = filename.replace('"', "")
        chunks.append(f"--{boundary}\r\n".encode("utf-8"))
        chunks.append(
            f'Content-Disposition: form-data; name="{field_name}"; filename="{safe_name}"\r\n'
            f"Content-Type: {mime}\r\n\r\n"
            .encode("utf-8")
        )
        chunks.append(data)
        chunks.append(b"\r\n")

    chunks.append(f"--{boundary}--\r\n".encode("utf-8"))
    body = b"".join(chunks)

    request = urllib.request.Request(
        url,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "User-Agent": UA,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        fail(f"接口返回 HTTP {exc.code}：{detail}")
    except urllib.error.URLError as exc:
        fail(f"无法连接接口：{exc.reason}")
    except (http.client.RemoteDisconnected, TimeoutError):
        fail("接口连接失败或超时，请稍后重试。")
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        fail(f"接口返回的不是有效 JSON：{raw[:500]}")
    if not isinstance(parsed, dict):
        fail("接口返回格式不正确：顶层结果不是对象。")
    return parsed


def http_get(url: str, api_key: str, timeout: int = 30) -> dict[str, Any]:
    request = urllib.request.Request(
        url, headers={"Authorization": f"Bearer {api_key}", "User-Agent": UA}, method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        fail(f"查询接口返回 HTTP {exc.code}：{detail}")
    except (urllib.error.URLError, http.client.RemoteDisconnected, TimeoutError):
        fail("查询接口连接失败或超时。")
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        fail(f"查询接口返回的不是有效 JSON：{raw[:500]}")
    return parsed


# ── OpenAI / ChatGPT 图片 API ───────────────────────────────

def build_openai_payload(args: argparse.Namespace, prompt: str, model: str) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "model": model,
        "prompt": prompt,
        "n": args.n,
        "size": size_to_openai_size(args.size),
    }
    if args.quality:
        payload["quality"] = args.quality
    if args.format:
        payload["output_format"] = normalize_mime_format(args.format)
    return payload


def build_openai_edit_fields(args: argparse.Namespace, prompt: str, model: str) -> dict[str, str]:
    fields = {
        "model": model,
        "prompt": prompt,
        "n": str(args.n),
        "size": size_to_openai_size(args.size),
        "output_format": normalize_mime_format(args.format),
    }
    if args.quality:
        fields["quality"] = args.quality
    return fields


def run_openai(base_url: str, api_key: str, args: argparse.Namespace,
               prompt: str, model: str, output_dir: Path) -> list[Path]:
    if args.image:
        endpoint = f"{base_url}/images/edits"
        filename, data, mime = read_image_bytes(args.image)
        fields = build_openai_edit_fields(args, prompt, model)
        print(f"[openai] 提交图片编辑请求到 {endpoint}...", file=sys.stderr)
        result = http_post_multipart(endpoint, api_key, fields, [("image[]", filename, data, mime)], timeout=180)
    else:
        endpoint = f"{base_url}/images/generations"
        payload = build_openai_payload(args, prompt, model)
        print(f"[openai] 提交图片生成请求到 {endpoint}...", file=sys.stderr)
        result = http_post_bearer(endpoint, api_key, payload, timeout=180)
    return save_openai_images(result, output_dir, args.format)


def save_openai_images(result: dict[str, Any], output_dir: Path, fmt: str) -> list[Path]:
    data = result.get("data")
    if not isinstance(data, list) or not data:
        fail(f"接口返回中没有 data 图片数组：{json.dumps(result, ensure_ascii=False)[:300]}")
    output_dir.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []
    for index, item in enumerate(data, start=1):
        if not isinstance(item, dict):
            fail("接口返回格式不正确：data 中包含非对象项目。")
        if item.get("b64_json"):
            try:
                image_bytes = base64.b64decode(item["b64_json"])
            except (binascii.Error, ValueError) as exc:
                fail(f"无法解码 b64_json 图片：{exc}")
            p = output_dir / filename_for(fmt, index)
            p.write_bytes(image_bytes)
            paths.append(p)
        elif item.get("url"):
            image_url = item["url"]
            suffix = _suffix_from_url(image_url, fmt)
            p = output_dir / filename_for(suffix, index)
            dl_req = urllib.request.Request(image_url, headers={"User-Agent": UA})
            with urllib.request.urlopen(dl_req, timeout=120) as resp:
                p.write_bytes(resp.read())
            paths.append(p)
        else:
            fail("图片结果既没有 b64_json，也没有 url。")
    return paths


# ── Gemini 图片 API ────────────────────────────────────────

def build_gemini_input(args: argparse.Namespace, prompt: str) -> str | list[dict[str, str]]:
    ratio = size_to_ratio(args.size)
    hints: list[str] = []
    if ratio != "auto":
        hints.append(f"画面比例必须接近 {ratio}。")
    if args.resolution:
        hints.append(f"输出清晰度目标为 {args.resolution.upper()}。")
    prompt_with_hints = prompt if not hints else f"{prompt}\n\n技术要求：{' '.join(hints)}"

    if not args.image:
        return prompt_with_hints
    return [
        {"type": "text", "text": prompt_with_hints},
        encode_gemini_image_block(args.image),
    ]


def build_gemini_payload(args: argparse.Namespace, prompt: str, model: str) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "model": model,
        "input": build_gemini_input(args, prompt),
    }
    if args.format:
        payload["response_format"] = {"type": "image", "mime_type": mime_for_format(args.format)}
    return payload


def run_gemini(base_url: str, api_key: str, args: argparse.Namespace,
               prompt: str, model: str, output_dir: Path) -> list[Path]:
    endpoint = f"{base_url}/interactions"
    payload = build_gemini_payload(args, prompt, model)
    print(f"[gemini] 提交图片请求到 {endpoint}...", file=sys.stderr)
    result = http_post_json(endpoint, {"x-goog-api-key": api_key}, payload, timeout=180)
    return save_gemini_images(result, output_dir, args.format)


def save_gemini_images(result: dict[str, Any], output_dir: Path, fmt: str) -> list[Path]:
    images = find_gemini_images(result)
    if not images:
        fail(f"Gemini 响应中没有找到 output_image 图片数据：{json.dumps(result, ensure_ascii=False)[:500]}")
    output_dir.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []
    for index, item in enumerate(images, start=1):
        encoded = item["data"]
        mime = item.get("mime_type") or item.get("mimeType") or mime_for_format(fmt)
        suffix = _suffix_from_mime(mime, fmt)
        try:
            image_bytes = base64.b64decode(encoded)
        except (binascii.Error, ValueError) as exc:
            fail(f"无法解码 Gemini 图片数据：{exc}")
        p = output_dir / filename_for(suffix, index)
        p.write_bytes(image_bytes)
        paths.append(p)
    return paths


def find_gemini_images(value: Any) -> list[dict[str, str]]:
    found: list[dict[str, str]] = []
    seen_data: set[str] = set()

    def add_image(data: str, mime: str) -> None:
        if data in seen_data:
            return
        seen_data.add(data)
        found.append({"data": data, "mime_type": mime})

    if isinstance(value, dict):
        output_image = value.get("output_image")
        if isinstance(output_image, dict) and isinstance(output_image.get("data"), str):
            mime = output_image.get("mime_type") or output_image.get("mimeType") or "image/png"
            add_image(output_image["data"], str(mime))

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            data = node.get("data")
            mime = node.get("mime_type") or node.get("mimeType") or ""
            node_type = node.get("type", "")
            if isinstance(data, str) and (str(mime).startswith("image/") or node_type in {"image", "output_image"}):
                add_image(data, str(mime) if mime else "image/png")
            for child in node.values():
                walk(child)
        elif isinstance(node, list):
            for child in node:
                walk(child)

    walk(value)
    return found


# ── apimart.ai 异步模式 ─────────────────────────────────────

def build_apimart_payload(args: argparse.Namespace, prompt: str, model: str) -> dict[str, Any]:
    ratio = size_to_ratio(args.size)
    payload: dict[str, Any] = {
        "model": model,
        "prompt": prompt,
        "n": 1,
        "size": ratio,
        "resolution": args.resolution,
    }
    if args.image:
        payload["image_urls"] = [encode_image_data_uri(args.image)]
    return payload


def run_apimart(base_url: str, api_key: str, args: argparse.Namespace,
                prompt: str, model: str, output_dir: Path) -> list[Path]:
    mode = resolve_apimart_mode(base_url, args.mode)
    endpoint = f"{base_url}/images/generations"
    if mode == "sync":
        payload = {
            "model": model,
            "prompt": prompt,
            "n": args.n,
            "size": args.size,
        }
        if args.quality:
            payload["quality"] = args.quality
        if args.image:
            payload["image_urls"] = [encode_image_data_uri(args.image)]
        print(f"[apimart-sync] 提交同步请求到 {endpoint}...", file=sys.stderr)
        result = http_post_bearer(endpoint, api_key, payload, timeout=180)
        return save_openai_images(result, output_dir, args.format)

    payload = build_apimart_payload(args, prompt, model)
    print(f"[apimart-async] 提交异步任务到 {endpoint}...", file=sys.stderr)
    result = http_post_bearer(endpoint, api_key, payload, timeout=30)

    code = result.get("code")
    if code and code != 200:
        error = result.get("error", {})
        fail(f"提交失败（code={code}）：{error.get('message', json.dumps(result, ensure_ascii=False))}")

    data = result.get("data")
    if not isinstance(data, list) or not data:
        fail(f"提交响应缺少 data 数组：{json.dumps(result, ensure_ascii=False)[:300]}")
    task_id = data[0].get("task_id")
    if not task_id:
        fail(f"提交响应缺少 task_id：{json.dumps(data[0], ensure_ascii=False)[:300]}")

    print(f"[apimart-async] 任务已提交: {task_id}，等待 15s 后开始轮询...", file=sys.stderr)
    time.sleep(15)

    task_data = poll_apimart_task(base_url, api_key, task_id, args.poll_interval, args.timeout)
    actual_time = task_data.get("actual_time", 0)
    cost = task_data.get("cost", 0)
    print(f"[apimart-async] 任务完成，耗时 {actual_time}s，费用 ${cost:.4f}", file=sys.stderr)

    return save_apimart_images(task_data, output_dir, args.format)


def poll_apimart_task(base_url: str, api_key: str, task_id: str,
                      poll_interval: int, timeout: int) -> dict[str, Any]:
    url = f"{base_url}/tasks/{task_id}"
    start = time.time()
    while True:
        elapsed = time.time() - start
        if elapsed > timeout:
            fail(f"任务 {task_id} 超时（{timeout}s），请稍后手动查询。")
        result = http_get(url, api_key)
        task_data = result.get("data", {})
        status = task_data.get("status", "")
        if status == "completed":
            return task_data
        if status == "failed":
            error = task_data.get("error", {})
            fail(f"任务 {task_id} 失败：{error.get('message', json.dumps(task_data, ensure_ascii=False)[:300])}")
        progress = task_data.get("progress", 0)
        print(f"  轮询中... 状态={status} 进度={progress}% 耗时={elapsed:.0f}s", file=sys.stderr)
        time.sleep(poll_interval)


def save_apimart_images(task_data: dict[str, Any], output_dir: Path, fmt: str) -> list[Path]:
    result = task_data.get("result", {})
    images = result.get("images")
    if not isinstance(images, list) or not images:
        fail(f"任务结果中缺少 images 数组：{json.dumps(task_data, ensure_ascii=False)[:300]}")
    output_dir.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []
    for index, img_item in enumerate(images, start=1):
        url_list = img_item.get("url")
        if not isinstance(url_list, list) or not url_list:
            fail(f"图片结果缺少 url 数组：{json.dumps(img_item, ensure_ascii=False)[:300]}")
        image_url = url_list[0]
        suffix = _suffix_from_url(image_url, fmt)
        output_path = output_dir / filename_for(suffix, index)
        print(f"  下载图片: {image_url}", file=sys.stderr)
        dl_req = urllib.request.Request(image_url, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(dl_req, timeout=120) as resp:
                output_path.write_bytes(resp.read())
        except urllib.error.URLError as exc:
            fail(f"无法下载图片：{exc.reason}")
        except TimeoutError:
            fail("下载图片超时。")
        paths.append(output_path)
    return paths


# ── 工具函数 ──────────────────────────────────────────────

def filename_for(suffix: str, index: int = 1) -> str:
    timestamp = time.strftime("%Y%m%d-%H%M%S")
    return f"image-{timestamp}-{index:02d}.{suffix.lstrip('.')}"


def _suffix_from_url(url: str, fallback: str) -> str:
    path = urllib.parse.urlparse(url).path
    suffix = Path(path).suffix.lower().lstrip(".")
    if suffix in {"png", "jpg", "jpeg", "webp"}:
        return "jpg" if suffix == "jpeg" else suffix
    return normalize_mime_format(fallback)


def _suffix_from_mime(mime: str, fallback: str) -> str:
    suffix = mime.split("/", 1)[1].lower() if "/" in mime else ""
    if suffix in {"png", "jpg", "jpeg", "webp"}:
        return "jpg" if suffix == "jpeg" else suffix
    return normalize_mime_format(fallback)


# ── CLI ───────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="电商图片生成脚本，支持 OpenAI/ChatGPT、Google Gemini 和 apimart.ai。"
    )
    prompt_group = parser.add_mutually_exclusive_group(required=True)
    prompt_group.add_argument("--prompt", help="直接传入图片生成 Prompt。")
    prompt_group.add_argument("--prompt-file", help="从文本文件读取图片生成 Prompt。")
    parser.add_argument("--provider", choices=PROVIDERS, help="图片提供方：openai、gemini、apimart。优先于 IMG_PROVIDER。")
    parser.add_argument("--output-dir", default="generated-images", help="图片输出目录，默认 generated-images。")
    parser.add_argument("--env-file", help="指定 .env 配置文件；不指定时从当前目录向上查找。")
    parser.add_argument("--mode", choices=("sync", "async"), help="仅 apimart 兼容模式使用；建议优先用 --provider。")
    parser.add_argument("--size", default="1:1", help="图片比例或尺寸，如 1:1、4:5、1024x1024、auto。默认 1:1。")
    parser.add_argument("--resolution", default="2k", choices=VALID_RESOLUTIONS, help="目标清晰度档位，默认 2k。")
    parser.add_argument("--quality", help="OpenAI/兼容接口质量参数，例如 low、medium、high。")
    parser.add_argument("--n", type=int, default=1, help="OpenAI/兼容同步模式生成数量，默认 1。")
    parser.add_argument("--image", help="参考产品图片路径，传入以提升产品一致性。")
    parser.add_argument("--poll-interval", type=int, default=5, help="apimart 异步模式轮询间隔秒数，默认 5。")
    parser.add_argument("--timeout", type=int, default=180, help="apimart 异步模式轮询超时秒数，默认 180。")
    parser.add_argument("--format", choices=("png", "jpeg", "webp"), default="png", help="图片保存格式，默认 png。")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    env_file = Path(args.env_file) if args.env_file else find_default_env_file()
    load_env_file(env_file)

    prompt = read_prompt(args)
    provider = resolve_provider(args)
    base_url = resolve_base_url(provider).rstrip("/")
    model = resolve_model(provider)
    api_key = resolve_api_key(provider)

    print(f"图片提供方: {provider} | base_url={base_url} | model={model}", file=sys.stderr)

    output_dir = Path(args.output_dir)
    if provider == "gemini":
        paths = run_gemini(base_url, api_key, args, prompt, model, output_dir)
    elif provider == "apimart":
        paths = run_apimart(base_url, api_key, args, prompt, model, output_dir)
    else:
        paths = run_openai(base_url, api_key, args, prompt, model, output_dir)

    print("生成完成：")
    for path in paths:
        print(path)


if __name__ == "__main__":
    main()
