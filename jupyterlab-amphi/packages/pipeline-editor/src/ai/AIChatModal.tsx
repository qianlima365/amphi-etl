import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Modal, Layout, Input, Button, Space, Select, Slider, Upload, Tabs, message, Tooltip, Progress, Tree, Switch } from 'antd';
import { UploadOutlined, CopyOutlined, SendOutlined, ThunderboltOutlined, RobotOutlined, SettingOutlined, EyeOutlined, SaveOutlined } from '@ant-design/icons';
import type { RcFile } from 'antd/es/upload';
import type { DataNode } from 'antd/es/tree';
import { ModelConfig, ChatMessage, Attachment, AmplnSchema, GenerationStep, DEFAULT_PROMPT_TEMPLATE, ModelProvider, UserApiKeyConfig } from './types';
import { AIService } from './AIService';
import { useTheme, getThemeStyles } from './useTheme';

const { Sider, Content } = Layout;
const { TextArea } = Input;

// ============================================================================
// Markdown 渲染组件
// ============================================================================

/**
 * 简单的 Markdown 渲染器
 * 支持：标题、粗体、斜体、代码块、行内代码、列表、链接、引用、分隔线
 */
const MarkdownRenderer: React.FC<{ content: string; className?: string; isNeonTheme?: boolean }> = ({ 
  content, 
  className, 
  isNeonTheme = false 
}) => {
  const html = useMemo(() => {
    if (!content) return '';

    // 去除首尾空白，避免开头空行
    let text = content.trim();

    // 转义 HTML 特殊字符（保护安全性）
    text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // 代码块 (```code```) - 使用主题变量
    text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, _lang, code) => {
      return `<pre style="background:var(--jp-layout-color2,#1e1e1e);color:var(--jp-ui-font-color0,#d4d4d4);padding:12px;border-radius:6px;overflow-x:auto;font-size:12px;margin:8px 0;white-space:pre-wrap;word-break:break-word;"><code>${code.trim()}</code></pre>`;
    });

    // 行内代码 (`code`) - 使用主题变量
    text = text.replace(/`([^`\n]+)`/g, '<code style="background:var(--jp-layout-color1,#f0f0f0);padding:2px 6px;border-radius:3px;font-size:12px;color:var(--jp-ui-font-color0,#333);">$1</code>');

    // 标题 (### ## #) - 使用主题文字色
    text = text.replace(/^### (.+)$/gm, '<h4 style="font-size:14px;font-weight:600;margin:12px 0 8px 0;color:var(--jp-ui-font-color0,#333);">$1</h4>');
    text = text.replace(/^## (.+)$/gm, '<h3 style="font-size:15px;font-weight:600;margin:14px 0 8px 0;color:var(--jp-ui-font-color0,#333);">$1</h3>');
    text = text.replace(/^# (.+)$/gm, '<h2 style="font-size:16px;font-weight:600;margin:16px 0 10px 0;color:var(--jp-ui-font-color0,#333);">$1</h2>');

    // 引用 (> quote) - 使用主题变量
    text = text.replace(/^&gt; (.+)$/gm, '<blockquote style="margin:8px 0;padding:8px 12px;border-left:4px solid #1890ff;background:var(--jp-layout-color1,#f5f5f5);color:var(--jp-ui-font-color2,#555);">$1</blockquote>');

    // 粗体 (**text** 或 __text__)
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');

    // 斜体 (*text* 或 _text_)
    text = text.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
    text = text.replace(/(?<!_)_([^_]+)_(?!_)/g, '<em>$1</em>');

    // 链接 [text](url)
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:#1890ff;text-decoration:none;">$1</a>');

    // 无序列表 (- item 或 * item)，用 <ul> 包裹连续项
    const ulStyle = 'margin:6px 0 6px 20px;padding-left:8px;';
    text = text.replace(/((?:^[\-\*] .+$\n?)+)/gm, (match) => {
      const items = match.trim().split(/\n/).filter(Boolean)
        .map((line) => line.replace(/^[\-\*] (.+)$/, '<li style="list-style-type:disc;">$1</li>'))
        .join('');
      return `<ul style="${ulStyle}">${items}</ul>`;
    });

    // 有序列表 (1. item)，用 <ol> 包裹连续项
    text = text.replace(/((?:^\d+\. .+$\n?)+)/gm, (match) => {
      const items = match.trim().split(/\n/).filter(Boolean)
        .map((line) => line.replace(/^\d+\. (.+)$/, '<li style="list-style-type:decimal;">$1</li>'))
        .join('');
      return `<ol style="${ulStyle}">${items}</ol>`;
    });

    // 分隔线 (--- 或 ***) - 使用主题边框色
    text = text.replace(/^[\-\*]{3,}$/gm, '<hr style="border:none;border-top:1px solid var(--jp-border-color2,#e8e8e8);margin:12px 0;">');

    // 换行
    text = text.replace(/\n/g, '<br>');

    // 清理块元素后的多余 <br>
    text = text.replace(/<\/h[234]><br>/g, '</h$1>');
    text = text.replace(/<\/pre><br>/g, '</pre>');
    text = text.replace(/<\/ul><br>/g, '</ul>');
    text = text.replace(/<\/ol><br>/g, '</ol>');
    text = text.replace(/<\/blockquote><br>/g, '</blockquote>');
    text = text.replace(/<\/li><br>/g, '</li>');
    text = text.replace(/<hr[^>]*><br>/g, '<hr style="border:none;border-top:1px solid var(--jp-border-color2,#e8e8e8);margin:12px 0;">');

    // 清理开头的 <br> 标签，避免首行空行
    text = text.replace(/^(<br\s*\/?>)+/gi, '');

    return text;
  }, [content]);

  return (
    <div
      className={`${className || ''} ai-chat-markdown`}
      style={{ 
        lineHeight: 1.6, 
        wordBreak: 'break-word', 
        color: isNeonTheme ? 'var(--neon-text-secondary, #e0e0e8)' : 'var(--jp-ui-font-color0, #333)'
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

// Generation steps display
const STEP_LABELS: Record<GenerationStep, string> = {
  parsing: '解析需求',
  matching: '匹配模板',
  filling: '填充参数',
  generating: '生成 DAG',
  validating: '校验环路',
  outputting: '输出 JSON'
};

const AIChatModal: React.FC<{
  onClose: () => void;
  setUnread: (n: number) => void;
  setLoading: (b: boolean) => void;
  onPipelineGenerated?: (pipeline: AmplnSchema) => void;
}> = ({ onClose, setUnread, setLoading, onPipelineGenerated }) => {
  // Theme detection
  const { isNeonTheme } = useTheme();
  const themeStyles = useMemo(() => getThemeStyles(isNeonTheme), [isNeonTheme]);
  
  const [open, setOpen] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  
  // Provider and API key state
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [userApiKeys, setUserApiKeys] = useState<UserApiKeyConfig[]>([]);
  const [newApiKey, setNewApiKey] = useState('');
  const [newBaseUrl, setNewBaseUrl] = useState('');
  const [testingKey, setTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; detail?: string[] } | null>(null);
  
  const [modelConfig, setModelConfig] = useState<ModelConfig>({
    providerId: 'openai',
    model: 'gpt-4',
    baseUrl: '',
    apiKey: '',
    temperature: 0.4,
    topP: 0.9,
    maxTokens: 2048,
    customPrompt: DEFAULT_PROMPT_TEMPLATE
  });
  
  const listRef = useRef<HTMLDivElement | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState<GenerationStep | null>(null);
  const [generationProgress, setGenerationProgress] = useState(0);
  
  // Intent recognition state
  const [intentResult, setIntentResult] = useState<{
    intent: 'pipeline_generate' | 'pipeline_edit' | 'none';
    confidence: number;
    shouldTrigger: boolean;
    suggestedTemplate?: any;
  } | null>(null);
  const [validationIssues, setValidationIssues] = useState<Array<{
    level: 'error' | 'warning' | 'info';
    message: string;
    nodeId?: string;
    suggestion?: string;
  }>>([]);
  
  // Pipeline preview state
  const [previewPipeline, setPreviewPipeline] = useState<AmplnSchema | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewMode, setPreviewMode] = useState<'tree' | 'json'>('tree');
  
  // Save dialog state
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveFileName, setSaveFileName] = useState('');
  const [savePath, setSavePath] = useState('./pipelines/');
  const [renderAfterSave, setRenderAfterSave] = useState(true);

  // Load providers, API keys, and user preferences on mount
  useEffect(() => {
    const loadData = async () => {
      // Load providers
      const providerList = await AIService.getProviders();
      setProviders(providerList);
      
      // Load API keys
      const apiKeyList = await AIService.getUserApiKeys();
      setUserApiKeys(apiKeyList);
      
      // Load user preferences from backend (优先使用后端数据)
      const prefs = await AIService.getPreferences();
      if (prefs) {
        setModelConfig(prev => ({
          ...prev,
          providerId: prefs.defaultProviderId || prev.providerId,
          model: prefs.defaultModel || prev.model,
          temperature: prefs.temperature ?? prev.temperature,
          topP: prefs.topP ?? prev.topP,
          maxTokens: prefs.maxTokens ?? prev.maxTokens,
          customPrompt: prefs.customPrompt || prev.customPrompt
        }));
        console.log('[AIChatModal] 从后端加载用户配置:', prefs);
      } else {
        // Fallback: load from localStorage if no backend data
        const saved = localStorage.getItem('ai-assistant-config');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            setModelConfig(prev => ({ ...prev, ...parsed }));
            console.log('[AIChatModal] 从 localStorage 加载配置');
          } catch {}
        }
      }
    };
    loadData();
  }, []);

  // Save config to backend and localStorage on change
  const saveConfigTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    // Save to localStorage immediately
    const toSave = { ...modelConfig };
    delete toSave.apiKey;
    localStorage.setItem('ai-assistant-config', JSON.stringify(toSave));
    
    // Debounce save to backend (avoid too many requests)
    if (saveConfigTimeoutRef.current) {
      clearTimeout(saveConfigTimeoutRef.current);
    }
    saveConfigTimeoutRef.current = setTimeout(async () => {
      await AIService.savePreferences({
        defaultProviderId: modelConfig.providerId,
        defaultModel: modelConfig.model,
        temperature: modelConfig.temperature,
        topP: modelConfig.topP,
        maxTokens: modelConfig.maxTokens,
        customPrompt: modelConfig.customPrompt
      });
      console.log('[AIChatModal] 用户配置已保存到后端');
    }, 1000); // 1秒防抖
    
    return () => {
      if (saveConfigTimeoutRef.current) {
        clearTimeout(saveConfigTimeoutRef.current);
      }
    };
  }, [modelConfig.providerId, modelConfig.model, modelConfig.temperature, modelConfig.topP, modelConfig.maxTokens, modelConfig.customPrompt]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages(prev => {
      const merged = [...prev, msg];
      return merged.slice(-20); // Keep last 20 messages
    });
  }, []);

  // Handle send message - 使用统一对话接口
  const handleSend = async () => {
    const text = input.trim();
    if (!text && attachments.length === 0) return;
    
    const startTime = Date.now();
    
    // 打印输入参数
    console.log('\n========== [AI Assistant] 发送消息 ==========');
    console.log('发送时间:', new Date().toISOString());
    console.log('用户输入:', text);
    console.log('模型配置:', {
      providerId: modelConfig.providerId,
      model: modelConfig.model
    });
    
    const userMsg: ChatMessage = {
      id: String(Date.now()),
      role: 'user',
      content: text,
      ts: Date.now(),
      attachments: attachments.length > 0 ? [...attachments] : undefined
    };
    addMessage(userMsg);
    setInput('');
    setAttachments([]);
    setChatLoading(true);
    setLoading(true);
    setValidationIssues([]);
    setGenerating(false);  // 初始不显示生成进度
    setGenerationProgress(0);
    setIntentResult(null);
    
    const PLACEHOLDER_TEXT = '回复中.....';
    const assistantMsgId = String(Date.now() + 1);
    addMessage({
      id: assistantMsgId,
      role: 'assistant',
      content: PLACEHOLDER_TEXT,
      ts: Date.now()
    });

    try {
      const chatMessages = messages
        .slice(-10)
        .map(m => ({ role: m.role, content: m.content }));
      chatMessages.push({ role: 'user' as const, content: text });

      console.log('[AI Assistant] 调用统一对话接口（流式）...');
      const result = await AIService.chatStream(
        chatMessages,
        {
          model: {
            providerId: modelConfig.providerId,
            model: modelConfig.model,
            baseUrl: modelConfig.baseUrl,
            apiKey: modelConfig.apiKey,
            temperature: modelConfig.temperature,
            topP: modelConfig.topP,
            maxTokens: modelConfig.maxTokens
          },
          customPrompt: modelConfig.customPrompt
        },
        (chunk) => setMessages(prev => prev.map(m => {
          if (m.id !== assistantMsgId) return m;
          const isPlaceholder = m.content === PLACEHOLDER_TEXT;
          return { ...m, content: isPlaceholder ? chunk : m.content + chunk };
        }))
      );

      const duration = Date.now() - startTime;
      console.log('[AI Assistant] 响应:', {
        success: result.success,
        intent: result.intent,
        hasPipeline: !!result.pipeline,
        duration
      });
      console.log('========== [AI Assistant] 调用结束 ==========\n');

      if (result.intent) {
        setIntentResult({
          intent: result.intent.type === 'chat' ? 'none' : result.intent.type as any,
          confidence: result.intent.confidence,
          shouldTrigger: result.intent.type === 'pipeline_generate'
        });
      }

      if (result.success) {
        if (result.pipeline) {
          setMessages(prev => prev.filter(m => m.id !== assistantMsgId));
          setGenerating(true);
          setGenerationProgress(100);
          setGenerationStep('outputting');
          if (result.validation?.issues) {
            setValidationIssues(result.validation.issues);
          }
          let responseContent = result.message || 'Pipeline 生成成功!';
          if (result.metadata) {
            responseContent += `\n\n**生成方式**: ${result.metadata.generationMethod === 'llm' ? 'AI 模型' : '规则引擎'}`;
            responseContent += `\n**耗时**: ${result.metadata.duration || duration}ms`;
          }
          if (result.validation?.summary) {
            const { errors, warnings } = result.validation.summary;
            if (errors > 0) {
              responseContent += `\n\n⚠️ **验证问题**: ${errors} 个错误, ${warnings} 个警告`;
            } else if (warnings > 0) {
              responseContent += `\n\n💡 **验证提示**: ${warnings} 个警告`;
            } else {
              responseContent += `\n\n✅ **验证通过**`;
            }
          }
          responseContent += `\n\n\`\`\`json\n${JSON.stringify(result.pipeline, null, 2)}\n\`\`\``;
          addMessage({
            id: String(Date.now() + 2),
            role: 'assistant',
            content: responseContent,
            ts: Date.now()
          });
          setPreviewPipeline(result.pipeline);
          setShowPreview(true);
          setUnread(0);
        } else {
          setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: result.message || m.content || '抱歉，我没有理解您的问题。' } : m));
        }
      } else {
        // 请求失败
        const errorMsg = result.error?.message || '未知错误';
        const suggestions = result.error?.suggestions;
        let errorContent = errorMsg;
        
        if (suggestions && suggestions.length > 0) {
          errorContent += '\n\n💡 **建议**:\n' + suggestions.map((s: string) => `- ${s}`).join('\n');
        }
        
        if (result.validation?.issues) {
          const errors = result.validation.issues.filter((i: any) => i.level === 'error');
          if (errors.length > 0) {
            errorContent += '\n\n**验证错误**:\n' + errors.slice(0, 5).map((e: any) => `- ${e.message}${e.suggestion ? ` (${e.suggestion})` : ''}`).join('\n');
          }
        }
        
        setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: errorContent } : m));
      }
    } catch (e: any) {
      const duration = Date.now() - startTime;
      console.error('[AI Assistant] 调用异常:', e);
      console.log(`[AI Assistant] 耗时: ${duration}ms`);
      console.log('========== [AI Assistant] 调用结束 (异常) ==========\n');
      setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: `请求异常: ${String(e.message || e)}` } : m));
    } finally {
      setChatLoading(false);
      setLoading(false);
      setGenerating(false);
      setGenerationStep(null);
      setGenerationProgress(0);
    }
  };

  // Handle optimize prompt
  const handleOptimizePrompt = async () => {
    const src = modelConfig.customPrompt;
    if (!src.trim()) return;
    
    // Privacy confirmation
    const confirmed = window.confirm(
      '提示词优化将发送您的提示词到优化服务进行处理。\n\n' +
      '我们承诺:\n' +
      '1. 只发送脱敏后的提示词内容\n' +
      '2. 不存储您的任何数据\n' +
      '3. 使用 HTTPS 加密传输\n\n' +
      '是否继续?'
    );
    if (!confirmed) return;
    
    setOptimizing(true);
    try {
      const result = await AIService.optimizePrompt(src);
      setModelConfig(prev => ({ ...prev, customPrompt: result.optimizedPrompt }));
      message.success(`提示词优化完成 (${result.method === 'service' ? '服务优化' : '本地优化'})`);
    } catch (e: any) {
      message.error(`优化失败: ${e.message}`);
    } finally {
      setOptimizing(false);
    }
  };

  // Handle file upload
  const handleFileUpload = async (file: RcFile) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const ext = file.name.split('.').pop()?.toLowerCase() as 'txt' | 'md' | 'json';
      setAttachments(prev => [...prev, { name: file.name, type: ext, content }]);
    };
    reader.readAsText(file);
    return false;
  };

  // Handle copy message
  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      message.success('已复制到剪贴板');
    });
  };

  // Handle save pipeline
  const handleSave = async () => {
    if (!previewPipeline) return;
    
    const fileName = saveFileName || `pipeline_${new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)}.ampln`;
    const fullPath = `${savePath}${fileName}`;
    
    try {
      if (renderAfterSave) {
        const result = await AIService.renderPipeline(previewPipeline, fullPath);
        if (result.success) {
          message.success('Pipeline 保存并渲染成功!');
          onPipelineGenerated?.(previewPipeline);
          setShowSaveDialog(false);
        } else {
          // 显示详细错误信息，并提供下载选项
          Modal.error({
            title: '保存失败',
            content: (
              <div>
                <p>{result.error || '未知错误'}</p>
                <p style={{ marginTop: 8, fontSize: 12, color: '#888' }}>
                  您可以下载 .ampln 文件手动导入
                </p>
              </div>
            ),
            okText: '下载文件',
            onOk: () => {
              AIService.downloadPipeline(previewPipeline, fileName);
            },
          });
        }
      } else {
        // 直接下载文件
        AIService.downloadPipeline(previewPipeline, fileName);
        message.success('Pipeline 已下载!');
        setShowSaveDialog(false);
      }
    } catch (e: any) {
      message.error(`保存失败: ${e.message}`);
    }
  };

  // Close modal
  const close = () => {
    setOpen(false);
    onClose();
  };

  // Keyboard handler
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Build tree data for pipeline preview
  const buildTreeData = (pipeline: AmplnSchema): DataNode[] => {
    const nodes: DataNode = {
      title: `节点 (${pipeline.nodes.length})`,
      key: 'nodes',
      children: pipeline.nodes.map(n => ({
        title: `${n.id} (${n.type})`,
        key: `node-${n.id}`
      }))
    };
    
    const edges: DataNode = {
      title: `连线 (${pipeline.edges.length})`,
      key: 'edges',
      children: pipeline.edges.map(e => ({
        title: `${e.source} → ${e.target}`,
        key: `edge-${e.id}`
      }))
    };
    
    return [
      { title: `名称: ${pipeline.name}`, key: 'name', isLeaf: true },
      { title: `版本: ${pipeline.version}`, key: 'version', isLeaf: true },
      nodes,
      edges
    ];
  };

  // Validate pipeline and get warnings
  const getValidationWarnings = (pipeline: AmplnSchema): string[] => {
    const warnings: string[] = [];
    if (!pipeline.name) warnings.push('缺少 name 字段');
    if (!pipeline.version) warnings.push('缺少 version 字段');
    if (!pipeline.nodes || pipeline.nodes.length === 0) warnings.push('nodes 为空');
    if (!pipeline.edges) warnings.push('缺少 edges 字段');
    return warnings;
  };

  return (
    <>
      {/* CSS animation for typing indicator */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
      <Modal
        open={open}
        onCancel={close}
        footer={null}
        width={900}
        style={{ top: '5%' }}
        styles={isNeonTheme ? {
          header: {
            background: 'var(--neon-bg-secondary, #1a1d29)',
            borderBottom: '1px solid var(--neon-bg-elevated, #2d3347)',
            color: 'var(--neon-text-primary, #fff)',
          },
          content: {
            background: 'var(--neon-bg-secondary, #1a1d29)',
            border: '1px solid var(--neon-bg-elevated, #2d3347)',
            boxShadow: '0 16px 48px rgba(0, 0, 0, 0.5)',
          },
          body: {
            height: '80vh',
            padding: 0,
            background: 'transparent',
            backdropFilter: 'none',
          },
        } : undefined}
        bodyStyle={{ 
          height: '80vh', 
          padding: 0, 
          background: isNeonTheme ? 'var(--neon-bg-secondary, #1a1d29)' : 'var(--jp-layout-color0, #fff)',
          backdropFilter: 'none',
        }}
        className="ai-chat-modal"
        destroyOnClose
        maskClosable
        title={
          <Space style={{ color: themeStyles.modal.title.color }}>
            <RobotOutlined style={{ color: isNeonTheme ? 'var(--neon-text-secondary, #e2e4ea)' : 'inherit' }} />
            <span>Pipeline助手</span>
          </Space>
        }
      >
        <Layout style={{ height: '100%', background: 'transparent' }}>
          <Content style={{ 
            background: isNeonTheme ? 'var(--neon-bg-primary, #0f1117)' : 'var(--jp-layout-color0, #fff)', 
            borderRight: isNeonTheme ? '1px solid var(--neon-bg-elevated, #2d3347)' : '1px solid var(--jp-border-color2, #e8e8e8)', 
            display: 'flex', 
            flexDirection: 'column' 
          }}>
            {/* Generation Progress */}
            {generating && (
              <div className="ai-chat-progress" style={{ padding: '8px 16px', borderBottom: isNeonTheme ? '1px solid var(--neon-bg-elevated, #2d3347)' : '1px solid var(--jp-border-color2, #e8e8e8)' }}>
                <div style={{ marginBottom: 4, color: isNeonTheme ? 'var(--neon-text-secondary, #e2e4ea)' : 'inherit' }}>
                  {generationStep && STEP_LABELS[generationStep]}
                </div>
                <Progress percent={generationProgress} size="small" />
              </div>
            )}
            
            {/* Messages List */}
            <div ref={listRef} className="ai-chat-messages" style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
              {messages.map(m => (
                <div 
                  key={m.id} 
                  style={{ 
                    marginBottom: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: m.role === 'user' ? 'flex-end' : 'flex-start'
                  }}
                >
                  <div style={{ 
                    fontSize: 12, 
                    color: isNeonTheme ? 'var(--neon-text-tertiary, #9ca3af)' : 'var(--jp-ui-font-color3, #888)', 
                    marginBottom: 4,
                    textAlign: m.role === 'user' ? 'right' : 'left'
                  }}>
                    {m.role === 'user' ? '👤 用户' : '🤖 Pipeline助手'}
                    <span style={{ marginLeft: 8 }}>{new Date(m.ts).toLocaleTimeString()}</span>
                    {m.role === 'assistant' && (
                      <Tooltip title="复制">
                        <CopyOutlined 
                          style={{ marginLeft: 8, cursor: 'pointer' }} 
                          onClick={() => handleCopy(m.content)} 
                        />
                      </Tooltip>
                    )}
                  </div>
                  {m.attachments && m.attachments.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      {m.attachments.map((a, i) => (
                        <span key={i} className="ai-chat-attachment" style={{ 
                          background: isNeonTheme ? 'rgba(63, 140, 255, 0.12)' : 'var(--jp-layout-color1, #f0f0f0)', 
                          padding: '2px 8px', 
                          borderRadius: 4, 
                          marginRight: 4,
                          fontSize: 12,
                          color: isNeonTheme ? 'var(--neon-text-secondary, #e8e8ec)' : 'var(--jp-ui-font-color1, inherit)',
                          border: isNeonTheme ? '1px solid rgba(63, 140, 255, 0.25)' : 'none',
                        }}>
                          📎 {a.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {m.role === 'user' ? (
                    // 用户消息 - 右侧显示
                    <pre
                      className="ai-chat-message-user"
                      style={{
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        background: isNeonTheme 
                          ? 'var(--neon-blue-500, #2563eb)'
                          : '#1890ff',
                        color: '#fff',
                        padding: 12,
                        borderRadius: '8px 8px 0 8px',
                        border: 'none',
                        margin: 0,
                        fontSize: 13,
                        maxWidth: '80%',
                        boxShadow: isNeonTheme ? '0 2px 8px rgba(37, 99, 235, 0.3)' : 'none',
                      }}
                    >
                      {m.content}
                    </pre>
                  ) : (
                    // Pipeline Agent 消息 - 左侧显示
                    <div
                      className="ai-chat-message-assistant"
                      style={{
                        background: isNeonTheme 
                          ? 'var(--neon-bg-tertiary, #252a3c)'
                          : 'var(--jp-layout-color1, #fff)',
                        padding: 12,
                        borderRadius: '8px 8px 8px 0',
                        border: isNeonTheme 
                          ? '1px solid var(--neon-bg-elevated, #2d3347)'
                          : '1px solid var(--jp-border-color2, #e8e8e8)',
                        fontSize: 13,
                        maxWidth: '90%',
                        color: isNeonTheme 
                          ? 'var(--neon-text-secondary, #e2e4ea)'
                          : 'var(--jp-ui-font-color0, #333)',
                        transition: 'all 0.3s ease',
                      }}
                    >
                      <MarkdownRenderer content={m.content} isNeonTheme={isNeonTheme} />
                    </div>
                  )}
                </div>
              ))}
              {/* 回复中占位：仅加载时显示，不占消息位，回复到达后直接新增消息无空行 */}
              {chatLoading && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
                <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: 12, color: isNeonTheme ? 'var(--neon-text-tertiary, #a0a0b0)' : 'var(--jp-ui-font-color3, #888)', marginBottom: 4 }}>🤖 Pipeline助手</div>
                  <div
                    className="ai-chat-typing"
                    style={{
                      background: isNeonTheme ? 'var(--neon-bg-tertiary, #1a1a25)' : 'var(--jp-layout-color1, #fff)',
                      padding: 12,
                      borderRadius: '8px 8px 8px 0',
                      border: isNeonTheme ? '1px solid var(--neon-bg-elevated, #222230)' : '1px solid var(--jp-border-color2, #e8e8e8)',
                      fontSize: 13,
                      color: isNeonTheme ? 'var(--neon-text-secondary, #e0e0e8)' : '#1890ff',
                      fontStyle: 'italic',
                      animation: 'pulse 1.5s ease-in-out infinite'
                    }}
                  >
                    💬 回复中...
                  </div>
                </div>
              )}
              {messages.length === 0 && (
                <div className="ai-chat-empty" style={{ 
                  textAlign: 'center', 
                  color: isNeonTheme ? 'var(--neon-text-muted, #6b7280)' : 'var(--jp-ui-font-color3, #999)', 
                  marginTop: 100 
                }}>
                  <RobotOutlined style={{ 
                    fontSize: 48, 
                    marginBottom: 16,
                    color: isNeonTheme ? 'var(--neon-text-tertiary, #a0a0b0)' : 'inherit',
                  }} />
                  <div>您好！我是你的 Pipeline 构建助手</div>
                  <div style={{ fontSize: 12, marginTop: 8 }}>
                    描述您的数据处理需求，我将帮您生成 Pipeline
                  </div>
                </div>
              )}
            </div>
            
            {/* Input Area */}
            <div className="ai-chat-input-area" style={{ 
              padding: 12, 
              borderTop: isNeonTheme 
                ? '1px solid var(--neon-bg-elevated, #2d3347)'
                : '1px solid var(--jp-border-color2, #e8e8e8)',
              background: isNeonTheme ? 'var(--neon-bg-secondary, #1a1d29)' : 'transparent',
            }}>
              {attachments.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  {attachments.map((a, i) => (
                    <span key={i} className="ai-chat-attachment" style={{ 
                      background: isNeonTheme ? 'rgba(63, 140, 255, 0.12)' : 'var(--jp-layout-color2, #e6f7ff)', 
                      padding: '2px 8px', 
                      borderRadius: 4, 
                      marginRight: 4,
                      fontSize: 12,
                      color: isNeonTheme ? 'var(--neon-text-secondary, #e8e8ec)' : 'var(--jp-ui-font-color1, inherit)',
                      border: isNeonTheme ? '1px solid rgba(63, 140, 255, 0.25)' : 'none',
                    }}>
                      📎 {a.name}
                      <span 
                        style={{ marginLeft: 4, cursor: 'pointer', color: isNeonTheme ? 'var(--neon-text-muted, #606070)' : 'var(--jp-ui-font-color3, #999)' }}
                        onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                      >
                        ×
                      </span>
                    </span>
                  ))}
                </div>
              )}
              <Space.Compact style={{ width: '100%', marginBottom: 8 }}>
                <Upload beforeUpload={handleFileUpload} showUploadList={false} accept=".txt,.md,.json">
                  <Button icon={<UploadOutlined />} />
                </Upload>
                <TextArea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoSize={{ minRows: 2, maxRows: 4 }}
                  placeholder="描述您的需求... (Shift+Enter 换行，Ctrl+Enter 发送)"
                  style={{ 
                    flex: 1,
                    background: isNeonTheme ? 'var(--neon-bg-tertiary, #252a3c)' : 'var(--jp-layout-color1, #fff)',
                    borderColor: isNeonTheme ? 'var(--neon-bg-elevated, #2d3347)' : 'var(--jp-border-color2, #e8e8e8)',
                    color: isNeonTheme ? 'var(--neon-text-primary, #fff)' : 'var(--jp-ui-font-color0, #333)',
                  }}
                />
              </Space.Compact>
              <div style={{ textAlign: 'right' }}>
                <Button 
                  type="primary" 
                  icon={<SendOutlined />} 
                  onClick={handleSend}
                  loading={generating}
                  className="ai-chat-send-btn"
                  style={{
                    background: isNeonTheme 
                      ? 'var(--neon-blue-500, #2563eb)'
                      : 'var(--amphi-interactive-01, #1890ff)',
                    border: 'none',
                    boxShadow: isNeonTheme 
                      ? '0 2px 8px rgba(37, 99, 235, 0.3)'
                      : 'none',
                  }}
                >
                  发送
                </Button>
              </div>
            </div>
          </Content>
          
          {/* Right Sidebar - Configuration */}
          <Sider width={280} theme="light" className="ai-chat-sider" style={{ 
            padding: 12, 
            overflowY: 'auto', 
            background: isNeonTheme ? 'var(--neon-bg-secondary, #1a1d29)' : 'var(--jp-layout-color0, #fff)',
            borderLeft: isNeonTheme ? '1px solid var(--neon-bg-elevated, #2d3347)' : 'none',
          }}>
            <Tabs
              className="ai-chat-tabs"
              size="small"
              items={[
                {
                  key: 'model',
                  label: <><SettingOutlined /> 模型配置</>,
                  children: (
                    <Space className="ai-chat-config" direction="vertical" style={{ width: '100%' }} size="middle">
                      {/* Provider Selection */}
                      <div>
                        <div style={{ marginBottom: 4, fontSize: 12, color: isNeonTheme ? 'var(--neon-text-secondary, #e2e4ea)' : 'inherit' }}>模型厂商</div>
                        <Select
                          value={modelConfig.providerId}
                          onChange={v => {
                            setTestResult(null);
                            const provider = providers.find(p => p.id === v);
                            const firstModel = provider?.models?.[0]?.id ?? provider?.supportedModels?.[0] ?? '';
                            setModelConfig(prev => ({ 
                              ...prev, 
                              providerId: v,
                              model: firstModel,
                              baseUrl: provider?.baseUrl || ''
                            }));
                          }}
                          style={{ width: '100%' }}
                          options={providers.map(p => ({
                            label: (
                              <span>
                                {p.displayName}
                                {userApiKeys.find(k => k.providerId === p.id)?.hasApiKey && 
                                  <span style={{ color: '#52c41a', marginLeft: 4 }}>✓</span>
                                }
                              </span>
                            ),
                            value: p.id
                          }))}
                        />
                      </div>
                      
                      {/* Model Selection - 来自 config 的 models 或 supportedModels */}
                      <div>
                        <div style={{ marginBottom: 4, fontSize: 12, color: isNeonTheme ? 'var(--neon-text-secondary, #e2e4ea)' : 'inherit' }}>模型</div>
                        <Select
                          value={modelConfig.model}
                          onChange={v => setModelConfig(prev => ({ ...prev, model: v }))}
                          style={{ width: '100%' }}
                          options={(() => {
                            const provider = providers.find(p => p.id === modelConfig.providerId);
                            if (provider?.models?.length) {
                              return provider.models.map(m => ({ label: m.name, value: m.id }));
                            }
                            return (provider?.supportedModels || []).map(m => ({ label: m, value: m }));
                          })()}
                        />
                      </div>
                      
                      {/* API Key Status & Management */}
                      {(() => {
                        const currentKeyConfig = userApiKeys.find(k => k.providerId === modelConfig.providerId);
                        const isConfigured = currentKeyConfig?.hasApiKey;
                        return (
                          <div style={{ background: isNeonTheme ? 'var(--neon-bg-tertiary, #252a3c)' : 'var(--jp-layout-color1, #f5f5f5)', padding: 8, borderRadius: 6, border: isNeonTheme ? '1px solid var(--neon-bg-elevated, #2d3347)' : 'none' }}>
                            <div style={{ fontSize: 12, marginBottom: 8, fontWeight: 500, color: isNeonTheme ? 'var(--neon-text-primary, #fff)' : 'var(--jp-ui-font-color0, inherit)' }}>
                              API Key 配置
                              {isConfigured ? (
                                <span style={{ color: isNeonTheme ? 'var(--neon-lime-400, #10b981)' : '#52c41a', marginLeft: 8 }}>✓ 已配置</span>
                              ) : (
                                <span style={{ color: isNeonTheme ? 'var(--neon-orange-400, #f59e0b)' : '#faad14', marginLeft: 8 }}>○ 未配置</span>
                              )}
                            </div>
                            {isConfigured && currentKeyConfig?.maskedKey && (
                              <div style={{ 
                                fontSize: 11, 
                                color: isNeonTheme ? 'var(--neon-text-tertiary, #a0a0b0)' : 'var(--jp-ui-font-color2, #666)', 
                                marginBottom: 8,
                                padding: '4px 8px',
                                background: isNeonTheme ? 'var(--neon-bg-elevated, #222230)' : 'var(--jp-layout-color2, #e8e8e8)',
                                borderRadius: 4,
                                fontFamily: 'monospace'
                              }}>
                                当前: {currentKeyConfig.maskedKey}
                              </div>
                            )}
                            <Input.Password
                              value={newApiKey}
                              onChange={e => { setNewApiKey(e.target.value); setTestResult(null); }}
                              placeholder={isConfigured ? "输入新的 API Key 覆盖..." : "输入 API Key..."}
                              style={{ marginBottom: 8 }}
                            />
                            {modelConfig.providerId === 'custom' && (
                              <Input
                                value={newBaseUrl}
                                onChange={e => { setNewBaseUrl(e.target.value); setTestResult(null); }}
                                placeholder="Base URL (OpenAI 兼容接口)"
                                style={{ marginBottom: 8 }}
                              />
                            )}
                            <Space>
                              <Button
                                size="small"
                                loading={testingKey}
                                onClick={async () => {
                                  setTestResult(null);
                                  setTestingKey(true);
                                  try {
                                    const result = await AIService.testApiKey(
                                      modelConfig.providerId,
                                      newApiKey,
                                      newBaseUrl || undefined
                                    );
                                    setTestResult(result);
                                    if (result.success) {
                                      message.success(result.message);
                                    } else {
                                      message.error(result.message);
                                    }
                                  } finally {
                                    setTestingKey(false);
                                  }
                                }}
                              >
                                测试连接
                              </Button>
                              <Button
                                size="small"
                                type="primary"
                                disabled={!newApiKey}
                                onClick={async () => {
                                  if (!newApiKey) return;
                                  const saved = await AIService.saveApiKey(
                                    modelConfig.providerId,
                                    newApiKey,
                                    newBaseUrl || undefined
                                  );
                                  if (saved) {
                                    message.success(isConfigured ? 'API Key 已更新' : 'API Key 已保存');
                                    setNewApiKey('');
                                    setNewBaseUrl('');
                                    setTestResult(null);
                                    const apiKeyList = await AIService.getUserApiKeys();
                                    setUserApiKeys(apiKeyList);
                                  } else {
                                    message.error('保存失败');
                                  }
                                }}
                              >
                                {isConfigured ? '更新' : '保存'}
                              </Button>
                            </Space>
                            {isConfigured && !newApiKey && (
                              <div style={{ fontSize: 11, color: isNeonTheme ? 'var(--neon-text-muted, #606070)' : 'var(--jp-ui-font-color3, #888)', marginTop: 6 }}>
                                输入新的 API Key 后点击「更新」可覆盖当前配置
                              </div>
                            )}
                            {testResult !== null && (
                              <div
                                style={{
                                  marginTop: 8,
                                  padding: 8,
                                  borderRadius: 4,
                                  background: testResult.success ? 'var(--jp-success-color0, #f6ffed)' : 'var(--jp-error-color0, #fff2f0)',
                                  border: `1px solid ${testResult.success ? 'var(--jp-success-color1, #b7eb8f)' : 'var(--jp-error-color1, #ffccc7)'}`,
                                  color: testResult.success ? 'var(--jp-success-color2, #389e0d)' : 'var(--jp-error-color2, #cf1322)',
                                  fontSize: 12
                                }}
                              >
                                <div style={{ fontWeight: 500 }}>{testResult.message}</div>
                                {testResult.detail && testResult.detail.length > 0 && (
                                  <div style={{ marginTop: 4, color: isNeonTheme ? 'var(--neon-text-tertiary, #a0a0b0)' : 'var(--jp-ui-font-color2, #666)' }}>
                                    可用模型: {testResult.detail.join(', ')}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      
                      {/* Parameters */}
                      <div>
                        <div style={{ marginBottom: 4, fontSize: 12, color: isNeonTheme ? 'var(--neon-text-secondary, #e2e4ea)' : 'inherit' }}>
                          Temperature: {modelConfig.temperature}
                        </div>
                        <Slider
                          min={0}
                          max={1}
                          step={0.1}
                          value={modelConfig.temperature}
                          onChange={v => setModelConfig(prev => ({ ...prev, temperature: v }))}
                        />
                      </div>
                      
                      <div>
                        <div style={{ marginBottom: 4, fontSize: 12, color: isNeonTheme ? 'var(--neon-text-secondary, #e2e4ea)' : 'inherit' }}>
                          Max Tokens: {modelConfig.maxTokens}
                        </div>
                        <Slider
                          min={256}
                          max={8192}
                          step={256}
                          value={modelConfig.maxTokens}
                          onChange={v => setModelConfig(prev => ({ ...prev, maxTokens: v }))}
                        />
                      </div>
                    </Space>
                  )
                },
                {
                  key: 'prompt',
                  label: <><ThunderboltOutlined /> 自定义提示词</>,
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }} size="middle">
                      <div style={{ fontSize: 12, color: isNeonTheme ? 'var(--neon-text-tertiary, #a0a0b0)' : 'var(--jp-ui-font-color2, #666)', background: isNeonTheme ? 'var(--neon-bg-tertiary, #1a1a25)' : 'var(--jp-layout-color1, #f5f5f5)', padding: 8, borderRadius: 4, border: isNeonTheme ? '1px solid var(--neon-bg-elevated, #222230)' : 'none' }}>
                        💡 自定义提示词为可选项，作为内置提示词的补充。清空后不影响正常使用。
                      </div>
                      <TextArea
                        value={modelConfig.customPrompt}
                        onChange={e => setModelConfig(prev => ({ ...prev, customPrompt: e.target.value }))}
                        autoSize={{ minRows: 10, maxRows: 20 }}
                        placeholder="输入自定义提示词（可选）..."
                      />
                      <Space style={{ width: '100%' }}>
                        <Button 
                          style={{ flex: 1 }}
                          onClick={handleOptimizePrompt} 
                          loading={optimizing}
                          icon={<ThunderboltOutlined />}
                        >
                          优化
                        </Button>
                        <Button 
                          style={{ flex: 1 }}
                          onClick={async () => {
                            // 清空并保存
                            setModelConfig(prev => ({ ...prev, customPrompt: '' }));
                            try {
                              const success = await AIService.savePreferences({
                                customPrompt: ''  // 显式传空字符串
                              });
                              if (success) {
                                message.success('已清空自定义提示词');
                              } else {
                                message.error('清空失败');
                              }
                            } catch (e: any) {
                              message.error(`清空失败: ${e.message}`);
                            }
                          }}
                        >
                          清空
                        </Button>
                        <Button 
                          type="primary"
                          style={{ flex: 1 }}
                          icon={<SaveOutlined />}
                          onClick={async () => {
                            try {
                              const success = await AIService.savePreferences({
                                customPrompt: modelConfig.customPrompt
                              });
                              if (success) {
                                message.success('自定义提示词已保存');
                              } else {
                                message.error('保存失败');
                              }
                            } catch (e: any) {
                              message.error(`保存失败: ${e.message}`);
                            }
                          }}
                        >
                          保存
                        </Button>
                      </Space>
                    </Space>
                  )
                },
                {
                  key: 'preview',
                  label: <><EyeOutlined /> Pipeline 预览</>,
                  children: previewPipeline ? (
                    <Space direction="vertical" style={{ width: '100%' }} size="middle">
                      {/* Validation Warnings */}
                      {getValidationWarnings(previewPipeline).length > 0 && (
                        <div style={{ background: 'var(--jp-error-color0, #fff2f0)', border: '1px solid var(--jp-error-color1, #ffccc7)', borderRadius: 4, padding: 8 }}>
                          <div style={{ color: 'var(--jp-error-color2, #cf1322)', fontWeight: 500, marginBottom: 4 }}>⚠️ 校验警告</div>
                          {getValidationWarnings(previewPipeline).map((w, i) => (
                            <div key={i} style={{ color: 'var(--jp-error-color2, #cf1322)', fontSize: 12 }}>• {w}</div>
                          ))}
                        </div>
                      )}
                      
                      {/* View Toggle */}
                      <div>
                        <Button.Group>
                          <Button 
                            type={previewMode === 'tree' ? 'primary' : 'default'}
                            onClick={() => setPreviewMode('tree')}
                          >
                            树形
                          </Button>
                          <Button 
                            type={previewMode === 'json' ? 'primary' : 'default'}
                            onClick={() => setPreviewMode('json')}
                          >
                            JSON
                          </Button>
                        </Button.Group>
                      </div>
                      
                      {/* Preview Content */}
                      {previewMode === 'tree' ? (
                        <Tree
                          treeData={buildTreeData(previewPipeline)}
                          defaultExpandAll
                          style={{ fontSize: 12 }}
                        />
                      ) : (
                        <pre style={{ 
                          background: 'var(--jp-layout-color1, #f5f5f5)', 
                          padding: 8, 
                          borderRadius: 4, 
                          fontSize: 11,
                          maxHeight: 300,
                          overflow: 'auto',
                          color: 'var(--jp-ui-font-color0, inherit)',
                          border: '1px solid var(--jp-border-color2, #e8e8e8)'
                        }}>
                          {JSON.stringify(previewPipeline, null, 2)}
                        </pre>
                      )}
                      
                      {/* Save Button */}
                      <Button 
                        type="primary" 
                        block 
                        icon={<SaveOutlined />}
                        onClick={() => {
                          setSaveFileName(`pipeline_${new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)}.ampln`);
                          setShowSaveDialog(true);
                        }}
                      >
                        保存 Pipeline
                      </Button>
                    </Space>
                  ) : (
                    <div style={{ textAlign: 'center', color: 'var(--jp-ui-font-color3, #999)', padding: 20 }}>
                      生成 Pipeline 后将在此预览
                    </div>
                  )
                }
              ]}
            />
          </Sider>
        </Layout>
      </Modal>
      
      {/* Save Confirm Dialog */}
      <Modal
        open={showSaveDialog}
        onCancel={() => setShowSaveDialog(false)}
        title="保存 Pipeline"
        onOk={handleSave}
        okText="保存"
        cancelText="取消"
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <div style={{ marginBottom: 4 }}>文件名</div>
            <Input
              value={saveFileName}
              onChange={e => setSaveFileName(e.target.value)}
              placeholder="pipeline.ampln"
            />
          </div>
          <div>
            <div style={{ marginBottom: 4 }}>保存路径</div>
            <Input
              value={savePath}
              onChange={e => setSavePath(e.target.value)}
              placeholder="./pipelines/"
            />
          </div>
          <div>
            <Switch 
              checked={renderAfterSave} 
              onChange={setRenderAfterSave}
            />
            <span style={{ marginLeft: 8 }}>立即渲染</span>
          </div>
        </Space>
      </Modal>
    </>
  );
};

export default AIChatModal;
