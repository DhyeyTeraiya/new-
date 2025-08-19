from __future__ import annotations
import argparse
from .agents.base_agent import BaseAgent
from .agents.orchestrator import MultiAgentRunner, OrchestratorConfig


def main():
    parser = argparse.ArgumentParser(description='AgentX: Analyze → Plan → Execute → Observe')
    parser.add_argument('--goal', type=str, required=True, help='High-level goal for the agent')
    parser.add_argument('--allow-domain', action='append', default=[], help='Allow navigation to domain (repeatable)')
    parser.add_argument('--no-multi', action='store_true', help='Disable multi-agent and use base agent only')
    parser.add_argument('--headless', action='store_true', help='Run browser headless')
    parser.add_argument('--show', action='store_true', help='Run browser visible (overrides --headless)')
    parser.add_argument('--screenshots', type=str, default='', help='Directory to save screenshots')
    parser.add_argument('--downloads', type=str, default='', help='Directory to save downloads')
    args = parser.parse_args()

    headless = args.headless or not args.show
    cfg = OrchestratorConfig(
        headless=headless,
        screenshots_dir=args.screenshots or None,
        downloads_dir=args.downloads or None,
    )

    if args.no_multi:
        agent = BaseAgent()
        result = agent.run(args.goal, allowed_domains=args.allow_domain)
    else:
        runner = MultiAgentRunner(config=cfg)
        result = runner.run(args.goal, allowed_domains=args.allow_domain)
    print('Run Result:\n', result)

if __name__ == '__main__':
    main()
