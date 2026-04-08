import { useState, useEffect, useMemo, useRef, ChangeEvent } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  deleteDoc, 
  serverTimestamp,
  orderBy,
  writeBatch
} from 'firebase/firestore';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User 
} from 'firebase/auth';
import { format } from 'date-fns';
import { 
  Plus, 
  Search, 
  FileText, 
  Users, 
  Download, 
  Send, 
  Trash2, 
  LogOut, 
  Filter,
  ChevronRight,
  User as UserIcon,
  Mail,
  MapPin,
  Calendar as CalendarIcon,
  DollarSign,
  CheckCircle2,
  Clock,
  AlertCircle,
  LayoutDashboard,
  Globe,
  Upload,
  Pencil,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { db, auth, OperationType, handleFirestoreError } from './lib/firebase';
import { Client, Invoice, BusinessDetails, InvoiceItem } from './types';
import { generateInvoicePDF } from './lib/pdf-utils';
import { translations, Language } from './lib/i18n';
import { exportToCSV, parseCSV } from './lib/csv-utils';

import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from './components/ui/card';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Badge } from './components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from './components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';

const DEFAULT_BUSINESS_DETAILS: BusinessDetails = {
  name: 'My Business Name',
  email: 'business@example.com',
  address: '123 Business St, City, Country',
  phone: '+1 234 567 890'
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [language, setLanguage] = useState<Language>('en');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const t = translations[language];
  const isRTL = language === 'ar' || language === 'ku';
  
  // Search and Filter
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // New/Edit Invoice State
  const [isInvoiceDialogOpen, setIsInvoiceDialogOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [invoiceForm, setInvoiceForm] = useState<Partial<Invoice>>({
    items: [{ description: '', quantity: 1, unitPrice: 0 }],
    taxRate: 0,
    status: 'pending',
    date: format(new Date(), 'yyyy-MM-dd')
  });

  // New/Edit Client State
  const [isClientDialogOpen, setIsClientDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientForm, setClientForm] = useState<Partial<Client>>({
    name: '',
    email: '',
    address: ''
  });

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Data Listeners
  useEffect(() => {
    if (!user) return;

    const clientsQuery = query(
      collection(db, 'clients'), 
      where('ownerId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubscribeClients = onSnapshot(clientsQuery, (snapshot) => {
      setClients(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'clients'));

    const invoicesQuery = query(
      collection(db, 'invoices'), 
      where('ownerId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubscribeInvoices = onSnapshot(invoicesQuery, (snapshot) => {
      setInvoices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'invoices'));

    return () => {
      unsubscribeClients();
      unsubscribeInvoices();
    };
  }, [user]);

  // Calculations
  const calculateTotals = (items: InvoiceItem[], taxRate: number) => {
    const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    const taxAmount = (subtotal * taxRate) / 100;
    const total = subtotal + taxAmount;
    return { subtotal, taxAmount, total };
  };

  // Actions
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      toast.error('Login failed');
    }
  };

  const handleLogout = () => signOut(auth);

  const handleUpsertClient = async () => {
    if (!user || !clientForm.name || !clientForm.email) return;
    try {
      if (editingClient) {
        await updateDoc(doc(db, 'clients', editingClient.id), {
          ...clientForm,
          updatedAt: serverTimestamp()
        });
        toast.success(t.successUpdate);
      } else {
        await addDoc(collection(db, 'clients'), {
          ...clientForm,
          ownerId: user.uid,
          createdAt: serverTimestamp()
        });
        toast.success(t.successAdd);
      }
      setIsClientDialogOpen(false);
      setEditingClient(null);
      setClientForm({ name: '', email: '', address: '' });
    } catch (error) {
      handleFirestoreError(error, editingClient ? OperationType.UPDATE : OperationType.CREATE, 'clients');
    }
  };

  const handleUpsertInvoice = async () => {
    if (!user || !invoiceForm.clientId || !invoiceForm.items?.length) return;
    
    const client = clients.find(c => c.id === invoiceForm.clientId);
    const { subtotal, taxAmount, total } = calculateTotals(invoiceForm.items as InvoiceItem[], invoiceForm.taxRate || 0);
    
    try {
      if (editingInvoice) {
        await updateDoc(doc(db, 'invoices', editingInvoice.id), {
          ...invoiceForm,
          clientName: client?.name,
          subtotal,
          taxAmount,
          total,
          updatedAt: serverTimestamp()
        });
        toast.success(t.successUpdate);
      } else {
        await addDoc(collection(db, 'invoices'), {
          ...invoiceForm,
          clientName: client?.name,
          subtotal,
          taxAmount,
          total,
          ownerId: user.uid,
          createdAt: serverTimestamp(),
          invoiceNumber: `INV-${Date.now().toString().slice(-6)}`
        });
        toast.success(t.successAdd);
      }
      setIsInvoiceDialogOpen(false);
      setEditingInvoice(null);
      setInvoiceForm({
        items: [{ description: '', quantity: 1, unitPrice: 0 }],
        taxRate: 0,
        status: 'pending',
        date: format(new Date(), 'yyyy-MM-dd')
      });
    } catch (error) {
      handleFirestoreError(error, editingInvoice ? OperationType.UPDATE : OperationType.CREATE, 'invoices');
    }
  };

  const handleBulkExport = () => {
    const exportData = invoices.map(inv => ({
      Number: inv.invoiceNumber,
      Client: inv.clientName,
      Date: inv.date,
      Total: inv.total,
      Status: inv.status
    }));
    exportToCSV(exportData, `invoices_export_${format(new Date(), 'yyyy-MM-dd')}`);
    toast.success(t.successExport);
  };

  const handleBulkUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const data = parseCSV(text);
      
      if (data.length === 0) {
        toast.error(t.errorImport);
        return;
      }

      try {
        const batch = writeBatch(db);
        data.forEach(item => {
          const newDocRef = doc(collection(db, 'clients'));
          batch.set(newDocRef, {
            name: item.Name || item.name,
            email: item.Email || item.email,
            address: item.Address || item.address || '',
            ownerId: user.uid,
            createdAt: serverTimestamp()
          });
        });
        await batch.commit();
        toast.success(t.successImport);
      } catch (error) {
        toast.error(t.errorImport);
      }
    };
    reader.readAsText(file);
  };

  const dashboardStats = useMemo(() => {
    const totalRevenue = invoices.filter(inv => inv.status === 'paid').reduce((sum, inv) => sum + inv.total, 0);
    const pendingAmount = invoices.filter(inv => inv.status === 'pending').reduce((sum, inv) => sum + inv.total, 0);
    const overdueAmount = invoices.filter(inv => inv.status === 'overdue').reduce((sum, inv) => sum + inv.total, 0);
    const activeClientsCount = clients.length;
    
    return { totalRevenue, pendingAmount, overdueAmount, activeClientsCount };
  }, [invoices, clients]);

  const handleUpdateStatus = async (invoiceId: string, status: Invoice['status']) => {
    try {
      await updateDoc(doc(db, 'invoices', invoiceId), { status });
      toast.success(`Invoice marked as ${status}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `invoices/${invoiceId}`);
    }
  };

  const handleDeleteInvoice = async (invoiceId: string) => {
    if (!confirm('Are you sure you want to delete this invoice?')) return;
    try {
      await deleteDoc(doc(db, 'invoices', invoiceId));
      toast.success('Invoice deleted');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `invoices/${invoiceId}`);
    }
  };

  const handleExportPDF = (invoice: Invoice) => {
    const client = clients.find(c => c.id === invoice.clientId) || { name: invoice.clientName, email: 'N/A' };
    const doc = generateInvoicePDF(invoice, DEFAULT_BUSINESS_DETAILS, client);
    doc.save(`${invoice.invoiceNumber}.pdf`);
    toast.success('PDF exported');
  };

  const handleSendInvoice = (invoice: Invoice) => {
    const client = clients.find(c => c.id === invoice.clientId);
    if (!client) return;
    
    // In a real app, this would trigger a backend function to email the PDF
    // For this demo, we'll simulate it
    toast.promise(
      new Promise((resolve) => setTimeout(resolve, 1500)),
      {
        loading: 'Sending invoice to client...',
        success: `Invoice sent to ${client.email}`,
        error: 'Failed to send invoice'
      }
    );
  };

  // Filtered Lists
  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      const matchesSearch = inv.clientName.toLowerCase().includes(invoiceSearch.toLowerCase()) || 
                           inv.invoiceNumber.toLowerCase().includes(invoiceSearch.toLowerCase());
      const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [invoices, invoiceSearch, statusFilter]);

  const filteredClients = useMemo(() => {
    return clients.filter(c => 
      c.name.toLowerCase().includes(clientSearch.toLowerCase()) || 
      c.email.toLowerCase().includes(clientSearch.toLowerCase())
    );
  }, [clients, clientSearch]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div className={`flex flex-col items-center justify-center min-h-screen bg-slate-50 p-4 ${isRTL ? 'rtl' : 'ltr'}`} dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="absolute top-4 right-4">
          <Select value={language} onValueChange={(val) => setLanguage(val as Language)}>
            <SelectTrigger className="w-[120px]">
              <Globe className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="ar">العربية</SelectItem>
              <SelectItem value="ku">کوردی</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full"
        >
          <Card className="border-none shadow-xl bg-white/80 backdrop-blur">
            <CardHeader className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center">
                <FileText className="w-8 h-8 text-primary" />
              </div>
              <div>
                <CardTitle className="text-3xl font-bold tracking-tight">{t.loginTitle}</CardTitle>
                <CardDescription className="text-lg">{t.loginDesc}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={handleLogin} className="w-full h-12 text-lg font-medium" size="lg">
                {t.signInGoogle}
              </Button>
              <p className="text-sm text-center text-muted-foreground">
                {t.secureManage}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-slate-50/50 ${isRTL ? 'rtl' : 'ltr'}`} dir={isRTL ? 'rtl' : 'ltr'}>
      <header className="sticky top-0 z-40 w-full border-b bg-white/80 backdrop-blur">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">{t.appName}</span>
          </div>
          
          <div className="flex items-center gap-4">
            <Select value={language} onValueChange={(val) => setLanguage(val as Language)}>
              <SelectTrigger className="w-[120px] h-8">
                <Globe className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="ar">العربية</SelectItem>
                <SelectItem value="ku">کوردی</SelectItem>
              </SelectContent>
            </Select>

            <div className="hidden md:flex flex-col items-end">
              <span className="text-sm font-medium">{user.displayName}</span>
              <span className="text-xs text-muted-foreground">{user.email}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout} className="rounded-full">
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <TabsList className="grid grid-cols-3 w-full md:w-[500px]">
              <TabsTrigger value="dashboard" className="flex items-center gap-2">
                <LayoutDashboard className="w-4 h-4" /> {t.dashboard}
              </TabsTrigger>
              <TabsTrigger value="invoices" className="flex items-center gap-2">
                <FileText className="w-4 h-4" /> {t.invoices}
              </TabsTrigger>
              <TabsTrigger value="clients" className="flex items-center gap-2">
                <Users className="w-4 h-4" /> {t.clients}
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2">
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept=".csv" 
                onChange={handleBulkUpload}
              />
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="hidden md:flex gap-2">
                <Upload className="w-4 h-4" /> {t.bulkUpload}
              </Button>
              <Button variant="outline" size="sm" onClick={handleBulkExport} className="hidden md:flex gap-2">
                <Download className="w-4 h-4" /> {t.bulkDownload}
              </Button>
              
              {activeTab === 'invoices' && (
                <Dialog open={isInvoiceDialogOpen} onOpenChange={setIsInvoiceDialogOpen}>
                  <DialogTrigger render={<Button className="flex items-center gap-2" />}>
                    <Plus className="w-4 h-4" /> {t.newInvoice}
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>{editingInvoice ? t.editInvoice : t.newInvoice}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-6 py-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>{t.client}</Label>
                          <Select 
                            onValueChange={(val) => setInvoiceForm({ ...invoiceForm, clientId: val })}
                            value={invoiceForm.clientId}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={t.client} />
                            </SelectTrigger>
                            <SelectContent>
                              {clients.map(c => (
                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>{t.date}</Label>
                          <Input 
                            type="date" 
                            value={invoiceForm.date}
                            onChange={(e) => setInvoiceForm({ ...invoiceForm, date: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <Label className="text-lg font-semibold">{t.lineItems}</Label>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setInvoiceForm({
                              ...invoiceForm,
                              items: [...(invoiceForm.items || []), { description: '', quantity: 1, unitPrice: 0 }]
                            })}
                          >
                            {t.addItem}
                          </Button>
                        </div>
                        {invoiceForm.items?.map((item, idx) => (
                          <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                            <div className="col-span-6 space-y-1">
                              <Label className="text-xs">{t.description}</Label>
                              <Input 
                                placeholder={t.description}
                                value={item.description}
                                onChange={(e) => {
                                  const items = [...(invoiceForm.items || [])];
                                  items[idx].description = e.target.value;
                                  setInvoiceForm({ ...invoiceForm, items });
                                }}
                              />
                            </div>
                            <div className="col-span-2 space-y-1">
                              <Label className="text-xs">{t.qty}</Label>
                              <Input 
                                type="number"
                                value={item.quantity}
                                onChange={(e) => {
                                  const items = [...(invoiceForm.items || [])];
                                  items[idx].quantity = Number(e.target.value);
                                  setInvoiceForm({ ...invoiceForm, items });
                                }}
                              />
                            </div>
                            <div className="col-span-3 space-y-1">
                              <Label className="text-xs">{t.price}</Label>
                              <Input 
                                type="number"
                                value={item.unitPrice}
                                onChange={(e) => {
                                  const items = [...(invoiceForm.items || [])];
                                  items[idx].unitPrice = Number(e.target.value);
                                  setInvoiceForm({ ...invoiceForm, items });
                                }}
                              />
                            </div>
                            <div className="col-span-1">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="text-destructive"
                                onClick={() => {
                                  const items = [...(invoiceForm.items || [])];
                                  items.splice(idx, 1);
                                  setInvoiceForm({ ...invoiceForm, items });
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                        <div className="space-y-2">
                          <Label>{t.taxRate}</Label>
                          <Input 
                            type="number"
                            value={invoiceForm.taxRate}
                            onChange={(e) => setInvoiceForm({ ...invoiceForm, taxRate: Number(e.target.value) })}
                          />
                        </div>
                        <div className="flex flex-col items-end justify-center space-y-1">
                          <span className="text-sm text-muted-foreground">{t.totalAmount}</span>
                          <span className="text-2xl font-bold">
                            ${calculateTotals(invoiceForm.items as InvoiceItem[] || [], invoiceForm.taxRate || 0).total.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => {
                        setIsInvoiceDialogOpen(false);
                        setEditingInvoice(null);
                      }}>{t.cancel}</Button>
                      <Button onClick={handleUpsertInvoice}>{editingInvoice ? t.save : t.createInvoice}</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}

              {activeTab === 'clients' && (
                <Dialog open={isClientDialogOpen} onOpenChange={setIsClientDialogOpen}>
                  <DialogTrigger render={<Button className="flex items-center gap-2" />}>
                    <Plus className="w-4 h-4" /> {t.newClient}
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{editingClient ? t.editClient : t.newClient}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>{t.client}</Label>
                        <Input 
                          placeholder={t.client}
                          value={clientForm.name}
                          onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t.email}</Label>
                        <Input 
                          type="email"
                          placeholder="client@example.com"
                          value={clientForm.email}
                          onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t.address}</Label>
                        <Input 
                          placeholder={t.address}
                          value={clientForm.address}
                          onChange={(e) => setClientForm({ ...clientForm, address: e.target.value })}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => {
                        setIsClientDialogOpen(false);
                        setEditingClient(null);
                      }}>{t.cancel}</Button>
                      <Button onClick={handleUpsertClient}>{editingClient ? t.save : t.add}</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>

          <TabsContent value="dashboard" className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="border-none shadow-sm bg-white">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{t.totalRevenue}</CardTitle>
                  <div className="p-2 bg-emerald-50 rounded-lg">
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">${dashboardStats.totalRevenue.toFixed(2)}</div>
                  <p className="text-xs text-emerald-600 flex items-center gap-1 mt-1">
                    <ArrowUpRight className="w-3 h-3" /> +12.5% from last month
                  </p>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm bg-white">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{t.pendingInvoices}</CardTitle>
                  <div className="p-2 bg-amber-50 rounded-lg">
                    <Clock className="w-4 h-4 text-amber-600" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">${dashboardStats.pendingAmount.toFixed(2)}</div>
                  <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                    {invoices.filter(i => i.status === 'pending').length} active invoices
                  </p>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm bg-white">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{t.overdueInvoices}</CardTitle>
                  <div className="p-2 bg-rose-50 rounded-lg">
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">${dashboardStats.overdueAmount.toFixed(2)}</div>
                  <p className="text-xs text-rose-600 flex items-center gap-1 mt-1">
                    <ArrowDownRight className="w-3 h-3" /> Action required
                  </p>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm bg-white">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{t.activeClients}</CardTitle>
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Users className="w-4 h-4 text-blue-600" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{dashboardStats.activeClientsCount}</div>
                  <p className="text-xs text-blue-600 flex items-center gap-1 mt-1">
                    Growing your network
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <Card className="border-none shadow-sm">
                <CardHeader>
                  <CardTitle>{t.invoices}</CardTitle>
                  <CardDescription>Recent billing activity</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {invoices.slice(0, 5).map(inv => (
                      <div key={inv.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-full ${inv.status === 'paid' ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                            <FileText className={`w-4 h-4 ${inv.status === 'paid' ? 'text-emerald-600' : 'text-amber-600'}`} />
                          </div>
                          <div>
                            <p className="font-medium">{inv.clientName}</p>
                            <p className="text-xs text-muted-foreground">{inv.invoiceNumber} • {format(new Date(inv.date), 'MMM dd')}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold">${inv.total.toFixed(2)}</p>
                          <Badge variant="outline" className="text-[10px] h-4">{inv.status.toUpperCase()}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader>
                  <CardTitle>{t.clients}</CardTitle>
                  <CardDescription>Top performing clients</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {clients.slice(0, 5).map(client => {
                      const total = invoices.filter(i => i.clientId === client.id).reduce((s, i) => s + i.total, 0);
                      return (
                        <div key={client.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                              <UserIcon className="w-5 h-5 text-slate-600" />
                            </div>
                            <div>
                              <p className="font-medium">{client.name}</p>
                              <p className="text-xs text-muted-foreground">{client.email}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-bold">${total.toFixed(2)}</p>
                            <p className="text-[10px] text-muted-foreground uppercase">Lifetime Value</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="invoices" className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder={t.searchInvoices} 
                  className="pl-10"
                  value={invoiceSearch}
                  onChange={(e) => setInvoiceSearch(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-[180px]">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder={t.status} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t.allStatus}</SelectItem>
                  <SelectItem value="pending">{t.pending}</SelectItem>
                  <SelectItem value="paid">{t.paid}</SelectItem>
                  <SelectItem value="overdue">{t.overdue}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Card className="border-none shadow-sm overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="w-[120px]">{t.invoiceNumber}</TableHead>
                    <TableHead>{t.client}</TableHead>
                    <TableHead>{t.date}</TableHead>
                    <TableHead>{t.amount}</TableHead>
                    <TableHead>{t.status}</TableHead>
                    <TableHead className="text-right">{t.actions}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <AnimatePresence mode="popLayout">
                    {filteredInvoices.map((inv) => (
                      <TableRow key={inv.id} className="group">
                        <TableCell className="font-mono text-xs font-medium">{inv.invoiceNumber}</TableCell>
                        <TableCell className="font-medium">{inv.clientName}</TableCell>
                        <TableCell className="text-muted-foreground">{format(new Date(inv.date), 'MMM dd, yyyy')}</TableCell>
                        <TableCell className="font-semibold">${inv.total.toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge 
                            variant="secondary"
                            className={
                              inv.status === 'paid' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' :
                              inv.status === 'overdue' ? 'bg-rose-100 text-rose-700 hover:bg-rose-100' :
                              'bg-amber-100 text-amber-700 hover:bg-amber-100'
                            }
                          >
                            {t[inv.status as keyof typeof t].toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" onClick={() => {
                              setEditingInvoice(inv);
                              setInvoiceForm({ ...inv });
                              setIsInvoiceDialogOpen(true);
                            }} title={t.edit}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleExportPDF(inv)} title={t.exportPDF}>
                              <Download className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleSendInvoice(inv)} title={t.sendToClient}>
                              <Send className="w-4 h-4" />
                            </Button>
                            <Select onValueChange={(val) => handleUpdateStatus(inv.id, val as Invoice['status'])}>
                              <SelectTrigger className="w-[32px] h-[32px] p-0 border-none bg-transparent shadow-none">
                                <ChevronRight className="w-4 h-4" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">{t.pending}</SelectItem>
                                <SelectItem value="paid">{t.paid}</SelectItem>
                                <SelectItem value="overdue">{t.overdue}</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteInvoice(inv.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </AnimatePresence>
                  {filteredInvoices.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                        {t.noInvoices}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="clients" className="space-y-6">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder={t.searchClients} 
                className="pl-10"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredClients.map((client) => {
                const clientInvoices = invoices.filter(inv => inv.clientId === client.id);
                const totalBilled = clientInvoices.reduce((sum, inv) => sum + inv.total, 0);
                const pendingCount = clientInvoices.filter(inv => inv.status === 'pending').length;

                return (
                  <motion.div key={client.id} layout>
                    <Card className="group hover:shadow-md transition-shadow border-none shadow-sm">
                      <CardHeader className="pb-4">
                        <div className="flex items-start justify-between">
                          <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                            <UserIcon className="w-5 h-5 text-slate-600" />
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => {
                                setEditingClient(client);
                                setClientForm({ ...client });
                                setIsClientDialogOpen(true);
                              }}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="text-destructive"
                              onClick={async () => {
                                if (confirm(t.confirmDelete)) {
                                  try {
                                    await deleteDoc(doc(db, 'clients', client.id));
                                    toast.success(t.successDelete);
                                  } catch (error) {
                                    handleFirestoreError(error, OperationType.DELETE, `clients/${client.id}`);
                                  }
                                }
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                        <CardTitle className="mt-4">{client.name}</CardTitle>
                        <CardDescription className="flex items-center gap-1">
                          <Mail className="w-3 h-3" /> {client.email}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">{t.totalBilled}</span>
                            <p className="text-lg font-bold">${totalBilled.toFixed(2)}</p>
                          </div>
                          <div className="space-y-1">
                            <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">{t.pending}</span>
                            <p className="text-lg font-bold text-amber-600">{pendingCount}</p>
                          </div>
                        </div>
                        {client.address && (
                          <div className="flex items-start gap-2 text-sm text-muted-foreground">
                            <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
                            <span>{client.address}</span>
                          </div>
                        )}
                      </CardContent>
                      <CardFooter className="pt-0">
                        <Button 
                          variant="secondary" 
                          className="w-full" 
                          onClick={() => {
                            setInvoiceForm({ ...invoiceForm, clientId: client.id });
                            setIsInvoiceDialogOpen(true);
                          }}
                        >
                          {t.createInvoice}
                        </Button>
                      </CardFooter>
                    </Card>
                  </motion.div>
                );
              })}
              {filteredClients.length === 0 && (
                <div className="col-span-full py-12 text-center text-muted-foreground">
                  {t.noClients}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>
      <Toaster position="top-right" />
    </div>
  );
}
