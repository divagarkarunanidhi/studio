export type Defect = {
    [key: string]: string | number;
    id: number;
    summary: string;
    domain: string;
    status: string;
    reported_by: string;
    created_at: string;
    severity: string;
    priority: string;
  };
  