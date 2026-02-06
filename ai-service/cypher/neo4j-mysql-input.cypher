// =============================================================================
// MySQLInput 组件及参数写入 Neo4j
// 来源: components-metadata.md
// 使用: 在 Neo4j Browser 中粘贴并执行（可整段或逐条执行）
// =============================================================================

// ---------- 方式一：单条语句一次性执行（推荐） ----------
CREATE (c:Component {
  id: 'mySQLInput',
  name: 'MySQLInput',
  description: 'Use MySQL Input to retrieve data from MySQL by specifying either a table name or a custom SQL query.',
  category: 'inputs.Databases',
  pipelineType: 'pandas_df_input',
  source: 'jupyterlab-amphi/packages/pipeline-components-core/src/components/inputs/databases/MySQLInput.tsx'
})
WITH c
CREATE
  (c)-[:HAS_PARAMETER]->(p1:Parameter { id: 'mySQLInput__host', name: 'host', paramType: 'input', defaultValue: 'localhost', required: true, description: 'Enter database host', options: null }),
  (c)-[:HAS_PARAMETER]->(p2:Parameter { id: 'mySQLInput__port', name: 'port', paramType: 'input', defaultValue: '3306', required: false, description: 'Enter database port', options: null }),
  (c)-[:HAS_PARAMETER]->(p3:Parameter { id: 'mySQLInput__databaseName', name: 'databaseName', paramType: 'input', defaultValue: '', required: true, description: 'Enter database name', options: null }),
  (c)-[:HAS_PARAMETER]->(p4:Parameter { id: 'mySQLInput__username', name: 'username', paramType: 'input', defaultValue: '', required: true, description: 'Enter username', options: null }),
  (c)-[:HAS_PARAMETER]->(p5:Parameter { id: 'mySQLInput__password', name: 'password', paramType: 'input', defaultValue: '', required: true, description: 'Enter password', options: null }),
  (c)-[:HAS_PARAMETER]->(p6:Parameter { id: 'mySQLInput__queryMethod', name: 'queryMethod', paramType: 'radio', defaultValue: 'table', required: false, description: 'Select whether you want to specify the table name to retrieve data or use a custom SQL query for greater flexibility.', options: '[{"value":"table","label":"Table Name"},{"value":"query","label":"SQL Query"}]' }),
  (c)-[:HAS_PARAMETER]->(p7:Parameter { id: 'mySQLInput__tableName', name: 'tableName', paramType: 'table', defaultValue: '', required: false, description: 'Enter table name; query: SHOW FULL TABLES WHERE Table_type = \'BASE TABLE\';', options: null }),
  (c)-[:HAS_PARAMETER]->(p8:Parameter { id: 'mySQLInput__sqlQuery', name: 'sqlQuery', paramType: 'codeTextarea', defaultValue: '', required: false, description: 'Optional. By default the SQL query is: SELECT * FROM table_name_provided. If specified, the SQL Query is used.', options: null })
RETURN c, p1, p2, p3, p4, p5, p6, p7, p8;


// ---------- 方式二：先删后建（重复执行前先清理） ----------
// 若已存在 mySQLInput，可先执行下面再执行方式一：
// MATCH (c:Component {id: 'mySQLInput'}) DETACH DELETE c;
