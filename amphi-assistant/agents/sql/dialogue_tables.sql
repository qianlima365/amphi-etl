-- ============================================================
-- ETL Agent 对话系统数据库表结构
-- 适用于 PostgreSQL
-- ============================================================

-- 对话会话表
CREATE TABLE IF NOT EXISTS dialogue_sessions (
    id UUID PRIMARY KEY,
    user_id VARCHAR(64),
    context JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 用户偏好表
CREATE TABLE IF NOT EXISTS user_preferences (
    user_id VARCHAR(64) PRIMARY KEY,
    default_params JSONB NOT NULL DEFAULT '{}',
    frequently_used JSONB NOT NULL DEFAULT '[]',
    last_used_components JSONB NOT NULL DEFAULT '[]',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 对话日志表
CREATE TABLE IF NOT EXISTS dialogue_logs (
    id SERIAL PRIMARY KEY,
    session_id UUID NOT NULL,
    user_id VARCHAR(64),
    user_input TEXT NOT NULL,
    intent_type VARCHAR(32) NOT NULL,
    confidence FLOAT NOT NULL DEFAULT 0,
    extracted_config JSONB,
    ai_response TEXT NOT NULL,
    processing_time INTEGER, -- 毫秒
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引优化查询性能
CREATE INDEX IF NOT EXISTS idx_dialogue_sessions_user_id ON dialogue_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_dialogue_sessions_updated_at ON dialogue_sessions(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_dialogue_logs_session_id ON dialogue_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_dialogue_logs_user_id ON dialogue_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_dialogue_logs_created_at ON dialogue_logs(created_at DESC);

-- 注释说明
COMMENT ON TABLE dialogue_sessions IS '存储对话会话的完整上下文';
COMMENT ON TABLE user_preferences IS '存储用户的偏好设置和使用习惯';
COMMENT ON TABLE dialogue_logs IS '记录每次对话的详细日志，用于分析和优化';
