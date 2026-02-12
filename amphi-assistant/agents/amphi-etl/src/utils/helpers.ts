/**
 * 通用辅助函数
 */

/**
 * 从文本中提取 JSON
 */
export function extractJson(text: string): string {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) ||
                    text.match(/```\s*([\s\S]*?)```/) ||
                    text.match(/(\{[\s\S]*\})/);
  
  if (jsonMatch) {
    return jsonMatch[1].trim();
  }
  return text.trim();
}

/**
 * 生成 UUID
 */
export function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 格式化当前时间
 */
export function formatTime(date: Date = new Date()): string {
  return date.toISOString();
}

/**
 * 安全地获取嵌套对象属性
 */
export function getNestedValue(obj: any, path: string, defaultValue?: any): any {
  const keys = path.split('.');
  let result = obj;
  
  for (const key of keys) {
    if (result == null || typeof result !== 'object') {
      return defaultValue;
    }
    result = result[key];
  }
  
  return result !== undefined ? result : defaultValue;
}

/**
 * 深度合并对象
 */
export function deepMerge<T>(target: T, source: Partial<T>): T {
  const result = { ...target };
  
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] as any, source[key] as any);
    } else {
      result[key] = source[key] as any;
    }
  }
  
  return result;
}

/**
 * 防抖函数
 */
export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * 限流函数
 */
export function throttle<T extends (...args: any[]) => void>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}
