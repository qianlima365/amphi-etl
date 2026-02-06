# MySQLInput
id: mySQLInput
description: Use MySQL Input to retrieve data from MySQL by specifying either a table name or a custom SQL query.
parameters:
- name: host
  type: input
  default: "localhost"
  required: true
  options: null
  description: Enter database host
- name: port
  type: input
  default: "3306"
  required: false
  options: null
  description: Enter database port
- name: databaseName
  type: input
  default: ""
  required: true
  options: null
  description: Enter database name
- name: username
  type: input
  default: ""
  required: true
  options: null
  description: Enter username
- name: password
  type: input
  default: ""
  required: true
  options: null
  description: Enter password
- name: queryMethod
  type: radio
  default: "table"
  required: false
  options: [{"value":"table","label":"Table Name"},{"value":"query","label":"SQL Query"}]
  description: Select whether you want to specify the table name to retrieve data or use a custom SQL query for greater flexibility.
- name: tableName
  type: table
  default: ""
  required: false
  options: null
  description: Enter table name; query: SHOW FULL TABLES WHERE Table_type = 'BASE TABLE';
- name: sqlQuery
  type: codeTextarea
  default: ""
  required: false
  options: null
  description: Optional. By default the SQL query is: SELECT * FROM table_name_provided. If specified, the SQL Query is used.
source: .amphi-etl\jupyterlab-amphi\packages\pipeline-components-core\src\components\inputs\databases\MySQLInput.tsx

# PostgresInput
id: postgresInput
description: Use Postgres Input to retrieve data from Postgres by specifying either a table name or a custom SQL query.
parameters:
- name: host
  type: input
  default: "localhost"
  required: false
  options: null
  description: Enter database host
- name: port
  type: input
  default: "5432"
  required: false
  options: null
  description: Enter database port
- name: databaseName
  type: input
  default: ""
  required: false
  options: null
  description: Enter database name
- name: username
  type: input
  default: ""
  required: false
  options: null
  description: Enter username
- name: password
  type: input
  default: ""
  required: false
  options: null
  description: Enter password
- name: schema
  type: input
  default: "public"
  required: false
  options: null
  description: Enter schema name
- name: queryMethod
  type: radio
  default: "table"
  required: false
  options: [{"value":"table","label":"Table Name"},{"value":"query","label":"SQL Query"}]
  description: Select whether you want to specify the table name to retrieve data or use a custom SQL query for greater flexibility.
- name: tableName
  type: table
  default: ""
  required: false
  options: null
  description: Enter table name; query: SELECT table_name FROM information_schema.tables WHERE table_schema = '{{schema}}' AND table_type = 'BASE TABLE' ORDER BY table_name;
- name: sqlQuery
  type: codeTextarea
  default: ""
  required: false
  options: null
  description: Optional. By default the SQL query is: SELECT * FROM table_name_provided. If specified, the SQL Query is used.
source: d:\mycode\amphi-etl\jupyterlab-amphi\packages\pipeline-components-core\src\components\inputs\databases\PostgresInput.tsx

# CsvFileInput
id: csvFileInput
description: Use CSV File Input to access data from a CSV file or multiple CSV files using a wildcard, locally or remotely (via HTTP or S3).
parameters:
- name: fileLocation
  type: radio
  default: "local"
  required: false
  options: [{"value":"local","label":"Local"},{"value":"http","label":"HTTP"},{"value":"s3","label":"S3"},{"value":"ftp","label":"FTP"}]
  description: File Location
- name: filePath
  type: file
  default: ""
  required: false
  options: null
  description: Provide a single CSV file path or use '*' for matching multiple files. Extensions accepted: .csv, .tsv, .txt. Can also read CSV files compressed as .gz, .bz2, .zip, .xz, .zst.
- name: csvOptions.sep
  type: selectCustomizable
  default: ","
  required: false
  options: [{"value":",","label":"comma (,)"},{"value":";","label":"semicolon (;)"},
{"value":" ","label":"space"},{"value":"\\t","label":"tab"},{"value":"|","label":"pipe (|)"},{"value":"infer","label":"infer (tries to auto detect)"}]
  description: Select or provide a custom delimiter.
- name: csvOptions.encoding
  type: selectCustomizable
  default: null
  required: false
  options: [{"value":"utf-8","label":"UTF-8"},{"value":"latin-1","label":"latin-1"},{"value":"iso-8859-1","label":"ISO-8859-1"},{"value":"cp1252","label":"cp1252"},{"value":"utf-16","label":"UTF-16"},{"value":"ascii","label":"ASCII"},{"value":"iso-8859-15","label":"ISO‑8859‑15"},{"value":"windows-1250","label":"Windows‑1250 (Central Europe)"},{"value":"windows-1251","label":"Windows‑1251 (Cyrillic)"},{"value":"koi8-r","label":"KOI8‑R (Russian Cyrillic)"},{"value":"koi8-u","label":"KOI8‑U (Ukrainian Cyrillic)"},{"value":"gbk","label":"GBK (Simplified Chinese)"},{"value":"big5","label":"Big5 (Traditional Chinese)"},{"value":"shift_jis","label":"Shift_JIS (Japanese)"},{"value":"euc-kr","label":"EUC‑KR (Korean)"}]
  description: Select the character encoding of the file.
- name: csvOptions.nrows
  type: inputNumber
  default: null
  required: false
  options: null
  description: Number of rows of file to read.
- name: csvOptions.decimal
  type: selectCustomizable
  default: "."
  required: false
  options: [{"value":".","label":"."},{"value":",","label":","}]
  description: Character to recognize as decimal point.
- name: csvOptions.names
  type: selectTokenization
  default: []
  required: false
  options: []
  description: Sequence of column labels to apply.
- name: csvOptions.quotechar
  type: input
  default: null
  required: false
  options: null
  description: Defines the character used to wrap fields.
- name: csvOptions.escapechar
  type: input
  default: null
  required: false
  options: null
  description: Character used to escape other characters.
- name: csvOptions.on_bad_lines
  type: select
  default: null
  required: false
  options: [{"value":"error","label":"Error"},{"value":"warn","label":"Warn"},{"value":"skip","label":"Skip"}]
  description: Behavior on bad lines.
- name: csvOptions.engine
  type: select
  default: null
  required: false
  options: [{"value":"python","label":"python"},{"value":"c","label":"c"},{"value":"pyarrow","label":"pyarrow"}]
  description: Select engine.
- name: csvOptions.storage_options
  type: keyvalue
  default: {}
  required: false
  options: null
  description: Storage Options (for http/s3/ftp)
source: d:\mycode\amphi-etl\jupyterlab-amphi\packages\pipeline-components-core\src\components\inputs\files\CsvFileInput.tsx

# CsvFileOutput
id: csvFileOutput
description: Use CSV File Output to write or append data to a CSV file locally or remotely (S3).
parameters:
- name: fileLocation
  type: radio
  default: "local"
  required: false
  options: [{"value":"local","label":"Local"},{"value":"s3","label":"S3"},{"value":"ftp","label":"FTP"}]
  description: File Location
- name: filePath
  type: file
  default: ""
  required: false
  options: null
  description: Type file name; expects .csv/.tsv/.txt
- name: csvOptions.sep
  type: selectCustomizable
  default: ","
  required: false
  options: [{"value":",","label":"comma (,)"},{"value":";","label":"semicolon (;)"},{"value":" ","label":"space"},{"value":"  ","label":"tab"},{"value":"|","label":"pipe (|)"}]
  description: Separator
- name: createFoldersIfNotExist
  type: boolean
  default: false
  required: false
  options: null
  description: Create folders if don't exist (local)
- name: csvOptions.mode
  type: radio
  default: "w"
  required: false
  options: [{"value":"w","label":"Write"},{"value":"x","label":"Exclusive Creation"},{"value":"a","label":"Append"}]
  description: File mode
- name: csvOptions.quoting
  type: selectCustomizable
  default: "0"
  required: false
  options: [{"value":"0","label":"Minimal quoting"},{"value":"1","label":"Quote All"},{"value":"2","label":"Quote All Non-Numeric"},{"value":"3","label":"Quote None"}]
  description: Controls how special characters are handled
- name: csvOptions.header
  type: boolean
  default: true
  required: false
  options: null
  description: Write header
- name: csvOptions.index
  type: boolean
  default: false
  required: false
  options: null
  description: Write row index
- name: csvOptions.storage_options
  type: keyvalue
  default: {}
  required: false
  options: null
  description: Storage Options (S3/FTP)
source: d:\mycode\amphi-etl\jupyterlab-amphi\packages\pipeline-components-core\src\components\outputs\files\CsvFileOutput.tsx

# MySQLOutput
id: mySQLOutput
description: Use MySQL Output to insert data into a MySQL table by specifying a data mapping between the incoming data and the existing table schema.
parameters:
- name: host
  type: input
  default: "localhost"
  required: false
  options: null
  description: Enter database host
- name: port
  type: input
  default: "3306"
  required: false
  options: null
  description: Enter database port
- name: connectionParams
  type: input
  default: ""
  required: false
  options: null
  description: e.g. connect_timeout=5&charset=utf8mb4
- name: databaseName
  type: input
  default: ""
  required: false
  options: null
  description: Enter database name
- name: tableName
  type: table
  default: ""
  required: false
  options: null
  description: Enter table name; query: SHOW TABLES;
- name: username
  type: input
  default: ""
  required: false
  options: null
  description: Enter username
- name: password
  type: input
  default: ""
  required: false
  options: null
  description: Enter password
- name: ifTableExists
  type: radio
  default: "fail"
  required: false
  options: [{"value":"fail","label":"Fail"},{"value":"replace","label":"Replace"},{"value":"append","label":"Append"}]
  description: If Table Exists
- name: mode
  type: radio
  default: "insert"
  required: false
  options: [{"value":"insert","label":"INSERT"}]
  description: Mode
- name: mapping
  type: dataMapping
  default: null
  required: false
  options: null
  description: Mapping schema override; drivers mysql+pymysql; DESCRIBE {{table}}
source: d:\mycode\amphi-etl\jupyterlab-amphi\packages\pipeline-components-core\src\components\outputs\databases\MySQLOutput.tsx

# DatabaseOutput
id: databaseOutput
description: Database Output lets you choose a database and write a DataFrame using table or custom mapping.
parameters:
- name: provider
  type: select
  default: "mysql"
  required: false
  options: [{"value":"mysql","label":"MySQL"},{"value":"postgres","label":"PostgreSQL"},{"value":"sqlserver","label":"SQL Server"},{"value":"snowflake","label":"Snowflake"},{"value":"oracle","label":"Oracle"}]
  description: Database Type
source: d:\mycode\amphi-etl\jupyterlab-amphi\packages\pipeline-components-core\src\components\outputs\databases\DatabaseOutput.tsx

# ChromaOutput
id: chromaOutput
description: no desc
parameters:
- name: collection
  type: input
  default: ""
  required: false
  options: null
  description: Collection name
- name: persistDirectory
  type: input
  default: "./chroma_db"
  required: false
  options: null
  description: Directory to persist
- name: model
  type: cascader
  default: null
  required: false
  options: [{"value":"openai","label":"OpenAI","children":[{"value":"text-embedding-ada-002","label":"text-embedding-ada-002"},{"value":"text-embedding-3-small","label":"text-embedding-3-small"},{"value":"text-embedding-3-large","label":"text-embedding-3-large"}]}]
  description: Embeddings Model
- name: openaiApiKey
  type: input
  default: ""
  required: false
  options: null
  description: OpenAI API Key
source: d:\mycode\amphi-etl\jupyterlab-amphi\packages\pipeline-components-local\src\components\outputs\vector-stores\ChromaOutput.tsx

# PineconeOutput
id: PineconeOutput
description: no desc
parameters:
- name: indexName
  type: input
  default: ""
  required: false
  options: null
  description: Index Name
- name: createIndex
  type: boolean
  default: false
  required: false
  options: null
  description: Create index if not exist
- name: pineconeApiKey
  type: input
  default: ""
  required: false
  options: null
  description: Pinecone API Key
- name: model
  type: cascader
  default: null
  required: false
  options: [{"value":"openai","label":"OpenAI","children":[{"value":"text-embedding-ada-002","label":"text-embedding-ada-002"},{"value":"text-embedding-3-small","label":"text-embedding-3-small"},{"value":"text-embedding-3-large","label":"text-embedding-3-large"}]}]
  description: Embeddings Model
- name: cloudAndRegion
  type: cascader
  default: ["aws","us-east-1"]
  required: false
  options: [{"value":"aws","label":"AWS","children":[{"value":"us-east-1","label":"us-east-1"}]}]
  description: Pinecone Cloud Region
- name: dimensions
  type: inputNumber
  default: 1536
  required: false
  options: null
  description: Index Dimensions
- name: similarityMetric
  type: radio
  default: "cosine"
  required: false
  options: [{"value":"cosine","label":"Cosine"},{"value":"euclidean","label":"Euclidean"},{"value":"dotproduct","label":"Dot Product"}]
  description: Vector Similarity metric
- name: openaiApiKey
  type: input
  default: ""
  required: false
  options: null
  description: OpenAI API Key
source: d:\mycode\amphi-etl\jupyterlab-amphi\packages\pipeline-components-local\src\components\outputs\vector-stores\PineconeOutput.tsx
