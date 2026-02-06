// =============================================================================
// CsvFileInput 组件及参数写入 Neo4j
// 来源: components-metadata.md
// 使用: 在 Neo4j Browser 中粘贴并执行（可整段或逐条执行）
// =============================================================================

// ---------- 方式一：单条语句一次性执行（推荐） ----------
CREATE (c:Component {
  id: 'csvFileInput',
  name: 'CsvFileInput',
  description: 'Use CSV File Input to access data from a CSV file or multiple CSV files using a wildcard, locally or remotely (via HTTP or S3).',
  category: 'inputs',
  pipelineType: 'pandas_df_input',
  source: 'jupyterlab-amphi/packages/pipeline-components-core/src/components/inputs/files/CsvFileInput.tsx'
})
WITH c
CREATE
  (c)-[:HAS_PARAMETER]->(p1:Parameter { id: 'csvFileInput__fileLocation', name: 'fileLocation', paramType: 'radio', defaultValue: 'local', required: false, description: 'File Location', options: '[{"value":"local","label":"Local"},{"value":"http","label":"HTTP"},{"value":"s3","label":"S3"},{"value":"ftp","label":"FTP"}]' }),
  (c)-[:HAS_PARAMETER]->(p2:Parameter { id: 'csvFileInput__filePath', name: 'filePath', paramType: 'file', defaultValue: '', required: false, description: 'Provide a single CSV file path or use 英文星号 for matching multiple files. Extensions accepted: .csv, .tsv, .txt. Can also read CSV files compressed as .gz, .bz2, .zip, .xz, .zst.', options: null }),
  (c)-[:HAS_PARAMETER]->(p3:Parameter { id: 'csvFileInput__csvOptions.sep', name: 'csvOptions.sep', paramType: 'selectCustomizable', defaultValue: ',', required: false, description: 'Select or provide a custom delimiter.', options: '[{"value":",","label":"comma (,)"},{"value":";","label":"semicolon (;)"},{"value":" ","label":"space"},{"value":"\\\\t","label":"tab"},{"value":"|","label":"pipe (|)"},{"value":"infer","label":"infer (tries to auto detect)"}]' }),
  (c)-[:HAS_PARAMETER]->(p4:Parameter { id: 'csvFileInput__csvOptions.encoding', name: 'csvOptions.encoding', paramType: 'selectCustomizable', defaultValue: null, required: false, description: 'Select the character encoding of the file.', options: '[{"value":"utf-8","label":"UTF-8"},{"value":"latin-1","label":"latin-1"},{"value":"iso-8859-1","label":"ISO-8859-1"},{"value":"cp1252","label":"cp1252"},{"value":"utf-16","label":"UTF-16"},{"value":"ascii","label":"ASCII"},{"value":"iso-8859-15","label":"ISO‑8859‑15"},{"value":"windows-1250","label":"Windows‑1250 (Central Europe)"},{"value":"windows-1251","label":"Windows‑1251 (Cyrillic)"},{"value":"koi8-r","label":"KOI8‑R (Russian Cyrillic)"},{"value":"koi8-u","label":"KOI8‑U (Ukrainian Cyrillic)"},{"value":"gbk","label":"GBK (Simplified Chinese)"},{"value":"big5","label":"Big5 (Traditional Chinese)"},{"value":"shift_jis","label":"Shift_JIS (Japanese)"},{"value":"euc-kr","label":"EUC‑KR (Korean)"}]' }),
  (c)-[:HAS_PARAMETER]->(p5:Parameter { id: 'csvFileInput__csvOptions.nrows', name: 'csvOptions.nrows', paramType: 'inputNumber', defaultValue: null, required: false, description: 'Number of rows of file to read.', options: null }),
  (c)-[:HAS_PARAMETER]->(p6:Parameter { id: 'csvFileInput__csvOptions.decimal', name: 'csvOptions.decimal', paramType: 'selectCustomizable', defaultValue: '.', required: false, description: 'Character to recognize as decimal point.', options: '[{"value":".","label":"."},{"value":",","label":","}]' }),
  (c)-[:HAS_PARAMETER]->(p7:Parameter { id: 'csvFileInput__csvOptions.names', name: 'csvOptions.names', paramType: 'selectTokenization', defaultValue: '[]', required: false, description: 'Sequence of column labels to apply.', options: '[]' }),
  (c)-[:HAS_PARAMETER]->(p8:Parameter { id: 'csvFileInput__csvOptions.quotechar', name: 'csvOptions.quotechar', paramType: 'input', defaultValue: null, required: false, description: 'Defines the character used to wrap fields.', options: null }),
  (c)-[:HAS_PARAMETER]->(p9:Parameter { id: 'csvFileInput__csvOptions.escapechar', name: 'csvOptions.escapechar', paramType: 'input', defaultValue: null, required: false, description: 'Character used to escape other characters.', options: null }),
  (c)-[:HAS_PARAMETER]->(p10:Parameter { id: 'csvFileInput__csvOptions.on_bad_lines', name: 'csvOptions.on_bad_lines', paramType: 'select', defaultValue: null, required: false, description: 'Behavior on bad lines.', options: '[{"value":"error","label":"Error"},{"value":"warn","label":"Warn"},{"value":"skip","label":"Skip"}]' }),
  (c)-[:HAS_PARAMETER]->(p11:Parameter { id: 'csvFileInput__csvOptions.engine', name: 'csvOptions.engine', paramType: 'select', defaultValue: null, required: false, description: 'Select engine.', options: '[{"value":"python","label":"python"},{"value":"c","label":"c"},{"value":"pyarrow","label":"pyarrow"}]' }),
  (c)-[:HAS_PARAMETER]->(p12:Parameter { id: 'csvFileInput__csvOptions.storage_options', name: 'csvOptions.storage_options', paramType: 'keyvalue', defaultValue: '{}', required: false, description: 'Storage Options (for http/s3/ftp)', options: null })
RETURN c, p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, p11, p12;


// ---------- 方式二：先删后建（重复执行前先清理） ----------
// MATCH (c:Component {id: 'csvFileInput'}) DETACH DELETE c;
