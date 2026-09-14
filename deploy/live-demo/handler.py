"""Public live demo: one Lambda function URL in front of the AgentCore Runtime.

GET  /, /*.js, /*.css  -> the static frontend (bundled by build.sh, pointed at this same origin)
POST /reason           -> quota check, then InvokeAgentRuntime on credential_bridge; the
                          runtime's reply (the /reason contract) is returned unchanged.

The browser can't sign AWS requests, so this function is the "small authenticated proxy"
the README's roadmap calls for. A DynamoDB counter caps total and per-day agent calls,
because every call is a real, billed model call.
"""
import base64
import datetime
import json
import os
import uuid

import boto3
from botocore.config import Config

RUNTIME_ARN = os.environ["RUNTIME_ARN"]
QUOTA_TABLE = os.environ["QUOTA_TABLE"]
TOTAL_LIMIT = int(os.environ.get("TOTAL_LIMIT", "150"))
DAILY_LIMIT = int(os.environ.get("DAILY_LIMIT", "40"))
EVENTS = {"build_pathway", "simulate_delay", "simulate_rejection", "reset"}
MAX_BODY = 64 * 1024

# Delay/rejection calls can take ~100 s; the default 60 s read timeout would cut them off.
_agentcore = boto3.client("bedrock-agentcore",
                          config=Config(read_timeout=290, connect_timeout=10, retries={"max_attempts": 1}))
_ddb = boto3.client("dynamodb")

STATIC = os.path.join(os.path.dirname(__file__), "static")
FILES = {"/": "index.html", "/index.html": "index.html", "/styles.css": "styles.css",
         "/app.js": "app.js", "/agent.js": "agent.js", "/pathways.js": "pathways.js"}
TYPES = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
         ".js": "application/javascript; charset=utf-8"}


def _resp(status, body, ctype="application/json"):
    return {"statusCode": status,
            "headers": {"content-type": ctype, "cache-control": "no-store",
                        "x-content-type-options": "nosniff"},
            "body": body if isinstance(body, str) else json.dumps(body)}


def _bump(pk, limit):
    """Atomically add 1 to a counter unless it has reached `limit`. True if counted."""
    try:
        _ddb.update_item(TableName=QUOTA_TABLE, Key={"pk": {"S": pk}},
                         UpdateExpression="ADD n :one",
                         ConditionExpression="attribute_not_exists(n) OR n < :lim",
                         ExpressionAttributeValues={":one": {"N": "1"}, ":lim": {"N": str(limit)}})
        return True
    except _ddb.exceptions.ConditionalCheckFailedException:
        return False


def _take_quota():
    """None if this call may run, otherwise the message to show."""
    day = "day#" + datetime.datetime.now(datetime.timezone.utc).date().isoformat()
    if not _bump(day, DAILY_LIMIT):
        return ("The live demo has reached today's usage limit. Please try again tomorrow (UTC), "
                "or watch the demo video.")
    if not _bump("total", TOTAL_LIMIT):
        _ddb.update_item(TableName=QUOTA_TABLE, Key={"pk": {"S": day}},
                         UpdateExpression="ADD n :m", ExpressionAttributeValues={":m": {"N": "-1"}})
        return ("The live demo has reached its overall usage limit. Please watch the demo video, "
                "or run the project locally (see the README).")
    return None


def handler(event, context):
    method = event.get("requestContext", {}).get("http", {}).get("method", "GET")
    path = event.get("rawPath", "/")

    if method == "GET":
        name = FILES.get(path)
        if not name:
            return _resp(404, {"detail": "Not found."})
        with open(os.path.join(STATIC, name), encoding="utf-8") as f:
            return _resp(200, f.read(), TYPES[os.path.splitext(name)[1]])

    if method == "POST" and path == "/reason":
        raw = event.get("body") or ""
        if event.get("isBase64Encoded"):
            raw = base64.b64decode(raw).decode("utf-8", "replace")
        if len(raw) > MAX_BODY:
            return _resp(413, {"detail": "Request too large."})
        try:
            req = json.loads(raw)
        except ValueError:
            return _resp(400, {"detail": "Body must be JSON."})
        if not isinstance(req, dict) or req.get("event") not in EVENTS or not isinstance(req.get("profile"), dict):
            return _resp(400, {"detail": "Not a /reason request."})

        refusal = _take_quota()
        if refusal:
            return _resp(429, {"detail": refusal})
        try:
            r = _agentcore.invoke_agent_runtime(
                agentRuntimeArn=RUNTIME_ARN,
                runtimeSessionId="demo-" + uuid.uuid4().hex + uuid.uuid4().hex[:8],  # must be >= 33 chars
                payload=json.dumps(req).encode("utf-8"),
                contentType="application/json", accept="application/json")
            return _resp(200, r["response"].read().decode("utf-8"))
        except Exception as e:  # the runtime's own error text isn't shown to the public
            print("invoke failed:", repr(e))
            return _resp(502, {"detail": "The agent could not complete this request. Please try again."})

    return _resp(405, {"detail": "Method not allowed."})
