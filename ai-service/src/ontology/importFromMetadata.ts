/**
 * 从 components-metadata.md 或等价的 JSON 解析并导入到 Neo4j
 * 支持：一级标题为组件名，id/description/parameters 及 source
 */

import * as fs from 'fs';
import * as path from 'path';
import { ComponentNode, ParameterNode } from './model';
import { createComponent, createParameter, createRelationship } from './service';
import { REL_TYPES, NODE_LABELS } from './model';

export interface ParsedComponent {
  componentName: string;
  id: string;
  description: string;
  parameters: Array<{
    name: string;
    type: string;
    default: unknown;
    required: boolean;
    options: unknown;
    description: string;
  }>;
  source?: string;
}

/**
 * 解析 components-metadata.md 文本，返回 ParsedComponent[]
 */
export function parseMetadataMarkdown(content: string): ParsedComponent[] {
  const blocks = content.split(/\n(?=# )/).filter((b) => b.trim().startsWith('# '));
  const result: ParsedComponent[] = [];

  for (const block of blocks) {
    const lines = block.split('\n');
    const titleLine = lines[0];
    const componentName = titleLine.replace(/^#\s*/, '').trim();
    if (!componentName) continue;

    let id = '';
    let description = '';
    const parameters: ParsedComponent['parameters'] = [];
    let source = '';
    let inParams = false;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('id:')) id = line.replace(/^id:\s*/, '').trim();
      else if (line.startsWith('description:')) description = line.replace(/^description:\s*/, '').trim();
      else if (line.startsWith('source:')) source = line.replace(/^source:\s*/, '').trim();
      else if (line === 'parameters:' || line === '- **parameters**:') inParams = true;
      else if (inParams && line.startsWith('- name:')) {
        const name = line.replace(/^- name:\s*/, '').trim();
        const param: ParsedComponent['parameters'][0] = {
          name,
          type: 'input',
          default: null,
          required: false,
          options: null,
          description: '',
        };
        let j = i + 1;
        while (j < lines.length && (lines[j].startsWith('  ') || lines[j].startsWith('- '))) {
          const l = lines[j];
          if (l.startsWith('  type:')) param.type = l.replace(/^  type:\s*/, '').trim();
          else if (l.startsWith('  default:')) {
            const v = l.replace(/^  default:\s*/, '').trim();
            param.default = v === 'null' ? null : (v.startsWith('"') ? v.slice(1, -1) : v);
          } else if (l.startsWith('  required:')) param.required = /true/i.test(l);
          else if (l.startsWith('  options:')) {
            const v = l.replace(/^  options:\s*/, '').trim();
            if (v !== 'null') try { param.options = JSON.parse(v); } catch { param.options = v; }
          } else if (l.startsWith('  description:')) param.description = l.replace(/^  description:\s*/, '').trim();
          j++;
        }
        parameters.push(param);
        i = j - 1;
      }
    }

    if (id) {
      result.push({
        componentName,
        id,
        description,
        parameters,
        source: source || undefined,
      });
    }
  }

  return result;
}

/**
 * 从文件路径读取并解析
 */
export function parseMetadataFile(filePath: string): ParsedComponent[] {
  const content = fs.readFileSync(filePath, 'utf8');
  return parseMetadataMarkdown(content);
}

/**
 * 将解析结果导入 Neo4j：创建 Component、Parameter 及 HAS_PARAMETER 关系
 */
export async function importParsedToNeo4j(parsed: ParsedComponent[]): Promise<{ created: number; errors: string[] }> {
  let created = 0;
  const errors: string[] = [];

  for (const p of parsed) {
    try {
      const comp: ComponentNode = {
        id: p.id,
        name: p.componentName,
        description: p.description,
        source: p.source,
        category: '', // 可从 source 路径推断，此处简化
        pipelineType: '',
      };
      const ok = await createComponent(comp);
      if (ok) created++;

      for (const param of p.parameters) {
        if (!param.name || param.name === '(spread)') continue;
        const paramId = `${p.id}__${param.name}`;
        const paramNode: ParameterNode = {
          id: paramId,
          name: param.name,
          paramType: param.type,
          defaultValue: param.default,
          required: param.required,
          description: param.description,
          options: Array.isArray(param.options) ? param.options : (param.options as ParameterNode['options']) ?? undefined,
        };
        const pok = await createParameter(paramNode, p.id);
        if (pok) created++;
      }
    } catch (e) {
      errors.push(`${p.id}: ${(e as Error).message}`);
    }
  }

  return { created, errors };
}

/**
 * 从指定路径的 components-metadata.md 导入（用于 API 或脚本）
 */
export async function importFromMetadataFilePath(metadataPath: string): Promise<{ created: number; errors: string[] }> {
  const resolved = path.isAbsolute(metadataPath) ? metadataPath : path.resolve(process.cwd(), metadataPath);
  if (!fs.existsSync(resolved)) {
    return { created: 0, errors: [`File not found: ${resolved}`] };
  }
  const parsed = parseMetadataFile(resolved);
  return importParsedToNeo4j(parsed);
}
