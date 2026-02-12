/**
 * React 对话组件示例
 * 可嵌入第三方应用的聊天窗口
 */

import React, { useState, useRef, useEffect } from 'react';

// 样式（可使用 CSS-in-JS 或单独 CSS 文件）
const styles = {
  chatContainer: {
    width: '100%',
    maxWidth: '600px',
    height: '700px',
    border: '1px solid #e0e0e0',
    borderRadius: '12px',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#fff',
    boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    padding: '16px 20px',
    borderBottom: '1px solid #e0e0e0',
    backgroundColor: '#f8f9fa',
    borderRadius: '12px 12px 0 0',
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 600,
    color: '#1a1a1a',
  },
  subtitle: {
    margin: '4px 0 0 0',
    fontSize: '13px',
    color: '#666',
  },
  messagesContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  message: {
    maxWidth: '85%',
    padding: '12px 16px',
    borderRadius: '12px',
    fontSize: '14px',
    lineHeight: 1.6,
    wordWrap: 'break-word',
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#007bff',
    color: '#fff',
    borderBottomRightRadius: '4px',
  },
  botMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#f1f3f4',
    color: '#1a1a1a',
    borderBottomLeftRadius: '4px',
  },
  inputContainer: {
    padding: '16px 20px',
    borderTop: '1px solid #e0e0e0',
    display: 'flex',
    gap: '12px',
  },
  input: {
    flex: 1,
    padding: '12px 16px',
    border: '1px solid #ddd',
    borderRadius: '24px',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  sendButton: {
    padding: '12px 24px',
    backgroundColor: '#007bff',
    color: '#fff',
    border: 'none',
    borderRadius: '24px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
    cursor: 'not-allowed',
  },
  status: {
    padding: '8px 16px',
    fontSize: '12px',
    color: '#666',
    textAlign: 'center',
    backgroundColor: '#f8f9fa',
  },
  pipelineBadge: {
    display: 'inline-block',
    padding: '4px 8px',
    backgroundColor: '#28a745',
    color: '#fff',
    borderRadius: '4px',
    fontSize: '12px',
    marginTop: '8px',
  },
  phaseIndicator: {
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: 500,
    textTransform: 'uppercase',
  },
};

// 阶段颜色映射
const phaseColors = {
  INITIAL: '#6c757d',
  PROPOSING: '#007bff',
  COLLECTING: '#ffc107',
  CONFIRMING: '#17a2b8',
  COMPLETED: '#28a745',
};

// 阶段中文映射
const phaseLabels = {
  INITIAL: '初始',
  PROPOSING: '方案',
  COLLECTING: '收集',
  CONFIRMING: '确认',
  COMPLETED: '完成',
};

function ETLChatWidget({ 
  apiBaseUrl = '/api/chat',
  userId = 'anonymous',
  title = '🤖 ETL 智能助手',
  subtitle = '告诉我你的数据处理需求'
}) {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [phase, setPhase] = useState('INITIAL');
  const [isComplete, setIsComplete] = useState(false);
  const messagesEndRef = useRef(null);

  // 初始化会话
  useEffect(() => {
    createSession();
  }, []);

  // 自动滚动到底部
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const createSession = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      
      const data = await response.json();
      if (data.success) {
        setSessionId(data.sessionId);
        // 添加欢迎消息
        setMessages([{
          role: 'assistant',
          content: '你好！我是 ETL 智能助手。请描述你的数据处理需求，例如：\n• "把CSV文件导入MySQL数据库"\n• "从PostgreSQL导出数据到CSV"',
          timestamp: Date.now(),
        }]);
      }
    } catch (error) {
      console.error('创建会话失败:', error);
      setMessages([{
        role: 'assistant',
        content: '抱歉，连接服务失败，请稍后重试。',
        timestamp: Date.now(),
      }]);
    }
  };

  const sendMessage = async () => {
    if (!inputValue.trim() || !sessionId || isLoading) return;

    const userMessage = inputValue.trim();
    setInputValue('');
    setIsLoading(true);

    // 添加用户消息
    setMessages(prev => [...prev, {
      role: 'user',
      content: userMessage,
      timestamp: Date.now(),
    }]);

    try {
      const response = await fetch(`${apiBaseUrl}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: userMessage,
          userId,
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        const { response: botResponse, phase: newPhase, isComplete: complete, pipelineFile } = data.data;
        
        setPhase(newPhase);
        setIsComplete(complete);
        
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: botResponse,
          timestamp: Date.now(),
          pipelineFile,
          phase: newPhase,
        }]);
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '抱歉，处理消息时出现错误，请重试。',
        timestamp: Date.now(),
        isError: true,
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // 格式化消息内容（支持换行）
  const formatMessage = (content) => {
    return content.split('\n').map((line, i) => (
      <span key={i}>
        {line}
        {i < content.split('\n').length - 1 && <br />}
      </span>
    ));
  };

  return (
    <div style={styles.chatContainer}>
      {/* 头部 */}
      <div style={styles.header}>
        <h3 style={styles.title}>{title}</h3>
        <p style={styles.subtitle}>{subtitle}</p>
        {sessionId && (
          <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: '#999' }}>
              会话: {sessionId.slice(0, 8)}...
            </span>
            <span style={{
              ...styles.phaseIndicator,
              backgroundColor: phaseColors[phase] + '20',
              color: phaseColors[phase],
            }}>
              {phaseLabels[phase]}
            </span>
          </div>
        )}
      </div>

      {/* 状态栏 */}
      {isComplete && (
        <div style={{ ...styles.status, backgroundColor: '#d4edda', color: '#155724' }}>
          ✅ Pipeline 已生成完成
        </div>
      )}

      {/* 消息列表 */}
      <div style={styles.messagesContainer}>
        {messages.map((msg, index) => (
          <div
            key={index}
            style={{
              ...styles.message,
              ...(msg.role === 'user' ? styles.userMessage : styles.botMessage),
              ...(msg.isError ? { backgroundColor: '#f8d7da', color: '#721c24' } : {}),
            }}
          >
            {formatMessage(msg.content)}
            {msg.pipelineFile && (
              <div style={styles.pipelineBadge}>
                📁 Pipeline 已保存
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div style={{ ...styles.message, ...styles.botMessage }}>
            <span>思考中</span>
            <span className="typing-indicator">...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <div style={styles.inputContainer}>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={isComplete ? '会话已完成，可以开始新的对话' : '输入你的需求...'}
          style={styles.input}
          disabled={isLoading || isComplete}
        />
        <button
          onClick={sendMessage}
          disabled={isLoading || !inputValue.trim() || isComplete}
          style={{
            ...styles.sendButton,
            ...(isLoading || !inputValue.trim() || isComplete ? styles.sendButtonDisabled : {}),
          }}
        >
          {isLoading ? '发送中...' : '发送'}
        </button>
      </div>
    </div>
  );
}

export default ETLChatWidget;
