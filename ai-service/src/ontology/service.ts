/**
 * 本体服务：Cypher 读写、图数据构建、搜索
 */

import neo4j from 'neo4j-driver';
import { withSession } from './neo4j';
import {
  NODE_LABELS,
  REL_TYPES,
  ComponentNode,
  ParameterNode,
  DataTypeNode,
  CategoryNode,
  RelationshipCreate,
  GraphForViz,
  OntologySearchResult,
} from './model';

const LABEL = NODE_LABELS;
const REL = REL_TYPES;

// ---------- 组件 CRUD ----------
export async function listComponents(category?: string): Promise<ComponentNode[]> {
  return (await withSession(async (session) => {
    const q = category
      ? `MATCH (c:${LABEL.Component}) WHERE c.category = $category RETURN c ORDER BY c.name`
      : `MATCH (c:${LABEL.Component}) RETURN c ORDER BY c.name`;
    const result = await session.run(q, category ? { category } : {});
    return result.records.map((r) => recordToComponent(r.get('c')));
  })) || [];
}

function recordToComponent(r: any): ComponentNode {
  const props = r?.properties || {};
  return {
    id: props.id ?? r?.elementId,
    name: props.name ?? '',
    displayName: props.displayName,
    description: props.description,
    category: props.category,
    pipelineType: props.pipelineType,
    source: props.source,
  };
}

export async function getComponent(id: string): Promise<ComponentNode | null> {
  return (await withSession(async (session) => {
    const result = await session.run(
      `MATCH (c:${LABEL.Component} {id: $id}) RETURN c`,
      { id }
    );
    const r = result.records[0]?.get('c');
    return r ? recordToComponent(r) : null;
  })) || null;
}

export async function createComponent(c: ComponentNode): Promise<boolean> {
  return (await withSession(async (session) => {
    await session.run(
      `CREATE (c:${LABEL.Component} {id: $id, name: $name, displayName: $displayName, description: $description, category: $category, pipelineType: $pipelineType, source: $source})`,
      {
        id: c.id,
        name: c.name,
        displayName: c.displayName ?? '',
        description: c.description ?? '',
        category: c.category ?? '',
        pipelineType: c.pipelineType ?? '',
        source: c.source ?? '',
      }
    );
    return true;
  })) ?? false;
}

export async function updateComponent(id: string, updates: Partial<ComponentNode>): Promise<boolean> {
  return (await withSession(async (session) => {
    const setClause = Object.keys(updates)
      .filter((k) => updates[k as keyof ComponentNode] !== undefined)
      .map((k) => `c.${k} = $${k}`)
      .join(', ');
    if (!setClause) return true;
    const params = { id, ...updates };
    await session.run(
      `MATCH (c:${LABEL.Component} {id: $id}) SET ${setClause}`,
      params
    );
    return true;
  })) ?? false;
}

export async function deleteComponent(id: string): Promise<boolean> {
  return (await withSession(async (session) => {
    // 先删除通过 HAS_PARAMETER 关联的参数节点，再删除组件
    await session.run(
      `MATCH (c:${LABEL.Component} {id: $id})-[:${REL.HAS_PARAMETER}]->(p:${LABEL.Parameter}) DETACH DELETE p`,
      { id }
    );
    await session.run(
      `MATCH (c:${LABEL.Component} {id: $id}) DETACH DELETE c`,
      { id }
    );
    return true;
  })) ?? false;
}

// ---------- 参数（挂载在组件下） ----------
export async function listParameters(componentId?: string): Promise<ParameterNode[]> {
  return (await withSession(async (session) => {
    const q = componentId
      ? `MATCH (comp:${LABEL.Component} {id: $componentId})-[:${REL.HAS_PARAMETER}]->(p:${LABEL.Parameter}) RETURN p ORDER BY p.name`
      : `MATCH (p:${LABEL.Parameter}) RETURN p ORDER BY p.name`;
    const result = await session.run(q, componentId ? { componentId } : {});
    return result.records.map((r) => recordToParameter(r.get('p')));
  })) || [];
}

function recordToParameter(r: any): ParameterNode {
  const props = r?.properties || {};
  let options = props.options;
  if (typeof options === 'string') try { options = JSON.parse(options); } catch { options = []; }
  return {
    id: props.id ?? r?.elementId,
    name: props.name ?? '',
    displayName: props.displayName,
    paramType: props.paramType ?? 'input',
    defaultValue: props.defaultValue,
    required: props.required === true,
    description: props.description,
    options: options,
    advanced: props.advanced,
    condition: typeof props.condition === 'string' ? {} : (props.condition || undefined),
  };
}

export async function createParameter(p: ParameterNode, componentId: string): Promise<boolean> {
  return (await withSession(async (session) => {
    await session.run(
      `MATCH (comp:${LABEL.Component} {id: $componentId})
       CREATE (p:${LABEL.Parameter} {id: $id, name: $name, displayName: $displayName, paramType: $paramType, defaultValue: $defaultValue, required: $required, description: $description, options: $options, advanced: $advanced})
       CREATE (comp)-[:${REL.HAS_PARAMETER}]->(p)`,
      {
        componentId,
        id: p.id,
        name: p.name,
        displayName: p.displayName ?? '',
        paramType: p.paramType ?? 'input',
        defaultValue: p.defaultValue != null ? JSON.stringify(p.defaultValue) : null,
        required: p.required ?? false,
        description: p.description ?? '',
        options: p.options ? JSON.stringify(p.options) : null,
        advanced: p.advanced ?? false,
      }
    );
    return true;
  })) ?? false;
}

export async function updateParameter(id: string, updates: Partial<ParameterNode>): Promise<boolean> {
  return (await withSession(async (session) => {
    // 特殊处理 options、defaultValue、condition，序列化为 JSON
    const jsonFields = ['options', 'defaultValue', 'condition'];
    const processed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined) continue;
      if (jsonFields.includes(k) && typeof v === 'object') {
        processed[k] = JSON.stringify(v);
      } else {
        processed[k] = v;
      }
    }
    const setClause = Object.keys(processed)
      .map((k) => `p.${k} = $${k}`)
      .join(', ');
    if (!setClause) return true;
    const params = { id, ...processed };
    await session.run(
      `MATCH (p:${LABEL.Parameter} {id: $id}) SET ${setClause}`,
      params
    );
    return true;
  })) ?? false;
}

export async function deleteParameter(id: string): Promise<boolean> {
  return (await withSession(async (session) => {
    await session.run(
      `MATCH (p:${LABEL.Parameter} {id: $id}) DETACH DELETE p`,
      { id }
    );
    return true;
  })) ?? false;
}

// ---------- 关系 ----------
export async function createRelationship(rel: RelationshipCreate): Promise<boolean> {
  return (await withSession(async (session) => {
    const fromLabel = rel.fromLabel || LABEL.Component;
    const toLabel = rel.toLabel || LABEL.Component;
    const relType = REL[rel.type];
    const props = rel.properties ? Object.entries(rel.properties).map(([k, v]) => `${k}: $${k}`).join(', ') : '';
    const withProps = props ? `{${props}}` : '';
    await session.run(
      `MATCH (a {id: $fromId}), (b {id: $toId})
       CREATE (a)-[r:${relType} ${withProps}]->(b)`,
      { fromId: rel.fromId, toId: rel.toId, ...(rel.properties || {}) }
    );
    return true;
  })) ?? false;
}

export async function listRelationships(type?: string): Promise<Array<{ fromId: string; toId: string; type: string }>> {
  return (await withSession(async (session) => {
    const relFilter = type ? `type(r) = $type` : 'true';
    const result = await session.run(
      `MATCH (a)-[r]->(b) WHERE ${relFilter}
       RETURN a.id AS fromId, b.id AS toId, type(r) AS type`,
      type ? { type } : {}
    );
    return result.records.map((r) => ({
      fromId: r.get('fromId'),
      toId: r.get('toId'),
      type: r.get('type'),
    }));
  })) || [];
}

export async function deleteRelationship(fromId: string, toId: string, relType: string): Promise<boolean> {
  return (await withSession(async (session) => {
    await session.run(
      `MATCH (a {id: $fromId})-[r]->(b {id: $toId}) WHERE type(r) = $relType DELETE r`,
      { fromId, toId, relType }
    );
    return true;
  })) ?? false;
}

export async function updateRelationship(
  fromId: string,
  toId: string,
  relType: string,
  updates: { displayName?: string }
): Promise<boolean> {
  return (await withSession(async (session) => {
    if (updates.displayName !== undefined) {
      await session.run(
        `MATCH (a {id: $fromId})-[r]->(b {id: $toId}) WHERE type(r) = $relType SET r.displayName = $displayName`,
        { fromId, toId, relType, displayName: updates.displayName }
      );
    }
    return true;
  })) ?? false;
}

// ---------- 图数据（可视化） ----------
// 只拉取 Component / Parameter 及它们之间的边，保证新增组件一定出现在图中；按 id 排序使结果稳定
export async function getGraphForViz(limit = 3000): Promise<GraphForViz> {
  const data = await withSession(async (session) => {
    const limitCount = Math.min(Math.max(Number(limit) || 500, 100), 5000);
    const nodeResult = await session.run(
      `MATCH (n) WHERE n:Component OR n:Parameter
       RETURN n ORDER BY n.id LIMIT $limit`,
      { limit: neo4j.int(limitCount) }
    );
    const nodeMap = new Map<string, { id: string; label: string; type: string; data?: Record<string, unknown> }>();
    for (const rec of nodeResult.records) {
      const n = rec.get('n');
      if (!n?.properties) continue;
      const id = n.properties.id ?? n.elementId;
      const props = n.properties as Record<string, unknown>;
      const label = (props.displayName ?? props.name ?? id) as string;
      nodeMap.set(id, {
        id,
        label,
        type: (n.labels && n.labels[0]) ? n.labels[0] : 'Node',
        data: props,
      });
    }
    const ids = Array.from(nodeMap.keys());
    if (ids.length === 0) return { nodes: [], edges: [] };
    const edgeResult = await session.run(
      `MATCH (a)-[r]->(b) WHERE a.id IN $ids AND b.id IN $ids RETURN a.id AS fromId, b.id AS toId, type(r) AS type, r.displayName AS displayName`,
      { ids }
    );
    const edges = edgeResult.records.map((r) => ({
      id: `${r.get('fromId')}-${r.get('type')}-${r.get('toId')}`,
      source: r.get('fromId'),
      target: r.get('toId'),
      type: r.get('type'),
      displayName: r.get('displayName'),
    }));
    return { nodes: Array.from(nodeMap.values()), edges };
  });
  return data || { nodes: [], edges: [] };
}

// ---------- 搜索 ----------
export async function searchOntology(q: string, type?: string): Promise<OntologySearchResult> {
  const components: ComponentNode[] = [];
  const parameters: ParameterNode[] = [];
  await withSession(async (session) => {
    const term = `(?i).*${(q || '').replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')}.*`;
    if (!type || type === LABEL.Component) {
      const res = await session.run(
        `MATCH (c:${LABEL.Component}) WHERE c.name =~ $term OR c.id =~ $term OR c.description =~ $term RETURN c LIMIT 50`,
        { term }
      );
      res.records.forEach((r) => components.push(recordToComponent(r.get('c'))));
    }
    if (!type || type === LABEL.Parameter) {
      const res = await session.run(
        `MATCH (p:${LABEL.Parameter}) WHERE p.name =~ $term OR p.id =~ $term OR p.description =~ $term RETURN p LIMIT 50`,
        { term }
      );
      res.records.forEach((r) => parameters.push(recordToParameter(r.get('p'))));
    }
  });
  return {
    components,
    parameters,
    total: components.length + parameters.length,
  };
}

// ---------- 按输入输出类型查组件（供 AI 使用） ----------
export async function getComponentsByInputOutput(inputType?: string, outputType?: string): Promise<ComponentNode[]> {
  if (!inputType && !outputType) return listComponents();
  return (await withSession(async (session) => {
    const params: Record<string, string> = {};
    let cypher: string;
    if (inputType && outputType) {
      params.inputType = inputType;
      params.outputType = outputType;
      cypher = `MATCH (c:${LABEL.Component})-[:${REL.ACCEPTS_INPUT}]->(dt:${LABEL.DataType}), (c)-[:${REL.PRODUCES_OUTPUT}]->(dt2:${LABEL.DataType}) WHERE dt.name = $inputType AND dt2.name = $outputType RETURN DISTINCT c`;
    } else if (inputType) {
      params.inputType = inputType;
      cypher = `MATCH (c:${LABEL.Component})-[:${REL.ACCEPTS_INPUT}]->(dt:${LABEL.DataType}) WHERE dt.name = $inputType RETURN DISTINCT c`;
    } else {
      params.outputType = outputType!;
      cypher = `MATCH (c:${LABEL.Component})-[:${REL.PRODUCES_OUTPUT}]->(dt2:${LABEL.DataType}) WHERE dt2.name = $outputType RETURN DISTINCT c`;
    }
    const result = await session.run(cypher, params);
    return result.records.map((r) => recordToComponent(r.get('c')));
  })) || [];
}
