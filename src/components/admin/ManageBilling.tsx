import { useState, useEffect } from "react";
import { 
  Plus, Search, Eye, Receipt, CreditCard, Banknote, 
  IndianRupee, Calendar, User, FileText, Printer, 
  CheckCircle, Clock, XCircle, Filter
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

interface Invoice {
  id: string;
  invoice_number: string;
  patient_id: string;
  total_amount: number;
  discount_amount: number;
  tax_amount: number;
  final_amount: number;
  paid_amount: number;
  payment_status: string;
  payment_method: string | null;
  notes: string | null;
  created_at: string;
  paid_at: string | null;
  patient?: {
    full_name: string;
    patient_id: string;
    phone: string;
  };
}

interface Patient {
  id: string;
  patient_id: string;
  full_name: string;
  phone: string;
}

interface PatientTest {
  id: string;
  test_name: string;
  test_date: string;
  status: string;
  test_id: string | null;
  test?: {
    price: number | null;
  };
}

const ManageBilling = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "partial" | "paid">("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  
  // Create invoice state
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [patientTests, setPatientTests] = useState<PatientTest[]>([]);
  const [selectedTestIds, setSelectedTestIds] = useState<Set<string>>(new Set());
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Payment state
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [transactionId, setTransactionId] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  const fetchInvoices = async () => {
    try {
      const { data, error } = await supabase
        .from("invoices")
        .select(`
          *,
          patient:patients(full_name, patient_id, phone)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setInvoices((data || []) as Invoice[]);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      toast.error("Failed to fetch invoices");
    } finally {
      setLoading(false);
    }
  };

  const fetchPatients = async () => {
    try {
      const { data, error } = await supabase
        .from("patients")
        .select("id, patient_id, full_name, phone")
        .eq("is_active", true)
        .order("full_name");

      if (error) throw error;
      setPatients(data || []);
    } catch (error) {
      console.error("Error fetching patients:", error);
    }
  };

  const fetchPatientTests = async (patientId: string) => {
    try {
      const { data, error } = await supabase
        .from("patient_tests")
        .select(`
          id, test_name, test_date, status, test_id,
          test:tests(price)
        `)
        .eq("patient_id", patientId)
        .order("test_date", { ascending: false });

      if (error) throw error;
      setPatientTests((data || []) as PatientTest[]);
    } catch (error) {
      console.error("Error fetching patient tests:", error);
    }
  };

  useEffect(() => {
    fetchInvoices();
    fetchPatients();
  }, []);

  useEffect(() => {
    if (selectedPatientId) {
      fetchPatientTests(selectedPatientId);
      setSelectedTestIds(new Set());
    }
  }, [selectedPatientId]);

  const generateInvoiceNumber = () => {
    const year = new Date().getFullYear().toString().slice(-2);
    const random = Math.floor(10000 + Math.random() * 90000);
    return `INV${year}${random}`;
  };

  const calculateTotal = () => {
    const selectedTests = patientTests.filter(t => selectedTestIds.has(t.id));
    const total = selectedTests.reduce((sum, t) => sum + (t.test?.price || 0), 0);
    return total;
  };

  const handleCreateInvoice = async () => {
    if (!selectedPatientId || selectedTestIds.size === 0) {
      toast.error("Please select a patient and at least one test");
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const totalAmount = calculateTotal();
      const finalAmount = totalAmount - discount;
      const invoiceNumber = generateInvoiceNumber();

      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .insert({
          invoice_number: invoiceNumber,
          patient_id: selectedPatientId,
          total_amount: totalAmount,
          discount_amount: discount,
          final_amount: finalAmount,
          notes,
          created_by: userData.user?.id,
        })
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      // Create invoice items
      const selectedTests = patientTests.filter(t => selectedTestIds.has(t.id));
      const invoiceItems = selectedTests.map(t => ({
        invoice_id: invoice.id,
        patient_test_id: t.id,
        test_name: t.test_name,
        unit_price: t.test?.price || 0,
        amount: t.test?.price || 0,
      }));

      const { error: itemsError } = await supabase
        .from("invoice_items")
        .insert(invoiceItems);

      if (itemsError) throw itemsError;

      toast.success(`Invoice ${invoiceNumber} created successfully`);
      setIsCreateDialogOpen(false);
      resetCreateForm();
      fetchInvoices();
    } catch (error: any) {
      console.error("Error creating invoice:", error);
      toast.error(error.message || "Failed to create invoice");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecordPayment = async () => {
    if (!selectedInvoice || paymentAmount <= 0) {
      toast.error("Please enter a valid payment amount");
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      
      // Record payment
      const { error: paymentError } = await supabase
        .from("payments")
        .insert({
          invoice_id: selectedInvoice.id,
          amount: paymentAmount,
          payment_method: paymentMethod,
          transaction_id: transactionId || null,
          notes: paymentNotes || null,
          received_by: userData.user?.id,
        });

      if (paymentError) throw paymentError;

      // Update invoice
      const newPaidAmount = selectedInvoice.paid_amount + paymentAmount;
      const newStatus = newPaidAmount >= selectedInvoice.final_amount ? "paid" : "partial";
      
      const { error: updateError } = await supabase
        .from("invoices")
        .update({
          paid_amount: newPaidAmount,
          payment_status: newStatus,
          payment_method: paymentMethod,
          paid_at: newStatus === "paid" ? new Date().toISOString() : null,
        })
        .eq("id", selectedInvoice.id);

      if (updateError) throw updateError;

      toast.success("Payment recorded successfully");
      setIsPaymentDialogOpen(false);
      resetPaymentForm();
      fetchInvoices();
    } catch (error: any) {
      console.error("Error recording payment:", error);
      toast.error(error.message || "Failed to record payment");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetCreateForm = () => {
    setSelectedPatientId("");
    setPatientTests([]);
    setSelectedTestIds(new Set());
    setDiscount(0);
    setNotes("");
  };

  const resetPaymentForm = () => {
    setPaymentAmount(0);
    setPaymentMethod("cash");
    setTransactionId("");
    setPaymentNotes("");
    setSelectedInvoice(null);
  };

  const openPaymentDialog = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setPaymentAmount(invoice.final_amount - invoice.paid_amount);
    setIsPaymentDialogOpen(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100"><CheckCircle className="h-3 w-3 mr-1" />Paid</Badge>;
      case "partial":
        return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100"><Clock className="h-3 w-3 mr-1" />Partial</Badge>;
      case "pending":
        return <Badge className="bg-red-100 text-red-700 hover:bg-red-100"><XCircle className="h-3 w-3 mr-1" />Pending</Badge>;
      case "cancelled":
        return <Badge variant="secondary">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const filteredInvoices = invoices.filter((invoice) => {
    const matchesSearch = 
      invoice.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
      invoice.patient?.full_name.toLowerCase().includes(search.toLowerCase()) ||
      invoice.patient?.patient_id.toLowerCase().includes(search.toLowerCase());
    
    const matchesStatus = 
      filterStatus === "all" || invoice.payment_status === filterStatus;

    return matchesSearch && matchesStatus;
  });

  // Stats
  const totalRevenue = invoices.reduce((sum, inv) => sum + inv.paid_amount, 0);
  const pendingAmount = invoices.reduce((sum, inv) => sum + (inv.final_amount - inv.paid_amount), 0);
  const todayRevenue = invoices
    .filter(inv => format(new Date(inv.created_at), "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd"))
    .reduce((sum, inv) => sum + inv.paid_amount, 0);

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100">
                <IndianRupee className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">₹{totalRevenue.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Total Revenue</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <IndianRupee className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">₹{todayRevenue.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Today's Revenue</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100">
                <Clock className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">₹{pendingAmount.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Pending Amount</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-violet-100">
                <Receipt className="h-4 w-4 text-violet-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{invoices.length}</p>
                <p className="text-xs text-muted-foreground">Total Invoices</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Header with search and filters */}
      <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center">
        <div className="flex flex-col sm:flex-row gap-4 flex-1">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search invoices..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 w-full sm:w-80"
            />
          </div>
          <Tabs value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)} className="w-auto">
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="partial">Partial</TabsTrigger>
              <TabsTrigger value="paid">Paid</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <Button onClick={() => setIsCreateDialogOpen(true)} className="bg-clinical-navy hover:bg-clinical-navy/90">
          <Plus className="h-4 w-4 mr-2" />
          Create Invoice
        </Button>
      </div>

      {/* Invoices Table */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Invoice #</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">Loading...</TableCell>
                </TableRow>
              ) : filteredInvoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No invoices found
                  </TableCell>
                </TableRow>
              ) : (
                filteredInvoices.map((invoice) => (
                  <TableRow key={invoice.id} className="hover:bg-muted/30">
                    <TableCell className="font-mono font-medium">{invoice.invoice_number}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{invoice.patient?.full_name}</p>
                        <p className="text-xs text-muted-foreground">{invoice.patient?.patient_id}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">₹{invoice.final_amount.toLocaleString()}</TableCell>
                    <TableCell className="text-right">₹{invoice.paid_amount.toLocaleString()}</TableCell>
                    <TableCell className="text-center">{getStatusBadge(invoice.payment_status)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(invoice.created_at), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {invoice.payment_status !== "paid" && (
                          <Button 
                            size="sm" 
                            onClick={() => openPaymentDialog(invoice)}
                            className="gap-1"
                          >
                            <CreditCard className="h-3.5 w-3.5" />
                            Pay
                          </Button>
                        )}
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            setSelectedInvoice(invoice);
                            setIsDetailsOpen(true);
                          }}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Invoice Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Create New Invoice
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 flex-1 overflow-y-auto">
            <div className="space-y-2">
              <Label>Select Patient</Label>
              <Select value={selectedPatientId} onValueChange={setSelectedPatientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a patient" />
                </SelectTrigger>
                <SelectContent>
                  {patients.map((patient) => (
                    <SelectItem key={patient.id} value={patient.id}>
                      {patient.full_name} ({patient.patient_id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedPatientId && (
              <div className="space-y-2">
                <Label>Select Tests to Invoice</Label>
                <div className="border rounded-lg max-h-48 overflow-y-auto">
                  {patientTests.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-4 text-center">No tests found for this patient</p>
                  ) : (
                    patientTests.map((test) => (
                      <div 
                        key={test.id} 
                        className="flex items-center gap-3 p-3 border-b last:border-b-0 hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={selectedTestIds.has(test.id)}
                          onCheckedChange={(checked) => {
                            const newSet = new Set(selectedTestIds);
                            if (checked) {
                              newSet.add(test.id);
                            } else {
                              newSet.delete(test.id);
                            }
                            setSelectedTestIds(newSet);
                          }}
                        />
                        <div className="flex-1">
                          <p className="font-medium">{test.test_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(test.test_date), "dd MMM yyyy")}
                          </p>
                        </div>
                        <p className="font-medium">₹{test.test?.price?.toLocaleString() || 0}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Subtotal</Label>
                <Input value={`₹${calculateTotal().toLocaleString()}`} disabled />
              </div>
              <div className="space-y-2">
                <Label>Discount</Label>
                <Input 
                  type="number" 
                  value={discount} 
                  onChange={(e) => setDiscount(Number(e.target.value))}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="p-4 bg-muted rounded-lg">
              <div className="flex justify-between items-center">
                <span className="font-semibold">Total Amount</span>
                <span className="text-2xl font-bold">₹{(calculateTotal() - discount).toLocaleString()}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea 
                value={notes} 
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional notes..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateInvoice} 
              disabled={isSubmitting || selectedTestIds.size === 0}
            >
              {isSubmitting ? "Creating..." : "Create Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Payment Dialog */}
      <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Record Payment
            </DialogTitle>
          </DialogHeader>
          
          {selectedInvoice && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Invoice #{selectedInvoice.invoice_number}</p>
                <p className="font-medium">{selectedInvoice.patient?.full_name}</p>
                <div className="flex justify-between mt-2">
                  <span>Outstanding:</span>
                  <span className="font-bold">
                    ₹{(selectedInvoice.final_amount - selectedInvoice.paid_amount).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Payment Amount</Label>
                <Input 
                  type="number" 
                  value={paymentAmount} 
                  onChange={(e) => setPaymentAmount(Number(e.target.value))}
                />
              </div>

              <div className="space-y-2">
                <Label>Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">
                      <div className="flex items-center gap-2">
                        <Banknote className="h-4 w-4" /> Cash
                      </div>
                    </SelectItem>
                    <SelectItem value="upi">
                      <div className="flex items-center gap-2">
                        <IndianRupee className="h-4 w-4" /> UPI
                      </div>
                    </SelectItem>
                    <SelectItem value="card">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4" /> Card
                      </div>
                    </SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {paymentMethod !== "cash" && (
                <div className="space-y-2">
                  <Label>Transaction ID</Label>
                  <Input 
                    value={transactionId} 
                    onChange={(e) => setTransactionId(e.target.value)}
                    placeholder="Enter transaction reference"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Textarea 
                  value={paymentNotes} 
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="Any payment notes..."
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPaymentDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRecordPayment} disabled={isSubmitting}>
              {isSubmitting ? "Recording..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice Details Sheet */}
      <Sheet open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <SheetContent className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Invoice Details
            </SheetTitle>
          </SheetHeader>
          
          {selectedInvoice && (
            <div className="mt-6 space-y-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-2xl font-mono font-bold">{selectedInvoice.invoice_number}</p>
                  <p className="text-sm text-muted-foreground">
                    Created {format(new Date(selectedInvoice.created_at), "dd MMM yyyy, HH:mm")}
                  </p>
                </div>
                {getStatusBadge(selectedInvoice.payment_status)}
              </div>

              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <p className="text-sm text-muted-foreground">Patient</p>
                <p className="font-medium text-lg">{selectedInvoice.patient?.full_name}</p>
                <p className="text-sm">{selectedInvoice.patient?.patient_id} • {selectedInvoice.patient?.phone}</p>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>₹{selectedInvoice.total_amount.toLocaleString()}</span>
                </div>
                {selectedInvoice.discount_amount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount</span>
                    <span>-₹{selectedInvoice.discount_amount.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-lg border-t pt-2">
                  <span>Total</span>
                  <span>₹{selectedInvoice.final_amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-emerald-600">
                  <span>Paid</span>
                  <span>₹{selectedInvoice.paid_amount.toLocaleString()}</span>
                </div>
                {selectedInvoice.final_amount - selectedInvoice.paid_amount > 0 && (
                  <div className="flex justify-between text-amber-600 font-medium">
                    <span>Outstanding</span>
                    <span>₹{(selectedInvoice.final_amount - selectedInvoice.paid_amount).toLocaleString()}</span>
                  </div>
                )}
              </div>

              {selectedInvoice.notes && (
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm">{selectedInvoice.notes}</p>
                </div>
              )}

              <div className="flex gap-2 pt-4 border-t">
                {selectedInvoice.payment_status !== "paid" && (
                  <Button 
                    className="flex-1"
                    onClick={() => {
                      setIsDetailsOpen(false);
                      openPaymentDialog(selectedInvoice);
                    }}
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    Record Payment
                  </Button>
                )}
                <Button variant="outline" className="flex-1">
                  <Printer className="h-4 w-4 mr-2" />
                  Print Invoice
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default ManageBilling;
