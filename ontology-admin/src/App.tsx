import { useEffect, useState, useMemo, useRef, useCallback, type MouseEvent as ReactMouseEvent } from 'react';
import { Layout, Card, Table, Alert, Input, Spin, message, Drawer, Form, Button, Switch, Select, Space, Divider, Modal, Menu } from 'antd';
import { PlusOutlined, DeleteOutlined, AppstoreOutlined, FormOutlined } from '@ant-design/icons';
import ReactFlow, {
  Node,
  Edge,
  Connection,
  Handle,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  Position,
  type NodeProps,
  type ReactFlowInstance,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { ontologyApi, type ComponentNode, type ParameterNode, type GraphForViz, type OntologyHealth } from './api';

// 节点属性编辑面板
interface NodeDetailPanelProps {
  node: Node | null;
  visible: boolean;
  onClose: () => void;
  onSave: (nodeId: string, updates: Record<string, unknown>) => void;
  onDelete?: (nodeId: string) => Promise<void>;
  onAddParam?: (componentId: string, param: ParameterNode) => Promise<void>;
}

function NodeDetailPanel({ node, visible, onClose, onSave, onDelete, onAddParam }: NodeDetailPanelProps) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showAddParam, setShowAddParam] = useState(false);
  const [newParam, setNewParam] = useState({
    name: '',
    displayName: '',
    paramType: 'input',
    defaultValue: '',
    required: false,
    description: '',
  });
  const [addingParam, setAddingParam] = useState(false);

  useEffect(() => {
    if (node && visible) {
      const data = node.data?.data || node.data || {};
      form.setFieldsValue({
        id: data.id || node.id,
        name: data.name || data.label || node.data?.label,
        displayName: data.displayName ?? '',
        description: data.description || '',
        category: data.category || '',
        pipelineType: data.pipelineType || '',
        paramType: data.paramType || '',
        defaultValue: typeof data.defaultValue === 'object' ? JSON.stringify(data.defaultValue) : (data.defaultValue ?? ''),
        required: data.required || false,
        options: typeof data.options === 'object' ? JSON.stringify(data.options) : (data.options ?? ''),
        advanced: data.advanced || false,
        condition: typeof data.condition === 'object' ? JSON.stringify(data.condition) : (data.condition ?? ''),
      });
      // 重置新增参数表单
      setShowAddParam(false);
      setNewParam({ name: '', displayName: '', paramType: 'input', defaultValue: '', required: false, description: '' });
    }
  }, [node, visible, form]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      // 解析 JSON 字段
      const updates: Record<string, unknown> = { ...values };
      if (values.defaultValue) {
        try { updates.defaultValue = JSON.parse(values.defaultValue); } catch { /* keep as string */ }
      }
      if (values.options) {
        try { updates.options = JSON.parse(values.options); } catch { /* keep as string */ }
      }
      if (values.condition) {
        try { updates.condition = JSON.parse(values.condition); } catch { /* keep as string */ }
      }
      await onSave(node!.id, updates);
      message.success('保存成功');
    } catch (e) {
      message.error('保存失败: ' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddParam = async () => {
    if (!newParam.name) {
      message.warning('请输入参数名称');
      return;
    }
    if (!onAddParam) return;

    setAddingParam(true);
    try {
      const componentId = node!.id;
      const param: ParameterNode = {
        id: `${componentId}.${newParam.name}`,
        name: newParam.name,
        displayName: newParam.displayName || undefined,
        paramType: newParam.paramType,
        defaultValue: newParam.defaultValue || undefined,
        required: newParam.required,
        description: newParam.description || '',
      };
      await onAddParam(componentId, param);
      message.success(`参数 "${newParam.name}" 添加成功`);
      setNewParam({ name: '', displayName: '', paramType: 'input', defaultValue: '', required: false, description: '' });
      setShowAddParam(false);
    } catch (e) {
      message.error('添加参数失败: ' + (e as Error).message);
    } finally {
      setAddingParam(false);
    }
  };

  const handleDelete = async () => {
    if (!node || !onDelete) return;
    Modal.confirm({
      title: '确认删除节点？',
      content: '将同时从画布和后端删除该节点及其连线，且不可恢复。',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        setDeleting(true);
        try {
          await onDelete(node.id);
          message.success('节点已删除');
          onClose();
        } catch (e) {
          message.error('删除失败: ' + (e as Error).message);
        } finally {
          setDeleting(false);
        }
      },
    });
  };

  const nodeType = node?.className || node?.type || 'Node';
  const isComponent = nodeType === 'Component' || nodeType.startsWith('Component');
  const isParameter = nodeType.includes('Parameter');

  return (
    <Drawer
      title={`编辑${isComponent ? '组件' : isParameter ? '参数' : '节点'}属性`}
      placement="right"
      width={450}
      onClose={onClose}
      open={visible}
      extra={
        <Space>
          <Button danger onClick={handleDelete} loading={deleting}>
            删除
          </Button>
          <Button type="primary" onClick={handleSave} loading={saving}>
            保存
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical">
        <Form.Item label="ID" name="id">
          <Input disabled />
        </Form.Item>
        <Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
          <Input placeholder="输入名称（英文/代码用）" />
        </Form.Item>
        <Form.Item label="展示名" name="displayName">
          <Input placeholder="图谱显示用，可填中文，不填则显示名称" />
        </Form.Item>
        <Form.Item label="描述" name="description">
          <Input.TextArea rows={3} placeholder="输入描述" />
        </Form.Item>
        {isComponent && (
          <>
            <Form.Item label="分类" name="category">
              <Input placeholder="如: inputs.Databases" />
            </Form.Item>
            <Form.Item label="Pipeline 类型" name="pipelineType">
              <Input placeholder="如: pandas_df_input" />
            </Form.Item>
          </>
        )}
        {isParameter && (
          <>
            <Form.Item label="参数类型" name="paramType">
              <Input placeholder="如: input, select, radio, codeTextarea" />
            </Form.Item>
            <Form.Item label="默认值" name="defaultValue">
              <Input.TextArea rows={2} placeholder="默认值（JSON 或字符串）" />
            </Form.Item>
            <Form.Item label="必填" name="required" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item label="高级参数" name="advanced" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item label="选项 (JSON)" name="options">
              <Input.TextArea rows={3} placeholder='如: [{"value":"a","label":"A"}]' />
            </Form.Item>
            <Form.Item label="显示条件 (JSON)" name="condition">
              <Input.TextArea rows={3} placeholder='如: {"fieldName": "expectedValue"}' />
            </Form.Item>
          </>
        )}
      </Form>

      {/* 为组件添加新参数 */}
      {isComponent && onAddParam && (
        <>
          <Divider>添加新参数</Divider>
          {!showAddParam ? (
            <Button
              type="dashed"
              block
              icon={<PlusOutlined />}
              onClick={() => setShowAddParam(true)}
            >
              为此组件添加参数
            </Button>
          ) : (
            <Card size="small" title="新参数">
              <Space direction="vertical" style={{ width: '100%' }}>
                <Input
                  placeholder="参数名称 (如: host)"
                  value={newParam.name}
                  onChange={(e) => setNewParam({ ...newParam, name: e.target.value })}
                />
                <Input
                  placeholder="展示名（可选，可填中文）"
                  value={newParam.displayName}
                  onChange={(e) => setNewParam({ ...newParam, displayName: e.target.value })}
                />
                <Space>
                  <Select
                    style={{ width: 140 }}
                    value={newParam.paramType}
                    options={[
                      { value: 'input', label: '文本输入' },
                      { value: 'inputNumber', label: '数字输入' },
                      { value: 'select', label: '下拉选择' },
                      { value: 'radio', label: '单选' },
                      { value: 'boolean', label: '开关' },
                      { value: 'codeTextarea', label: '代码文本' },
                      { value: 'file', label: '文件选择' },
                      { value: 'keyvalue', label: '键值对' },
                    ]}
                    onChange={(v) => setNewParam({ ...newParam, paramType: v })}
                  />
                  <Switch
                    checkedChildren="必填"
                    unCheckedChildren="可选"
                    checked={newParam.required}
                    onChange={(v) => setNewParam({ ...newParam, required: v })}
                  />
                </Space>
                <Input
                  placeholder="默认值"
                  value={newParam.defaultValue}
                  onChange={(e) => setNewParam({ ...newParam, defaultValue: e.target.value })}
                />
                <Input
                  placeholder="参数描述"
                  value={newParam.description}
                  onChange={(e) => setNewParam({ ...newParam, description: e.target.value })}
                />
                <Space>
                  <Button type="primary" onClick={handleAddParam} loading={addingParam}>
                    添加
                  </Button>
                  <Button onClick={() => setShowAddParam(false)}>取消</Button>
                </Space>
              </Space>
            </Card>
          )}
        </>
      )}
    </Drawer>
  );
}

// 参数类型选项
const PARAM_TYPE_OPTIONS = [
  { value: 'input', label: '文本输入' },
  { value: 'inputNumber', label: '数字输入' },
  { value: 'select', label: '下拉选择' },
  { value: 'radio', label: '单选' },
  { value: 'boolean', label: '开关' },
  { value: 'codeTextarea', label: '代码文本' },
  { value: 'file', label: '文件选择' },
  { value: 'keyvalue', label: '键值对' },
];

// 关系类型选项（与 Neo4j REL_TYPES 一致）
// 带连接点的节点，用于画布上拖动创建连线
function NodeWithHandles(props: NodeProps) {
  return (
    <>
      <Handle type="target" position={Position.Top} />
      <Handle type="target" position={Position.Left} />
      <Handle type="target" position={Position.Right} />
      <Handle type="target" position={Position.Bottom} />
      <Handle type="source" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Left} id="left" />
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <div style={{ padding: '4px 8px' }}>{props.data?.label ?? props.id}</div>
    </>
  );
}

const NODE_TYPES = { default: NodeWithHandles };

const REL_TYPE_OPTIONS = [
  { value: 'HAS_PARAMETER', label: 'HAS_PARAMETER（拥有参数）' },
  { value: 'CAN_FOLLOW', label: 'CAN_FOLLOW（可跟随）' },
  { value: 'ACCEPTS_INPUT', label: 'ACCEPTS_INPUT' },
  { value: 'PRODUCES_OUTPUT', label: 'PRODUCES_OUTPUT' },
  { value: 'BELONGS_TO_CATEGORY', label: 'BELONGS_TO_CATEGORY' },
  { value: 'PARAMETER_TYPE', label: 'PARAMETER_TYPE' },
  { value: 'OPTION_OF', label: 'OPTION_OF' },
];

// 不同关系类型对应连线颜色
const REL_TYPE_STROKE: Record<string, string> = {
  HAS_PARAMETER: '#faad14',
  CAN_FOLLOW: '#1890ff',
  ACCEPTS_INPUT: '#fa8c16',
  PRODUCES_OUTPUT: '#722ed1',
  BELONGS_TO_CATEGORY: '#13c2c2',
  PARAMETER_TYPE: '#eb2f96',
  OPTION_OF: '#52c41a',
};
function getEdgeStrokeColor(relType: string): string {
  return REL_TYPE_STROKE[relType] ?? '#8c8c8c';
}

// 连线（关系）编辑面板
interface EdgeDetailPanelProps {
  edge: Edge | null;
  visible: boolean;
  onClose: () => void;
  onSave: (source: string, target: string, oldType: string, newType: string, displayName?: string) => Promise<void>;
  onDelete: (source: string, target: string, type: string) => Promise<void>;
}

function EdgeDetailPanel({ edge, visible, onClose, onSave, onDelete }: EdgeDetailPanelProps) {
  const [relType, setRelType] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const source = edge?.source ?? '';
  const target = edge?.target ?? '';
  const edgeData = edge?.data as { type?: string; displayName?: string } | undefined;
  const currentType = edgeData?.type ?? (edge?.label as string) ?? '';

  useEffect(() => {
    if (edge && visible) {
      setRelType(currentType);
      setDisplayName(edgeData?.displayName ?? '');
    }
  }, [edge, visible, currentType, edgeData?.displayName]);

  const handleSave = async () => {
    if (!edge || !relType) return;
    setSaving(true);
    try {
      await onSave(source, target, currentType, relType, displayName || undefined);
      message.success('关系已更新');
      onClose();
    } catch (e) {
      message.error('更新失败: ' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!edge) return;
    setDeleting(true);
    try {
      await onDelete(source, target, currentType);
      message.success('关系已删除');
      onClose();
    } catch (e) {
      message.error('删除失败: ' + (e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Drawer
      title="编辑连线（关系）"
      placement="right"
      width={400}
      onClose={onClose}
      open={visible}
      extra={
        <Space>
          <Button danger onClick={handleDelete} loading={deleting}>
            删除关系
          </Button>
          <Button type="primary" onClick={handleSave} loading={saving}>
            保存
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        <Form.Item label="源节点 (Source)">
          <Input value={source} disabled />
        </Form.Item>
        <Form.Item label="目标节点 (Target)">
          <Input value={target} disabled />
        </Form.Item>
        <Form.Item label="关系类型 (Type)">
          <Select
            style={{ width: '100%' }}
            value={relType}
            onChange={setRelType}
            options={REL_TYPE_OPTIONS}
          />
        </Form.Item>
        <Form.Item label="展示名">
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="图谱显示用，可填中文，不填则显示关系类型"
          />
        </Form.Item>
      </Space>
    </Drawer>
  );
}

// 添加组件面板
interface AddComponentPanelProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ParamFormItem {
  key: string;
  name: string;
  displayName: string;
  paramType: string;
  defaultValue: string;
  required: boolean;
  description: string;
}

function AddComponentPanel({ visible, onClose, onSuccess }: AddComponentPanelProps) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [params, setParams] = useState<ParamFormItem[]>([]);

  // 重置表单
  useEffect(() => {
    if (visible) {
      form.resetFields();
      setParams([]);
    }
  }, [visible, form]);

  // 添加参数
  const addParam = () => {
    setParams([
      ...params,
      {
        key: `param_${Date.now()}`,
        name: '',
        displayName: '',
        paramType: 'input',
        defaultValue: '',
        required: false,
        description: '',
      },
    ]);
  };

  // 删除参数
  const removeParam = (key: string) => {
    setParams(params.filter((p) => p.key !== key));
  };

  // 更新参数
  const updateParam = (key: string, field: keyof ParamFormItem, value: unknown) => {
    setParams(params.map((p) => (p.key === key ? { ...p, [field]: value } : p)));
  };

  // 提交
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      // 1. 创建组件
      const component: ComponentNode = {
        id: values.id,
        name: values.name,
        displayName: values.displayName || undefined,
        description: values.description || '',
        category: values.category || '',
        pipelineType: values.pipelineType || '',
      };
      await ontologyApi.createComponent(component);

      // 2. 创建参数
      for (const p of params) {
        if (!p.name) continue;
        const param: ParameterNode = {
          id: `${values.id}.${p.name}`,
          name: p.name,
          displayName: p.displayName || undefined,
          paramType: p.paramType,
          defaultValue: p.defaultValue || undefined,
          required: p.required,
          description: p.description || '',
        };
        await ontologyApi.createParameter(values.id, param);
      }

      message.success(`组件 "${values.name}" 创建成功，包含 ${params.filter((p) => p.name).length} 个参数`);
      onSuccess();
      onClose();
    } catch (e) {
      message.error('创建失败: ' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      title="添加组件"
      placement="right"
      width={500}
      onClose={onClose}
      open={visible}
      extra={
        <Button type="primary" onClick={handleSubmit} loading={saving}>
          提交
        </Button>
      }
    >
      <Form form={form} layout="vertical">
        <Form.Item
          label="组件 ID"
          name="id"
          rules={[
            { required: true, message: '请输入组件 ID' },
            { pattern: /^[a-zA-Z][a-zA-Z0-9_]*$/, message: 'ID 必须以字母开头，只能包含字母、数字、下划线' },
          ]}
        >
          <Input placeholder="如: mySQLInput" />
        </Form.Item>
        <Form.Item
          label="组件名称"
          name="name"
          rules={[{ required: true, message: '请输入组件名称' }]}
        >
          <Input placeholder="如: MySQL Input（英文/代码用）" />
        </Form.Item>
        <Form.Item label="展示名" name="displayName">
          <Input placeholder="图谱显示用，可填中文，不填则显示名称" />
        </Form.Item>
        <Form.Item label="描述" name="description">
          <Input.TextArea rows={2} placeholder="组件功能描述" />
        </Form.Item>
        <Form.Item label="分类" name="category">
          <Input placeholder="如: inputs.Databases" />
        </Form.Item>
        <Form.Item label="Pipeline 类型" name="pipelineType">
          <Input placeholder="如: pandas_df_input" />
        </Form.Item>
      </Form>

      <Divider>参数列表</Divider>

      {params.map((p, index) => (
        <Card
          key={p.key}
          size="small"
          title={`参数 ${index + 1}`}
          style={{ marginBottom: 12 }}
          extra={
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => removeParam(p.key)}
            />
          }
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <Input
              placeholder="参数名称 (如: host)"
              value={p.name}
              onChange={(e) => updateParam(p.key, 'name', e.target.value)}
            />
            <Input
              placeholder="展示名（可选，可填中文）"
              value={p.displayName}
              onChange={(e) => updateParam(p.key, 'displayName', e.target.value)}
            />
            <Space>
              <Select
                style={{ width: 140 }}
                value={p.paramType}
                options={PARAM_TYPE_OPTIONS}
                onChange={(v) => updateParam(p.key, 'paramType', v)}
              />
              <Switch
                checkedChildren="必填"
                unCheckedChildren="可选"
                checked={p.required}
                onChange={(v) => updateParam(p.key, 'required', v)}
              />
            </Space>
            <Input
              placeholder="默认值"
              value={p.defaultValue}
              onChange={(e) => updateParam(p.key, 'defaultValue', e.target.value)}
            />
            <Input
              placeholder="参数描述"
              value={p.description}
              onChange={(e) => updateParam(p.key, 'description', e.target.value)}
            />
          </Space>
        </Card>
      ))}

      <Button
        type="dashed"
        block
        icon={<PlusOutlined />}
        onClick={addParam}
      >
        添加参数
      </Button>
    </Drawer>
  );
}

const { Header, Content } = Layout;
const { Search } = Input;

/** 根据节点数量计算合适的半径，确保相邻节点不重叠 */
function computeRadiusForCount(count: number, minRadius: number = 160, minSpacing: number = 180): number {
  if (count <= 1) return minRadius;
  const radiusBySpacing = (minSpacing * count) / (2 * Math.PI);
  return Math.max(minRadius, radiusBySpacing);
}

/** 根据两节点相对位置计算连线方向（就近原则：从两节点最近的两侧连，即最短路径） */
function getEdgePositions(
  sourcePos: { x: number; y: number },
  targetPos: { x: number; y: number },
  sourceSize?: { width: number; height: number },
  targetSize?: { width: number; height: number }
): { sourcePosition: Position; targetPosition: Position } {
  const srcCenter = {
    x: sourcePos.x + (sourceSize ? sourceSize.width / 2 : 0),
    y: sourcePos.y + (sourceSize ? sourceSize.height / 2 : 0),
  };
  const tgtCenter = {
    x: targetPos.x + (targetSize ? targetSize.width / 2 : 0),
    y: targetPos.y + (targetSize ? targetSize.height / 2 : 0),
  };
  const dx = tgtCenter.x - srcCenter.x;
  const dy = tgtCenter.y - srcCenter.y;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  let sourcePosition: Position;
  let targetPosition: Position;
  if (absDx > absDy) {
    sourcePosition = dx > 0 ? Position.Right : Position.Left;
    targetPosition = dx > 0 ? Position.Left : Position.Right;
  } else {
    sourcePosition = dy > 0 ? Position.Bottom : Position.Top;
    targetPosition = dy > 0 ? Position.Top : Position.Bottom;
  }
  return { sourcePosition, targetPosition };
}

/**
 * 簇状布局：组件作为簇心，参数围绕组件分布；多个簇在画布上自然错落排布（网格 + 轻微随机偏移）
 * 不围绕单一中心，每个组件带自己的参数形成独立簇，整体更自然
 */
function clusterLayout(
  nodeList: GraphForViz['nodes'],
  edgeList: GraphForViz['edges'],
): { x: number; y: number }[] {
  const components = nodeList.filter((n) => n.type === 'Component');
  const params = nodeList.filter((n) => n.type === 'Parameter');
  const compToParams = new Map<string, string[]>();

  for (const e of edgeList) {
    if (e.type !== 'HAS_PARAMETER') continue;
    const from = e.source;
    const to = e.target;
    const comp = components.some((c) => c.id === from) ? from : components.some((c) => c.id === to) ? to : null;
    const param = comp === from ? to : comp === to ? from : null;
    if (comp && param) {
      if (!compToParams.has(comp)) compToParams.set(comp, []);
      compToParams.get(comp)!.push(param);
    }
  }

  const cols = 4;
  const clusterGapX = 320;
  const clusterGapY = 280;
  const paramRadius = 130;
  const posMap = new Map<string, { x: number; y: number }>();

  const jitter = (i: number, seed: number) => ((i * 7 + seed) % 11) - 5;
  components.forEach((c, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const cx = col * clusterGapX + jitter(i, 1);
    const cy = row * clusterGapY + jitter(i, 2);
    posMap.set(c.id, { x: cx, y: cy });

    const paramIds = compToParams.get(c.id) ?? [];
    const n = paramIds.length;
    paramIds.forEach((pid, k) => {
      const angle = (2 * Math.PI * k) / Math.max(n, 1) - Math.PI / 2;
      const r = n <= 1 ? 0 : paramRadius;
      posMap.set(pid, {
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
      });
    });
  });

  let orphanIndex = 0;
  params.forEach((p) => {
    if (!posMap.has(p.id)) {
      const row = Math.floor(orphanIndex / 4);
      const col = orphanIndex % 4;
      orphanIndex += 1;
      posMap.set(p.id, { x: 240 + col * 120, y: 240 + row * 80 });
    }
  });

  return nodeList.map((n) => posMap.get(n.id) ?? { x: 0, y: 0 });
}

// 连线类型选项
const EDGE_TYPE_OPTIONS = [
  { value: 'smoothstep', label: '平滑直角（推荐）' },
  { value: 'step', label: '直角折线' },
  { value: 'straight', label: '直线' },
  { value: 'default', label: '贝塞尔曲线' },
];

function GraphView() {
  const [graph, setGraph] = useState<GraphForViz | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [panelVisible, setPanelVisible] = useState(false);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  const [edgePanelVisible, setEdgePanelVisible] = useState(false);
  const [addPanelVisible, setAddPanelVisible] = useState(false);
  const [edgeType, setEdgeType] = useState<string>('smoothstep');

  // 加载图数据
  const loadGraph = useCallback(() => {
    setLoading(true);
    ontologyApi.getGraph(2000)
      .then(setGraph)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // 计算节点位置（簇状布局：组件为簇心，参数围绕组件；多簇自然排布）
  const nodePositions = useMemo(() => {
    if (!graph?.nodes?.length) return new Map<string, { x: number; y: number }>();
    const positions = clusterLayout(graph.nodes, graph?.edges ?? []);
    const posMap = new Map<string, { x: number; y: number }>();
    graph.nodes.forEach((n, i) => {
      posMap.set(n.id, positions[i] ?? { x: 0, y: 0 });
    });
    return posMap;
  }, [graph?.nodes, graph?.edges]);

  const initialNodes: Node[] = useMemo(() => {
    if (!graph?.nodes?.length) return [];
    return graph.nodes.map((n) => {
      const isComponent = n.type === 'Component';
      const isParameter = n.type === 'Parameter';
      return {
        id: n.id,
        type: 'default',
        position: nodePositions.get(n.id) ?? { x: 0, y: 0 },
        data: { label: n.label || n.id, data: n.data },
        className: isComponent ? n.type : `${n.type} node--flow-follow`,
        style: isComponent
          ? { width: 120, height: 44, minWidth: 100 }
          : isParameter
            ? { width: 100, height: 40 }
            : undefined,
        draggable: true,
      };
    });
  }, [graph?.nodes, nodePositions]);

  const initialEdges: Edge[] = useMemo(() => {
    if (!graph?.edges?.length) return [];
    const nodeSize = (id: string) => {
      const n = graph?.nodes?.find((nd) => nd.id === id);
      if (!n) return undefined;
      return n.type === 'Component' ? { width: 120, height: 44 } : n.type === 'Parameter' ? { width: 100, height: 40 } : undefined;
    };
    return graph.edges.map((e) => {
      const sourcePos = nodePositions.get(e.source);
      const targetPos = nodePositions.get(e.target);
      const edgePositions = sourcePos && targetPos
        ? getEdgePositions(sourcePos, targetPos, nodeSize(e.source), nodeSize(e.target))
        : { sourcePosition: Position.Right, targetPosition: Position.Left };
      const label = e.displayName ?? e.type;
      const strokeColor = getEdgeStrokeColor(e.type);
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        label,
        type: edgeType,
        sourcePosition: edgePositions.sourcePosition,
        targetPosition: edgePositions.targetPosition,
        style: { strokeDasharray: '8 4', stroke: strokeColor },
        labelStyle: { fill: strokeColor, color: strokeColor, fontWeight: 700, fontSize: 16 },
        labelBgStyle: { fill: '#fff', fillOpacity: 0.9 },
        labelBgPadding: [4, 8] as [number, number],
        labelBgBorderRadius: 4,
        className: 'edge--dash-flow',
        data: { displayName: e.displayName, type: e.type },
      } as Edge;
    });
  }, [graph?.edges, edgeType, nodePositions]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const initializedRef = useRef(false);
  const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null);
  const dragLastPos = useRef<{ x: number; y: number } | null>(null);
  const dragStartRef = useRef<{ center: { x: number; y: number }; children: Map<string, { x: number; y: number }> } | null>(null);
  const followTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 拖放「参数」到画布空白时弹出的表单（需选择所属组件）
  const [addParamModal, setAddParamModal] = useState<{ visible: boolean; position: { x: number; y: number } | null; componentId: string; paramName: string }>({
    visible: false,
    position: null,
    componentId: '',
    paramName: '',
  });
  const [componentOptions, setComponentOptions] = useState<Array<{ value: string; label: string }>>([]);

  // 中心拖动：只有 Parameter 子节点跟随 Component 移动，其他 Component 不受影响
  const isCenterNode = (n: Node) => n.className === 'Component' || n.type === 'Component';
  const isParameterNode = (n: Node) => (n.className || '').includes('Parameter');

  // 获取某个 Component 直接关联的 Parameter 子节点（通过 HAS_PARAMETER 关系）
  const getParameterChildren = (componentId: string, currentNodes: Node[]) => {
    const connectedIds = new Set(
      edges.flatMap((e) =>
        e.source === componentId ? [e.target] : e.target === componentId ? [e.source] : []
      )
    );
    // 只返回 Parameter 类型的节点，排除其他 Component
    return currentNodes.filter((n) => connectedIds.has(n.id) && isParameterNode(n));
  };

  const onNodeDragStart = (_: ReactMouseEvent, node: Node) => {
    if (!isCenterNode(node)) return;
    dragLastPos.current = { ...node.position };
    const paramChildren = getParameterChildren(node.id, nodes);
    const children = new Map<string, { x: number; y: number }>();
    paramChildren.forEach((n) => {
      children.set(n.id, { ...n.position });
    });
    dragStartRef.current = { center: { ...node.position }, children };
  };
  const onNodeDrag = (_: ReactMouseEvent, node: Node) => {
    const last = dragLastPos.current;
    const start = dragStartRef.current;
    if (!last || !start || !isCenterNode(node)) return;
    if (followTimerRef.current != null) clearTimeout(followTimerRef.current);
    setNodes((currentNodes) =>
      currentNodes.map((n) => (n.id === node.id ? { ...n, position: node.position } : n))
    );
    dragLastPos.current = { ...node.position };
    followTimerRef.current = setTimeout(() => {
      followTimerRef.current = null;
      setNodes((currentNodes) => {
          const centerNode = currentNodes.find((n) => n.id === node.id);
          const centerNow = centerNode?.position ?? node.position;
          // 只获取 Parameter 类型的子节点
          const paramChildren = getParameterChildren(node.id, currentNodes);
          const childIds = paramChildren.map((n) => n.id).sort();
          const childCount = childIds.length;
          // 根据子节点数量动态计算半径，避免重叠
          const radius = computeRadiusForCount(childCount);
          const childPosMap = new Map<string, { x: number; y: number }>();
          childIds.forEach((id, i) => {
            const angle = (2 * Math.PI * i) / Math.max(childCount, 1) - Math.PI / 2;
            childPosMap.set(id, {
              x: centerNow.x + radius * Math.cos(angle),
              y: centerNow.y + radius * Math.sin(angle),
            });
          });
          return currentNodes.map((n) => {
            if (n.id === node.id) return { ...n, position: centerNow };
            const newPos = childPosMap.get(n.id);
            if (newPos) return { ...n, position: newPos };
            return n;
          });
        });
    }, 48);
  };
  // 根据当前节点位置更新边的连接方向（就近原则）
  const updateEdgePositions = useCallback((currentNodes: Node[]) => {
    const posMap = new Map<string, { x: number; y: number }>();
    const sizeMap = new Map<string, { width: number; height: number }>();
    currentNodes.forEach((n) => {
      posMap.set(n.id, n.position);
      const w = (n.style as { width?: number })?.width;
      const h = (n.style as { height?: number })?.height;
      if (w != null && h != null) sizeMap.set(n.id, { width: w, height: h });
    });

    setEdges((currentEdges) =>
      currentEdges.map((e) => {
        const sourcePos = posMap.get(e.source);
        const targetPos = posMap.get(e.target);
        if (sourcePos && targetPos) {
          const edgePositions = getEdgePositions(sourcePos, targetPos, sizeMap.get(e.source), sizeMap.get(e.target));
          return {
            ...e,
            sourcePosition: edgePositions.sourcePosition,
            targetPosition: edgePositions.targetPosition,
          };
        }
        return e;
      })
    );
  }, [setEdges]);

  const onNodeDragStop = (_: ReactMouseEvent, node: Node) => {
    if (!isCenterNode(node)) return;
    if (followTimerRef.current != null) {
      clearTimeout(followTimerRef.current);
      followTimerRef.current = null;
    }
    // 拖动结束时立即重新分布子节点（只移动 Parameter 类型）
    setNodes((currentNodes) => {
      const centerNode = currentNodes.find((n) => n.id === node.id);
      const centerNow = centerNode?.position ?? node.position;
      // 只获取 Parameter 类型的子节点
      const paramChildren = getParameterChildren(node.id, currentNodes);
      const childIds = paramChildren.map((n) => n.id).sort();
      const childCount = childIds.length;
      // 根据子节点数量动态计算半径，避免重叠
      const radius = computeRadiusForCount(childCount);
      const childPosMap = new Map<string, { x: number; y: number }>();
      childIds.forEach((id, i) => {
        const angle = (2 * Math.PI * i) / Math.max(childCount, 1) - Math.PI / 2;
        childPosMap.set(id, {
          x: centerNow.x + radius * Math.cos(angle),
          y: centerNow.y + radius * Math.sin(angle),
        });
      });
      const newNodes = currentNodes.map((n) => {
        if (n.id === node.id) return { ...n, position: centerNow };
        const newPos = childPosMap.get(n.id);
        if (newPos) return { ...n, position: newPos };
        return n;
      });
      // 更新边的连接方向
      setTimeout(() => updateEdgePositions(newNodes), 0);
      return newNodes;
    });
    dragStartRef.current = null;
  };

  // 节点点击：打开属性编辑面板
  const onNodeClick = useCallback((_: ReactMouseEvent, node: Node) => {
    // 从 nodes 状态中查找完整的节点数据，而不是使用 React Flow 传递的 node
    const fullNode = nodes.find((n) => n.id === node.id);
    setSelectedNode(fullNode || node);
    setPanelVisible(true);
  }, [nodes]);

  // 保存节点属性（只更新该节点数据与展示名，不整图刷新）
  const handleSaveNode = useCallback(async (nodeId: string, updates: Record<string, unknown>) => {
    const node = nodes.find((n) => n.id === nodeId);
    const nodeType = node?.className || '';
    const isComponent = nodeType === 'Component' || nodeType.startsWith('Component');
    if (isComponent) {
      await ontologyApi.updateComponent(nodeId, updates as Partial<ComponentNode>);
    } else {
      await ontologyApi.updateParameter(nodeId, updates as Partial<ParameterNode>);
    }
    const mergedData = { ...node?.data?.data, ...updates };
    const displayLabel = (mergedData.displayName ?? mergedData.name ?? node?.data?.label ?? nodeId) as string;
    setNodes((currentNodes) =>
      currentNodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, label: displayLabel, data: mergedData } }
          : n
      )
    );
  }, [nodes, setNodes]);

  // 从右侧编辑面板删除当前节点（与保存按钮同处）
  const handleDeleteNode = useCallback(
    async (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      const nodeType = node?.className || node?.type || '';
      const isComponent = nodeType === 'Component' || nodeType.startsWith('Component');
      if (isComponent) {
        await ontologyApi.deleteComponent(nodeId);
      } else {
        await ontologyApi.deleteParameter(nodeId);
      }
      setNodes((prev) => prev.filter((n) => n.id !== nodeId));
      setEdges((prev) => prev.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setPanelVisible(false);
    },
    [nodes, setNodes, setEdges]
  );

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  useEffect(() => {
    // 只在首次获取到数据时初始化，之后保持用户操作的位置不被覆盖
    if (!initializedRef.current && initialNodes.length) {
      setNodes(initialNodes);
      setEdges(initialEdges);
      initializedRef.current = true;
    }
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // 添加组件成功后刷新图谱
  const handleAddSuccess = useCallback(() => {
    initializedRef.current = false; // 允许重新初始化
    loadGraph();
  }, [loadGraph]);

  // 为组件添加新参数
  const handleAddParam = useCallback(async (componentId: string, param: ParameterNode) => {
    await ontologyApi.createParameter(componentId, param);
    // 刷新图谱以显示新参数
    initializedRef.current = false;
    loadGraph();
  }, [loadGraph]);

  // 点击连线打开编辑面板
  const onEdgeClick = useCallback((_: ReactMouseEvent, edge: Edge) => {
    setSelectedEdge(edge);
    setEdgePanelVisible(true);
  }, []);

  // 保存连线（关系）：若类型变更则先删后建；展示名通过 properties 或 updateRelationship 写入；保存后只更新该连线显示，不整图刷新
  const handleSaveEdge = useCallback(
    async (source: string, target: string, oldType: string, newType: string, displayName?: string) => {
      if (oldType !== newType) {
        await ontologyApi.deleteRelationship(source, target, oldType);
        await ontologyApi.createRelationship({
          fromId: source,
          toId: target,
          type: newType,
          properties: displayName !== undefined && displayName !== '' ? { displayName } : undefined,
        });
      } else if (displayName !== undefined) {
        await ontologyApi.updateRelationship({ fromId: source, toId: target, type: oldType, displayName: displayName || undefined });
      }
      const labelText = displayName !== undefined && displayName !== '' ? displayName : newType;
      setEdges((prev) => {
        if (oldType !== newType) {
          const oldId = `${source}-${target}-${oldType}`;
          const oldEdge = prev.find((e) => e.id === oldId || (e.source === source && e.target === target && (e.data?.type as string) === oldType)) as Edge | undefined;
          const strokeColor = getEdgeStrokeColor(newType);
          const newEdge = {
            id: `${source}-${target}-${newType}`,
            source,
            target,
            label: labelText,
            type: edgeType,
            sourcePosition: (oldEdge as { sourcePosition?: Position })?.sourcePosition ?? Position.Right,
            targetPosition: (oldEdge as { targetPosition?: Position })?.targetPosition ?? Position.Left,
            style: { strokeDasharray: '8 4', stroke: strokeColor },
            labelStyle: { fill: strokeColor, color: strokeColor, fontWeight: 700, fontSize: 16 },
            labelBgStyle: { fill: '#fff', fillOpacity: 0.9 },
            labelBgPadding: [4, 8] as [number, number],
            labelBgBorderRadius: 4,
            className: 'edge--dash-flow',
            data: { displayName: displayName || undefined, type: newType },
          } as Edge;
          return prev
            .filter((e) => e.id !== oldId && !(e.source === source && e.target === target && (e.data?.type as string) === oldType))
            .concat([newEdge]);
        }
        return prev.map((e) =>
          e.source === source && e.target === target && ((e.data?.type as string) === oldType || (e.data?.type as string) === newType)
            ? { ...e, label: labelText, data: { ...e.data, displayName: displayName ?? (e.data as { displayName?: string })?.displayName, type: newType } }
            : e
        );
      });
    },
    [edgeType, setEdges]
  );

  // 删除连线（关系）
  const handleDeleteEdge = useCallback(async (source: string, target: string, type: string) => {
    await ontologyApi.deleteRelationship(source, target, type);
    initializedRef.current = false;
    loadGraph();
  }, [loadGraph]);

  // 画布可编辑：从一节点拖到另一节点创建连线
  const onConnect = useCallback(
    async (connection: Connection) => {
      const sourceId = connection.source ?? '';
      const targetId = connection.target ?? '';
      const sourceNode = nodes.find((n) => n.id === sourceId);
      const targetNode = nodes.find((n) => n.id === targetId);
      const isComponent = (n: Node) => n.className === 'Component' || n.type === 'Component';
      const isParameter = (n: Node) => (n.className || '').includes('Parameter');
      let fromId: string;
      let toId: string;
      let relType: string;
      if (sourceNode && targetNode) {
        if (isComponent(sourceNode) && isParameter(targetNode)) {
          fromId = sourceId;
          toId = targetId;
          relType = 'HAS_PARAMETER';
        } else if (isParameter(sourceNode) && isComponent(targetNode)) {
          fromId = targetId;
          toId = sourceId;
          relType = 'HAS_PARAMETER';
        } else if (isComponent(sourceNode) && isComponent(targetNode)) {
          fromId = sourceId;
          toId = targetId;
          relType = 'CAN_FOLLOW';
        } else {
          message.warning('当前仅支持：组件↔参数(HAS_PARAMETER)、组件→组件(CAN_FOLLOW)');
          return;
        }
      } else {
        message.warning('未找到节点信息');
        return;
      }
      try {
        await ontologyApi.createRelationship({ fromId, toId, type: relType });
        const sourcePos = sourceNode.position;
        const targetPos = targetNode.position;
        const srcStyle = sourceNode.style as { width?: number; height?: number } | undefined;
        const tgtStyle = targetNode.style as { width?: number; height?: number } | undefined;
        const edgePositions = getEdgePositions(
          sourcePos,
          targetPos,
          srcStyle?.width != null && srcStyle?.height != null ? { width: srcStyle.width, height: srcStyle.height } : undefined,
          tgtStyle?.width != null && tgtStyle?.height != null ? { width: tgtStyle.width, height: tgtStyle.height } : undefined
        );
        const strokeColor = getEdgeStrokeColor(relType);
        const newEdge = {
          id: `${fromId}-${toId}-${relType}`,
          source: sourceId,
          target: targetId,
          label: relType,
          type: edgeType,
          sourcePosition: edgePositions.sourcePosition,
          targetPosition: edgePositions.targetPosition,
          style: { strokeDasharray: '8 4', stroke: strokeColor },
          labelStyle: { fill: strokeColor, color: strokeColor, fontWeight: 700, fontSize: 16 },
          labelBgStyle: { fill: '#fff', fillOpacity: 0.9 },
          labelBgPadding: [4, 8] as [number, number],
          labelBgBorderRadius: 4,
          className: 'edge--dash-flow',
          data: { displayName: relType, type: relType },
        } as Edge;
        setEdges((prev) => [...prev, newEdge]);
        message.success('连线已创建');
      } catch (e) {
        message.error('创建连线失败: ' + (e as Error).message);
      }
    },
    [nodes, edgeType, setEdges]
  );

  // 画布可编辑：删除连线时同步到后端
  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      deleted.forEach((edge) => {
        const relType = (edge.data?.type as string) || 'CAN_FOLLOW';
        ontologyApi.deleteRelationship(edge.source, edge.target, relType).catch((e) => {
          message.error(`删除连线失败: ${(e as Error).message}`);
        });
      });
    },
    []
  );

  // 画布可编辑：删除节点时同步到后端（节点已被 React Flow 从画布移除，取消则刷新恢复）
  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      if (deleted.length === 0) return;
      Modal.confirm({
        title: '节点已从画布移除',
        content: `是否同时从后端删除这 ${deleted.length} 个节点？选择「取消」将刷新画布以恢复节点。`,
        okText: '从后端删除',
        okType: 'danger',
        cancelText: '取消并恢复',
        onOk: async () => {
          for (const node of deleted) {
            const nodeType = node.className || node.type || '';
            const isComponent = nodeType === 'Component' || nodeType.startsWith('Component');
            try {
              if (isComponent) {
                await ontologyApi.deleteComponent(node.id);
              } else {
                await ontologyApi.deleteParameter(node.id);
              }
            } catch (e) {
              message.error(`删除节点 ${node.id} 失败: ${(e as Error).message}`);
            }
          }
        },
        onCancel: () => {
          initializedRef.current = false;
          loadGraph();
        },
      });
    },
    [loadGraph]
  );

  // 切换连线类型时更新所有边
  const handleEdgeTypeChange = useCallback((newType: string) => {
    setEdgeType(newType);
    setEdges((currentEdges) =>
      currentEdges.map((e) => ({ ...e, type: newType }))
    );
  }, [setEdges]);

  // 拖放到画布：转换为 flow 坐标并创建节点
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const raw = event.dataTransfer.getData('application/reactflow');
      if (!raw) return;
      let data: { type: string };
      try {
        data = JSON.parse(raw);
      } catch {
        return;
      }
      const position = reactFlowInstanceRef.current?.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      if (!position) return;
      if (data.type === 'component') {
        const id = `component_${Date.now()}`;
        ontologyApi
          .createComponent({ id, name: id, displayName: '新组件' })
          .then(() => {
            const newNode: Node = {
              id,
              type: 'default',
              position,
              data: { label: '新组件', data: { id, name: id, displayName: '新组件' } },
              className: 'Component',
              style: { width: 120, height: 44, minWidth: 100 },
              draggable: true,
            };
            setNodes((prev) => [...prev, newNode]);
            message.success('组件已创建');
          })
          .catch((e) => message.error('创建组件失败: ' + (e as Error).message));
      } else if (data.type === 'parameter') {
        setAddParamModal((m) => ({ ...m, visible: true, position, componentId: '', paramName: '' }));
        ontologyApi.listComponents().then((r) =>
          setComponentOptions(r.components.map((c) => ({ value: c.id, label: c.displayName ?? c.name ?? c.id })))
        );
      }
    },
    [setNodes]
  );
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const handleAddParamFromModal = useCallback(() => {
    if (!addParamModal.componentId || !addParamModal.paramName?.trim() || !addParamModal.position) return;
    const componentId = addParamModal.componentId;
    const paramName = addParamModal.paramName.trim();
    const paramId = `${componentId}.${paramName}`;
    const param: ParameterNode = { id: paramId, name: paramName, paramType: 'input', description: '' };
    ontologyApi
      .createParameter(componentId, param)
      .then(() => {
        const newNode: Node = {
          id: paramId,
          type: 'default',
          position: addParamModal.position!,
          data: { label: paramName, data: param },
          className: 'Parameter node--flow-follow',
          style: { width: 100, height: 40 },
          draggable: true,
        };
        setNodes((prev) => [...prev, newNode]);
        const compNode = nodes.find((n) => n.id === componentId);
        if (compNode) {
          const compStyle = compNode.style as { width?: number; height?: number } | undefined;
          const edgePositions = getEdgePositions(
            compNode.position,
            addParamModal.position!,
            compStyle?.width != null && compStyle?.height != null ? { width: compStyle.width, height: compStyle.height } : undefined,
            { width: 100, height: 40 }
          );
          const strokeColor = getEdgeStrokeColor('HAS_PARAMETER');
          setEdges((prev) => [
            ...prev,
            {
              id: `${componentId}-${paramId}-HAS_PARAMETER`,
              source: componentId,
              target: paramId,
              label: 'HAS_PARAMETER',
              type: edgeType,
              sourcePosition: edgePositions.sourcePosition,
              targetPosition: edgePositions.targetPosition,
              style: { strokeDasharray: '8 4', stroke: strokeColor },
              labelStyle: { fill: strokeColor, color: strokeColor, fontWeight: 700, fontSize: 16 },
              labelBgStyle: { fill: '#fff', fillOpacity: 0.9 },
              labelBgPadding: [4, 8] as [number, number],
              labelBgBorderRadius: 4,
              className: 'edge--dash-flow',
              data: { displayName: 'HAS_PARAMETER', type: 'HAS_PARAMETER' },
            } as Edge,
          ]);
        }
        setAddParamModal((m) => ({ ...m, visible: false, position: null, componentId: '', paramName: '' }));
        message.success('参数已创建');
      })
      .catch((e) => message.error('创建参数失败: ' + (e as Error).message));
  }, [addParamModal, nodes, edgeType, setNodes, setEdges]);

  if (loading) return <Spin tip="加载图数据..." />;
  if (error) return <Alert type="error" message={error} />;

  return (
    <div style={{ position: 'relative' }}>
      {/* 工具栏 */}
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Space>
          <span style={{ fontWeight: 500 }}>连线样式：</span>
          <Select
            value={edgeType}
            onChange={handleEdgeTypeChange}
            options={EDGE_TYPE_OPTIONS}
            style={{ width: 160 }}
            size="small"
          />
        </Space>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setAddPanelVisible(true)}
        >
          添加组件
        </Button>
      </div>
      <div style={{ height: 600, border: '1px solid #d9d9d9', borderRadius: 8, position: 'relative' }}>
      <ReactFlow
        onInit={(instance) => { reactFlowInstanceRef.current = instance; }}
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        onNodesDelete={onNodesDelete}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onDrop={onDrop}
        onDragOver={onDragOver}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable
        nodesConnectable
        elementsSelectable
      >
        <Panel position="top-left" style={{ margin: 10 }}>
          <Space direction="vertical" size={8}>
            <div
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/reactflow', JSON.stringify({ type: 'component' }));
                e.dataTransfer.effectAllowed = 'move';
              }}
              style={{
                padding: '8px 12px',
                background: '#1890ff',
                color: '#fff',
                borderRadius: 8,
                cursor: 'grab',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
              }}
            >
              <AppstoreOutlined />
              <span>组件</span>
            </div>
            <div
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/reactflow', JSON.stringify({ type: 'parameter' }));
                e.dataTransfer.effectAllowed = 'move';
              }}
              style={{
                padding: '8px 12px',
                background: '#52c41a',
                color: '#fff',
                borderRadius: 8,
                cursor: 'grab',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
              }}
              title="拖到画布后选择所属组件并输入参数名"
            >
              <FormOutlined />
              <span>参数</span>
            </div>
          </Space>
        </Panel>
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
      </div>
      <Modal
        title="选择所属组件并输入参数名"
        open={addParamModal.visible}
        onOk={handleAddParamFromModal}
        onCancel={() => setAddParamModal((m) => ({ ...m, visible: false, position: null }))}
        okText="创建"
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <div>
            <span style={{ marginRight: 8 }}>所属组件：</span>
            <Select
              placeholder="选择组件"
              style={{ width: 260 }}
              options={componentOptions}
              value={addParamModal.componentId || undefined}
              onChange={(v) => setAddParamModal((m) => ({ ...m, componentId: v ?? '' }))}
            />
          </div>
          <div>
            <span style={{ marginRight: 8 }}>参数名：</span>
            <Input
              placeholder="参数 name"
              value={addParamModal.paramName}
              onChange={(e) => setAddParamModal((m) => ({ ...m, paramName: e.target.value }))}
              style={{ width: 260 }}
            />
          </div>
        </Space>
      </Modal>
      <NodeDetailPanel
        node={selectedNode}
        visible={panelVisible}
        onClose={() => setPanelVisible(false)}
        onSave={handleSaveNode}
        onDelete={handleDeleteNode}
        onAddParam={handleAddParam}
      />
      <EdgeDetailPanel
        edge={selectedEdge}
        visible={edgePanelVisible}
        onClose={() => setEdgePanelVisible(false)}
        onSave={handleSaveEdge}
        onDelete={handleDeleteEdge}
      />
      <AddComponentPanel
        visible={addPanelVisible}
        onClose={() => setAddPanelVisible(false)}
        onSuccess={handleAddSuccess}
      />
    </div>
  );
}

function ComponentsList() {
  const [list, setList] = useState<ComponentNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ontologyApi.listComponents()
      .then((r) => setList(r.components))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 180 },
    { title: '名称', dataIndex: 'name', key: 'name' },
    { title: '分类', dataIndex: 'category', key: 'category', width: 120 },
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true },
  ];

  if (error) return <Alert type="error" message={error} />;
  return (
    <Table
      loading={loading}
      dataSource={list}
      columns={columns}
      rowKey="id"
      pagination={{ pageSize: 20 }}
      size="small"
    />
  );
}

function SearchView() {
  const [q, setQ] = useState('');
  const [result, setResult] = useState<{ components: ComponentNode[]; parameters: ParameterNode[]; total: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const onSearch = () => {
    if (!q.trim()) return;
    setLoading(true);
    ontologyApi.search(q)
      .then(setResult)
      .catch((e) => message.error(e.message))
      .finally(() => setLoading(false));
  };

  const cols = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 200 },
    { title: '名称', dataIndex: 'name', key: 'name' },
    { title: '类型', dataIndex: 'paramType', key: 'paramType', width: 120, render: (_: unknown, r: { paramType?: string }) => r.paramType || 'Component' },
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true },
  ];

  return (
    <Card>
      <Search
        placeholder="按名称、ID 或描述搜索"
        allowClear
        enterButton="搜索"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onSearch={onSearch}
        style={{ maxWidth: 400, marginBottom: 16 }}
      />
      {result !== null && (
        <Table
          loading={loading}
          dataSource={[
            ...result.components.map((c) => ({ ...c, paramType: 'Component' as const })),
            ...result.parameters,
          ]}
          columns={cols}
          rowKey="id"
          pagination={{ pageSize: 20 }}
          size="small"
        />
      )}
    </Card>
  );
}

export default function App() {
  const [health, setHealth] = useState<OntologyHealth | null>(null);
  const [activeTab, setActiveTab] = useState('graph');

  useEffect(() => {
    ontologyApi.health().then(setHealth).catch(() => setHealth({ available: false, timestamp: '' }));
  }, []);

  const navItems = [
    { key: 'graph', label: '组件可视化' },
    { key: 'components', label: '组件列表' },
    { key: 'search', label: '搜索' },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', padding: '0 24px', color: '#fff' }}>
        <span style={{ marginRight: 32, fontSize: 18, fontWeight: 600 }}>ETL 本体管理</span>
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[activeTab]}
          items={navItems}
          onClick={({ key }) => setActiveTab(key)}
          style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent' }}
        />
        {health && (
          <Alert
            type={health.available ? 'success' : 'warning'}
            message={health.available ? 'Neo4j 已连接' : 'Neo4j 未配置或不可用'}
            showIcon
            style={{ marginLeft: 16 }}
          />
        )}
      </Header>
      <Content style={{ padding: 24 }}>
        {activeTab === 'graph' && (
          <Card title="ETL组件本体图（组件与参数及其他组件关系）">
            <GraphView />
          </Card>
        )}
        {activeTab === 'components' && (
          <Card title="组件列表">
            <ComponentsList />
          </Card>
        )}
        {activeTab === 'search' && <SearchView />}
      </Content>
    </Layout>
  );
}
