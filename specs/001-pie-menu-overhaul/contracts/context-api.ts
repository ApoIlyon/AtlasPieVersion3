// Context Conditions API Contracts
// Rule evaluation for profile activation

export interface ContextEvaluateRequest {
  currentContext: SystemContext; // Current window/app state
  evaluateAll?: boolean; // Check all rules vs. only active profile's rules
}

export interface ContextEvaluateResponse {
  success: boolean;
  data?: {
    matchedProfiles: ProfileMatch[];
    activeProfile?: {
      id: string;
      conditionId: string;
      priority: number;
    };
    visualIndicators?: VisualIndicator[];
  };
  error?: string;
}

export interface ContextRuleTestRequest {
  rule: ContextRule;
  context: SystemContext;
}

export interface ContextRuleTestResponse {
  success: boolean;
  data?: {
    matches: boolean;
    confidence: number; // 0-100 match confidence
    matchedPatterns: string[];
    explanation?: string; // Why it matched/didn't
  };
  error?: string;
}

export interface ContextAutoDetectRequest {
  timeoutSeconds: number; // 5-second default
  patternsOnly?: boolean; // Return detected patterns without creating rules
}

export interface ContextAutoDetectResponse {
  success: boolean;
  data?: {
    detectedApps: AppDetection[];
    suggestedRules: ContextRule[];
    confidence: number;
  };
  error?: string;
}

export interface ContextRuleUpdateRequest {
  conditionId: string;
  rules: ContextRule[];
  priority?: number;
}

export interface ContextConditionCreateRequest {
  profileId: string;
  rules: ContextRule[];
  priority?: number;
  visualIndicator?: boolean;
  autoDetectEnabled?: boolean;
}

// Command names
export const CONTEXT_COMMANDS = {
  evaluate: 'context_evaluate',
  test_rule: 'context_test_rule',
  auto_detect: 'context_auto_detect',
  create_condition: 'context_create_condition',
  update_condition: 'context_update_condition',
  delete_condition: 'context_delete_condition',
  list_conditions: 'context_list_conditions',
} as const;

// Error codes
export const CONTEXT_ERRORS = {
  EVALUATION_FAILED: 'CONTEXT_EVALUATION_FAILED',
  INVALID_RULE: 'INVALID_CONTEXT_RULE',
  AUTO_DETECT_TIMEOUT: 'AUTO_DETECT_TIMEOUT',
  PERMISSION_DENIED: 'CONTEXT_PERMISSION_DENIED',
} as const;

// Types
export interface ProfileMatch {
  profileId: string;
  conditionId: string;
  priority: number;
  matchedRules: ContextRule[];
  confidence: number; // Overall match confidence
}

export interface VisualIndicator {
  profileId: string;
  indicator: 'icon' | 'text' | 'highlight';
  message?: string; // e.g., "Work Profile Active"
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

export interface AppDetection {
  appName: string;
  processName: string;
  windowTitle: string;
  confidence: number; // Detection confidence
  metadata: {
    pid?: number;
    executablePath?: string;
    iconPath?: string;
  };
}

// Core context types
export interface SystemContext {
  activeApp?: AppInfo;
  activeWindow?: WindowInfo;
  foregroundProcess?: ProcessInfo;
  timestamp: Date; // When context was captured
}

export interface AppInfo {
  name: string; // Human-readable name
  executableName: string; // Process name
  bundleId?: string; // macOS bundle ID
  version?: string;
  path: string; // Executable path
}

export interface WindowInfo {
  title: string;
  class?: string; // Linux window class
  pid: number;
  dimensions: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  isMinimized: boolean;
  isMaximized: boolean;
  isFullscreen: boolean;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  commandLine: string;
  workingDirectory?: string;
  parentPid?: number;
}

export interface ContextRule {
  id: string; // Unique rule identifier
  type: RuleType; // What aspect to match
  pattern: string; // Pattern to match against
  matchType: MatchType; // How to match
  caseSensitive: boolean;
  priority?: number; // Within condition priority (higher = more specific)
  enabled: boolean;
}

export enum RuleType {
  AppName = 'app_name',
  ProcessName = 'process_name',
  WindowTitle = 'window_title',
  WindowClass = 'window_class',
  ExecutablePath = 'executable_path',
  BundleId = 'bundle_id',
}

export enum MatchType {
  Exact = 'exact',
  Contains = 'contains',
  StartsWith = 'starts_with',
  EndsWith = 'ends_with',
  Regex = 'regex',
}
