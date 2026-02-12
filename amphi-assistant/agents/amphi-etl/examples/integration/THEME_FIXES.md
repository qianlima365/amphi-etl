# 主题修复记录

## 修复的三个问题

### 1. 左侧导航选中状态 - 图标居中

**问题**：图标在选中区域中错位，不居中

**修复**：
```css
.nav-item {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;      /* 垂直居中 */
  justify-content: center;  /* 水平居中 */
  border-radius: 10px;
  /* ... */
}

.nav-item.active::before {
  content: '';
  position: absolute;
  left: -12px;
  top: 50%;
  transform: translateY(-50%);  /* 左侧指示器也垂直居中 */
  /* ... */
}
```

### 2. 输入框默认字体颜色

**问题**：输入框文字颜色太深，看不清

**修复**：
```css
.form-input,
.chat-input {
  color: #f0f6fc;        /* 更亮的白色 */
  /* 之前可能是 #e2e8f0 或更深 */
}

.chat-input::placeholder {
  color: #8b949e;        /* placeholder 用稍暗的灰色 */
}
```

### 3. 未选中图标不够清楚

**问题**：左侧和右侧导航未选中的图标颜色太暗

**修复**：
```css
/* 左侧导航 - 未选中 */
.nav-item {
  color: #8b949e;        /* 提高对比度 */
}

.nav-item:hover {
  color: #f0f6fc;        /* 悬停时更亮 */
}

/* 右侧导航 - 专门优化 */
.right-sidebar .nav-item {
  color: #6e7681;        /* 未选中状态更清晰 */
}

.right-sidebar .nav-item:hover {
  color: #f0f6fc;
}

.right-sidebar .nav-item.active {
  color: #58a6ff;        /* 选中蓝色 */
}
```

## 文件说明

| 文件 | 说明 |
|------|------|
| `pipeline-builder-dark.html` | 完整的 Pipeline Builder 风格界面（带左右导航、组件面板） |
| `embed-chat-dark.html` | 悬浮聊天组件（修复后的输入框颜色） |
| `test-integration-dark.html` | 测试工具（深色主题） |

## 颜色参考（GitHub Dark 风格）

```css
:root {
  --bg-primary: #0d1117;      /* 最深背景 */
  --bg-secondary: #161b22;    /* 次深背景 */
  --bg-tertiary: #21262d;     /* 输入框背景 */
  
  --text-primary: #f0f6fc;    /* 主要文字（白色） */
  --text-secondary: #8b949e;  /* 次要文字 */
  --text-muted: #6e7681;      /* 弱化文字 */
  
  --accent-blue: #58a6ff;     /* 蓝色强调 */
  --accent-green: #238636;    /* 绿色成功 */
  --accent-orange: #f78166;   /* 橙色警告 */
  
  --border-color: #30363d;    /* 边框颜色 */
}
```

## 预览

打开 `pipeline-builder-dark.html` 可以看到：
- ✅ 左侧导航图标完美居中
- ✅ 输入框文字为白色，清晰可见
- ✅ 未选中图标使用 `--text-secondary` (#8b949e)，清晰可辨
- ✅ 选中状态使用蓝色高亮
