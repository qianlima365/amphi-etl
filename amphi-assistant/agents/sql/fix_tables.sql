-- ============================================================
-- 修复 dialogue_tables 的补丁脚本
-- 如果列不存在则添加
-- ============================================================

-- 检查并添加 user_preferences 表的列
DO $$
BEGIN
    -- 检查 last_used_components 列是否存在
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_preferences' 
        AND column_name = 'last_used_components'
    ) THEN
        ALTER TABLE user_preferences ADD COLUMN last_used_components JSONB NOT NULL DEFAULT '[]';
        RAISE NOTICE 'Added column last_used_components to user_preferences';
    END IF;

    -- 检查其他列是否存在（以防万一）
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_preferences' 
        AND column_name = 'default_params'
    ) THEN
        ALTER TABLE user_preferences ADD COLUMN default_params JSONB NOT NULL DEFAULT '{}';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_preferences' 
        AND column_name = 'frequently_used'
    ) THEN
        ALTER TABLE user_preferences ADD COLUMN frequently_used JSONB NOT NULL DEFAULT '[]';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_preferences' 
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE user_preferences ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
END $$;

-- 如果表不存在则创建完整表
CREATE TABLE IF NOT EXISTS user_preferences (
    user_id VARCHAR(64) PRIMARY KEY,
    default_params JSONB NOT NULL DEFAULT '{}',
    frequently_used JSONB NOT NULL DEFAULT '[]',
    last_used_components JSONB NOT NULL DEFAULT '[]',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 查看表结构确认
\d user_preferences
