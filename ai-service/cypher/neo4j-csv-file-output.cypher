// ============================================================
// CsvFileOutput 组件及其参数导入 Neo4j
// ============================================================
// 使用方式：在 Neo4j Browser 中直接执行此脚本
// 如需重新创建，先删除旧数据：
// MATCH (c:Component {id: 'csvFileOutput'})-[r:HAS_PARAMETER]->(p:Parameter) DETACH DELETE c, p;
// ============================================================

// 创建 CsvFileOutput 组件及其 9 个参数（原子操作）
CREATE (c:Component {
  id: 'csvFileOutput',
  name: 'CsvFileOutput',
  description: 'Use CSV File Output to write or append data to a CSV file locally or remotely (S3).',
  category: 'outputs.Files',
  pipelineType: 'pandas_df_output',
  source: 'jupyterlab-amphi/packages/pipeline-components-core/src/components/outputs/files/CsvFileOutput.tsx'
})

// 参数 1: fileLocation
CREATE (c)-[:HAS_PARAMETER]->(:Parameter {
  id: 'csvFileOutput.fileLocation',
  name: 'fileLocation',
  paramType: 'radio',
  defaultValue: 'local',
  required: false,
  description: 'File Location',
  options: '[{"value":"local","label":"Local"},{"value":"s3","label":"S3"},{"value":"ftp","label":"FTP"}]'
})

// 参数 2: filePath
CREATE (c)-[:HAS_PARAMETER]->(:Parameter {
  id: 'csvFileOutput.filePath',
  name: 'filePath',
  paramType: 'file',
  defaultValue: '',
  required: false,
  description: 'Type file name; expects .csv/.tsv/.txt',
  options: null
})

// 参数 3: csvOptions.sep
CREATE (c)-[:HAS_PARAMETER]->(:Parameter {
  id: 'csvFileOutput.csvOptions.sep',
  name: 'csvOptions.sep',
  paramType: 'selectCustomizable',
  defaultValue: ',',
  required: false,
  description: 'Separator',
  options: '[{"value":",","label":"comma (,)"},{"value":";","label":"semicolon (;)"},{"value":" ","label":"space"},{"value":"  ","label":"tab"},{"value":"|","label":"pipe (|)"}]'
})

// 参数 4: createFoldersIfNotExist
CREATE (c)-[:HAS_PARAMETER]->(:Parameter {
  id: 'csvFileOutput.createFoldersIfNotExist',
  name: 'createFoldersIfNotExist',
  paramType: 'boolean',
  defaultValue: 'false',
  required: false,
  description: 'Create folders if don\'t exist (local)',
  options: null
})

// 参数 5: csvOptions.mode
CREATE (c)-[:HAS_PARAMETER]->(:Parameter {
  id: 'csvFileOutput.csvOptions.mode',
  name: 'csvOptions.mode',
  paramType: 'radio',
  defaultValue: 'w',
  required: false,
  description: 'File mode',
  options: '[{"value":"w","label":"Write"},{"value":"x","label":"Exclusive Creation"},{"value":"a","label":"Append"}]'
})

// 参数 6: csvOptions.quoting
CREATE (c)-[:HAS_PARAMETER]->(:Parameter {
  id: 'csvFileOutput.csvOptions.quoting',
  name: 'csvOptions.quoting',
  paramType: 'selectCustomizable',
  defaultValue: '0',
  required: false,
  description: 'Controls how special characters are handled',
  options: '[{"value":"0","label":"Minimal quoting"},{"value":"1","label":"Quote All"},{"value":"2","label":"Quote All Non-Numeric"},{"value":"3","label":"Quote None"}]'
})

// 参数 7: csvOptions.header
CREATE (c)-[:HAS_PARAMETER]->(:Parameter {
  id: 'csvFileOutput.csvOptions.header',
  name: 'csvOptions.header',
  paramType: 'boolean',
  defaultValue: 'true',
  required: false,
  description: 'Write header',
  options: null
})

// 参数 8: csvOptions.index
CREATE (c)-[:HAS_PARAMETER]->(:Parameter {
  id: 'csvFileOutput.csvOptions.index',
  name: 'csvOptions.index',
  paramType: 'boolean',
  defaultValue: 'false',
  required: false,
  description: 'Write row index',
  options: null
})

// 参数 9: csvOptions.storage_options
CREATE (c)-[:HAS_PARAMETER]->(:Parameter {
  id: 'csvFileOutput.csvOptions.storage_options',
  name: 'csvOptions.storage_options',
  paramType: 'keyvalue',
  defaultValue: '{}',
  required: false,
  description: 'Storage Options (S3/FTP)',
  options: null
})

RETURN c.id AS componentId, 'Created CsvFileOutput with 9 parameters' AS status;

// ============================================================
// 建立 CAN_FOLLOW 关系（CsvFileOutput 可以跟在 Input 组件后面）
// 需要单独执行此语句
// ============================================================

// CsvFileOutput 可以跟在 CsvFileInput 后面
// MATCH (input:Component {id: 'csvFileInput'}), (output:Component {id: 'csvFileOutput'})
// CREATE (output)-[:CAN_FOLLOW]->(input)
// RETURN 'Created CAN_FOLLOW: csvFileOutput -> csvFileInput' AS status;

// CsvFileOutput 可以跟在 MySQLInput 后面
// MATCH (input:Component {id: 'mySQLInput'}), (output:Component {id: 'csvFileOutput'})
// CREATE (output)-[:CAN_FOLLOW]->(input)
// RETURN 'Created CAN_FOLLOW: csvFileOutput -> mySQLInput' AS status;
