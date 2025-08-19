-- Enhanced Session Management Schema
-- Migration 002: Add advanced session features

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_last_activity ON sessions(last_activity);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- Add session analytics table
CREATE TABLE IF NOT EXISTS session_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    duration_ms BIGINT NOT NULL DEFAULT 0,
    page_views INTEGER NOT NULL DEFAULT 0,
    automation_count INTEGER NOT NULL DEFAULT 0,
    message_count INTEGER NOT NULL DEFAULT 0,
    device_switches INTEGER NOT NULL DEFAULT 0,
    most_visited_domains JSONB DEFAULT '[]',
    activity_timeline JSONB DEFAULT '[]',
    performance_metrics JSONB DEFAULT '{}',
    user_behavior JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add session sync events table
CREATE TABLE IF NOT EXISTS session_sync_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    device_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('create', 'update', 'delete')),
    event_data JSONB NOT NULL DEFAULT '{}',
    version INTEGER NOT NULL DEFAULT 1,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add session conflicts table
CREATE TABLE IF NOT EXISTS session_conflicts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    conflict_type VARCHAR(50) NOT NULL,
    local_version INTEGER NOT NULL,
    remote_version INTEGER NOT NULL,
    local_data JSONB NOT NULL DEFAULT '{}',
    remote_data JSONB NOT NULL DEFAULT '{}',
    resolution_status VARCHAR(50) DEFAULT 'pending' CHECK (resolution_status IN ('pending', 'resolved', 'ignored')),
    resolution_strategy VARCHAR(50),
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add device sync tracking table
CREATE TABLE IF NOT EXISTS device_sync (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id VARCHAR(255) NOT NULL UNIQUE,
    device_info JSONB NOT NULL DEFAULT '{}',
    last_sync_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sync_version INTEGER NOT NULL DEFAULT 0,
    conflict_count INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'disconnected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add session exports table
CREATE TABLE IF NOT EXISTS session_exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    export_id VARCHAR(255) NOT NULL UNIQUE,
    user_id VARCHAR(255),
    session_ids UUID[] DEFAULT '{}',
    file_path TEXT NOT NULL,
    file_size BIGINT NOT NULL DEFAULT 0,
    session_count INTEGER NOT NULL DEFAULT 0,
    format VARCHAR(50) NOT NULL,
    compression VARCHAR(50) NOT NULL DEFAULT 'none',
    options JSONB DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    checksum VARCHAR(255),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Add session backups table
CREATE TABLE IF NOT EXISTS session_backups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    backup_id VARCHAR(255) NOT NULL UNIQUE,
    session_id UUID NOT NULL,
    backup_data JSONB NOT NULL,
    backup_type VARCHAR(50) DEFAULT 'automatic' CHECK (backup_type IN ('automatic', 'manual', 'export')),
    compression VARCHAR(50) DEFAULT 'gzip',
    file_size BIGINT,
    checksum VARCHAR(255),
    retention_days INTEGER DEFAULT 30,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 days')
);

-- Add session metrics aggregation table
CREATE TABLE IF NOT EXISTS session_metrics_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    total_sessions INTEGER NOT NULL DEFAULT 0,
    active_sessions INTEGER NOT NULL DEFAULT 0,
    new_sessions INTEGER NOT NULL DEFAULT 0,
    unique_users INTEGER NOT NULL DEFAULT 0,
    average_duration_ms BIGINT NOT NULL DEFAULT 0,
    total_page_views INTEGER NOT NULL DEFAULT 0,
    total_automations INTEGER NOT NULL DEFAULT 0,
    total_messages INTEGER NOT NULL DEFAULT 0,
    device_breakdown JSONB DEFAULT '{}',
    browser_breakdown JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(date)
);

-- Add indexes for new tables
CREATE INDEX IF NOT EXISTS idx_session_analytics_session_id ON session_analytics(session_id);
CREATE INDEX IF NOT EXISTS idx_session_analytics_created_at ON session_analytics(created_at);

CREATE INDEX IF NOT EXISTS idx_session_sync_events_session_id ON session_sync_events(session_id);
CREATE INDEX IF NOT EXISTS idx_session_sync_events_device_id ON session_sync_events(device_id);
CREATE INDEX IF NOT EXISTS idx_session_sync_events_timestamp ON session_sync_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_session_sync_events_processed ON session_sync_events(processed);

CREATE INDEX IF NOT EXISTS idx_session_conflicts_session_id ON session_conflicts(session_id);
CREATE INDEX IF NOT EXISTS idx_session_conflicts_status ON session_conflicts(resolution_status);
CREATE INDEX IF NOT EXISTS idx_session_conflicts_created_at ON session_conflicts(created_at);

CREATE INDEX IF NOT EXISTS idx_device_sync_device_id ON device_sync(device_id);
CREATE INDEX IF NOT EXISTS idx_device_sync_status ON device_sync(status);
CREATE INDEX IF NOT EXISTS idx_device_sync_last_sync ON device_sync(last_sync_time);

CREATE INDEX IF NOT EXISTS idx_session_exports_export_id ON session_exports(export_id);
CREATE INDEX IF NOT EXISTS idx_session_exports_user_id ON session_exports(user_id);
CREATE INDEX IF NOT EXISTS idx_session_exports_status ON session_exports(status);
CREATE INDEX IF NOT EXISTS idx_session_exports_created_at ON session_exports(created_at);

CREATE INDEX IF NOT EXISTS idx_session_backups_session_id ON session_backups(session_id);
CREATE INDEX IF NOT EXISTS idx_session_backups_backup_id ON session_backups(backup_id);
CREATE INDEX IF NOT EXISTS idx_session_backups_expires_at ON session_backups(expires_at);

CREATE INDEX IF NOT EXISTS idx_session_metrics_daily_date ON session_metrics_daily(date);

-- Add triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_session_analytics_updated_at 
    BEFORE UPDATE ON session_analytics 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_device_sync_updated_at 
    BEFORE UPDATE ON device_sync 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add function to clean up expired data
CREATE OR REPLACE FUNCTION cleanup_expired_session_data()
RETURNS INTEGER AS $$
DECLARE
    cleanup_count INTEGER := 0;
BEGIN
    -- Clean up expired session backups
    DELETE FROM session_backups WHERE expires_at < NOW();
    GET DIAGNOSTICS cleanup_count = ROW_COUNT;
    
    -- Clean up old sync events (older than 7 days)
    DELETE FROM session_sync_events 
    WHERE created_at < NOW() - INTERVAL '7 days' AND processed = true;
    
    -- Clean up resolved conflicts (older than 30 days)
    DELETE FROM session_conflicts 
    WHERE resolution_status = 'resolved' AND resolved_at < NOW() - INTERVAL '30 days';
    
    -- Clean up old export records (older than 90 days)
    DELETE FROM session_exports 
    WHERE status = 'completed' AND completed_at < NOW() - INTERVAL '90 days';
    
    RETURN cleanup_count;
END;
$$ LANGUAGE plpgsql;

-- Add function to calculate daily metrics
CREATE OR REPLACE FUNCTION calculate_daily_session_metrics(target_date DATE DEFAULT CURRENT_DATE)
RETURNS VOID AS $$
DECLARE
    metrics_record RECORD;
BEGIN
    -- Calculate metrics for the target date
    SELECT 
        COUNT(*) as total_sessions,
        COUNT(CASE WHEN last_activity >= target_date AND last_activity < target_date + INTERVAL '1 day' THEN 1 END) as active_sessions,
        COUNT(CASE WHEN created_at >= target_date AND created_at < target_date + INTERVAL '1 day' THEN 1 END) as new_sessions,
        COUNT(DISTINCT user_id) as unique_users,
        COALESCE(AVG(EXTRACT(EPOCH FROM (last_activity - created_at)) * 1000), 0)::BIGINT as average_duration_ms
    INTO metrics_record
    FROM sessions 
    WHERE created_at >= target_date AND created_at < target_date + INTERVAL '1 day';
    
    -- Insert or update daily metrics
    INSERT INTO session_metrics_daily (
        date, 
        total_sessions, 
        active_sessions, 
        new_sessions, 
        unique_users, 
        average_duration_ms
    ) VALUES (
        target_date,
        metrics_record.total_sessions,
        metrics_record.active_sessions,
        metrics_record.new_sessions,
        metrics_record.unique_users,
        metrics_record.average_duration_ms
    )
    ON CONFLICT (date) DO UPDATE SET
        total_sessions = EXCLUDED.total_sessions,
        active_sessions = EXCLUDED.active_sessions,
        new_sessions = EXCLUDED.new_sessions,
        unique_users = EXCLUDED.unique_users,
        average_duration_ms = EXCLUDED.average_duration_ms,
        created_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Add function to get session analytics
CREATE OR REPLACE FUNCTION get_session_analytics(p_session_id UUID)
RETURNS TABLE (
    session_id UUID,
    duration_ms BIGINT,
    page_views INTEGER,
    automation_count INTEGER,
    message_count INTEGER,
    device_switches INTEGER,
    most_visited_domains JSONB,
    activity_timeline JSONB,
    performance_metrics JSONB,
    user_behavior JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sa.session_id,
        sa.duration_ms,
        sa.page_views,
        sa.automation_count,
        sa.message_count,
        sa.device_switches,
        sa.most_visited_domains,
        sa.activity_timeline,
        sa.performance_metrics,
        sa.user_behavior
    FROM session_analytics sa
    WHERE sa.session_id = p_session_id;
END;
$$ LANGUAGE plpgsql;

-- Add function to get aggregated session metrics
CREATE OR REPLACE FUNCTION get_aggregated_session_metrics(
    start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    total_sessions BIGINT,
    total_users BIGINT,
    average_session_duration_ms BIGINT,
    daily_active_users BIGINT,
    weekly_active_users BIGINT,
    monthly_active_users BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::BIGINT as total_sessions,
        COUNT(DISTINCT s.user_id)::BIGINT as total_users,
        COALESCE(AVG(EXTRACT(EPOCH FROM (s.last_activity - s.created_at)) * 1000), 0)::BIGINT as average_session_duration_ms,
        COUNT(DISTINCT CASE WHEN s.last_activity >= CURRENT_DATE THEN s.user_id END)::BIGINT as daily_active_users,
        COUNT(DISTINCT CASE WHEN s.last_activity >= CURRENT_DATE - INTERVAL '7 days' THEN s.user_id END)::BIGINT as weekly_active_users,
        COUNT(DISTINCT CASE WHEN s.last_activity >= CURRENT_DATE - INTERVAL '30 days' THEN s.user_id END)::BIGINT as monthly_active_users
    FROM sessions s
    WHERE s.created_at >= start_date AND s.created_at <= end_date + INTERVAL '1 day';
END;
$$ LANGUAGE plpgsql;

-- Create a view for active sessions
CREATE OR REPLACE VIEW active_sessions AS
SELECT 
    s.*,
    EXTRACT(EPOCH FROM (NOW() - s.last_activity)) as seconds_since_activity,
    CASE 
        WHEN s.expires_at > NOW() THEN 'active'
        ELSE 'expired'
    END as status
FROM sessions s
WHERE s.expires_at > NOW() - INTERVAL '1 hour'; -- Include recently expired for grace period

-- Create a view for session summary
CREATE OR REPLACE VIEW session_summary AS
SELECT 
    s.id,
    s.user_id,
    s.created_at,
    s.last_activity,
    s.expires_at,
    EXTRACT(EPOCH FROM (s.last_activity - s.created_at)) * 1000 as duration_ms,
    COALESCE(sa.page_views, 0) as page_views,
    COALESCE(sa.automation_count, 0) as automation_count,
    COALESCE(sa.message_count, 0) as message_count,
    COALESCE(jsonb_array_length(s.conversation_history), 0) as conversation_length,
    s.metadata->>'source' as source,
    s.metadata->'device'->>'type' as device_type,
    s.metadata->'device'->>'browser' as browser
FROM sessions s
LEFT JOIN session_analytics sa ON s.id = sa.session_id;

-- Add comments for documentation
COMMENT ON TABLE session_analytics IS 'Stores detailed analytics data for each session';
COMMENT ON TABLE session_sync_events IS 'Tracks synchronization events between devices';
COMMENT ON TABLE session_conflicts IS 'Records and tracks resolution of sync conflicts';
COMMENT ON TABLE device_sync IS 'Manages device synchronization state and metadata';
COMMENT ON TABLE session_exports IS 'Tracks session data export operations';
COMMENT ON TABLE session_backups IS 'Stores session backup metadata and retention info';
COMMENT ON TABLE session_metrics_daily IS 'Daily aggregated session metrics for reporting';

COMMENT ON FUNCTION cleanup_expired_session_data() IS 'Cleans up expired session-related data';
COMMENT ON FUNCTION calculate_daily_session_metrics(DATE) IS 'Calculates and stores daily session metrics';
COMMENT ON FUNCTION get_session_analytics(UUID) IS 'Retrieves analytics data for a specific session';
COMMENT ON FUNCTION get_aggregated_session_metrics(DATE, DATE) IS 'Gets aggregated metrics for a date range';

COMMENT ON VIEW active_sessions IS 'Shows currently active sessions with status information';
COMMENT ON VIEW session_summary IS 'Provides a summary view of sessions with key metrics';