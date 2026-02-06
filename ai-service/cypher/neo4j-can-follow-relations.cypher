// ============================================================
// CAN_FOLLOW 关系：定义组件之间的前后逻辑关系
// ============================================================
// CAN_FOLLOW 表示 Output 组件可以接收来自 Input 组件的数据
// 方向: (OutputComponent)-[:CAN_FOLLOW]->(InputComponent)
// 含义: OutputComponent 可以跟在 InputComponent 后面处理数据
// ============================================================

// CsvFileOutput 可以跟在 CsvFileInput 后面
MATCH (input:Component {id: 'csvFileInput'}), (output:Component {id: 'csvFileOutput'})
MERGE (output)-[:CAN_FOLLOW]->(input)
RETURN 'csvFileOutput -> csvFileInput' AS relation, 'created' AS status;

// CsvFileOutput 可以跟在 MySQLInput 后面
MATCH (input:Component {id: 'mySQLInput'}), (output:Component {id: 'csvFileOutput'})
MERGE (output)-[:CAN_FOLLOW]->(input)
RETURN 'csvFileOutput -> mySQLInput' AS relation, 'created' AS status;

// ============================================================
// 查询已建立的 CAN_FOLLOW 关系
// ============================================================
// MATCH (a:Component)-[r:CAN_FOLLOW]->(b:Component)
// RETURN a.name AS from, b.name AS to, type(r) AS relation;
