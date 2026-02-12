<template>
  <!-- Vue 3 对话组件示例 -->
  <div class="etl-chat-widget">
    <!-- 头部 -->
    <div class="chat-header">
      <h3 class="title">{{ title }}</h3>
      <p class="subtitle">{{ subtitle }}</p>
      <div v-if="sessionId" class="session-info">
        <span class="session-id">会话: {{ sessionId.slice(0, 8) }}...</span>
        <span class="phase-badge" :style="phaseStyle">{{ phaseLabel }}</span>
      </div>
    </div>

    <!-- 完成状态 -->
    <div v-if="isComplete" class="status-bar success">
      ✅ Pipeline 已生成完成
    </div>

    <!-- 消息列表 -->
    <div class="messages-container" ref="messagesContainer">
      <div
        v-for="(msg, index) in messages"
        :key="index"
        :class="['message', msg.role, { error: msg.isError }]"
      >
        <div class="message-content" v-html="formatMessage(msg.content)"></div>
        <div v-if="msg.pipelineFile" class="pipeline-badge">
          📁 Pipeline 已保存
        </div>
      </div>
      
      <!-- 加载中 -->
      <div v-if="isLoading" class="message bot">
        <span>思考中...</span>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="input-container">
      <input
        v-model="inputValue"
        @keyup.enter="sendMessage"
        :placeholder="isComplete ? '会话已完成' : '输入你的需求...'
        :disabled="isLoading || isComplete"
        class="message-input"
      />
      <button
        @click="sendMessage"
        :disabled="isLoading || !inputValue.trim() || isComplete"
        class="send-button"
      >
        {{ isLoading ? '发送中...' : '发送' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';

const props = defineProps({
  apiBaseUrl: {
    type: String,
    default: '/api/chat'
  },
  userId: {
    type: String,
    default: 'anonymous'
  },
  title: {
    type: String,
    default: '🤖 ETL 智能助手'
  },
  subtitle: {
    type: String,
    default: '告诉我你的数据处理需求'
  }
});

// 状态
const messages = ref([]);
const inputValue = ref('');
const isLoading = ref(false);
const sessionId = ref(null);
const phase = ref('INITIAL');
const isComplete = ref(false);
const messagesContainer = ref(null);

// 阶段配置
const phaseConfig = {
  INITIAL: { label: '初始', color: '#6c757d' },
  PROPOSING: { label: '方案', color: '#007bff' },
  COLLECTING: { label: '收集', color: '#ffc107' },
  CONFIRMING: { label: '确认', color: '#17a2b8' },
  COMPLETED: { label: '完成', color: '#28a745' },
};

const phaseLabel = computed(() => phaseConfig[phase.value]?.label || '未知');
const phaseStyle = computed(() => ({
  backgroundColor: phaseConfig[phase.value]?.color + '20',
  color: phaseConfig[phase.value]?.color,
}));

// 初始化
onMounted(() => {
  createSession();
});

// 创建会话
const createSession = async () => {
  try {
    const response = await fetch(`${props.apiBaseUrl}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: props.userId }),
    });
    
    const data = await response.json();
    if (data.success) {
      sessionId.value = data.sessionId;
      messages.value.push({
        role: 'assistant',
        content: '你好！我是 ETL 智能助手。请描述你的数据处理需求，例如：\n• "把CSV文件导入MySQL数据库"\n• "从PostgreSQL导出数据到CSV"',
        timestamp: Date.now(),
      });
    }
  } catch (error) {
    console.error('创建会话失败:', error);
    messages.value.push({
      role: 'assistant',
      content: '抱歉，连接服务失败，请稍后重试。',
      timestamp: Date.now(),
    });
  }
};

// 发送消息
const sendMessage = async () => {
  const userMessage = inputValue.value.trim();
  if (!userMessage || !sessionId.value || isLoading.value) return;

  inputValue.value = '';
  isLoading.value = true;

  // 添加用户消息
  messages.value.push({
    role: 'user',
    content: userMessage,
    timestamp: Date.now(),
  });

  scrollToBottom();

  try {
    const response = await fetch(`${props.apiBaseUrl}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: sessionId.value,
        message: userMessage,
        userId: props.userId,
      }),
    });

    const data = await response.json();
    
    if (data.success) {
      const { response: botResponse, phase: newPhase, isComplete: complete, pipelineFile } = data.data;
      
      phase.value = newPhase;
      isComplete.value = complete;
      
      messages.value.push({
        role: 'assistant',
        content: botResponse,
        timestamp: Date.now(),
        pipelineFile,
      });
    } else {
      throw new Error(data.error);
    }
  } catch (error) {
    messages.value.push({
      role: 'assistant',
      content: '抱歉，处理消息时出现错误，请重试。',
      timestamp: Date.now(),
      isError: true,
    });
  } finally {
    isLoading.value = false;
    scrollToBottom();
  }
};

// 滚动到底部
const scrollToBottom = () => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }
  });
};

// 格式化消息
const formatMessage = (content) => {
  return content.replace(/\n/g, '<br>');
};
</script>

<style scoped>
.etl-chat-widget {
  width: 100%;
  max-width: 600px;
  height: 700px;
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  background-color: #fff;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.chat-header {
  padding: 16px 20px;
  border-bottom: 1px solid #e0e0e0;
  background-color: #f8f9fa;
  border-radius: 12px 12px 0 0;
}

.title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1a1a1a;
}

.subtitle {
  margin: 4px 0 0 0;
  font-size: 13px;
  color: #666;
}

.session-info {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.session-id {
  font-size: 11px;
  color: #999;
}

.phase-badge {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
}

.status-bar {
  padding: 8px 16px;
  font-size: 12px;
  text-align: center;
}

.status-bar.success {
  background-color: #d4edda;
  color: #155724;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message {
  max-width: 85%;
  padding: 12px 16px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.6;
  word-wrap: break-word;
}

.message.user {
  align-self: flex-end;
  background-color: #007bff;
  color: #fff;
  border-bottom-right-radius: 4px;
}

.message.bot {
  align-self: flex-start;
  background-color: #f1f3f4;
  color: #1a1a1a;
  border-bottom-left-radius: 4px;
}

.message.error {
  background-color: #f8d7da;
  color: #721c24;
}

.pipeline-badge {
  display: inline-block;
  padding: 4px 8px;
  background-color: #28a745;
  color: #fff;
  border-radius: 4px;
  font-size: 12px;
  margin-top: 8px;
}

.input-container {
  padding: 16px 20px;
  border-top: 1px solid #e0e0e0;
  display: flex;
  gap: 12px;
}

.message-input {
  flex: 1;
  padding: 12px 16px;
  border: 1px solid #ddd;
  border-radius: 24px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.message-input:focus {
  border-color: #007bff;
}

.send-button {
  padding: 12px 24px;
  background-color: #007bff;
  color: #fff;
  border: none;
  border-radius: 24px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
}

.send-button:hover:not(:disabled) {
  background-color: #0056b3;
}

.send-button:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}
</style>
