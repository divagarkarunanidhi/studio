'use client';

type SecurityRuleContext = {
  path: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete' | 'write';
  requestResourceData?: any;
};

interface SecurityRuleRequest {
  auth: { uid: string; email: string | null; name: string | null } | null;
  method: string;
  path: string;
  resource?: {
    data: any;
  };
}

/**
 * Builds a simulated request object describing the failed operation.
 * Note: We no longer have direct access to a Firebase Auth user; the auth
 * field is populated from NextAuth elsewhere when relevant.
 */
function buildRequestObject(context: SecurityRuleContext): SecurityRuleRequest {
  return {
    auth: null,
    method: context.operation,
    path: `/databases/(default)/documents/${context.path}`,
    resource: context.requestResourceData ? { data: context.requestResourceData } : undefined,
  };
}

/**
 * Builds the final, formatted error message for the LLM.
 */
function buildErrorMessage(requestObject: SecurityRuleRequest): string {
  return `Missing or insufficient permissions for ${requestObject.method} on ${requestObject.path}:
${JSON.stringify(requestObject, null, 2)}`;
}

/**
 * Custom error class for Mongo-shim permission/operation failures.
 * Kept under the legacy "FirestorePermissionError" name so consumers don't
 * need to be updated.
 */
export class FirestorePermissionError extends Error {
  public readonly request: SecurityRuleRequest;

  constructor(context: SecurityRuleContext) {
    const requestObject = buildRequestObject(context);
    super(buildErrorMessage(requestObject));
    this.name = 'PermissionError';
    this.request = requestObject;
  }
}
