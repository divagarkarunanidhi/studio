
export type SecurityRuleContext = {
    path: string;
    operation: 'get' | 'list' | 'create' | 'update' | 'delete' | 'write';
    requestResourceData?: any;
};
  
const BASE_MESSAGE = "FirestoreError: Missing or insufficient permissions: The following request was denied by Firestore Security Rules:";
  
export class FirestorePermissionError extends Error {
    public readonly context: SecurityRuleContext;

    constructor(context: SecurityRuleContext) {
        const fullMessage = `
${BASE_MESSAGE}
${JSON.stringify(context, null, 2)}
`;
        super(fullMessage);
        this.name = 'FirestorePermissionError';
        this.context = context;

        // This is to make the error work correctly in ES5 environments
        Object.setPrototypeOf(this, FirestorePermissionError.prototype);
    }
}
