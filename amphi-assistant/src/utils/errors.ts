/**
 * 错误处理工具
 */

export class AgentError extends Error {
  public code: string;
  public details?: Record<string, any>;

  constructor(message: string, code: string, details?: Record<string, any>) {
    super(message);
    this.name = 'AgentError';
    this.code = code;
    this.details = details;
  }
}

export class PerceptionError extends AgentError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'PERCEPTION_ERROR', details);
    this.name = 'PerceptionError';
  }
}

export class MemoryError extends AgentError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'MEMORY_ERROR', details);
    this.name = 'MemoryError';
  }
}

export class CognitionError extends AgentError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'COGNITION_ERROR', details);
    this.name = 'CognitionError';
  }
}

export class ExecutionError extends AgentError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'EXECUTION_ERROR', details);
    this.name = 'ExecutionError';
  }
}

export class CollaborationError extends AgentError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'COLLABORATION_ERROR', details);
    this.name = 'CollaborationError';
  }
}

export class ToolError extends AgentError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'TOOL_ERROR', details);
    this.name = 'ToolError';
  }
}

export const handleError = (error: unknown): AgentError => {
  if (error instanceof AgentError) {
    return error;
  }
  
  if (error instanceof Error) {
    return new AgentError(error.message, 'UNKNOWN_ERROR', { stack: error.stack });
  }
  
  return new AgentError(String(error), 'UNKNOWN_ERROR');
};
