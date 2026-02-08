import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Input, Space, Tooltip, Button, Tabs } from 'antd';
import type { TabsProps } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { Notification } from '@jupyterlab/apputils';
import { refreshIcon } from './icons';
import { useTheme } from './ai/useTheme';

interface ComponentPaletteProps {
  componentService: { getComponents: () => any[] | Promise<any[]> };
  onRefreshed?: (components: any[]) => void;
}

// --- Icon Renderer (Same as Sidebar) ---
const renderIcon = (icon: any, size: number | string = 14) => {
  if (icon?.react) {
    const Icon = icon.react;
    return (
      <span className="anticon">
        <Icon height={typeof size === 'number' ? `${size}px` : size} width={typeof size === 'number' ? `${size}px` : size} />
      </span>
    );
  }
  if (icon?.svgstr) {
    return (
      <span
        className="anticon"
        style={{ display: 'inline-flex', lineHeight: 0, verticalAlign: 'middle' }}
        dangerouslySetInnerHTML={{
          __html: icon.svgstr.replace('<svg', `<svg height="${size}" width="${size}"`)
        }}
      />
    );
  }
  return null;
};

const ComponentPalette: React.FC<ComponentPaletteProps> = ({
  componentService,
  onRefreshed
}) => {
  const { isNeonTheme } = useTheme();
  const [searchValue, setSearchValue] = useState('');
  const [activeTabKey, setActiveTabKey] = useState('0');
  const [components, setComponents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // --- Fetch Logic ---
  const fetchComponents = useCallback(
    async (opts?: { notify?: boolean }) => {
      const notify = !!opts?.notify;
      setLoading(true);
      try {
        const next = await Promise.resolve(componentService.getComponents());
        const list = Array.isArray(next) ? [...next] : [];
        setComponents(list);
        onRefreshed?.(list);
        if (notify) Notification.success('Components refreshed', { autoClose: 3000 });
      } catch (e: any) {
        if (notify) Notification.error('Failed to refresh components', { autoClose: 6000 });
      } finally {
        setLoading(false);
      }
    },
    [componentService, onRefreshed]
  );

  useEffect(() => {
    fetchComponents({ notify: false });
  }, [fetchComponents]);

  // --- Categorization Logic ---
  const categorizedComponents = useMemo(() => {
    const result: Record<string, Record<string, any[]>> = {};
    components.forEach(component => {
      let [category, subcategory] = String(component._category || '').split('.');
      if (!category) category = 'uncategorized';
      if (!result[category]) result[category] = {};
      
      const targetSub = subcategory || '_';
      if (!result[category][targetSub]) result[category][targetSub] = [];
      result[category][targetSub].push(component);
    });
    return result;
  }, [components]);

  // --- Filtering Logic ---
  const filterComponents = (data: Record<string, Record<string, any[]>>, term: string) => {
    const filtered: Record<string, Record<string, any[]>> = {};
    Object.keys(data).forEach(category => {
      const categoryData = data[category];
      const filteredCategoryData: Record<string, any[]> = {};
      Object.keys(categoryData).forEach(subCategory => {
        const filteredItems = categoryData[subCategory].filter(component =>
          (component._name || '').toLowerCase().includes(term.toLowerCase()) ||
          (component._description || '').toLowerCase().includes(term.toLowerCase())
        );
        if (filteredItems.length > 0) filteredCategoryData[subCategory] = filteredItems;
      });
      if (Object.keys(filteredCategoryData).length > 0) filtered[category] = filteredCategoryData;
    });
    return filtered;
  };

  const filteredCategorizedComponents = useMemo(() => {
    if (searchValue && searchValue.trim()) {
      return filterComponents(categorizedComponents, searchValue);
    }
    return categorizedComponents;
  }, [searchValue, categorizedComponents]);

  // --- Drag Logic ---
  const onDragStart = (event: React.DragEvent, nodeType: string, config: any) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.setData('additionalData', config);
    event.dataTransfer.effectAllowed = 'move';
  };

  // --- Render Single Card (Fixed Size) ---
  const renderComponentItem = (component: any, key: string) => {
    return (
      <Tooltip
        key={key}
        title={component._description || component._name}
        placement="bottom"
        mouseEnterDelay={0.5}
        overlayInnerStyle={{ fontSize: '12px' }}
      >
        <div
          draggable
          className="palette-component-square"
          onDragStart={(event) => onDragStart(event, component._id, component._default ? JSON.stringify(component._default) : '{}')}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '70px',
            height: '70px',
            flex: '0 0 70px',
            padding: '6px 2px 6px 2px',
            border: `1px solid ${isNeonTheme ? 'var(--neon-bg-elevated, #2d3347)' : '#d9d9d9'}`,
            borderRadius: '6px',
            cursor: 'move',
            backgroundColor: isNeonTheme ? 'var(--neon-bg-tertiary, #252a3c)' : '#ffffff',
            transition: 'all 0.2s ease',
            marginRight: '8px'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = isNeonTheme ? 'var(--neon-bg-elevated, #2d3347)' : '#F2F4F7';
            e.currentTarget.style.borderColor = isNeonTheme ? 'var(--neon-blue-400, #3b82f6)' : '#778899';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = isNeonTheme ? 'var(--neon-bg-tertiary, #252a3c)' : '#ffffff';
            e.currentTarget.style.borderColor = isNeonTheme ? 'var(--neon-bg-elevated, #2d3347)' : '#d9d9d9';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '8px', color: '#5E9B96' }}>
            {renderIcon(component?._icon, 30)}
          </div>
          <div
            className="component-name"
            style={{
              fontSize: '10px',
              textAlign: 'center',
              lineHeight: '1.1',
              color: isNeonTheme ? 'var(--neon-text-secondary, #e2e4ea)' : '#595959',
              fontWeight: '500',
              wordBreak: 'break-word',
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              maxWidth: '100%'
            }}
          >
            {component._name}
          </div>
        </div>
      </Tooltip>
    );
  };

  // --- Render Tab Content (Horizontal Scroll Row) ---
  const renderTabContent = (categoryData: Record<string, any[]>) => {
    const subCategories = Object.keys(categoryData);
    let allComponents: any[] = [];
    subCategories.forEach(subCat => {
      allComponents = allComponents.concat(categoryData[subCat]);
    });

    if (allComponents.length === 0) {
      return (
        <div style={{ 
          padding: '16px', 
          color: isNeonTheme ? 'var(--neon-text-tertiary, #9ca3af)' : '#8c8c8c' 
        }}>
          No components found.
        </div>
      );
    }

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'nowrap',
          overflowX: 'auto',
          overflowY: 'hidden',
          alignItems: 'center',
          padding: '10px 4px 10px 4px',
          width: '100%',
          scrollbarWidth: 'thin',
        }}
        className="palette-horizontal-scroll"
      >
        {allComponents.map((component, index) =>
          renderComponentItem(component, `comp-${index}`)
        )}
      </div>
    );
  };

  // --- Tabs Configuration ---
  const tabItems: TabsProps['items'] = useMemo(() => {
    const categories = Object.keys(filteredCategorizedComponents);
    
    if (categories.length === 0) return [];

    return categories.map((category, index) => ({
      key: String(index),
      label: (
        <span style={{ 
          fontWeight: '600', 
          fontSize: '13px', 
          color: isNeonTheme ? 'var(--neon-text-primary, #fff)' : '#262626' 
        }}>
          {category.charAt(0).toUpperCase() + category.slice(1)}
        </span>
      ),
      children: renderTabContent(filteredCategorizedComponents[category]),
    }));
  }, [filteredCategorizedComponents, isNeonTheme]);

  // Auto-select first tab
  useEffect(() => {
    if (tabItems.length > 0 && activeTabKey === '0') {
      setActiveTabKey(tabItems[0].key);
    }
    if (tabItems.length === 0) setActiveTabKey('0');
  }, [tabItems.length]);

  // --- Render: Search Bar Control ---
  const searchControls = (
    <Space style={{ marginRight: '16px', paddingLeft: '8px' }}>
      <Input
        placeholder="Search components"
        onChange={(e) => setSearchValue(e.target.value)}
        value={searchValue}
        style={{ 
          width: 200,
          backgroundColor: isNeonTheme ? 'var(--neon-bg-tertiary, #252a3c)' : undefined,
          borderColor: isNeonTheme ? 'var(--neon-bg-elevated, #2d3347)' : undefined,
          color: isNeonTheme ? 'var(--neon-text-primary, #fff)' : undefined,
        }} 
        size="small"
        suffix={
          <SearchOutlined style={{ 
            color: isNeonTheme ? 'var(--neon-text-muted, #6b7280)' : 'rgba(0,0,0,.25)' 
          }} />
        }
        allowClear
      />
      <Tooltip title="Refresh components">
        <Button
          size="small"
          onClick={() => fetchComponents({ notify: true })}
          loading={loading}
          icon={renderIcon(refreshIcon, 14) as React.ReactNode}
          style={{
            backgroundColor: isNeonTheme ? 'var(--neon-bg-tertiary, #252a3c)' : undefined,
            borderColor: isNeonTheme ? 'var(--neon-bg-elevated, #2d3347)' : undefined,
            color: isNeonTheme ? 'var(--neon-text-secondary, #e2e4ea)' : undefined,
          }}
        />
      </Tooltip>
    </Space>
  );

  return (
    <div
      className="component-palette-horizontal"
      style={{
        width: '100%',
        backgroundColor: isNeonTheme ? 'var(--neon-bg-secondary, #1a1d29)' : '#ffffff',
        borderBottom: `1px solid ${isNeonTheme ? 'var(--neon-bg-elevated, #2d3347)' : '#e8e8e8'}`,
        boxShadow: isNeonTheme ? 'none' : '0 2px 4px rgba(0,0,0,0.02)',
        zIndex: 100,
        position: 'relative'
      }}
    >
      <Tabs
        activeKey={activeTabKey}
        items={tabItems}
        onChange={setActiveTabKey}
        type="line"
        size="small"
        tabBarExtraContent={{ left: searchControls }}
        tabBarStyle={{ 
          margin: 0, 
          padding: '0 8px',
          borderBottom: `1px solid ${isNeonTheme ? 'var(--neon-bg-elevated, #2d3347)' : '#f0f0f0'}`,
        }}
        destroyInactiveTabPane={true}
        className={isNeonTheme ? 'neon-tabs' : ''}
      />
      
      {tabItems.length === 0 && (
        <div style={{ 
          padding: '16px', 
          textAlign: 'center', 
          color: isNeonTheme ? 'var(--neon-text-tertiary, #9ca3af)' : '#8c8c8c', 
          fontSize: '12px' 
        }}>
          {searchValue ? `No components match "${searchValue}"` : "No components available"}
        </div>
      )}
    </div>
  );
};

export default ComponentPalette;
