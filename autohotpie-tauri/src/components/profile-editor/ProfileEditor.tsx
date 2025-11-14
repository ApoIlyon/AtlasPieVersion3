import React, { useState, useCallback } from 'react';
import { PieMenu, PieSliceDefinition } from '../pie/PieMenu';
import { ContextConditionsPanel, ContextCondition } from './ContextConditionsPanel';
import { useSystemStore } from '../../state/systemStore';

export interface ProfileEditorProps {
  profile: {
    profile: {
      id: string;
      name: string;
      description?: string | null;
      enabled: boolean;
      globalHotkey?: string | null;
      activationRules: any[];
      rootMenu: string;
      holdToOpen?: boolean | null;
    };
    menus: Array<{
      id: string;
      name: string;
      slices: PieSliceDefinition[];
      appearance?: any;
    }>;
    actions: any[];
  } | null;
  mode: 'view' | 'create';
  onClose: () => void;
  animationsEnabled?: boolean;
  onToggleAnimations?: (enabled: boolean) => void;
  onUpdateProfile?: (profile: ProfileEditorProps['profile']) => void;
}

export function ProfileEditor({
  profile,
  mode,
  onClose,
  animationsEnabled = true,
  onToggleAnimations,
  onUpdateProfile,
}: ProfileEditorProps) {
  const [selectedMenuId, setSelectedMenuId] = useState<string>(profile?.menus[0]?.id || '');
  const [selectedSliceId, setSelectedSliceId] = useState<string | null>(null);
  const [showCreateMenuDialog, setShowCreateMenuDialog] = useState(false);
  const [newMenuName, setNewMenuName] = useState('');
  const [showHints, setShowHints] = useState(true);
  const [showContextPanel, setShowContextPanel] = useState(false);
  const [showActionsPanel, setShowActionsPanel] = useState(false);
  const [contextConditions, setContextConditions] = useState<ContextCondition[]>([]);
  const [autoDetectApp, setAutoDetectApp] = useState(false);
  const [actionFilter, setActionFilter] = useState('');
  const [selectedActionCategory, setSelectedActionCategory] = useState('all');
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const currentWindowInfo = useSystemStore((state) => state.currentWindow);

  const selectedMenu = profile?.menus.find(menu => menu.id === selectedMenuId);
  const selectedSlice = selectedMenu?.slices.find(slice => slice.id === selectedSliceId);

  const handleCreateMenu = useCallback(() => {
    if (!newMenuName.trim()) return;
    
    const newMenu = {
      id: `menu-${Date.now()}`,
      name: newMenuName.trim(),
      slices: [],
    };
    
    if (!profile) return;
    
    const updatedProfile = {
      ...profile,
      menus: [...profile.menus, newMenu],
    };
    
    onUpdateProfile?.(updatedProfile);
    setSelectedMenuId(newMenu.id);
    setNewMenuName('');
    setShowCreateMenuDialog(false);
  }, [profile, newMenuName, onUpdateProfile]);

  const handleDeleteMenu = useCallback((menuId: string) => {
    if (!profile || profile.menus.length <= 1) return;
    
    const updatedProfile = {
      ...profile,
      menus: profile.menus.filter(menu => menu.id !== menuId),
    };
    
    onUpdateProfile?.(updatedProfile);
    
    if (selectedMenuId === menuId) {
      setSelectedMenuId(updatedProfile.menus[0]?.id || '');
    }
  }, [profile, selectedMenuId, onUpdateProfile]);

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-full bg-background text-text">
        <div className="text-center">
          <p className="text-lg font-medium mb-2">No profile selected</p>
          <p className="text-sm text-text-muted mb-4">Select a profile to start editing</p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-accent hover:bg-accent-hover rounded-md text-sm transition-colors"
          >
            Close Editor
          </button>
        </div>
      </div>
    );
  }

  const handleCreateSlice = useCallback(() => {
    if (!selectedMenu) return;
    
    const newSlice: PieSliceDefinition = {
      id: `slice-${Date.now()}`,
      label: 'New Action',
      order: selectedMenu.slices.length,
      description: 'Click to configure this action',
      color: '#3b82f6',
    };
    
    const updatedMenu = {
      ...selectedMenu,
      slices: [...selectedMenu.slices, newSlice],
    };
    
    const updatedProfile = {
      ...profile,
      menus: profile.menus.map(menu => 
        menu.id === selectedMenuId ? updatedMenu : menu
      ),
    };
    
    onUpdateProfile?.(updatedProfile);
    setSelectedSliceId(newSlice.id);
  }, [profile, selectedMenu, selectedMenuId, onUpdateProfile]);

  const handleDeleteSlice = useCallback((sliceId: string) => {
    if (!selectedMenu) return;
    
    const updatedMenu = {
      ...selectedMenu,
      slices: selectedMenu.slices.filter(slice => slice.id !== sliceId),
    };
    
    const updatedProfile = {
      ...profile,
      menus: profile.menus.map(menu => 
        menu.id === selectedMenuId ? updatedMenu : menu
      ),
    };
    
    onUpdateProfile?.(updatedProfile);
    setSelectedSliceId(null);
  }, [profile, selectedMenu, selectedMenuId, onUpdateProfile]);

  const handleUpdateSlice = useCallback((sliceId: string, updates: Partial<PieSliceDefinition>) => {
    if (!selectedMenu) return;
    
    const updatedMenu = {
      ...selectedMenu,
      slices: selectedMenu.slices.map(slice => 
        slice.id === sliceId ? { ...slice, ...updates } : slice
      ),
    };
    
    const updatedProfile = {
      ...profile,
      menus: profile.menus.map(menu => 
        menu.id === selectedMenuId ? updatedMenu : menu
      ),
    };
    
    onUpdateProfile?.(updatedProfile);
  }, [profile, selectedMenu, selectedMenuId, onUpdateProfile]);

  const handleDragDrop = useCallback((draggedSliceId: string, targetIndex: number) => {
    if (!selectedMenu) return;
    
    const draggedSlice = selectedMenu.slices.find(s => s.id === draggedSliceId);
    if (!draggedSlice) return;
    
    const otherSlices = selectedMenu.slices.filter(s => s.id !== draggedSliceId);
    const reorderedSlices = [
      ...otherSlices.slice(0, targetIndex),
      draggedSlice,
      ...otherSlices.slice(targetIndex),
    ].map((slice, index) => ({ ...slice, order: index }));
    
    const updatedMenu = {
      ...selectedMenu,
      slices: reorderedSlices,
    };
    
    const updatedProfile = {
      ...profile,
      menus: profile.menus.map(menu => 
        menu.id === selectedMenuId ? updatedMenu : menu
      ),
    };
    
    onUpdateProfile?.(updatedProfile);
  }, [profile, selectedMenu, selectedMenuId, onUpdateProfile]);

  const handleUpdateContextConditions = useCallback((conditions: ContextCondition[]) => {
    setContextConditions(conditions);
    // TODO: Update profile with new conditions
  }, []);

  const handleToggleAutoDetect = useCallback((enabled: boolean) => {
    setAutoDetectApp(enabled);
  }, []);

  // Mock action library data
  const actionLibrary = [
    { id: 'launch-app', name: 'Launch Application', category: 'application', description: 'Open any application', icon: '🚀' },
    { id: 'open-file', name: 'Open File', category: 'file', description: 'Open a specific file', icon: '📄' },
    { id: 'open-folder', name: 'Open Folder', category: 'file', description: 'Open a folder', icon: '📁' },
    { id: 'system-command', name: 'System Command', category: 'system', description: 'Execute system commands', icon: '⚙️' },
    { id: 'keyboard-shortcut', name: 'Keyboard Shortcut', category: 'input', description: 'Send key combinations', icon: '⌨️' },
    { id: 'clipboard-copy', name: 'Copy to Clipboard', category: 'clipboard', description: 'Copy text to clipboard', icon: '📋' },
    { id: 'clipboard-paste', name: 'Paste from Clipboard', category: 'clipboard', description: 'Paste clipboard content', icon: '📋' },
    { id: 'window-minimize', name: 'Minimize Window', category: 'window', description: 'Minimize current window', icon: '🗔' },
    { id: 'window-maximize', name: 'Maximize Window', category: 'window', description: 'Maximize current window', icon: '🗖' },
    { id: 'volume-up', name: 'Volume Up', category: 'media', description: 'Increase system volume', icon: '🔊' },
    { id: 'volume-down', name: 'Volume Down', category: 'media', description: 'Decrease system volume', icon: '🔉' },
    { id: 'mute-toggle', name: 'Mute Toggle', category: 'media', description: 'Toggle mute', icon: '🔇' },
  ];

  const categories = [
    { id: 'all', name: 'All Actions', icon: '🎯' },
    { id: 'application', name: 'Applications', icon: '🚀' },
    { id: 'file', name: 'Files', icon: '📁' },
    { id: 'system', name: 'System', icon: '⚙️' },
    { id: 'input', name: 'Input', icon: '⌨️' },
    { id: 'clipboard', name: 'Clipboard', icon: '📋' },
    { id: 'window', name: 'Windows', icon: '🗔' },
    { id: 'media', name: 'Media', icon: '🎵' },
  ];

  const filteredActions = actionLibrary.filter(action => {
    const matchesCategory = selectedActionCategory === 'all' || action.category === selectedActionCategory;
    const matchesFilter = actionFilter === '' || 
      action.name.toLowerCase().includes(actionFilter.toLowerCase()) ||
      action.description.toLowerCase().includes(actionFilter.toLowerCase());
    return matchesCategory && matchesFilter;
  });

  const handleDragStart = (e: React.DragEvent, actionId: string) => {
    e.dataTransfer.setData('text/plain', actionId);
    e.dataTransfer.effectAllowed = 'copy';
    // Add visual feedback during drag
    e.currentTarget.classList.add('opacity-50');
  };

  const handleDragEnd = (e: React.DragEvent) => {
    // Remove visual feedback after drag
    e.currentTarget.classList.remove('opacity-50');
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent, targetSliceId?: string) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const actionId = e.dataTransfer.getData('text/plain');
    const action = actionLibrary.find(a => a.id === actionId);
    
    // Determine which slice to bind the action to
    const targetSlice = targetSliceId ? 
      selectedMenu?.slices.find(s => s.id === targetSliceId) :
      selectedSlice;
    
    if (action && targetSlice) {
      // Bind the action to the slice by updating both label and action ID
      handleUpdateSlice(targetSlice.id, { 
        label: action.name,
        description: action.description,
        action: actionId // This binds the action to the slice
      });
      
      // Auto-select the slice that was just updated
      setSelectedSliceId(targetSlice.id);
      
      // Show a toast notification that the action has been bound
      if (window.__PIE_DEBUG__) {
        console.log(`Action "${action.name}" bound to slice "${targetSlice.label}"`);
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-background text-text">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div>
          <h1 className="text-xl font-semibold">{profile.profile.name}</h1>
          <p className="text-sm text-text-muted">
            {mode === 'create' ? 'Creating new profile' : 'Editing profile'}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-surface-hover rounded-lg transition-colors"
          aria-label="Close editor"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Menu List */}
      <div className="w-64 bg-surface border-r border-border p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Menus</h2>
          <button
            onClick={() => setShowCreateMenuDialog(true)}
            className="px-3 py-1 bg-accent hover:bg-accent-hover rounded-md text-sm transition-colors"
          >
            + New
          </button>
        </div>
        
        <div className="space-y-2">
          {profile?.menus.map(menu => (
            <div
              key={menu.id}
              className={clsx(
                'p-3 rounded-lg cursor-pointer transition-colors',
                selectedMenuId === menu.id 
                  ? 'bg-accent/20 border border-accent' 
                  : 'bg-surface-hover hover:bg-surface-hover/80'
              )}
              onClick={() => setSelectedMenuId(menu.id)}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{menu.name}</span>
                {profile?.menus.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteMenu(menu.id);
                    }}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    ×
                  </button>
                )}
              </div>
              <div className="text-xs text-text-muted mt-1">
                {menu.slices.length} actions
              </div>
            </div>
          ))}
        </div>

        {/* Animation Toggle */}
        <div className="mt-6 pt-4 border-t border-border">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={animationsEnabled}
              onChange={(e) => onToggleAnimations(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Enable Animations</span>
          </label>
        </div>

        {/* Hints Toggle */}
        <div className="mt-4">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showHints}
              onChange={(e) => setShowHints(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Show Hints</span>
          </label>
        </div>

        {/* Context Conditions Toggle */}
        <div className="mt-4">
          <button
            onClick={() => setShowContextPanel(!showContextPanel)}
            className={clsx(
              'w-full px-3 py-2 rounded-md text-sm transition-colors',
              showContextPanel 
                ? 'bg-accent text-white' 
                : 'bg-surface-hover hover:bg-surface-hover/80 text-text'
            )}
          >
            Context Conditions
          </button>
        </div>

        {/* Actions Panel Toggle */}
        <div className="mt-2">
          <button
            onClick={() => setShowActionsPanel(!showActionsPanel)}
            className={clsx(
              'w-full px-3 py-2 rounded-md text-sm transition-colors',
              showActionsPanel 
                ? 'bg-accent text-white' 
                : 'bg-surface-hover hover:bg-surface-hover/80 text-text'
            )}
          >
            Actions Library
          </button>
        </div>
      </div>

      {/* Center - Pie Menu Preview */}
      <div className="flex-1 flex items-center justify-center bg-background">
        <div
          className="relative"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          {selectedMenu && (
            <PieMenu
              slices={selectedMenu.slices}
              visible={true}
              radius={180}
              gapDeg={6}
              animationsEnabled={animationsEnabled}
              theme="dark"
              animationStyle="slide"
              interactive={true}
              onReorder={handleDragDrop}
              onSelect={(sliceId) => setSelectedSliceId(sliceId)}
              onHover={(sliceId) => {
                // Could show preview/tooltip here
              }}
              centerContent={selectedMenu.name}
              onSliceDrop={handleDrop}
            />
          )}
          
          {showHints && selectedMenu && selectedMenu.slices.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-surface/90 backdrop-blur-sm rounded-lg p-4 text-center max-w-xs">
                <p className="text-sm text-text-muted">
                  Right-click or drag actions here to create slices
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Sidebar - Slice Editor */}
      <div 
        className={`w-80 bg-surface border-l border-border p-4 transition-colors ${
          isDraggingOver ? 'bg-accent/10 border-accent/30' : ''
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Actions</h2>
          <button
            onClick={handleCreateSlice}
            className="px-3 py-1 bg-accent hover:bg-accent-hover rounded-md text-sm transition-colors"
          >
            + Add
          </button>
        </div>
        
        {isDraggingOver && (
          <div className="mb-4 p-3 bg-accent/20 border-2 border-dashed border-accent/50 rounded-lg text-center">
            <p className="text-sm text-accent">Drop action here to bind it to the selected slice</p>
          </div>
        )}

        {selectedSlice ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Label</label>
              <input
                type="text"
                value={selectedSlice.label}
                onChange={(e) => handleUpdateSlice(selectedSlice.id, { label: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder="Action name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Description</label>
              <textarea
                value={selectedSlice.description || ''}
                onChange={(e) => handleUpdateSlice(selectedSlice.id, { description: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent h-20 resize-none"
                placeholder="What this action does..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Color</label>
              <input
                type="color"
                value={selectedSlice.color || '#3b82f6'}
                onChange={(e) => handleUpdateSlice(selectedSlice.id, { color: e.target.value })}
                className="w-full h-10 rounded-md cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Shortcut</label>
              <input
                type="text"
                value={selectedSlice.shortcut || ''}
                onChange={(e) => handleUpdateSlice(selectedSlice.id, { shortcut: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder="Ctrl+Shift+A"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Bound Action</label>
              {selectedSlice.action ? (
                <div className="p-3 bg-surface-hover rounded-lg border border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">
                        {actionLibrary.find(a => a.id === selectedSlice.action)?.name || 'Unknown Action'}
                      </div>
                      <div className="text-xs text-text-muted">
                        {actionLibrary.find(a => a.id === selectedSlice.action)?.description || 'No description'}
                      </div>
                    </div>
                    <button
                      onClick={() => handleUpdateSlice(selectedSlice.id, { action: null })}
                      className="p-1 hover:bg-surface rounded transition-colors text-text-muted hover:text-text"
                      title="Remove action binding"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3 border-2 border-dashed border-border rounded-lg text-center">
                  <p className="text-sm text-text-muted mb-2">No action bound</p>
                  <p className="text-xs text-text-muted/70">Drag an action from the library to bind it</p>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-border">
              <button
                onClick={() => handleDeleteSlice(selectedSlice.id)}
                className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 rounded-md text-sm transition-colors"
              >
                Delete Action
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center text-text-muted py-8">
            <p className="text-sm">Select an action to edit</p>
            {showHints && (
              <p className="text-xs mt-2">
                Click on a slice in the pie menu or create a new action
              </p>
            )}
          </div>
        )}
      </div>

      {/* Context Conditions Panel */}
      {showContextPanel && (
        <div className="absolute top-16 right-4 w-96 bg-surface border border-border rounded-lg shadow-lg z-10">
          <ContextConditionsPanel
            conditions={contextConditions}
            onUpdateConditions={handleUpdateContextConditions}
            autoDetectApp={autoDetectApp}
            onToggleAutoDetect={handleToggleAutoDetect}
            currentWindowInfo={currentWindowInfo}
          />
        </div>
      )}

      {/* Actions Panel */}
      {showActionsPanel && (
        <div className="absolute top-16 left-4 w-80 bg-surface border border-border rounded-lg shadow-lg z-10">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Actions Library</h3>
              <button
                onClick={() => setShowActionsPanel(false)}
                className="p-1 hover:bg-surface-hover rounded transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Search Filter */}
            <div className="mb-4">
              <input
                type="text"
                placeholder="Search actions..."
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent text-sm"
              />
            </div>

            {/* Category Filter */}
            <div className="mb-4">
              <select
                value={selectedActionCategory}
                onChange={(e) => setSelectedActionCategory(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent text-sm"
              >
                {categories.map(category => (
                  <option key={category.id} value={category.id}>
                    {category.icon} {category.name}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Actions List */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {filteredActions.map(action => (
                <div
                  key={action.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, action.id)}
                  onDragEnd={handleDragEnd}
                  className="p-3 bg-surface-hover rounded-lg cursor-move hover:bg-surface-hover/80 transition-colors border border-transparent hover:border-accent/30"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{action.icon}</span>
                    <div className="flex-1">
                      <div className="font-medium text-sm">{action.name}</div>
                      <div className="text-xs text-text-muted">{action.description}</div>
                    </div>
                  </div>
                </div>
              ))}
              {filteredActions.length === 0 && (
                <div className="text-center text-text-muted py-8">
                  <p className="text-sm">No actions found</p>
                </div>
              )}
            </div>
            
            <div className="mt-4 pt-4 border-t border-border">
              <button className="w-full px-3 py-2 bg-accent hover:bg-accent-hover rounded-md text-sm transition-colors">
                Create Custom Action
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

      {/* Create Menu Dialog */}
      {showCreateMenuDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-lg p-6 w-96">
            <h3 className="text-lg font-semibold mb-4">Create New Menu</h3>
            <input
              type="text"
              value={newMenuName}
              onChange={(e) => setNewMenuName(e.target.value)}
              placeholder="Menu name"
              className="w-full px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent mb-4"
              autoFocus
            />
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowCreateMenuDialog(false);
                  setNewMenuName('');
                }}
                className="px-4 py-2 text-text-muted hover:text-text transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateMenu}
                disabled={!newMenuName.trim()}
                className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors"
              >
                Create
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