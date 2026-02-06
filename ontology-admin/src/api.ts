const BASE = import.meta.env.VITE_ONTOLOGY_API || '';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function put(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
}

async function del(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await res.text());
}

export interface OntologyHealth {
  available: boolean;
  timestamp: string;
}

export interface ComponentNode {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  category?: string;
  pipelineType?: string;
  source?: string;
}

export interface ParameterNode {
  id: string;
  name: string;
  displayName?: string;
  paramType: string;
  defaultValue?: unknown;
  required?: boolean;
  description?: string;
  options?: Array<{ value: string; label?: string }>;
  advanced?: boolean;
  condition?: Record<string, unknown>;
}

export interface GraphForViz {
  nodes: Array<{ id: string; label: string; type: string; data?: Record<string, unknown> }>;
  edges: Array<{ id: string; source: string; target: string; type: string; displayName?: string }>;
}

export interface SearchResult {
  components: ComponentNode[];
  parameters: ParameterNode[];
  total: number;
}

export const ontologyApi = {
  health: () => get<OntologyHealth>('/ontology/health'),
  listComponents: (category?: string) =>
    get<{ components: ComponentNode[] }>(category ? `/ontology/components?category=${encodeURIComponent(category)}` : '/ontology/components'),
  getComponent: (id: string) => get<ComponentNode>(`/ontology/components/${encodeURIComponent(id)}`),
  createComponent: (body: ComponentNode) => post<ComponentNode>('/ontology/components', body),
  updateComponent: (id: string, body: Partial<ComponentNode>) => put(`/ontology/components/${encodeURIComponent(id)}`, body),
  deleteComponent: (id: string) => del(`/ontology/components/${encodeURIComponent(id)}`),
  listParameters: (componentId?: string) =>
    get<{ parameters: ParameterNode[] }>(componentId ? `/ontology/parameters?componentId=${encodeURIComponent(componentId)}` : '/ontology/parameters'),
  createParameter: (componentId: string, body: ParameterNode) =>
    post<ParameterNode>('/ontology/parameters', { ...body, componentId }),
  updateParameter: (id: string, body: Partial<ParameterNode>) => put(`/ontology/parameters/${encodeURIComponent(id)}`, body),
  deleteParameter: (id: string) => del(`/ontology/parameters/${encodeURIComponent(id)}`),
  getGraph: (limit?: number) =>
    get<GraphForViz>(limit ? `/ontology/graph?limit=${limit}` : '/ontology/graph'),
  listRelationships: (type?: string) =>
    get<{ relationships: Array<{ fromId: string; toId: string; type: string }> }>(
      type ? `/ontology/relationships?type=${encodeURIComponent(type)}` : '/ontology/relationships'
    ),
  createRelationship: (body: { fromId: string; toId: string; type: string; fromLabel?: string; toLabel?: string; properties?: Record<string, unknown> }) =>
    post<{ success: boolean }>('/ontology/relationships', body),
  deleteRelationship: (fromId: string, toId: string, type: string) =>
    del(`/ontology/relationships?fromId=${encodeURIComponent(fromId)}&toId=${encodeURIComponent(toId)}&type=${encodeURIComponent(type)}`),
  updateRelationship: (body: { fromId: string; toId: string; type: string; displayName?: string }) =>
    put('/ontology/relationships', body),
  search: (q: string, type?: string) =>
    get<SearchResult>(`/ontology/search?q=${encodeURIComponent(q)}${type ? '&type=' + encodeURIComponent(type) : ''}`),
  importMarkdown: (markdown: string) =>
    post<{ created: number; errors: string[] }>('/ontology/import', { markdown }),
  importFilePath: (filePath: string) =>
    post<{ created: number; errors: string[] }>('/ontology/import', { filePath }),
};
