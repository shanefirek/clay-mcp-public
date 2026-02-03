/**
 * Clay API Type Definitions
 * Based on reverse-engineered internal API (v3)
 */

// ID Patterns
export type WorkspaceId = string; // numeric string e.g., "712043"
export type WorkbookId = `wb_${string}`;
export type TableId = `t_${string}`;
export type ViewId = `gv_${string}`;
export type RecordId = `r_${string}`;
export type FieldId = `f_${string}`;
export type SourceId = `s_${string}`;

// Cell value with metadata
export interface CellValue {
  value: unknown;
  metadata?: {
    isCoerced?: boolean;
    [key: string]: unknown;
  };
  externalContent?: {
    status?: 'SUCCESS' | 'FAILED' | 'PENDING' | 'RUNNING' | string;
    fullValue?: unknown;
    hiddenValue?: unknown;
    error?: string;
    [key: string]: unknown;
  };
}

// Record structure
export interface ClayRecord {
  id: RecordId;
  tableId: TableId;
  cells: Record<FieldId, CellValue>;
  recordMetadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// Field/Column types
export type FieldType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'url'
  | 'email'
  | 'phone'
  | 'action'
  | 'formula'
  | 'lookup'
  | 'waterfall';

export interface FieldTypeSettings {
  formulaType?: string;
  formulaText?: string;
  formulaPrompt?: string;
  actionKey?: string;
  actionPackageId?: string;
  inputs?: Record<string, unknown>;
  runSettings?: {
    autoUpdate?: boolean;
    onlyRunIf?: string;
  };
  dataTypeSettings?: {
    type: string;
    label: string;
    iconType?: { displayName: string };
  };
  [key: string]: unknown;
}

export interface ClayField {
  id: FieldId;
  name: string;
  type: FieldType;
  typeSettings?: FieldTypeSettings;
  createdAt?: string;
  updatedAt?: string;
}

// View structure
export interface ClayView {
  id: ViewId;
  name: string;
  tableId: TableId;
  fieldOrder?: FieldId[];
  filters?: unknown[];
  sorts?: unknown[];
}

// Table structure
export interface ClayTable {
  id: TableId;
  name: string;
  workbookId: WorkbookId;
  fields: ClayField[];
  views: ClayView[];
  recordCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

// Workspace structure
export interface ClayWorkspace {
  id: WorkspaceId;
  name: string;
  workbooks?: ClayWorkbook[];
}

export interface ClayWorkbook {
  id: WorkbookId;
  name: string;
  tables?: ClayTable[];
}

// Enrichment/Action types
export interface ActionConfig {
  type: 'actionConfig';
  actionKey: string;
  actionPackageId: string;
  authAccountId?: string | null;
  inputsBinding: InputBinding[];
  attributePath: string;
  name: string;
}

export interface InputBinding {
  name: string;
  formulaText: string;
}

export interface WaterfallConfig {
  waterfallConfigs: ActionConfig[];
  name: string;
  runMode: 'DONT_RUN' | 'RUN_ALL' | 'RUN_SAMPLE';
}

// Run enrichment request
export interface RunEnrichmentRequest {
  callerName?: string;
  fieldIds: FieldId[];
  forceRun?: boolean;
  runRecords: {
    recordIds: RecordId[];
  };
}

export interface RunEnrichmentResponse {
  recordCount: number;
  runMode: string;
}

// Search response
export interface SearchResult {
  fieldId: FieldId;
  recordId: RecordId;
}

export interface SearchResponse {
  results: SearchResult[];
}

// Bulk fetch response
export interface BulkFetchResponse {
  results: ClayRecord[];
}

// Create field request types
export interface CreateFormulaFieldRequest {
  type: 'text';
  name: string;
  typeSettings: {
    formulaType: string;
    dataTypeSettings: {
      type: string;
      label: string;
      iconType?: { displayName: string };
    };
    formulaText: string;
    formulaPrompt: string;
  };
  activeViewId: ViewId;
  attributionData?: { created_from: string };
}

export interface AIFieldOutputField {
  name: string;
  type: 'text' | 'number' | 'boolean';
}

export interface CreateAIFieldRequest {
  type: 'action';
  name: string;
  typeSettings: {
    actionKey: 'use-ai';
    actionPackageId: string;
    inputs: {
      useCase: string;
      model: string;
      prompt: string;
      outputFormat: 'fields' | 'json';
      outputFields: AIFieldOutputField[];
    };
    runSettings?: {
      autoUpdate?: boolean;
      onlyRunIf?: string;
    };
  };
}

// Available actions response
export interface AvailableAction {
  actionKey: string;
  actionPackageId: string;
  name: string;
  description?: string;
  category?: string;
  inputs?: ActionInput[];
  outputs?: ActionOutput[];
}

export interface ActionInput {
  name: string;
  type: string;
  required?: boolean;
  description?: string;
}

export interface ActionOutput {
  name: string;
  type: string;
  path?: string;
}

// API Error
export interface ClayAPIError {
  status: number;
  message: string;
  code?: string;
}
