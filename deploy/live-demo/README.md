# Live demo: a public URL in front of the AgentCore Runtime

The browser can't sign AWS requests, so it can't call the AgentCore Runtime directly. This folder is
the small proxy that closes that gap: one AWS Lambda function with a public function URL.

```
browser ──► Lambda function URL (handler.py) ──► InvokeAgentRuntime: credential_bridge ──► Strands agent ──► Claude
```

- `GET /` serves the static frontend from the repo root. `build.sh` bundles it, sets `agent.js` to
  call this same origin, and adds a disclosure banner.
- `POST /reason` validates the body, takes one unit of quota, invokes the runtime, and returns its
  reply (the `/reason` contract) unchanged.
- **Usage cap.** Every call is a real, billed model call, so a DynamoDB counter (`credbridge-demo-quota`)
  allows at most `TOTAL_LIMIT` calls overall (default 150) and `DAILY_LIMIT` per UTC day (default 40).
  Past either limit the page shows a "usage limit reached" message.

**Model provider during judging.** Bedrock model access on our account is suspended pending review,
so the runtime runs with `CREDBRIDGE_PROVIDER=anthropic`: the same Strands agent and tools, with
Claude Sonnet 4.6 served through the Anthropic API. The page's banner says so. Setting
`CREDBRIDGE_PROVIDER=bedrock` on the runtime switches it back with no code change.

## Deploy (us-west-2)
Needs an IAM role for Lambda with `logs:*` on its own log group, `bedrock-agentcore:InvokeAgentRuntime`
on the runtime ARN (and `/*`), and `dynamodb:UpdateItem` on the quota table.

```bash
aws dynamodb create-table --table-name credbridge-demo-quota \
  --attribute-definitions AttributeName=pk,AttributeType=S --key-schema AttributeName=pk,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
./build.sh
aws lambda create-function --function-name credbridge-live-demo --runtime python3.13 --architectures arm64 \
  --handler handler.handler --role <role-arn> --zip-file fileb://live-demo.zip --timeout 300 --memory-size 256 \
  --environment 'Variables={RUNTIME_ARN=<runtime-arn>,QUOTA_TABLE=credbridge-demo-quota,TOTAL_LIMIT=150,DAILY_LIMIT=40}'
aws lambda add-permission --function-name credbridge-live-demo --statement-id public-url \
  --action lambda:InvokeFunctionUrl --principal '*' --function-url-auth-type NONE
aws lambda create-function-url-config --function-name credbridge-live-demo --auth-type NONE
```

Teardown: `aws lambda delete-function --function-name credbridge-live-demo` and
`aws dynamodb delete-table --table-name credbridge-demo-quota`.
