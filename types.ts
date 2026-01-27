
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

export interface User {
  id: string;
  name: string;
  username: string;
  password?: string;
}
