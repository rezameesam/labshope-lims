import { useState, useEffect, useCallback } from "react";
import { 
  Plus, Search, Eye, Receipt, CreditCard, Banknote, 
  IndianRupee, Calendar, User, FileText, Printer, 
  CheckCircle, Clock, XCircle, Filter, Download, Edit2, ChevronDown
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
import { useAuth } from "@/hooks/useAuth";

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
  lab_id?: string | null;
  collection_center_id?: string | null;
  patient?: {
    full_name: string;
    patient_id: string;
    phone: string;
  };
  labs?: {
    id: string;
    name: string;
    lab_code: string;
  } | null;
  collection_centers?: {
    id: string;
    name: string;
    code: string;
  } | null;
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
  } | null;
  invoice_status?: "not_invoiced" | "unpaid" | "paid";
  invoice_number?: string;
}

interface InvoiceItem {
  id: string;
  test_name: string;
  unit_price: number;
  quantity: number;
  amount: number;
}

interface Test {
  id: string;
  name: string;
  price: number | null;
}

interface TestPrice {
  testId: string;
  price: number;
}

const ManageBilling = () => {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "partial" | "paid">("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [editableItems, setEditableItems] = useState<InvoiceItem[]>([]);
  const [editableDiscount, setEditableDiscount] = useState(0);
  
  // Create invoice state
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [patientTests, setPatientTests] = useState<PatientTest[]>([]);
  const [selectedTestIds, setSelectedTestIds] = useState<Set<string>>(new Set());
  const [customPrices, setCustomPrices] = useState<Map<string, number>>(new Map());
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [patientSearchOpen, setPatientSearchOpen] = useState(false);
  const [patientSearchQuery, setPatientSearchQuery] = useState("");

  // Payment state
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [transactionId, setTransactionId] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  // Tests database for price lookup
  const [testsDb, setTestsDb] = useState<Test[]>([]);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);

  const fetchInvoices = async () => {
    try {
      // Try to fetch with lab/collection center joins, fallback to basic query if it fails
      let data, error;
      
      try {
        const result = await supabase
          .from("invoices")
          .select(`
            *,
            patient:patients(full_name, patient_id, phone),
            labs (
              id,
              name,
              lab_code
            ),
            collection_centers (
              id,
              name,
              code
            )
          `)
          .order("created_at", { ascending: false });
        
        data = result.data;
        error = result.error;
        
        // If join fails due to missing tables/columns, fallback to basic query
        if (error && (error.code === "PGRST116" || error.code === "42P01" || error.message?.includes("Could not find") || error.message?.includes("relation") || error.code === "400")) {
          const basicResult = await supabase
            .from("invoices")
            .select(`
              *,
              patient:patients(full_name, patient_id, phone)
            `)
            .order("created_at", { ascending: false });
          data = basicResult.data;
          error = basicResult.error;
        }
      } catch (err: any) {
        // If join fails, try basic query
        const basicResult = await supabase
          .from("invoices")
          .select(`
            *,
            patient:patients(full_name, patient_id, phone)
          `)
          .order("created_at", { ascending: false });
        data = basicResult.data;
        error = basicResult.error;
      }

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

  const fetchTestsDb = async () => {
    try {
      const { data, error } = await supabase
        .from("tests")
        .select("id, name, price");

      if (error) throw error;
      setTestsDb((data || []) as Test[]);
    } catch (error) {
      console.error("Error fetching tests:", error);
    }
  };

  // Filter patients based on search query
  const filteredPatients = patients.filter((patient) => {
    if (!patientSearchQuery) return true;
    const query = patientSearchQuery.toLowerCase();
    return (
      patient.full_name.toLowerCase().includes(query) ||
      patient.patient_id.toLowerCase().includes(query) ||
      patient.phone.includes(query)
    );
  });

  const selectedPatient = patients.find(p => p.id === selectedPatientId);

  const fetchInvoiceItems = async (invoiceId: string) => {
    try {
      const { data, error } = await supabase
        .from("invoice_items")
        .select("id, test_name, unit_price, quantity, amount")
        .eq("invoice_id", invoiceId);

      if (error) throw error;
      setInvoiceItems((data || []) as InvoiceItem[]);
    } catch (error) {
      console.error("Error fetching invoice items:", error);
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
      
      // Check which tests are already invoiced
      const testIds = (data || []).map(t => t.id);
      
      if (testIds.length > 0) {
        // Get invoice items for these tests
        const { data: invoiceItemsData } = await supabase
          .from("invoice_items")
          .select("patient_test_id, invoice_id")
          .in("patient_test_id", testIds);

        if (invoiceItemsData && invoiceItemsData.length > 0) {
          // Get invoice payment statuses
          const invoiceIds = Array.from(new Set(invoiceItemsData.map(item => item.invoice_id)));
          const { data: invoicesData } = await supabase
            .from("invoices")
            .select("id, invoice_number, payment_status, final_amount, paid_amount")
            .in("id", invoiceIds);

          // Create maps for quick lookup
          const testToInvoiceMap = new Map<string, string>();
          const invoiceStatusMap = new Map<string, { status: string; number: string; isPaid: boolean }>();
          
          invoiceItemsData.forEach(item => {
            if (item.patient_test_id) {
              testToInvoiceMap.set(item.patient_test_id, item.invoice_id);
            }
          });

          invoicesData?.forEach(inv => {
            const isPaid = (inv.paid_amount || 0) >= (inv.final_amount || 0);
            invoiceStatusMap.set(inv.id, {
              status: inv.payment_status,
              number: inv.invoice_number,
              isPaid
            });
          });

          // Add invoice status to each test
          const testsWithInvoiceStatus = (data || []).map(test => {
            const invoiceId = testToInvoiceMap.get(test.id);
            if (invoiceId) {
              const invoiceInfo = invoiceStatusMap.get(invoiceId);
              if (invoiceInfo) {
                return {
                  ...test,
                  invoice_status: invoiceInfo.isPaid ? "paid" : "unpaid",
                  invoice_number: invoiceInfo.number
                };
              }
            }
            return { ...test, invoice_status: "not_invoiced" as const };
          });

          setPatientTests(testsWithInvoiceStatus as PatientTest[]);
        } else {
          // No invoices, all tests are not invoiced
          setPatientTests((data || []).map(t => ({ ...t, invoice_status: "not_invoiced" as const })) as PatientTest[]);
        }
      } else {
        setPatientTests([]);
      }
    } catch (error) {
      console.error("Error fetching patient tests:", error);
    }
  };

  useEffect(() => {
    fetchInvoices();
    fetchPatients();
    fetchTestsDb();
  }, []);

  useEffect(() => {
    if (selectedPatientId) {
      fetchPatientTests(selectedPatientId);
      setSelectedTestIds(new Set());
      setCustomPrices(new Map());
    }
  }, [selectedPatientId]);

  // Initialize custom prices when tests are loaded - look up prices from testsDb by test name
  useEffect(() => {
    const newPrices = new Map<string, number>();
    patientTests.forEach(t => {
      // First try to get price from linked test
      let price = t.test?.price || 0;
      
      // If no price, look up in testsDb by test name
      if (price === 0) {
        const matchedTest = testsDb.find(
          dbTest => dbTest.name.toLowerCase() === t.test_name.toLowerCase()
        );
        if (matchedTest && matchedTest.price) {
          price = Number(matchedTest.price);
        }
      }
      
      newPrices.set(t.id, price);
    });
    setCustomPrices(newPrices);
  }, [patientTests, testsDb]);

  const generateInvoiceNumber = () => {
    const year = new Date().getFullYear().toString().slice(-2);
    const random = Math.floor(10000 + Math.random() * 90000);
    return `INV${year}${random}`;
  };

  const getTestPrice = (testId: string) => {
    return customPrices.get(testId) || 0;
  };

  const updateTestPrice = (testId: string, price: number) => {
    const newPrices = new Map(customPrices);
    newPrices.set(testId, price);
    setCustomPrices(newPrices);
  };

  const calculateTotal = () => {
    const selectedTests = patientTests.filter(t => selectedTestIds.has(t.id));
    const total = selectedTests.reduce((sum, t) => sum + getTestPrice(t.id), 0);
    return total;
  };

  const handleCreateInvoice = async () => {
    if (!selectedPatientId || selectedTestIds.size === 0) {
      toast.error("Please select a patient and at least one test");
      return;
    }

    // Check if any selected tests are already in paid invoices
    const selectedTests = patientTests.filter(t => selectedTestIds.has(t.id));
    const paidInvoicedTests = selectedTests.filter(t => t.invoice_status === "paid");
    
    if (paidInvoicedTests.length > 0) {
      const testNames = paidInvoicedTests.map(t => t.test_name).join(", ");
      const invoiceNumbers = Array.from(new Set(paidInvoicedTests.map(t => t.invoice_number).filter(Boolean))).join(", ");
      toast.error(
        `Cannot create invoice. The following tests are already invoiced and paid: ${testNames}. Invoice(s): ${invoiceNumbers}`
      );
      return;
    }

    // Warn if tests are in unpaid invoices (but allow it)
    const unpaidInvoicedTests = selectedTests.filter(t => t.invoice_status === "unpaid");
    if (unpaidInvoicedTests.length > 0) {
      const testNames = unpaidInvoicedTests.map(t => t.test_name).join(", ");
      toast.warning(
        `Warning: Some tests (${testNames}) are already in unpaid invoices. This will create a duplicate invoice.`
      );
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

      // Create invoice items with custom prices
      const invoiceItems = selectedTests.map(t => {
        const price = getTestPrice(t.id);
        return {
          invoice_id: invoice.id,
          patient_test_id: t.id,
          test_name: t.test_name,
          unit_price: price,
          amount: price,
        };
      });

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
    setPatientSearchQuery("");
    setPatientSearchOpen(false);
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

  const openEditDialog = async (invoice: Invoice) => {
    // Check if user has permission to edit this invoice
    if (!isAdmin && invoice.payment_status === "paid") {
      toast.error("Only administrators can edit paid invoices. Please contact an admin for assistance.");
      return;
    }

    setSelectedInvoice(invoice);
    setEditableDiscount(invoice.discount_amount);
    
    // Fetch invoice items
    const { data: items, error } = await supabase
      .from("invoice_items")
      .select("id, test_name, unit_price, quantity, amount")
      .eq("invoice_id", invoice.id);

    if (error) {
      toast.error("Failed to load invoice items");
      return;
    }

    setEditableItems(items || []);
    setIsEditDialogOpen(true);
  };

  const updateItemPrice = (itemId: string, price: number) => {
    setEditableItems(items => 
      items.map(item => {
        if (item.id === itemId) {
          const newAmount = price * item.quantity;
          return { ...item, unit_price: price, amount: newAmount };
        }
        return item;
      })
    );
  };

  const calculateEditableTotal = () => {
    return editableItems.reduce((sum, item) => sum + item.amount, 0);
  };

  const calculateEditableFinal = () => {
    return calculateEditableTotal() - editableDiscount;
  };

  const handleSaveInvoice = async () => {
    if (!selectedInvoice) return;

    setIsSubmitting(true);
    try {
      const newTotal = calculateEditableTotal();
      const newFinal = calculateEditableFinal();

      // Update invoice items
      for (const item of editableItems) {
        const { error } = await supabase
          .from("invoice_items")
          .update({
            unit_price: item.unit_price,
            amount: item.amount,
          })
          .eq("id", item.id);

        if (error) throw error;
      }

      // Update invoice totals
      const { error: invoiceError } = await supabase
        .from("invoices")
        .update({
          total_amount: newTotal,
          discount_amount: editableDiscount,
          final_amount: newFinal,
        })
        .eq("id", selectedInvoice.id);

      if (invoiceError) throw invoiceError;

      toast.success("Invoice updated successfully");
      setIsEditDialogOpen(false);
      fetchInvoices();
      
      // Refresh invoice details if open
      if (isDetailsOpen && selectedInvoice) {
        try {
          const result = await supabase
            .from("invoices")
            .select(`
              *,
              patient:patients(full_name, patient_id, phone),
              labs (
                id,
                name,
                lab_code
              ),
              collection_centers (
                id,
                name,
                code
              )
            `)
            .eq("id", selectedInvoice.id)
            .single();
          
          if (!result.error && result.data) {
            setSelectedInvoice(result.data as Invoice);
          } else if (result.error && (result.error.code === "PGRST116" || result.error.code === "42P01" || result.error.message?.includes("Could not find") || result.error.code === "400")) {
            // Fallback to basic query
            const basicResult = await supabase
              .from("invoices")
              .select(`
                *,
                patient:patients(full_name, patient_id, phone)
              `)
              .eq("id", selectedInvoice.id)
              .single();
            
            if (!basicResult.error && basicResult.data) {
              setSelectedInvoice(basicResult.data as Invoice);
            }
          }
        } catch (err) {
          console.error("Error refreshing invoice:", err);
        }
      }
    } catch (error: any) {
      console.error("Error updating invoice:", error);
      toast.error(error.message || "Failed to update invoice");
    } finally {
      setIsSubmitting(false);
    }
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

  const handlePrintInvoice = async (invoice: Invoice) => {
    // Fetch invoice items for the invoice
    const { data: items, error } = await supabase
      .from("invoice_items")
      .select("id, test_name, unit_price, quantity, amount")
      .eq("invoice_id", invoice.id);

    if (error) {
      toast.error("Failed to fetch invoice items");
      return;
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("INVOICE", pageWidth / 2, 20, { align: "center" });
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("IRM Clinical Pathology Laboratory", pageWidth / 2, 28, { align: "center" });
    doc.text("Pampore, Pulwama, J&K | +91 9419034607", pageWidth / 2, 34, { align: "center" });
    
    // Invoice details
    doc.setFontSize(11);
    doc.text(`Invoice #: ${invoice.invoice_number}`, 14, 50);
    doc.text(`Date: ${format(new Date(invoice.created_at), "dd MMM yyyy")}`, 14, 57);
    doc.text(`Status: ${invoice.payment_status.toUpperCase()}`, 14, 64);
    
    // Patient details
    let patientY = 50;
    doc.text(`Patient: ${invoice.patient?.full_name || "N/A"}`, pageWidth - 14, patientY, { align: "right" });
    doc.text(`ID: ${invoice.patient?.patient_id || "N/A"}`, pageWidth - 14, patientY + 7, { align: "right" });
    doc.text(`Phone: ${invoice.patient?.phone || "N/A"}`, pageWidth - 14, patientY + 14, { align: "right" });
    
    // Lab and Collection Center info (if available)
    if (invoice.labs || invoice.collection_centers) {
      let infoY = patientY + 21;
      if (invoice.labs) {
        const labDisplay = invoice.labs.lab_code || (invoice.labs.name.length > 15 ? invoice.labs.name.substring(0, 15) + "..." : invoice.labs.name);
        doc.text(`Lab: ${labDisplay}`, pageWidth - 14, infoY, { align: "right" });
        infoY += 7;
      }
      if (invoice.collection_centers) {
        const centerDisplay = invoice.collection_centers.code || (invoice.collection_centers.name.length > 15 ? invoice.collection_centers.name.substring(0, 15) + "..." : invoice.collection_centers.name);
        doc.text(`Center: ${centerDisplay}`, pageWidth - 14, infoY, { align: "right" });
        infoY += 7;
      }
    }
    
    // Line separator
    doc.setLineWidth(0.5);
    const separatorY = invoice.labs || invoice.collection_centers ? 78 : 70;
    doc.line(14, separatorY, pageWidth - 14, separatorY);
    
    // Items table
    const tableData = (items || []).map((item: InvoiceItem, index: number) => [
      (index + 1).toString(),
      item.test_name,
      item.quantity.toString(),
      `₹${Number(item.unit_price).toLocaleString()}`,
      `₹${Number(item.amount).toLocaleString()}`
    ]);
    
    const tableStartY = invoice.labs || invoice.collection_centers ? 83 : 75;
    autoTable(doc, {
      startY: tableStartY,
      head: [["#", "Test Name", "Qty", "Unit Price", "Amount"]],
      body: tableData,
      theme: "striped",
      headStyles: { fillColor: [41, 65, 112], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 15 },
        1: { cellWidth: "auto" },
        2: { cellWidth: 20, halign: "center" },
        3: { cellWidth: 35, halign: "right" },
        4: { cellWidth: 35, halign: "right" }
      }
    });
    
    // Summary section
    const finalY = (doc as any).lastAutoTable?.finalY || 120;
    
    doc.setFont("helvetica", "normal");
    doc.text("Subtotal:", pageWidth - 70, finalY + 15);
    doc.text(`₹${Number(invoice.total_amount).toLocaleString()}`, pageWidth - 14, finalY + 15, { align: "right" });
    
    if (invoice.discount_amount > 0) {
      doc.text("Discount:", pageWidth - 70, finalY + 22);
      doc.text(`-₹${Number(invoice.discount_amount).toLocaleString()}`, pageWidth - 14, finalY + 22, { align: "right" });
    }
    
    doc.setFont("helvetica", "bold");
    doc.text("Total:", pageWidth - 70, finalY + 32);
    doc.text(`₹${Number(invoice.final_amount).toLocaleString()}`, pageWidth - 14, finalY + 32, { align: "right" });
    
    doc.setFont("helvetica", "normal");
    doc.text("Paid:", pageWidth - 70, finalY + 42);
    doc.text(`₹${Number(invoice.paid_amount).toLocaleString()}`, pageWidth - 14, finalY + 42, { align: "right" });
    
    const outstanding = invoice.final_amount - invoice.paid_amount;
    if (outstanding > 0) {
      doc.setTextColor(255, 100, 100);
      doc.text("Outstanding:", pageWidth - 70, finalY + 52);
      doc.text(`₹${outstanding.toLocaleString()}`, pageWidth - 14, finalY + 52, { align: "right" });
      doc.setTextColor(0, 0, 0);
    }
    
    // Footer
    doc.setFontSize(9);
    doc.setTextColor(128, 128, 128);
    doc.text("Thank you for choosing our laboratory services.", pageWidth / 2, doc.internal.pageSize.getHeight() - 20, { align: "center" });
    
    // Save PDF directly instead of opening print dialog (avoids popup blockers)
    doc.save(`Invoice_${invoice.invoice_number}.pdf`);
    
    toast.success("Invoice downloaded successfully");
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
                        {(isAdmin || invoice.payment_status !== "paid") && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => openEditDialog(invoice)}
                            title={invoice.payment_status === "paid" ? "Edit Invoice (Admin Only)" : "Edit Invoice"}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={async () => {
                            setSelectedInvoice(invoice);
                            await fetchInvoiceItems(invoice.id);
                            setIsDetailsOpen(true);
                          }}
                          title="View Details"
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
              <Popover open={patientSearchOpen} onOpenChange={setPatientSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={patientSearchOpen}
                    className="w-full justify-between"
                  >
                    {selectedPatient
                      ? `${selectedPatient.full_name} (${selectedPatient.patient_id})`
                      : "Choose a patient..."}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command>
                    <CommandInput 
                      placeholder="Search by name, ID, or phone..." 
                      value={patientSearchQuery}
                      onValueChange={setPatientSearchQuery}
                    />
                    <CommandList>
                      <CommandEmpty>No patient found.</CommandEmpty>
                      <CommandGroup>
                        {filteredPatients.map((patient) => (
                          <CommandItem
                            key={patient.id}
                            value={patient.id}
                            onSelect={() => {
                              setSelectedPatientId(patient.id);
                              setPatientSearchOpen(false);
                              setPatientSearchQuery("");
                            }}
                            className="cursor-pointer"
                          >
                            <div className="flex flex-col">
                              <span className="font-medium">{patient.full_name}</span>
                              <span className="text-xs text-muted-foreground">
                                {patient.patient_id} • {patient.phone}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {selectedPatientId && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Select Tests to Invoice</Label>
                  {patientTests.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      {patientTests.filter(t => t.invoice_status !== "paid").length} available • {" "}
                      {patientTests.filter(t => t.invoice_status === "paid").length} already paid
                    </div>
                  )}
                </div>
                <div className="border rounded-lg max-h-48 overflow-y-auto">
                  {patientTests.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-4 text-center">No tests found for this patient</p>
                  ) : (
                    patientTests.map((test) => {
                      const isPaidInvoiced = test.invoice_status === "paid";
                      const isUnpaidInvoiced = test.invoice_status === "unpaid";
                      const isAlreadyInvoiced = isPaidInvoiced || isUnpaidInvoiced;
                      
                      return (
                        <div 
                          key={test.id} 
                          className={`flex items-center gap-3 p-3 border-b last:border-b-0 hover:bg-muted/50 ${
                            isPaidInvoiced ? "opacity-60 bg-muted/30" : ""
                          }`}
                        >
                          <Checkbox
                            checked={selectedTestIds.has(test.id)}
                            onCheckedChange={(checked) => {
                              if (isPaidInvoiced) {
                                toast.error(`This test is already invoiced and paid (Invoice: ${test.invoice_number}). Cannot create duplicate invoice.`);
                                return;
                              }
                              const newSet = new Set(selectedTestIds);
                              if (checked) {
                                newSet.add(test.id);
                              } else {
                                newSet.delete(test.id);
                              }
                              setSelectedTestIds(newSet);
                            }}
                            disabled={isPaidInvoiced}
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{test.test_name}</p>
                              {isPaidInvoiced && (
                                <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                                  Paid (INV: {test.invoice_number})
                                </Badge>
                              )}
                              {isUnpaidInvoiced && (
                                <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                                  Unpaid Invoice ({test.invoice_number})
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(test.test_date), "dd MMM yyyy")}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-muted-foreground">₹</span>
                            <Input
                              type="number"
                              value={getTestPrice(test.id)}
                              onChange={(e) => updateTestPrice(test.id, Number(e.target.value))}
                              className="w-24 h-8 text-right"
                              min={0}
                              disabled={isPaidInvoiced}
                            />
                          </div>
                        </div>
                      );
                    })
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

      {/* Edit Invoice Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="h-5 w-5" />
              Edit Invoice
            </DialogTitle>
          </DialogHeader>
          
          {selectedInvoice && (
            <div className="space-y-4 flex-1 overflow-y-auto">
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Invoice #{selectedInvoice.invoice_number}</p>
                <p className="font-medium">{selectedInvoice.patient?.full_name}</p>
              </div>

              <div className="space-y-2">
                <Label>Invoice Items</Label>
                <div className="border rounded-lg">
                  {editableItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-4 text-center">No items found</p>
                  ) : (
                    <div className="divide-y">
                      {editableItems.map((item, index) => (
                        <div 
                          key={item.id} 
                          className="flex items-center gap-4 p-4 hover:bg-muted/50"
                        >
                          <div className="flex-1">
                            <p className="font-medium">{item.test_name}</p>
                            <p className="text-xs text-muted-foreground">
                              Quantity: {item.quantity}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Label className="text-sm text-muted-foreground">Price:</Label>
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground">₹</span>
                              <Input
                                type="number"
                                value={item.unit_price}
                                onChange={(e) => updateItemPrice(item.id, Number(e.target.value))}
                                className="w-32 h-9 text-right"
                                min={0}
                                step="0.01"
                              />
                            </div>
                            <div className="w-24 text-right">
                              <p className="text-sm text-muted-foreground">Amount:</p>
                              <p className="font-medium">₹{item.amount.toLocaleString()}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Subtotal</Label>
                  <Input 
                    value={`₹${calculateEditableTotal().toLocaleString()}`} 
                    disabled 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Discount</Label>
                  <Input 
                    type="number" 
                    value={editableDiscount} 
                    onChange={(e) => setEditableDiscount(Number(e.target.value))}
                    placeholder="0"
                    min={0}
                    step="0.01"
                  />
                </div>
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Total Amount</span>
                  <span className="text-2xl font-bold">₹{calculateEditableFinal().toLocaleString()}</span>
                </div>
                {selectedInvoice.paid_amount > 0 && (
                  <div className="flex justify-between items-center mt-2 pt-2 border-t">
                    <span className="text-sm text-muted-foreground">Already Paid</span>
                    <span className="text-sm font-medium text-emerald-600">
                      ₹{selectedInvoice.paid_amount.toLocaleString()}
                    </span>
                  </div>
                )}
                {selectedInvoice.paid_amount > 0 && (
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-sm font-medium">Outstanding</span>
                    <span className={`text-sm font-bold ${
                      calculateEditableFinal() - selectedInvoice.paid_amount > 0 
                        ? "text-amber-600" 
                        : "text-emerald-600"
                    }`}>
                      ₹{(calculateEditableFinal() - selectedInvoice.paid_amount).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveInvoice} 
              disabled={isSubmitting || editableItems.length === 0}
            >
              {isSubmitting ? "Saving..." : "Save Changes"}
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

              {/* Invoice Items */}
              {invoiceItems.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Items</p>
                  <div className="border rounded-lg divide-y">
                    {invoiceItems.map((item) => (
                      <div key={item.id} className="flex justify-between items-center p-3">
                        <div className="flex-1">
                          <p className="font-medium">{item.test_name}</p>
                          <p className="text-xs text-muted-foreground">
                            Qty: {item.quantity} × ₹{item.unit_price.toLocaleString()}
                          </p>
                        </div>
                        <p className="font-medium">₹{item.amount.toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                {(isAdmin || selectedInvoice.payment_status !== "paid") && (
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => {
                      setIsDetailsOpen(false);
                      openEditDialog(selectedInvoice);
                    }}
                  >
                    <Edit2 className="h-4 w-4 mr-2" />
                    Edit Invoice
                  </Button>
                )}
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => handlePrintInvoice(selectedInvoice)}
                >
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
