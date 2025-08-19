-- Initial database schema for Browser AI Agent

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE,
    name VARCHAR(255),
    role VARCHAR(50) NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sessions table
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    browser_state JSONB,
    conversation_history JSONB DEFAULT '[]'::jsonb,
    preferences JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '1 hour')
);

-- Action logs table
CREATE TABLE action_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    action_type VARCHAR(100) NOT NULL,
    target_url VARCHAR(500),
    action_data JSONB NOT NULL,
    result JSONB,
    success BOOLEAN DEFAULT false,
    execution_time INTEGER, -- milliseconds
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Automation history table
CREATE TABLE automation_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    automation_id VARCHAR(255) NOT NULL,
    plan JSONB NOT NULL,
    status VARCHAR(50) NOT NULL,
    current_step INTEGER DEFAULT 0,
    total_steps INTEGER NOT NULL,
    results JSONB DEFAULT '[]'::jsonb,
    error_info JSONB,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_created_at ON sessions(created_at);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX idx_sessions_last_activity ON sessions(last_activity);

CREATE INDEX idx_action_logs_session_id ON action_logs(session_id);
CREATE INDEX idx_action_logs_executed_at ON action_logs(executed_at);
CREATE INDEX idx_action_logs_action_type ON action_logs(action_type);
CREATE INDEX idx_action_logs_success ON action_logs(success);

CREATE INDEX idx_automation_history_session_id ON automation_history(session_id);
CREATE INDEX idx_automation_history_automation_id ON automation_history(automation_id);
CREATE INDEX idx_automation_history_status ON automation_history(status);
CREATE INDEX idx_automation_history_started_at ON automation_history(started_at);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for users table
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create function to update last_activity on sessions
CREATE OR REPLACE FUNCTION update_session_activity()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE sessions 
    SET last_activity = NOW() 
    WHERE id = NEW.session_id;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to update session activity when actions are logged
CREATE TRIGGER update_session_activity_trigger
    AFTER INSERT ON action_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_session_activity();

-- Create function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM sessions WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ language 'plpgsql';

-- Insert default admin user (optional)
INSERT INTO users (email, name, role) 
VALUES ('admin@browser-ai-agent.com', 'Admin User', 'admin')
ON CONFLICT (email) DO NOTHING;