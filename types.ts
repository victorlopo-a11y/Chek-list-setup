
export interface ChecklistItem {
  id: number;
  activity: string;
  quantity: string;
  status: 'OK' | 'N/A' | '';
  notes: string;
}

export interface FormData {
  date: string;
  line: string;
  startTime: string;
  endTime: string;
  currentProduct: string;
  setupProduct: string;
  actingArea: string;
  lineLeader: string;
  responsible: string;
  monitor: string;
}

export interface SignatureData {
  leaderSignature?: string;
  monitorSignature?: string;
}

export type SignatureRole = 'leader' | 'monitor';

export interface SignatureRequestStatus {
  token?: string;
  signedAt?: string | null;
  signerName?: string;
}

export interface SignatureRequests {
  leader?: SignatureRequestStatus;
  monitor?: SignatureRequestStatus;
}

export interface ChecklistRecord {
  id: string;
  user_id: string;
  form_data: FormData;
  checklist_items: ChecklistItem[];
  signatures?: SignatureData;
  signature_requests?: SignatureRequests;
  leader_signature?: string | null;
  monitor_signature?: string | null;
  leader_signed_at?: string | null;
  monitor_signed_at?: string | null;
  created_at: string;
}

export interface User {
  id: string;
  name: string;
  username: string;
  password?: string;
}
