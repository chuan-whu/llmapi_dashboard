import json
import numbers
import urllib.request


TYPE_DAILY_REFRESH = "daily_refresh"
TYPE_PAY_AS_YOU_GO = "pay_as_you_go"

STATUS_OK = "ok"
STATUS_PARTIAL = "partial"
STATUS_FAILED = "failed"
STATUS_ERROR = "error"

REQUEST_TIMEOUT = 20


# A mock daily refresh balance. Replace this with a real request when needed.
MOCK_DAILY_REFRESH = {
    "name": "mock-daily-refresh",
    "type": TYPE_DAILY_REFRESH,
    "parser": "mock_balance",
    "mock_response": {"remaining": 12.34},
}


# A mock pay-as-you-go balance. Replace this with a real request when needed.
MOCK_PAY_AS_YOU_GO = {
    "name": "mock-pay-as-you-go",
    "type": TYPE_PAY_AS_YOU_GO,
    "parser": "mock_balance",
    "mock_response": {"remaining": 56.78},
}


# Template for a GET request that returns {"remaining": 12.34}.
# Keep real keys in your private query_amount.py, not in this example file.
EXAMPLE_REAL_REQUEST = {
    "name": "example-real-request",
    "type": TYPE_PAY_AS_YOU_GO,
    "url": "https://example.com/api/balance",
    "key": "replace-with-private-token",
    "parser": "mock_balance",
    "headers": {"User-Agent": "cpa-usage-keeper/1.0"},
    # Optional per-request proxy. Remove it when the endpoint does not need a proxy.
    # "proxy": "http://127.0.0.1:7890",
}


REQUESTS = [
    MOCK_DAILY_REFRESH,
    MOCK_PAY_AS_YOU_GO,
    # EXAMPLE_REAL_REQUEST,
]


def build_opener(request_config):
    proxy = str(request_config.get("proxy", "")).strip()
    if not proxy:
        return urllib.request.urlopen

    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({
            "http": proxy,
            "https": proxy,
        })
    )
    return opener.open


def request_usage(request_config, timeout=REQUEST_TIMEOUT):
    if "mock_response" in request_config:
        return json.dumps(request_config["mock_response"], ensure_ascii=False)

    api_key = request_config.get("key", "")
    if not api_key or api_key == "replace-with-private-token":
        raise ValueError("API key is not configured")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
    }
    headers.update(request_config.get("headers", {}))

    request = urllib.request.Request(
        request_config["url"],
        headers=headers,
        method=str(request_config.get("method", "GET")).upper(),
    )

    with build_opener(request_config)(request, timeout=timeout) as response:
        return response.read().decode("utf-8")


def parse_mock_balance(response_text):
    try:
        payload = json.loads(response_text)
    except json.JSONDecodeError:
        return {"status": STATUS_ERROR, "remaining": None}

    remaining = payload.get("remaining") if isinstance(payload, dict) else None
    if not isinstance(remaining, numbers.Number):
        return {"status": STATUS_ERROR, "remaining": None}
    return {"status": STATUS_OK, "remaining": remaining}


PARSERS = {
    "mock_balance": parse_mock_balance,
}


def parse_request_remaining(request_config, response_text):
    parser = PARSERS.get(request_config.get("parser", "mock_balance"))
    if parser is None:
        return {"status": STATUS_ERROR, "remaining": None}
    return parser(response_text)


def normalize_remaining(remaining):
    if not isinstance(remaining, numbers.Number):
        return remaining
    return max(remaining, 0)


def query_request(request_config):
    request_result = {
        "name": request_config.get("name", ""),
        "type": request_config.get("type", ""),
        "status": STATUS_ERROR,
        "remaining": None,
    }

    try:
        response_text = request_usage(request_config)
        parsed_result = parse_request_remaining(request_config, response_text)
    except Exception:
        return request_result

    request_result["status"] = parsed_result["status"]
    request_result["remaining"] = normalize_remaining(parsed_result["remaining"])
    return request_result


def merge_typed_results(request_results, balance_type):
    typed_results = [
        result
        for result in request_results
        if result.get("type") == balance_type
    ]
    ok_results = [
        result
        for result in typed_results
        if result.get("status") == STATUS_OK and isinstance(result.get("remaining"), numbers.Number)
    ]

    if not typed_results or not ok_results:
        return {"status": STATUS_FAILED}

    status = STATUS_OK if len(ok_results) == len(typed_results) else STATUS_PARTIAL
    return {
        "status": status,
        "remaining": sum(result["remaining"] for result in ok_results),
    }


def merge_request_results(request_results):
    daily_refresh = merge_typed_results(request_results, TYPE_DAILY_REFRESH)
    pay_as_you_go = merge_typed_results(request_results, TYPE_PAY_AS_YOU_GO)

    if daily_refresh["status"] == STATUS_OK and pay_as_you_go["status"] == STATUS_OK:
        status = STATUS_OK
    elif daily_refresh["status"] == STATUS_FAILED and pay_as_you_go["status"] == STATUS_FAILED:
        status = STATUS_FAILED
    else:
        status = STATUS_PARTIAL

    return {
        "status": status,
        TYPE_DAILY_REFRESH: daily_refresh,
        TYPE_PAY_AS_YOU_GO: pay_as_you_go,
        "requests": request_results,
    }


def main():
    request_results = [query_request(request_config) for request_config in REQUESTS]
    print(json.dumps(merge_request_results(request_results), ensure_ascii=False))


if __name__ == "__main__":
    main()
