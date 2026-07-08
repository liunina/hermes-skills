#!/usr/bin/env python3
"""ecom-details-image 生图脚本的离线单元测试。

这些测试只验证本地 payload 构造和参数映射，不调用任何第三方 API。
"""

from __future__ import annotations

import importlib.util
import pathlib
import types
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "skills" / "ecom-details-image" / "scripts" / "generate_image.py"


def load_module() -> types.ModuleType:
    spec = importlib.util.spec_from_file_location("ecom_generate_image", SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"无法加载脚本：{SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


mod = load_module()


def args(**overrides: object) -> types.SimpleNamespace:
    defaults: dict[str, object] = {
        "size": "4:5",
        "resolution": "2k",
        "n": 1,
        "quality": None,
        "format": "png",
        "images": None,
        "input_fidelity": None,
        "mode": None,
        "dry_run": True,
        "poll_interval": 5,
        "timeout": 180,
    }
    defaults.update(overrides)
    return types.SimpleNamespace(**defaults)


class GenerateImagePayloadTest(unittest.TestCase):
    def test_provider_aliases_are_supported(self) -> None:
        self.assertEqual(mod.resolve_provider(args(provider="chatgpt")), "openai")
        self.assertEqual(mod.resolve_provider(args(provider="google")), "gemini")

    def test_openai_gpt_image_2_uses_resolution_mapping(self) -> None:
        self.assertEqual(mod.size_to_openai_size("4:5", "2k", "gpt-image-2"), "1632x2048")
        self.assertEqual(mod.size_to_openai_size("1:1", "4k", "gpt-image-2"), "2880x2880")

    def test_openai_non_gpt_image_2_keeps_legacy_mapping(self) -> None:
        self.assertEqual(mod.size_to_openai_size("4:5", "2k", "gpt-image-1"), "1024x1280")

    def test_openai_input_fidelity_is_not_sent_for_gpt_image_2(self) -> None:
        fields = mod.build_openai_edit_fields(args(input_fidelity="high"), "prompt", "gpt-image-2")
        self.assertNotIn("input_fidelity", fields)

        legacy_fields = mod.build_openai_edit_fields(args(input_fidelity="high"), "prompt", "gpt-image-1")
        self.assertEqual(legacy_fields["input_fidelity"], "high")

    def test_gemini_payload_uses_structured_response_format(self) -> None:
        payload = mod.build_gemini_payload(
            args(size="16:9", resolution="2k"),
            "生成一张商品场景图",
            "gemini-3.1-flash-image",
        )
        self.assertEqual(payload["response_format"]["type"], "image")
        self.assertEqual(payload["response_format"]["mime_type"], "image/png")
        self.assertEqual(payload["response_format"]["aspect_ratio"], "16:9")
        self.assertEqual(payload["response_format"]["image_size"], "2K")
        self.assertIn("技术要求", payload["input"])

    def test_dry_run_scrubs_base64_image_data(self) -> None:
        payload = {"image_urls": ["data:image/png;base64,abcdef"], "data": "a" * 300}
        scrubbed = mod.scrub_payload(payload)
        self.assertEqual(scrubbed["image_urls"][0], "data:image/png;base64,<base64 redacted>")
        self.assertEqual(scrubbed["data"], "<base64 redacted: 300 chars>")


if __name__ == "__main__":
    unittest.main()
