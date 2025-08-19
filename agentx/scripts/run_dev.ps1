param(
  [string]$Goal = "Open https://example.com and extract title"
)
python -m agentx.app --goal "$Goal" --allow-domain example.com
