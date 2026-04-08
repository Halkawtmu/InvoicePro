export interface Client {
  id: string;
  name: string;
  email: string;
  address?: string;
  ownerId: string;
  createdAt: any;
}

export interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  date: string;
  dueDate?: string;
  items: InvoiceItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  status: 'pending' | 'paid' | 'overdue';
  ownerId: string;
  createdAt: any;
}

export interface BusinessDetails {
  name: string;
  email: string;
  address: string;
  phone?: string;
}
