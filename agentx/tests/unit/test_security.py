from agentx.security import SecurityManager

def test_sanitize_and_allow():
    sm = SecurityManager(allowed_domains=['example.com'])  # explicit
    assert sm.sanitize_input('<script>alert(1)</script>') == 'scriptalert(1)/script'
    assert sm.is_domain_allowed('https://sub.example.com/path')
