/**
 * Optimize Prompt Handler
 * 
 * @swagger
 * /ai/optimizePrompt:
 *   post:
 *     summary: Optimize a prompt for better pipeline generation
 *     tags: [AI]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - prompt
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: The original prompt to optimize
 *               userId:
 *                 type: string
 *                 description: User ID for using saved API keys
 *               providerId:
 *                 type: string
 *                 description: Provider to use for optimization
 *     responses:
 *       200:
 *         description: Optimized prompt
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 optimizedPrompt:
 *                   type: string
 *                 method:
 *                   type: string
 *                   enum: [service, local]
 *                 meta:
 *                   type: object
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Server error
 */

import { Request, Response } from 'express';
import { LLMService } from '../services/llmService';

/**
 * Local prompt optimization rules
 */
function localOptimize(prompt: string): string {
  let optimized = prompt;
  
  // Normalize line breaks
  optimized = optimized.replace(/\r\n/g, '\n');
  
  // Remove excessive blank lines
  optimized = optimized.replace(/\n{3,}/g, '\n\n');
  
  // Trim each line
  optimized = optimized.split('\n').map(line => line.trim()).join('\n');
  
  // Add markdown headers for common sections
  optimized = optimized.replace(/^(要求|需求|参数|输出|输入)[:：]/gm, '## $1:\n');
  
  // Normalize list items
  optimized = optimized.replace(/^[-*•]\s*/gm, '- ');
  
  // Add structure hints
  if (!optimized.includes('## ')) {
    const lines = optimized.split('\n');
    if (lines.length > 5) {
      optimized = '## 任务描述\n' + optimized;
    }
  }
  
  return optimized.trim();
}

/**
 * Use LLM to optimize prompt
 */
async function llmOptimize(prompt: string, userId: string, providerId: string): Promise<string> {
  const systemPrompt = `You are a prompt optimization assistant. Your task is to improve the given prompt for better AI understanding and pipeline generation.

Rules:
1. Keep the original intent and requirements
2. Add clear structure (sections, lists)
3. Clarify ambiguous terms
4. Add relevant technical details if missing
5. Ensure the prompt is in the same language as the input
6. Output only the optimized prompt, no explanations`;

  const response = await LLMService.chat(
    userId,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Please optimize this prompt:\n\n${prompt}` }
    ],
    {
      providerId,
      temperature: 0.3,
      maxTokens: 2000,
    }
  );

  return response.content || prompt;
}

export async function optimizePromptHandler(req: Request, res: Response): Promise<void> {
  try {
    const { prompt, userId, providerId } = req.body;
    
    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ error: true, message: 'prompt is required and must be a string' });
      return;
    }
    
    if (prompt.length > 50000) {
      res.status(400).json({ error: true, message: 'prompt is too long (max 50000 characters)' });
      return;
    }
    
    let optimizedPrompt: string;
    let method: 'service' | 'local';
    
    // Try LLM optimization if userId and providerId are provided
    if (userId && providerId) {
      try {
        optimizedPrompt = await llmOptimize(prompt, userId, providerId);
        method = 'service';
      } catch (error: any) {
        console.warn('LLM optimization failed, falling back to local:', error.message);
        optimizedPrompt = localOptimize(prompt);
        method = 'local';
      }
    } else {
      // Use local optimization
      optimizedPrompt = localOptimize(prompt);
      method = 'local';
    }
    
    res.json({
      optimizedPrompt,
      method,
      meta: {
        originalLength: prompt.length,
        optimizedLength: optimizedPrompt.length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Optimize prompt error:', error);
    res.status(500).json({ 
      error: true, 
      message: error.message || 'Internal server error' 
    });
  }
}
