from agentx.planner.task_planner import TaskPlanner

def test_planner_basic():
    p = TaskPlanner()
    analysis = p.analyze('Research Playwright', '')
    plan = p.plan('Visit example.com and read title', '')
    assert isinstance(analysis, str)
    assert isinstance(plan, list) and len(plan) >= 1
