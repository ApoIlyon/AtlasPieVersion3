import React, { useState, useEffect } from 'react';

export interface ContextCondition {
  id: string;
  type: 'application' | 'window_title' | 'url' | 'file_path';
  value: string;
  operator: 'equals' | 'contains' | 'starts_with' | 'ends_with' | 'regex';
  enabled: boolean;
}

export interface ContextConditionsPanelProps {
  conditions: ContextCondition[];
  onUpdateConditions: (conditions: ContextCondition[]) => void;
  autoDetectApp: boolean;
  onToggleAutoDetect: (enabled: boolean) => void;
  currentWindowInfo?: {
    application: string;
    windowTitle: string;
    url?: string;
    filePath?: string;
  } | null;
}

export function ContextConditionsPanel({
  conditions,
  onUpdateConditions,
  autoDetectApp,
  onToggleAutoDetect,
  currentWindowInfo,
}: ContextConditionsPanelProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newCondition, setNewCondition] = useState<Partial<ContextCondition>>({
    type: 'application',
    operator: 'contains',
    value: '',
    enabled: true,
  });
  const [autoDetectTimer, setAutoDetectTimer] = useState<number>(0);
  const [isAutoDetecting, setIsAutoDetecting] = useState(false);

  useEffect(() => {
    if (autoDetectApp && !isAutoDetecting) {
      setIsAutoDetecting(true);
      setAutoDetectTimer(5);
      
      const timer = setInterval(() => {
        setAutoDetectTimer(prev => {
          if (prev <= 1) {
            setIsAutoDetecting(false);
            if (currentWindowInfo) {
              // Auto-add condition for current app
              const existingCondition = conditions.find(c => 
                c.type === 'application' && c.value === currentWindowInfo.application
              );
              
              if (!existingCondition) {
                const newAppCondition: ContextCondition = {
                  id: `auto-${Date.now()}`,
                  type: 'application',
                  operator: 'equals',
                  value: currentWindowInfo.application,
                  enabled: true,
                };
                onUpdateConditions([...conditions, newAppCondition]);
              }
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [autoDetectApp, isAutoDetecting, currentWindowInfo, conditions, onUpdateConditions]);

  const handleAddCondition = () => {
    if (!newCondition.value?.trim()) return;
    
    const condition: ContextCondition = {
      id: `cond-${Date.now()}`,
      type: newCondition.type || 'application',
      operator: newCondition.operator || 'contains',
      value: newCondition.value.trim(),
      enabled: newCondition.enabled !== false,
    };
    
    onUpdateConditions([...conditions, condition]);
    setNewCondition({ type: 'application', operator: 'contains', value: '', enabled: true });
    setShowAddDialog(false);
  };

  const handleDeleteCondition = (id: string) => {
    onUpdateConditions(conditions.filter(c => c.id !== id));
  };

  const handleToggleCondition = (id: string) => {
    onUpdateConditions(conditions.map(c => 
      c.id === id ? { ...c, enabled: !c.enabled } : c
    ));
  };

  const getConditionIcon = (type: ContextCondition['type']) => {
    switch (type) {
      case 'application': return '📱';
      case 'window_title': return '🪟';
      case 'url': return '🔗';
      case 'file_path': return '📁';
      default: return '📋';
    }
  };

  const getConditionDescription = (condition: ContextCondition) => {
    const operatorText = {
      equals: 'equals',
      contains: 'contains',
      starts_with: 'starts with',
      ends_with: 'ends with',
      regex: 'matches regex',
    }[condition.operator];

    return `${condition.type} ${operatorText} "${condition.value}"`;
  };

  return (
    <div className="bg-surface rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold">Context Conditions</h3>
        <div className="flex items-center space-x-4">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoDetectApp}
              onChange={(e) => onToggleAutoDetect(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Auto-detect app</span>
            {isAutoDetecting && (
              <span className="text-xs text-accent bg-accent/20 px-2 py-1 rounded">
                {autoDetectTimer}s
              </span>
            )}
          </label>
          <button
            onClick={() => setShowAddDialog(true)}
            className="px-4 py-2 bg-accent hover:bg-accent-hover rounded-md text-sm transition-colors"
          >
            + Add Condition
          </button>
        </div>
      </div>

      {/* Current Window Info */}
      {currentWindowInfo && (
        <div className="mb-6 p-4 bg-background rounded-lg border border-border">
          <h4 className="text-sm font-medium mb-2">Current Window</h4>
          <div className="space-y-1 text-sm text-text-muted">
            <div><strong>Application:</strong> {currentWindowInfo.application}</div>
            <div><strong>Title:</strong> {currentWindowInfo.windowTitle}</div>
            {currentWindowInfo.url && <div><strong>URL:</strong> {currentWindowInfo.url}</div>}
            {currentWindowInfo.filePath && <div><strong>File:</strong> {currentWindowInfo.filePath}</div>}
          </div>
        </div>
      )}

      {/* Conditions List */}
      <div className="space-y-3">
        {conditions.length === 0 ? (
          <div className="text-center py-8 text-text-muted">
            <p className="text-sm">No conditions set</p>
            <p className="text-xs mt-1">Add conditions to bind this profile to specific applications or contexts</p>
          </div>
        ) : (
          conditions.map(condition => (
            <div
              key={condition.id}
              className={clsx(
                'flex items-center justify-between p-4 rounded-lg border transition-colors',
                condition.enabled 
                  ? 'bg-background border-border' 
                  : 'bg-background/50 border-border/50 opacity-60'
              )}
            >
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => handleToggleCondition(condition.id)}
                  className={clsx(
                    'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors',
                    condition.enabled
                      ? 'bg-accent border-accent'
                      : 'border-border hover:border-accent/50'
                  )}
                >
                  {condition.enabled && (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
                
                <div className="text-2xl">{getConditionIcon(condition.type)}</div>
                
                <div>
                  <div className="font-medium text-sm">{getConditionDescription(condition)}</div>
                  <div className="text-xs text-text-muted">
                    Active: {condition.enabled ? 'Yes' : 'No'}
                  </div>
                </div>
              </div>
              
              <button
                onClick={() => handleDeleteCondition(condition.id)}
                className="text-red-400 hover:text-red-300 p-1 rounded transition-colors"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>

      {/* Add Condition Dialog */}
      {showAddDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-lg p-6 w-96">
            <h3 className="text-lg font-semibold mb-4">Add Condition</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Type</label>
                <select
                  value={newCondition.type}
                  onChange={(e) => setNewCondition({ ...newCondition, type: e.target.value as ContextCondition['type'] })}
                  className="w-full px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="application">Application</option>
                  <option value="window_title">Window Title</option>
                  <option value="url">URL</option>
                  <option value="file_path">File Path</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Operator</label>
                <select
                  value={newCondition.operator}
                  onChange={(e) => setNewCondition({ ...newCondition, operator: e.target.value as ContextCondition['operator'] })}
                  className="w-full px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="equals">Equals</option>
                  <option value="contains">Contains</option>
                  <option value="starts_with">Starts With</option>
                  <option value="ends_with">Ends With</option>
                  <option value="regex">Regex</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Value</label>
                <input
                  type="text"
                  value={newCondition.value}
                  onChange={(e) => setNewCondition({ ...newCondition, value: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder={newCondition.type === 'application' ? 'e.g., chrome.exe' : 'condition value'}
                  autoFocus
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowAddDialog(false);
                  setNewCondition({ type: 'application', operator: 'contains', value: '', enabled: true });
                }}
                className="px-4 py-2 text-text-muted hover:text-text transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCondition}
                disabled={!newCondition.value?.trim()}
                className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function clsx(...classes: Array<string | boolean | undefined>) {
  return classes.filter(Boolean).join(' ');
}
