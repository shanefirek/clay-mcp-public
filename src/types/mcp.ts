/**
 * MCP-specific Type Definitions
 *
 * Types for MCP tool responses and resource handling.
 */

/**
 * Standard MCP tool response
 */
export interface ToolResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

/**
 * Create a success response
 */
export function successResponse(data: unknown): ToolResponse {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

/**
 * Create an error response
 */
export function errorResponse(message: string): ToolResponse {
  return {
    content: [
      {
        type: 'text',
        text: `Error: ${message}`,
      },
    ],
    isError: true,
  };
}

/**
 * Resource content structure
 */
export interface ResourceContent {
  uri: string;
  mimeType: string;
  text: string;
}

/**
 * Resource response structure
 */
export interface ResourceResponse {
  contents: ResourceContent[];
}
