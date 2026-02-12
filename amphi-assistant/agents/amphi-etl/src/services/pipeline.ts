/**
 * Pipeline 生成服务
 * 从原 etl-agent.ts 提取
 */

import * as fs from 'fs';
import * as path from 'path';
import { Component, Pipeline, PipelineNode, PipelineEdge, ETLConfig } from '../types';

export interface PipelineServiceOptions {
  outputDir?: string;
}

export class PipelineService {
  private outputDir: string;

  constructor(options: PipelineServiceOptions = {}) {
    this.outputDir = options.outputDir || path.join(__dirname, '../../output');
  }

  /**
   * 生成 Pipeline
   */
  generate(config: ETLConfig): Pipeline {
    const nodes: PipelineNode[] = [];
    const edges: PipelineEdge[] = [];
    let x = 135;
    const y = 105;
    let lastId: string | null = null;

    const addNode = (comp: Component) => {
      const nodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const params = config.params[comp.id] || {};
      
      nodes.push({
        id: nodeId,
        type: comp.id,
        position: { x, y },
        data: { nameId: `${comp.id}1`, lastUpdated: Date.now(), ...params },
        positionAbsolute: { x, y },
        width: 196,
        height: 177,
      });

      if (lastId) {
        edges.push({
          id: `edge_${lastId}_${nodeId}`,
          source: lastId,
          target: nodeId
        });
      }
      lastId = nodeId;
      x += 315;
    };

    if (config.input) addNode(config.input);
    config.transformations.forEach(addNode);
    if (config.output) addNode(config.output);

    return {
      doc_type: 'Amphi Pipeline',
      version: '1',
      json_schema: 'http://docs.amphi.ai/schemas/pipeline-v1-schema.json',
      id: `pipeline_${Date.now()}`,
      pipelines: [{
        id: 'primary',
        flow: {
          nodes,
          edges,
          viewport: { x: 0, y: 0, zoom: 1 }
        }
      }],
    };
  }

  /**
   * 保存 Pipeline 到文件
   */
  save(pipeline: Pipeline, filename?: string): string {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
    
    const filepath = path.join(
      this.outputDir,
      filename || `pipeline_${Date.now()}.ampln`
    );
    
    fs.writeFileSync(filepath, JSON.stringify(pipeline, null, 2));
    return filepath;
  }

  /**
   * 保存为 JSON 格式
   */
  saveAsJson(pipeline: any, filename?: string): string {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
    
    const filepath = path.join(
      this.outputDir,
      filename || `pipeline_${Date.now()}.json`
    );
    
    fs.writeFileSync(filepath, JSON.stringify(pipeline, null, 2));
    return filepath;
  }

  /**
   * 格式化配置为可读文本
   */
  formatConfig(config: ETLConfig): string {
    const lines: string[] = [];

    if (config.input) {
      lines.push(`输入: ${config.input.name}`);
      const params = config.params[config.input.id] || {};
      Object.entries(params).forEach(([k, v]) => {
        lines.push(`  ${k}: ${k.includes('password') ? '***' : v}`);
      });
    }

    if (config.transformations.length > 0) {
      config.transformations.forEach((trans, idx) => {
        lines.push(`转换${idx + 1}: ${trans.name}`);
        const params = config.params[trans.id] || {};
        Object.entries(params).forEach(([k, v]) => {
          lines.push(`  ${k}: ${v}`);
        });
      });
    }

    if (config.output) {
      lines.push(`输出: ${config.output.name}`);
      const params = config.params[config.output.id] || {};
      Object.entries(params).forEach(([k, v]) => {
        lines.push(`  ${k}: ${k.includes('password') ? '***' : v}`);
      });
    }
    
    return lines.join('\n') || '暂无配置';
  }

  /**
   * 格式化为提案文本
   */
  formatProposal(config: ETLConfig): string {
    return `\n📋 方案建议\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${this.formatConfig(config)}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
  }
}

export default PipelineService;
