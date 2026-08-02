import base64

import httpx

from app.services import license_classifier


def _client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def _b64(text: str) -> str:
    return base64.b64encode(text.encode()).decode()


def _not_found(request):
    return httpx.Response(404, json={"message": "Not Found"})


async def test_classify_permissive_via_github_api():
    def handler(request):
        assert request.url.path == "/repos/owner/repo"
        return httpx.Response(200, json={"license": {"spdx_id": "MIT"}})

    result = await license_classifier.classify_license("owner/repo", client=_client(handler))
    assert result == license_classifier.LicenseResult("MIT", "permissive", "github_api")


async def test_classify_copyleft_via_github_api():
    def handler(request):
        return httpx.Response(200, json={"license": {"spdx_id": "GPL-3.0"}})

    result = await license_classifier.classify_license("owner/repo", client=_client(handler))
    assert result.classification == "copyleft"
    assert result.source == "github_api"


async def test_classify_permissive_with_only_suffix():
    # SPDX identifiers sometimes carry a -only/-or-later suffix (e.g. from a
    # LICENSE file rather than GitHub's short-form spdx_id) -- must still bucket.
    def handler(request):
        if request.url.path == "/repos/owner/repo":
            return httpx.Response(200, json={"license": None})
        if request.url.path == "/repos/owner/repo/contents/LICENSE":
            return httpx.Response(
                200,
                json={"encoding": "base64", "content": _b64("GNU GENERAL PUBLIC LICENSE\nVersion 3")},
            )
        return _not_found(request)

    result = await license_classifier.classify_license("owner/repo", client=_client(handler))
    assert result.classification == "copyleft"
    assert result.spdx_id == "gpl-3.0"


def _not_found_all_but_repo(request):
    if request.url.path == "/repos/owner/repo":
        return httpx.Response(200, json={"license": None})
    return httpx.Response(404, json={"message": "Not Found"})


async def test_classify_unlicensed_when_nothing_found():
    result = await license_classifier.classify_license("owner/repo", client=_client(_not_found_all_but_repo))
    assert result == license_classifier.LicenseResult(None, "unlicensed", "not_found")


async def test_classify_falls_back_to_license_file_when_noassertion():
    mit_text = "MIT License\n\nPermission is hereby granted, free of charge, to any person obtaining a copy..."

    def handler(request):
        if request.url.path == "/repos/owner/repo":
            return httpx.Response(200, json={"license": {"spdx_id": "NOASSERTION"}})
        if request.url.path == "/repos/owner/repo/contents/LICENSE":
            return httpx.Response(200, json={"encoding": "base64", "content": _b64(mit_text)})
        return _not_found(request)

    result = await license_classifier.classify_license("owner/repo", client=_client(handler))
    assert result == license_classifier.LicenseResult("mit", "permissive", "license_file")


async def test_classify_unknown_when_license_file_unrecognized():
    def handler(request):
        if request.url.path == "/repos/owner/repo":
            return httpx.Response(200, json={"license": None})
        if request.url.path == "/repos/owner/repo/contents/LICENSE":
            return httpx.Response(
                200, json={"encoding": "base64", "content": _b64("Some completely custom proprietary terms.")}
            )
        return _not_found(request)

    result = await license_classifier.classify_license("owner/repo", client=_client(handler))
    assert result == license_classifier.LicenseResult(None, "unknown", "license_file")


async def test_classify_falls_back_to_manifest_license():
    def handler(request):
        if request.url.path == "/repos/owner/repo":
            return httpx.Response(200, json={"license": None})
        if request.url.path == "/repos/owner/repo/contents/package.json":
            return httpx.Response(200, json={"encoding": "base64", "content": _b64('{"name": "x", "license": "Apache-2.0"}')})
        return _not_found(request)

    result = await license_classifier.classify_license("owner/repo", client=_client(handler))
    assert result == license_classifier.LicenseResult("Apache-2.0", "permissive", "manifest")


async def test_classify_rate_limited_returns_unknown():
    def handler(request):
        return httpx.Response(
            403,
            headers={"x-ratelimit-remaining": "0", "x-ratelimit-reset": "9999999999"},
            json={"message": "rate limited"},
        )

    result = await license_classifier.classify_license("owner/repo", client=_client(handler))
    assert result == license_classifier.LicenseResult(None, "unknown", "not_found")


async def test_classify_repo_not_found_returns_unknown_not_unlicensed():
    # A 404 on the repo itself means we couldn't check at all -- distinct
    # from successfully checking a real repo and finding no license.
    def handler(request):
        return httpx.Response(404, json={"message": "Not Found"})

    result = await license_classifier.classify_license("owner/repo", client=_client(handler))
    assert result.classification == "unknown"
