/**
 * Render Pipeline Handler
 * 
 * @swagger
 * /ai/renderPipeline:
 *   post:
 *     summary: Save and render a pipeline to the workspace
 *     tags: [AI]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - pipeline
 *               - filePath
 *             properties:
 *               pipeline:
 *                 type: object
 *                 description: The pipeline schema to save
 *               filePath:
 *                 type: string
 *                 description: Path where to save the pipeline
 *     responses:
 *       200:
 *         description: Render result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 error:
 *                   type: string
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Server error
 */

import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

interface AmplnNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, any>;
}

interface AmplnEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

interface AmplnSchema {
  name: string;
  version: string;
  nodes: AmplnNode[];
  edges: AmplnEdge[];
  variables?: Record<string, any>;
}

/**
 * Validate pipeline schema
 */
function validatePipeline(pipeline: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!pipeline || typeof pipeline !== 'object') {
    errors.push('Pipeline must be an object');
    return { valid: false, errors };
  }
  
  if (!pipeline.name) errors.push('Missing "name" field');
  if (!pipeline.version) errors.push('Missing "version" field');
  if (!Array.isArray(pipeline.nodes)) errors.push('Missing or invalid "nodes" field');
  if (!Array.isArray(pipeline.edges)) errors.push('Missing or invalid "edges" field');
  
  return { valid: errors.length === 0, errors };
}

/**
 * Sanitize file path to prevent directory traversal
 */
function sanitizePath(filePath: string, baseDir: string): string {
  // Normalize the path
  const normalized = path.normalize(filePath);
  
  // Ensure it ends with .ampln
  const withExtension = normalized.endsWith('.ampln') ? normalized : `${normalized}.ampln`;
  
  // Resolve to absolute path
  const absolutePath = path.isAbsolute(withExtension) 
    ? withExtension 
    : path.join(baseDir, withExtension);
  
  // Ensure it's within the base directory
  const resolvedPath = path.resolve(absolutePath);
  const resolvedBase = path.resolve(baseDir);
  
  if (!resolvedPath.startsWith(resolvedBase)) {
    throw new Error('Invalid file path: outside of workspace');
  }
  
  return resolvedPath;
}

/**
 * Ensure directory exists
 */
function ensureDirectory(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export async function renderPipelineHandler(req: Request, res: Response): Promise<void> {
  try {
    const { pipeline, filePath } = req.body;
    
    // Validate request
    if (!pipeline) {
      res.status(400).json({ success: false, error: 'pipeline is required' });
      return;
    }
    
    if (!filePath || typeof filePath !== 'string') {
      res.status(400).json({ success: false, error: 'filePath is required and must be a string' });
      return;
    }
    
    // Validate pipeline schema
    const validation = validatePipeline(pipeline);
    if (!validation.valid) {
      res.status(400).json({ 
        success: false, 
        error: `Invalid pipeline: ${validation.errors.join('; ')}` 
      });
      return;
    }
    
    // Get workspace directory from environment or use current directory
    const workspaceDir = process.env.WORKSPACE_DIR || process.cwd();
    
    try {
      // Sanitize and resolve the file path
      const resolvedPath = sanitizePath(filePath, workspaceDir);
      
      // Ensure directory exists
      ensureDirectory(resolvedPath);
      
      // Prepare pipeline content with proper formatting
      const pipelineContent: AmplnSchema = {
        name: pipeline.name,
        version: pipeline.version,
        nodes: pipeline.nodes.map((node: AmplnNode) => ({
          id: node.id,
          type: node.type,
          position: node.position,
          data: node.data || {}
        })),
        edges: pipeline.edges.map((edge: AmplnEdge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          ...(edge.sourceHandle && { sourceHandle: edge.sourceHandle }),
          ...(edge.targetHandle && { targetHandle: edge.targetHandle })
        })),
        ...(pipeline.variables && { variables: pipeline.variables })
      };
      
      // Write to file
      const jsonContent = JSON.stringify(pipelineContent, null, 2);
      fs.writeFileSync(resolvedPath, jsonContent, 'utf-8');
      
      console.log(`Pipeline saved to: ${resolvedPath}`);
      
      res.json({
        success: true,
        message: `Pipeline saved successfully to ${filePath}`,
        filePath: resolvedPath
      });
    } catch (fsError: any) {
      console.error('File system error:', fsError);
      res.status(200).json({
        success: false,
        error: `Failed to save pipeline: ${fsError.message}`
      });
    }
  } catch (error: any) {
    console.error('Render pipeline error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
}
