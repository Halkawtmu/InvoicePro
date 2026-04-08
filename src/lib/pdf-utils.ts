import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { format } from 'date-fns';
import { Invoice, BusinessDetails, Client } from '../types';

// Extend jsPDF with autotable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

export const generateInvoicePDF = (
  invoice: Invoice,
  businessDetails: BusinessDetails,
  client: Client | { name: string; email: string; address?: string }
) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header - Business Details
  doc.setFontSize(20);
  doc.setTextColor(40);
  doc.text(businessDetails.name, 20, 20);
  
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(businessDetails.address, 20, 30);
  doc.text(businessDetails.email, 20, 35);
  if (businessDetails.phone) doc.text(businessDetails.phone, 20, 40);

  // Invoice Info
  doc.setFontSize(24);
  doc.setTextColor(0);
  doc.text('INVOICE', pageWidth - 20, 25, { align: 'right' });
  
  doc.setFontSize(10);
  doc.text(`Invoice #: ${invoice.invoiceNumber}`, pageWidth - 20, 35, { align: 'right' });
  doc.text(`Date: ${format(new Date(invoice.date), 'MMM dd, yyyy')}`, pageWidth - 20, 40, { align: 'right' });
  if (invoice.dueDate) {
    doc.text(`Due Date: ${format(new Date(invoice.dueDate), 'MMM dd, yyyy')}`, pageWidth - 20, 45, { align: 'right' });
  }

  // Bill To
  doc.setFontSize(12);
  doc.setTextColor(40);
  doc.text('BILL TO:', 20, 60);
  doc.setFontSize(10);
  doc.text(client.name, 20, 67);
  doc.text(client.email, 20, 72);
  if (client.address) {
    doc.text(client.address, 20, 77);
  }

  // Table
  const tableData = invoice.items.map(item => [
    item.description,
    item.quantity.toString(),
    `$${item.unitPrice.toFixed(2)}`,
    `$${(item.quantity * item.unitPrice).toFixed(2)}`
  ]);

  doc.autoTable({
    startY: 90,
    head: [['Description', 'Qty', 'Unit Price', 'Total']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [51, 51, 51] },
    margin: { left: 20, right: 20 }
  });

  // Totals
  const finalY = (doc as any).lastAutoTable.finalY + 10;
  doc.setFontSize(10);
  doc.text('Subtotal:', pageWidth - 60, finalY);
  doc.text(`$${invoice.subtotal.toFixed(2)}`, pageWidth - 20, finalY, { align: 'right' });
  
  doc.text(`Tax (${invoice.taxRate}%):`, pageWidth - 60, finalY + 7);
  doc.text(`$${invoice.taxAmount.toFixed(2)}`, pageWidth - 20, finalY + 7, { align: 'right' });
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Total:', pageWidth - 60, finalY + 15);
  doc.text(`$${invoice.total.toFixed(2)}`, pageWidth - 20, finalY + 15, { align: 'right' });

  // Status Badge
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const statusColor = invoice.status === 'paid' ? [0, 128, 0] : invoice.status === 'overdue' ? [255, 0, 0] : [255, 165, 0];
  doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
  doc.text(`Status: ${invoice.status.toUpperCase()}`, 20, finalY + 15);

  return doc;
};
