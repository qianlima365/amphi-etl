/**
 * 本体管理 REST API
 * 路由前缀: /ontology
 */

import { Request, Response } from 'express';
import * as ontologyService from '../ontology/service';
import { importParsedToNeo4j, parseMetadataMarkdown, importFromMetadataFilePath } from '../ontology/importFromMetadata';
import { isOntologyAvailable } from '../ontology/neo4j';
import { ComponentNode, ParameterNode, RelationshipCreate } from '../ontology/model';

function requireNeo4j(_req: Request, res: Response, next: () => void) {
  if (!isOntologyAvailable()) {
    res.status(503).json({ error: true, message: 'Ontology backend (Neo4j) not available' });
    return;
  }
  next();
}

// GET /ontology/health
export async function healthHandler(req: Request, res: Response) {
  res.json({
    available: isOntologyAvailable(),
    timestamp: new Date().toISOString(),
  });
}

// GET /ontology/components
export async function listComponentsHandler(req: Request, res: Response) {
  const category = req.query.category as string | undefined;
  const list = await ontologyService.listComponents(category);
  res.json({ components: list });
}

// GET /ontology/components/:id
export async function getComponentHandler(req: Request, res: Response) {
  const c = await ontologyService.getComponent(req.params.id);
  if (!c) {
    res.status(404).json({ error: true, message: 'Component not found' });
    return;
  }
  res.json(c);
}

// POST /ontology/components
export async function createComponentHandler(req: Request, res: Response) {
  const body = req.body as ComponentNode;
  if (!body?.id || !body?.name) {
    res.status(400).json({ error: true, message: 'id and name required' });
    return;
  }
  const ok = await ontologyService.createComponent(body);
  if (!ok) {
    res.status(500).json({ error: true, message: 'Create failed' });
    return;
  }
  res.status(201).json(body);
}

// PUT /ontology/components/:id
export async function updateComponentHandler(req: Request, res: Response) {
  const ok = await ontologyService.updateComponent(req.params.id, req.body);
  if (!ok) {
    res.status(500).json({ error: true, message: 'Update failed' });
    return;
  }
  res.json({ success: true });
}

// DELETE /ontology/components/:id
export async function deleteComponentHandler(req: Request, res: Response) {
  const ok = await ontologyService.deleteComponent(req.params.id);
  if (!ok) {
    res.status(500).json({ error: true, message: 'Delete failed' });
    return;
  }
  res.json({ success: true });
}

// GET /ontology/parameters
export async function listParametersHandler(req: Request, res: Response) {
  const componentId = req.query.componentId as string | undefined;
  const list = await ontologyService.listParameters(componentId);
  res.json({ parameters: list });
}

// POST /ontology/parameters
export async function createParameterHandler(req: Request, res: Response) {
  const body = req.body as ParameterNode & { componentId: string };
  if (!body?.componentId || !body?.id || !body?.name) {
    res.status(400).json({ error: true, message: 'componentId, id, name required' });
    return;
  }
  const { componentId, ...param } = body;
  const ok = await ontologyService.createParameter(param as ParameterNode, componentId);
  if (!ok) {
    res.status(500).json({ error: true, message: 'Create parameter failed' });
    return;
  }
  res.status(201).json(param);
}

// PUT /ontology/parameters/:id
export async function updateParameterHandler(req: Request, res: Response) {
  const ok = await ontologyService.updateParameter(req.params.id, req.body);
  if (!ok) {
    res.status(500).json({ error: true, message: 'Update parameter failed' });
    return;
  }
  res.json({ success: true });
}

// DELETE /ontology/parameters/:id
export async function deleteParameterHandler(req: Request, res: Response) {
  const ok = await ontologyService.deleteParameter(req.params.id);
  if (!ok) {
    res.status(500).json({ error: true, message: 'Delete parameter failed' });
    return;
  }
  res.json({ success: true });
}

// GET /ontology/relationships
export async function listRelationshipsHandler(req: Request, res: Response) {
  const type = req.query.type as string | undefined;
  const list = await ontologyService.listRelationships(type);
  res.json({ relationships: list });
}

// POST /ontology/relationships
export async function createRelationshipHandler(req: Request, res: Response) {
  const body = req.body as RelationshipCreate & { displayName?: string };
  if (!body?.fromId || !body?.toId || !body?.type) {
    res.status(400).json({ error: true, message: 'fromId, toId, type required' });
    return;
  }
  const properties = { ...(body.properties || {}), ...(body.displayName !== undefined && { displayName: body.displayName }) };
  const ok = await ontologyService.createRelationship({ ...body, properties: Object.keys(properties).length ? properties : undefined });
  if (!ok) {
    res.status(500).json({ error: true, message: 'Create relationship failed' });
    return;
  }
  res.status(201).json({ success: true });
}

// PUT /ontology/relationships
export async function updateRelationshipHandler(req: Request, res: Response) {
  const body = req.body as { fromId: string; toId: string; type: string; displayName?: string };
  if (!body?.fromId || !body?.toId || !body?.type) {
    res.status(400).json({ error: true, message: 'fromId, toId, type required' });
    return;
  }
  const ok = await ontologyService.updateRelationship(body.fromId, body.toId, body.type, { displayName: body.displayName });
  if (!ok) {
    res.status(500).json({ error: true, message: 'Update relationship failed' });
    return;
  }
  res.json({ success: true });
}

// DELETE /ontology/relationships
export async function deleteRelationshipHandler(req: Request, res: Response) {
  const fromId = req.query.fromId as string;
  const toId = req.query.toId as string;
  const type = req.query.type as string;
  if (!fromId || !toId || !type) {
    res.status(400).json({ error: true, message: 'fromId, toId, type query params required' });
    return;
  }
  const ok = await ontologyService.deleteRelationship(fromId, toId, type);
  if (!ok) {
    res.status(500).json({ error: true, message: 'Delete relationship failed' });
    return;
  }
  res.json({ success: true });
}

// GET /ontology/graph
export async function getGraphHandler(req: Request, res: Response) {
  const limit = Number(req.query.limit) || 500;
  const graph = await ontologyService.getGraphForViz(limit);
  res.json(graph);
}

// GET /ontology/search
export async function searchHandler(req: Request, res: Response) {
  const q = (req.query.q as string) || '';
  const type = req.query.type as string | undefined;
  const result = await ontologyService.searchOntology(q, type);
  res.json(result);
}

// GET /ontology/ai/components-by-io
export async function getComponentsByInputOutputHandler(req: Request, res: Response) {
  const inputType = req.query.inputType as string | undefined;
  const outputType = req.query.outputType as string | undefined;
  const list = await ontologyService.getComponentsByInputOutput(inputType, outputType);
  res.json({ components: list });
}

// POST /ontology/import
export async function importHandler(req: Request, res: Response) {
  const body = req.body as { source?: 'metadata'; filePath?: string; markdown?: string };
  if (body.markdown) {
    const parsed = parseMetadataMarkdown(body.markdown);
    const result = await importParsedToNeo4j(parsed);
    res.json(result);
    return;
  }
  if (body.filePath) {
    const result = await importFromMetadataFilePath(body.filePath);
    return res.json(result);
  }
  res.status(400).json({ error: true, message: 'Provide markdown or filePath' });
}
