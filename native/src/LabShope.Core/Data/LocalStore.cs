using Microsoft.Data.Sqlite;

namespace LabShope.Core.Data;

/// <summary>
/// The lab's local database (one SQLite file per organisation). Every screen reads from here, so the
/// app is fast and works offline; sync fills it from the server and sends local changes back.
/// </summary>
public sealed record OutboxItem(string VisitId, string PayloadJson, string Status, int Attempts, string? LastError, string PatientName, decimal TotalAmount, string Kind = "visit");

public sealed record LocalPayment(string Id, string InvoiceId, decimal Amount, string Method, string? TransactionId, string? Notes, string PaidAt, bool Synced);

public sealed class LocalStore : IDisposable
{
    private readonly SqliteConnection _db;

    public LocalStore(string path)
    {
        _db = new SqliteConnection($"Data Source={path}");
        _db.Open();
        Exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;");
        Exec("""
            CREATE TABLE IF NOT EXISTS patients (
              id TEXT PRIMARY KEY, patient_code TEXT NOT NULL, full_name TEXT NOT NULL, phone TEXT NOT NULL,
              gender TEXT, date_of_birth TEXT, pending INTEGER NOT NULL DEFAULT 0, search TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS ix_patients_code ON patients(patient_code COLLATE NOCASE);
            CREATE INDEX IF NOT EXISTS ix_patients_phone ON patients(phone);
            CREATE TABLE IF NOT EXISTS invoices (
              id TEXT PRIMARY KEY, invoice_number TEXT NOT NULL, patient_id TEXT NOT NULL, total_amount REAL NOT NULL,
              paid_amount REAL NOT NULL, payment_status TEXT, created_at TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS ix_invoices_number ON invoices(invoice_number COLLATE NOCASE);
            CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
            CREATE TABLE IF NOT EXISTS catalog (kind TEXT NOT NULL, id TEXT NOT NULL, sort TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (kind, id));
            CREATE INDEX IF NOT EXISTS ix_catalog_sort ON catalog(kind, sort COLLATE NOCASE);
            CREATE TABLE IF NOT EXISTS outbox (
              visit_id TEXT PRIMARY KEY, payload TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
              last_error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
              patient_name TEXT NOT NULL, total_amount REAL NOT NULL, result TEXT);
            CREATE INDEX IF NOT EXISTS ix_outbox_status ON outbox(status, created_at);
            CREATE TABLE IF NOT EXISTS patient_tests (
              id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, test_name TEXT NOT NULL, test_date TEXT NOT NULL, status TEXT NOT NULL,
              result TEXT, result_value REAL, result_unit TEXT, normal_range_text TEXT, is_abnormal INTEGER NOT NULL DEFAULT 0,
              waiting INTEGER NOT NULL DEFAULT 0, result_items TEXT);
            CREATE INDEX IF NOT EXISTS ix_patient_tests_status ON patient_tests(status);
            CREATE INDEX IF NOT EXISTS ix_patient_tests_patient ON patient_tests(patient_id);
            CREATE TABLE IF NOT EXISTS bookings (
              id TEXT PRIMARY KEY, full_name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT, booking_type TEXT NOT NULL, preferred_date TEXT,
              test_details TEXT, notes TEXT, status TEXT NOT NULL, patient_id TEXT, created_at TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
            CREATE INDEX IF NOT EXISTS ix_bookings_status ON bookings(status);
            CREATE TABLE IF NOT EXISTS notify_queue (
              patient_id TEXT NOT NULL, test_date TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (patient_id, test_date));
            CREATE TABLE IF NOT EXISTS aliases (
              alias TEXT NOT NULL COLLATE NOCASE PRIMARY KEY, kind TEXT NOT NULL, target_id TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS payments (
              id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL, amount REAL NOT NULL, method TEXT NOT NULL,
              transaction_id TEXT, notes TEXT, paid_at TEXT NOT NULL, synced INTEGER NOT NULL DEFAULT 0);
            CREATE INDEX IF NOT EXISTS ix_payments_invoice ON payments(invoice_id);
            """);
        // Databases created before panel results existed have no result_items column.
        using (var info2 = _db.CreateCommand())
        {
            info2.CommandText = "SELECT COUNT(*) FROM pragma_table_info('patient_tests') WHERE name = 'result_items'";
            if ((long)info2.ExecuteScalar()! == 0) Exec("ALTER TABLE patient_tests ADD COLUMN result_items TEXT");
        }
        // Databases created before payments existed have no "kind" column on the outbox.
        using (var info = _db.CreateCommand())
        {
            info.CommandText = "SELECT COUNT(*) FROM pragma_table_info('outbox') WHERE name = 'kind'";
            if ((long)info.ExecuteScalar()! == 0) Exec("ALTER TABLE outbox ADD COLUMN kind TEXT NOT NULL DEFAULT 'visit'");
        }
    }

    public void UpsertPatient(Patient p)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = """
            INSERT INTO patients (id, patient_code, full_name, phone, gender, date_of_birth, pending, search)
            VALUES ($id, $code, $name, $phone, $gender, $dob, $pending, $search)
            ON CONFLICT(id) DO UPDATE SET patient_code=$code, full_name=$name, phone=$phone, gender=$gender,
              date_of_birth=$dob, pending=$pending, search=$search;
            """;
        cmd.Parameters.AddWithValue("$id", p.Id);
        cmd.Parameters.AddWithValue("$code", p.PatientCode);
        cmd.Parameters.AddWithValue("$name", p.FullName);
        cmd.Parameters.AddWithValue("$phone", p.Phone);
        cmd.Parameters.AddWithValue("$gender", (object?)p.Gender ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$dob", (object?)p.DateOfBirth ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$pending", p.Pending ? 1 : 0);
        cmd.Parameters.AddWithValue("$search", $"{p.FullName} {p.Phone} {p.PatientCode}".ToLowerInvariant());
        cmd.ExecuteNonQuery();
    }

    public void UpsertInvoice(Invoice i)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = """
            INSERT INTO invoices (id, invoice_number, patient_id, total_amount, paid_amount, payment_status, created_at)
            VALUES ($id, $number, $patient, $total, $paid, $status, $created)
            ON CONFLICT(id) DO UPDATE SET invoice_number=$number, patient_id=$patient, total_amount=$total,
              paid_amount=$paid, payment_status=$status, created_at=$created;
            """;
        cmd.Parameters.AddWithValue("$id", i.Id);
        cmd.Parameters.AddWithValue("$number", i.InvoiceNumber);
        cmd.Parameters.AddWithValue("$patient", i.PatientId);
        cmd.Parameters.AddWithValue("$total", (double)i.TotalAmount);
        cmd.Parameters.AddWithValue("$paid", (double)i.PaidAmount);
        cmd.Parameters.AddWithValue("$status", (object?)i.PaymentStatus ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$created", i.CreatedAt);
        cmd.ExecuteNonQuery();
    }

    /// <summary>Patients whose name, phone or ID contains every word typed, newest names first by name.</summary>
    public IReadOnlyList<Patient> SearchPatients(string text, int limit = 200)
    {
        var words = text.Trim().ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        using var cmd = _db.CreateCommand();
        var where = string.Join(" AND ", words.Select((_, n) => $"search LIKE $w{n}"));
        cmd.CommandText = $"SELECT id, patient_code, full_name, phone, gender, date_of_birth, pending FROM patients " +
                          $"{(words.Length > 0 ? "WHERE " + where : "")} ORDER BY full_name COLLATE NOCASE LIMIT $limit";
        for (var n = 0; n < words.Length; n++) cmd.Parameters.AddWithValue($"$w{n}", $"%{words[n]}%");
        cmd.Parameters.AddWithValue("$limit", limit);
        return ReadPatients(cmd);
    }

    /// <summary>Bills whose number contains the text, newest first.</summary>
    public IReadOnlyList<Invoice> SearchInvoices(string text, int limit = 500)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "SELECT id, invoice_number, patient_id, total_amount, paid_amount, payment_status, created_at FROM invoices " +
                          "WHERE invoice_number LIKE $q ORDER BY created_at DESC LIMIT $limit";
        cmd.Parameters.AddWithValue("$q", $"%{text.Trim()}%");
        cmd.Parameters.AddWithValue("$limit", limit);
        var list = new List<Invoice>();
        using var r = cmd.ExecuteReader();
        while (r.Read())
            list.Add(new Invoice(r.GetString(0), r.GetString(1), r.GetString(2), (decimal)r.GetDouble(3), (decimal)r.GetDouble(4),
                r.IsDBNull(5) ? null : r.GetString(5), r.GetString(6)));
        return list;
    }

    /// <summary>Bills with the patient's name, newest first. Matches the bill number, the patient's name, phone or ID.</summary>
    public IReadOnlyList<BillRow> SearchBills(string text, bool onlyUnpaid = false, int limit = 500)
    {
        var words = text.Trim().ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        using var cmd = _db.CreateCommand();
        var where = words.Select((_, n) => $"(LOWER(i.invoice_number) LIKE $w{n} OR p.search LIKE $w{n})").ToList();
        if (onlyUnpaid) where.Add("COALESCE(i.payment_status,'pending') <> 'paid'");
        cmd.CommandText = "SELECT i.id, i.invoice_number, i.patient_id, COALESCE(p.full_name,''), COALESCE(p.patient_code,''), i.total_amount, i.paid_amount, COALESCE(i.payment_status,'pending'), i.created_at " +
                          "FROM invoices i LEFT JOIN patients p ON p.id = i.patient_id " +
                          (where.Count > 0 ? "WHERE " + string.Join(" AND ", where) + " " : "") +
                          "ORDER BY i.created_at DESC LIMIT $limit";
        for (var n = 0; n < words.Length; n++) cmd.Parameters.AddWithValue($"$w{n}", $"%{words[n]}%");
        cmd.Parameters.AddWithValue("$limit", limit);
        var list = new List<BillRow>();
        using var r = cmd.ExecuteReader();
        while (r.Read())
            list.Add(new BillRow(r.GetString(0), r.GetString(1), r.GetString(2), r.GetString(3), r.GetString(4),
                (decimal)r.GetDouble(5), (decimal)r.GetDouble(6), r.GetString(7), r.GetString(8)));
        return list;
    }

    /// <summary>Today's counts and money for the home screen. The day is given as a UTC window (local midnight to midnight).</summary>
    public DashboardNumbers GetDashboard(string fromIso, string toIso)
    {
        long Count(string sql, bool withDay = false)
        {
            using var cmd = _db.CreateCommand();
            cmd.CommandText = sql;
            if (withDay) { cmd.Parameters.AddWithValue("$a", fromIso); cmd.Parameters.AddWithValue("$b", toIso); }
            return Convert.ToInt64(cmd.ExecuteScalar());
        }
        decimal Sum(string sql, bool withDay = false)
        {
            using var cmd = _db.CreateCommand();
            cmd.CommandText = sql;
            if (withDay) { cmd.Parameters.AddWithValue("$a", fromIso); cmd.Parameters.AddWithValue("$b", toIso); }
            return Convert.ToDecimal(cmd.ExecuteScalar());
        }

        var (waiting, failed) = OutboxCounts();
        return new DashboardNumbers(
            (int)Count("SELECT COUNT(*) FROM invoices WHERE datetime(created_at) >= datetime($a) AND datetime(created_at) < datetime($b)", true),
            (int)Count("SELECT COUNT(*) FROM patient_tests WHERE status IN ('pending','in_progress')"),
            Sum("SELECT COALESCE(SUM(amount), 0) FROM payments WHERE datetime(paid_at) >= datetime($a) AND datetime(paid_at) < datetime($b)", true),
            Sum("SELECT COALESCE(SUM(total_amount - paid_amount), 0) FROM invoices WHERE COALESCE(payment_status,'pending') NOT IN ('paid','cancelled')"),
            (int)Count("SELECT COUNT(*) FROM invoices WHERE COALESCE(payment_status,'pending') NOT IN ('paid','cancelled') AND total_amount > paid_amount"),
            failed, waiting);
    }

    /// <summary>
    /// Totals for a period. <paramref name="fromDay"/> and <paramref name="toDay"/> are local calendar days (inclusive, yyyy-MM-dd);
    /// <paramref name="utcOffsetMinutes"/> turns the stored UTC times into those local days.
    /// </summary>
    public ReportSummary GetReport(string fromDay, string toDay, int utcOffsetMinutes)
    {
        var shift = $"{(utcOffsetMinutes >= 0 ? "+" : "-")}{Math.Abs(utcOffsetMinutes)} minutes";
        void Days(SqliteCommand c) { c.Parameters.AddWithValue("$from", fromDay); c.Parameters.AddWithValue("$to", toDay); c.Parameters.AddWithValue("$shift", shift); }
        T Scalar<T>(string sql, Func<object?, T> convert)
        {
            using var c = _db.CreateCommand(); c.CommandText = sql; Days(c); return convert(c.ExecuteScalar());
        }

        const string InvDay = "date(created_at, $shift) BETWEEN $from AND $to AND COALESCE(payment_status,'pending') <> 'cancelled'";
        var visits = Scalar($"SELECT COUNT(*) FROM invoices WHERE {InvDay}", Convert.ToInt32);
        var billed = Scalar($"SELECT COALESCE(SUM(total_amount),0) FROM invoices WHERE {InvDay}", Convert.ToDecimal);
        var collected = Scalar("SELECT COALESCE(SUM(amount),0) FROM payments WHERE date(paid_at, $shift) BETWEEN $from AND $to", Convert.ToDecimal);
        var outstanding = Scalar($"SELECT COALESCE(SUM(total_amount - paid_amount),0) FROM invoices WHERE {InvDay} AND total_amount > paid_amount", Convert.ToDecimal);
        var ordered = Scalar("SELECT COUNT(*) FROM patient_tests WHERE test_date BETWEEN $from AND $to", Convert.ToInt32);
        var completed = Scalar("SELECT COUNT(*) FROM patient_tests WHERE status = 'completed' AND test_date BETWEEN $from AND $to", Convert.ToInt32);

        var daily = new List<DayAmount>();
        using (var c = _db.CreateCommand())
        {
            c.CommandText = "SELECT date(paid_at, $shift) d, SUM(amount) FROM payments WHERE date(paid_at, $shift) BETWEEN $from AND $to GROUP BY d ORDER BY d";
            Days(c);
            using var r = c.ExecuteReader();
            while (r.Read()) daily.Add(new DayAmount(r.GetString(0), (decimal)r.GetDouble(1)));
        }

        var methods = new List<MethodAmount>();
        using (var c = _db.CreateCommand())
        {
            c.CommandText = "SELECT method, SUM(amount), COUNT(*) FROM payments WHERE date(paid_at, $shift) BETWEEN $from AND $to GROUP BY method ORDER BY SUM(amount) DESC";
            Days(c);
            using var r = c.ExecuteReader();
            while (r.Read()) methods.Add(new MethodAmount(r.GetString(0), (decimal)r.GetDouble(1), r.GetInt32(2)));
        }

        var top = new List<TestCount>();
        using (var c = _db.CreateCommand())
        {
            c.CommandText = "SELECT test_name, COUNT(*) FROM patient_tests WHERE test_date BETWEEN $from AND $to GROUP BY test_name ORDER BY COUNT(*) DESC, test_name LIMIT 8";
            Days(c);
            using var r = c.ExecuteReader();
            while (r.Read()) top.Add(new TestCount(r.GetString(0), r.GetInt32(1)));
        }

        return new ReportSummary(visits, billed, collected, outstanding, ordered, completed, daily, methods, top);
    }

    public long InvoiceCount()
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "SELECT COUNT(*) FROM invoices";
        return (long)cmd.ExecuteScalar()!;
    }

    public Patient? FindPatientByCode(string code)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "SELECT id, patient_code, full_name, phone, gender, date_of_birth, pending FROM patients WHERE patient_code = $c COLLATE NOCASE LIMIT 1";
        cmd.Parameters.AddWithValue("$c", code);
        return ReadPatients(cmd).FirstOrDefault();
    }

    public Patient? GetPatient(string id)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "SELECT id, patient_code, full_name, phone, gender, date_of_birth, pending FROM patients WHERE id = $id";
        cmd.Parameters.AddWithValue("$id", id);
        return ReadPatients(cmd).FirstOrDefault();
    }

    public Invoice? FindInvoiceByNumber(string number)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "SELECT id, invoice_number, patient_id, total_amount, paid_amount, payment_status, created_at FROM invoices WHERE invoice_number = $n COLLATE NOCASE LIMIT 1";
        cmd.Parameters.AddWithValue("$n", number);
        using var r = cmd.ExecuteReader();
        return r.Read()
            ? new Invoice(r.GetString(0), r.GetString(1), r.GetString(2), (decimal)r.GetDouble(3), (decimal)r.GetDouble(4),
                r.IsDBNull(5) ? null : r.GetString(5), r.GetString(6))
            : null;
    }

    public long PatientCount()
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "SELECT COUNT(*) FROM patients";
        return (long)cmd.ExecuteScalar()!;
    }

    /// <summary>Resolves a scanned code: a patient ID first, then a bill number.</summary>
    public ScanMatch ResolveScan(string raw)
    {
        var code = raw.Trim().Replace("\r", "").Replace("\n", "").Replace("\t", "");
        if (code.Length == 0) return new ScanMatch.NotFound(code);

        var patient = FindPatientByCode(code);
        if (patient is not null) return new ScanMatch.FoundPatient(patient);

        var invoice = FindInvoiceByNumber(code);
        if (invoice is not null) return new ScanMatch.FoundInvoice(invoice, GetPatient(invoice.PatientId));

        // A label printed before the server issued the official number still has to scan.
        if (FindAlias(code) is { } alias)
        {
            if (alias.Kind == "patient" && GetPatient(alias.TargetId) is { } owner) return new ScanMatch.FoundPatient(owner);
            if (alias.Kind == "invoice" && GetInvoice(alias.TargetId) is { } bill) return new ScanMatch.FoundInvoice(bill, GetPatient(bill.PatientId));
        }
        return new ScanMatch.NotFound(code);
    }

    private static List<Patient> ReadPatients(SqliteCommand cmd)
    {
        var list = new List<Patient>();
        using var r = cmd.ExecuteReader();
        while (r.Read())
        {
            list.Add(new Patient(r.GetString(0), r.GetString(1), r.GetString(2), r.GetString(3),
                r.IsDBNull(4) ? null : r.GetString(4), r.IsDBNull(5) ? null : r.GetString(5), r.GetInt32(6) == 1));
        }
        return list;
    }

    // ── catalog (tests, packages, doctors, labs, centers) ───────────────────

    /// <summary>Replaces the whole catalog in one step, so a half-finished refresh never leaves it empty.</summary>
    public void ReplaceCatalog(Catalog catalog)
    {
        InTransaction(() =>
        {
            Exec("DELETE FROM catalog");
            foreach (var t in catalog.Tests) PutCatalog("test", t.Id, t.Name, t);
            foreach (var p in catalog.Packages) PutCatalog("package", p.Id, p.Name, p);
            foreach (var d in catalog.Doctors) PutCatalog("doctor", d.Id, d.Name, d);
            foreach (var l in catalog.Labs) PutCatalog("lab", l.Id, l.Name, l);
            foreach (var c in catalog.Centers) PutCatalog("center", c.Id, c.Name, c);
            foreach (var c in catalog.CategoryList) PutCatalog("category", c.Id, c.Name, c);
            foreach (var t in catalog.TemplateList) PutCatalog("template", t.Id, t.Name, t);
        });
    }

    public Catalog GetCatalog() => new(
        ReadCatalog<CatalogTest>("test"), ReadCatalog<TestPackage>("package"), ReadCatalog<Doctor>("doctor"),
        ReadCatalog<LabRef>("lab"), ReadCatalog<CenterRef>("center"), ReadCatalog<TestCategory>("category"), ReadCatalog<ReportTemplate>("template"));

    private void PutCatalog<T>(string kind, string id, string sort, T value)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "INSERT INTO catalog (kind, id, sort, json) VALUES ($k, $i, $s, $j)";
        cmd.Parameters.AddWithValue("$k", kind);
        cmd.Parameters.AddWithValue("$i", id);
        cmd.Parameters.AddWithValue("$s", sort);
        cmd.Parameters.AddWithValue("$j", System.Text.Json.JsonSerializer.Serialize(value));
        cmd.ExecuteNonQuery();
    }

    private List<T> ReadCatalog<T>(string kind)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "SELECT json FROM catalog WHERE kind = $k ORDER BY sort COLLATE NOCASE";
        cmd.Parameters.AddWithValue("$k", kind);
        var list = new List<T>();
        using var r = cmd.ExecuteReader();
        while (r.Read()) list.Add(System.Text.Json.JsonSerializer.Deserialize<T>(r.GetString(0))!);
        return list;
    }

    public Patient? FindPatientByPhone(IEnumerable<string> variants)
    {
        var list = variants.ToList();
        if (list.Count == 0) return null;
        using var cmd = _db.CreateCommand();
        var names = list.Select((_, n) => $"$p{n}").ToList();
        cmd.CommandText = $"SELECT id, patient_code, full_name, phone, gender, date_of_birth, pending FROM patients WHERE phone IN ({string.Join(",", names)}) ORDER BY pending, id LIMIT 1";
        for (var n = 0; n < list.Count; n++) cmd.Parameters.AddWithValue(names[n], list[n]);
        return ReadPatients(cmd).FirstOrDefault();
    }

    // ── booking requests (from the website) ────────────────────────────────

    public void UpsertBooking(BookingRequest b, bool fromServer = false)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = """
            INSERT INTO bookings (id, full_name, phone, email, booking_type, preferred_date, test_details, notes, status, patient_id, created_at, waiting)
            VALUES ($id,$name,$phone,$email,$type,$pref,$tests,$notes,$status,$patient,$created,$waiting)
            ON CONFLICT(id) DO UPDATE SET full_name=$name, phone=$phone, email=$email, booking_type=$type, preferred_date=$pref, test_details=$tests,
              notes=$notes, status=$status, patient_id=$patient, created_at=$created, waiting=$waiting
            WHERE $fromServer = 0 OR bookings.waiting = 0;
            """;
        cmd.Parameters.AddWithValue("$id", b.Id);
        cmd.Parameters.AddWithValue("$name", b.FullName);
        cmd.Parameters.AddWithValue("$phone", b.Phone);
        cmd.Parameters.AddWithValue("$email", (object?)b.Email ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$type", b.BookingType);
        cmd.Parameters.AddWithValue("$pref", (object?)b.PreferredDate ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$tests", (object?)b.TestDetails ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$notes", (object?)b.Notes ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$status", b.Status);
        cmd.Parameters.AddWithValue("$patient", (object?)b.PatientId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$created", b.CreatedAt);
        cmd.Parameters.AddWithValue("$waiting", b.Waiting ? 1 : 0);
        cmd.Parameters.AddWithValue("$fromServer", fromServer ? 1 : 0);
        cmd.ExecuteNonQuery();
    }

    public BookingRequest? GetBooking(string id) => QueryBookings("WHERE id = $a", id).FirstOrDefault();

    /// <summary>Booking requests, newest first. <paramref name="status"/> null means all.</summary>
    public IReadOnlyList<BookingRequest> SearchBookings(string text, string? status = null, int limit = 500)
    {
        var words = text.Trim().ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var where = words.Select((_, n) => $"(LOWER(full_name) LIKE $w{n} OR phone LIKE $w{n} OR LOWER(COALESCE(test_details,'')) LIKE $w{n})").ToList();
        if (status is not null) where.Add("status = $status");
        return QueryBookings((where.Count > 0 ? "WHERE " + string.Join(" AND ", where) : "") + $" ORDER BY datetime(created_at) DESC LIMIT {limit}", null, words, status);
    }

    public int NewBookingCount()
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "SELECT COUNT(*) FROM bookings WHERE status = 'new'";
        return Convert.ToInt32(cmd.ExecuteScalar());
    }

    public void ClearBookingWaiting(string id)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "UPDATE bookings SET waiting = 0 WHERE id = $id";
        cmd.Parameters.AddWithValue("$id", id);
        cmd.ExecuteNonQuery();
    }

    private List<BookingRequest> QueryBookings(string tail, string? a, string[]? words = null, string? status = null)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "SELECT id, full_name, phone, email, booking_type, preferred_date, test_details, notes, status, patient_id, created_at, waiting FROM bookings " + tail;
        if (a is not null) cmd.Parameters.AddWithValue("$a", a);
        if (words is not null) for (var n = 0; n < words.Length; n++) cmd.Parameters.AddWithValue($"$w{n}", $"%{words[n]}%");
        if (status is not null) cmd.Parameters.AddWithValue("$status", status);
        var list = new List<BookingRequest>();
        using var r = cmd.ExecuteReader();
        while (r.Read())
            list.Add(new BookingRequest(r.GetString(0), r.GetString(1), r.GetString(2), r.IsDBNull(3) ? null : r.GetString(3), r.GetString(4),
                r.IsDBNull(5) ? null : r.GetString(5), r.IsDBNull(6) ? null : r.GetString(6), r.IsDBNull(7) ? null : r.GetString(7), r.GetString(8),
                r.IsDBNull(9) ? null : r.GetString(9), r.GetString(10), r.GetInt32(11) == 1));
        return list;
    }

    // ── "your reports are ready" emails still to send ───────────────────────

    public void QueueReadyNotification(string patientId, string testDate)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "INSERT INTO notify_queue (patient_id, test_date, created_at) VALUES ($p, $d, $now) ON CONFLICT DO NOTHING";
        cmd.Parameters.AddWithValue("$p", patientId);
        cmd.Parameters.AddWithValue("$d", testDate);
        cmd.Parameters.AddWithValue("$now", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        cmd.ExecuteNonQuery();
    }

    public IReadOnlyList<(string PatientId, string TestDate)> PendingReadyNotifications()
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "SELECT patient_id, test_date FROM notify_queue ORDER BY created_at";
        var list = new List<(string, string)>();
        using var r = cmd.ExecuteReader();
        while (r.Read()) list.Add((r.GetString(0), r.GetString(1)));
        return list;
    }

    public void RemoveReadyNotification(string patientId, string testDate)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "DELETE FROM notify_queue WHERE patient_id = $p AND test_date = $d";
        cmd.Parameters.AddWithValue("$p", patientId);
        cmd.Parameters.AddWithValue("$d", testDate);
        cmd.ExecuteNonQuery();
    }

    /// <summary>The names of a patient's tests on a day when every one of them is finished and confirmed by the server; empty otherwise.</summary>
    public IReadOnlyList<string> NamesIfAllConfirmedComplete(string patientId, string testDate)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "SELECT test_name, status, waiting FROM patient_tests WHERE patient_id = $p AND test_date = $d ORDER BY rowid";
        cmd.Parameters.AddWithValue("$p", patientId);
        cmd.Parameters.AddWithValue("$d", testDate);
        var names = new List<string>();
        using var r = cmd.ExecuteReader();
        while (r.Read())
        {
            if (r.GetString(1) != "completed" || r.GetInt32(2) == 1) return [];
            names.Add(r.GetString(0));
        }
        return names;
    }

    // ── aliases: old provisional numbers that must keep working (printed labels/receipts) ───

    /// <summary>Remembers that a provisional code or bill number printed earlier now means this patient or bill.</summary>
    public void AddAlias(string alias, string kind, string targetId)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "INSERT INTO aliases (alias, kind, target_id) VALUES ($a, $k, $t) ON CONFLICT(alias) DO UPDATE SET kind=$k, target_id=$t";
        cmd.Parameters.AddWithValue("$a", alias);
        cmd.Parameters.AddWithValue("$k", kind);
        cmd.Parameters.AddWithValue("$t", targetId);
        cmd.ExecuteNonQuery();
    }

    public (string Kind, string TargetId)? FindAlias(string alias)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "SELECT kind, target_id FROM aliases WHERE alias = $a";
        cmd.Parameters.AddWithValue("$a", alias);
        using var r = cmd.ExecuteReader();
        return r.Read() ? (r.GetString(0), r.GetString(1)) : null;
    }

    // ── branding (cached on this PC so printing never needs the internet) ───

    public void SaveBranding(Branding b) => SetMeta("branding", System.Text.Json.JsonSerializer.Serialize(b));

    public Branding GetBranding(string fallbackName)
    {
        var json = GetMeta("branding");
        if (json is not null)
        {
            try { if (System.Text.Json.JsonSerializer.Deserialize<Branding>(json) is { } b) return b; }
            catch (System.Text.Json.JsonException) { }
        }
        return Branding.Minimal(fallbackName);
    }

    /// <summary>Every active patient whose stored phone is one of the given forms (a number may be shared by family members).</summary>
    public IReadOnlyList<Patient> FindPatientsByPhone(IEnumerable<string> variants)
    {
        var list = variants.Where(v => v.Length > 0).ToList();
        if (list.Count == 0) return [];
        using var cmd = _db.CreateCommand();
        var names = list.Select((_, n) => $"$p{n}").ToList();
        cmd.CommandText = $"SELECT id, patient_code, full_name, phone, gender, date_of_birth, pending FROM patients WHERE phone IN ({string.Join(",", names)}) ORDER BY full_name COLLATE NOCASE";
        for (var n = 0; n < list.Count; n++) cmd.Parameters.AddWithValue(names[n], list[n]);
        return ReadPatients(cmd);
    }

    // ── meta (cursors, session, settings) ──────────────────────────────────

    public string? GetMeta(string key)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "SELECT value FROM meta WHERE key = $k";
        cmd.Parameters.AddWithValue("$k", key);
        return cmd.ExecuteScalar() as string;
    }

    public void SetMeta(string key, string? value)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "INSERT INTO meta (key, value) VALUES ($k, $v) ON CONFLICT(key) DO UPDATE SET value = $v";
        cmd.Parameters.AddWithValue("$k", key);
        cmd.Parameters.AddWithValue("$v", (object?)value ?? DBNull.Value);
        cmd.ExecuteNonQuery();
    }

    private int _txDepth;

    /// <summary>
    /// Runs several writes as one all-or-nothing, much faster than separate commits. Calls can nest:
    /// only the outermost one starts and ends the transaction, so a failure anywhere undoes everything.
    /// </summary>
    public void InTransaction(Action work)
    {
        if (_txDepth > 0) { work(); return; }

        using var tx = _db.BeginTransaction();
        _txDepth++;
        try { work(); tx.Commit(); }
        catch { tx.Rollback(); throw; }
        finally { _txDepth--; }
    }

    // ── outbox ─────────────────────────────────────────────────────────────

    public void EnqueueVisit(OutboxItem item)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = """
            INSERT INTO outbox (visit_id, payload, status, attempts, last_error, created_at, updated_at, patient_name, total_amount, result, kind)
            VALUES ($id, $payload, 'pending', 0, NULL, $now, $now, $name, $total, NULL, $kind)
            ON CONFLICT(visit_id) DO NOTHING;
            """;
        cmd.Parameters.AddWithValue("$id", item.VisitId);
        cmd.Parameters.AddWithValue("$payload", item.PayloadJson);
        cmd.Parameters.AddWithValue("$now", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        cmd.Parameters.AddWithValue("$name", item.PatientName);
        cmd.Parameters.AddWithValue("$total", (double)item.TotalAmount);
        cmd.Parameters.AddWithValue("$kind", item.Kind);
        cmd.ExecuteNonQuery();
    }

    public OutboxItem? NextPendingVisit()
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "SELECT visit_id, payload, status, attempts, last_error, patient_name, total_amount, kind FROM outbox WHERE status = 'pending' ORDER BY created_at, rowid LIMIT 1";
        using var r = cmd.ExecuteReader();
        return r.Read() ? ReadOutbox(r) : null;
    }

    public OutboxItem? GetVisit(string visitId)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "SELECT visit_id, payload, status, attempts, last_error, patient_name, total_amount, kind FROM outbox WHERE visit_id = $id";
        cmd.Parameters.AddWithValue("$id", visitId);
        using var r = cmd.ExecuteReader();
        return r.Read() ? ReadOutbox(r) : null;
    }

    public void SetVisitStatus(string visitId, string status, string? error = null, bool countAttempt = false, string? resultJson = null)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = $"UPDATE outbox SET status=$s, last_error=$e, updated_at=$now, result=COALESCE($r, result){(countAttempt ? ", attempts = attempts + 1" : "")} WHERE visit_id=$id";
        cmd.Parameters.AddWithValue("$id", visitId);
        cmd.Parameters.AddWithValue("$s", status);
        cmd.Parameters.AddWithValue("$e", (object?)error ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$r", (object?)resultJson ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$now", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        cmd.ExecuteNonQuery();
    }

    /// <summary>A crash mid-sync leaves "syncing" rows behind; sending again is safe (the server is idempotent).</summary>
    public void RequeueStuckVisits(TimeSpan olderThan)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "UPDATE outbox SET status='pending' WHERE status='syncing' AND updated_at < $cutoff";
        cmd.Parameters.AddWithValue("$cutoff", DateTimeOffset.UtcNow.Add(-olderThan).ToUnixTimeMilliseconds());
        cmd.ExecuteNonQuery();
    }

    public (int Pending, int Failed) OutboxCounts()
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "SELECT COALESCE(SUM(status IN ('pending','syncing')),0), COALESCE(SUM(status='failed'),0) FROM outbox";
        using var r = cmd.ExecuteReader();
        r.Read();
        return (r.GetInt32(0), r.GetInt32(1));
    }

    // ── the worklist (tests ordered, and their results) ─────────────────────

    /// <summary>Saves a test from the server. A result entered here that the server hasn't confirmed is never overwritten.</summary>
    public void UpsertPatientTest(PatientTest t, bool fromServer = false)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = """
            INSERT INTO patient_tests (id, patient_id, test_name, test_date, status, result, result_value, result_unit, normal_range_text, is_abnormal, waiting, result_items)
            VALUES ($id,$pid,$name,$date,$status,$result,$value,$unit,$range,$abn,$waiting,$items)
            ON CONFLICT(id) DO UPDATE SET patient_id=$pid, test_name=$name, test_date=$date, status=$status, result=$result,
              result_value=$value, result_unit=$unit, normal_range_text=$range, is_abnormal=$abn, waiting=$waiting, result_items=$items
            WHERE $fromServer = 0 OR patient_tests.waiting = 0;
            """;
        cmd.Parameters.AddWithValue("$id", t.Id);
        cmd.Parameters.AddWithValue("$pid", t.PatientId);
        cmd.Parameters.AddWithValue("$name", t.TestName);
        cmd.Parameters.AddWithValue("$date", t.TestDate);
        cmd.Parameters.AddWithValue("$status", t.Status);
        cmd.Parameters.AddWithValue("$result", (object?)t.Result ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$value", t.ResultValue is { } v ? (double)v : DBNull.Value);
        cmd.Parameters.AddWithValue("$unit", (object?)t.ResultUnit ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$range", (object?)t.NormalRangeText ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$abn", t.IsAbnormal ? 1 : 0);
        cmd.Parameters.AddWithValue("$waiting", t.Waiting ? 1 : 0);
        cmd.Parameters.AddWithValue("$items", (object?)t.ResultItemsJson ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$fromServer", fromServer ? 1 : 0);
        cmd.ExecuteNonQuery();
    }

    public PatientTest? GetPatientTest(string id)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "SELECT id, patient_id, test_name, test_date, status, result, result_value, result_unit, normal_range_text, is_abnormal, waiting, result_items FROM patient_tests WHERE id = $id";
        cmd.Parameters.AddWithValue("$id", id);
        using var r = cmd.ExecuteReader();
        return r.Read() ? ReadTest(r) : null;
    }

    /// <summary>Worklist lines, oldest first. <paramref name="statuses"/> limits by status (e.g. pending, in_progress).</summary>
    public IReadOnlyList<WorklistRow> SearchWorklist(string text, IReadOnlyCollection<string>? statuses = null, int limit = 500)
    {
        var words = text.Trim().ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        using var cmd = _db.CreateCommand();
        var where = words.Select((_, n) => $"(LOWER(t.test_name) LIKE $w{n} OR p.search LIKE $w{n})").ToList();
        if (statuses is { Count: > 0 })
            where.Add($"t.status IN ({string.Join(",", statuses.Select((_, n) => $"$s{n}"))})");
        cmd.CommandText = "SELECT t.id, t.patient_id, t.test_name, t.test_date, t.status, t.result, t.result_value, t.result_unit, t.normal_range_text, t.is_abnormal, t.waiting, t.result_items, " +
                          "COALESCE(p.full_name,''), COALESCE(p.patient_code,'') FROM patient_tests t LEFT JOIN patients p ON p.id = t.patient_id " +
                          (where.Count > 0 ? "WHERE " + string.Join(" AND ", where) + " " : "") +
                          "ORDER BY t.test_date, t.rowid LIMIT $limit";
        for (var n = 0; n < words.Length; n++) cmd.Parameters.AddWithValue($"$w{n}", $"%{words[n]}%");
        if (statuses is not null) { var i = 0; foreach (var s in statuses) cmd.Parameters.AddWithValue($"$s{i++}", s); }
        cmd.Parameters.AddWithValue("$limit", limit);
        var list = new List<WorklistRow>();
        using var r = cmd.ExecuteReader();
        while (r.Read()) list.Add(new WorklistRow(ReadTest(r), r.GetString(12), r.GetString(13)));
        return list;
    }

    public void ClearTestWaiting(string id)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "UPDATE patient_tests SET waiting = 0 WHERE id = $id";
        cmd.Parameters.AddWithValue("$id", id);
        cmd.ExecuteNonQuery();
    }

    public CatalogTest? FindCatalogTest(string name)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "SELECT json FROM catalog WHERE kind = 'test' AND sort = $n COLLATE NOCASE LIMIT 1";
        cmd.Parameters.AddWithValue("$n", name);
        return cmd.ExecuteScalar() is string json ? System.Text.Json.JsonSerializer.Deserialize<CatalogTest>(json) : null;
    }

    private static PatientTest ReadTest(SqliteDataReader r) => new(
        r.GetString(0), r.GetString(1), r.GetString(2), r.GetString(3), r.GetString(4),
        r.IsDBNull(5) ? null : r.GetString(5), r.IsDBNull(6) ? null : (decimal)r.GetDouble(6), r.IsDBNull(7) ? null : r.GetString(7),
        r.IsDBNull(8) ? null : r.GetString(8), r.GetInt32(9) == 1, r.GetInt32(10) == 1, r.IsDBNull(11) ? null : r.GetString(11));

    // ── bills and payments ────────────────────────────────────────────────

    public Invoice? GetInvoice(string id)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "SELECT id, invoice_number, patient_id, total_amount, paid_amount, payment_status, created_at FROM invoices WHERE id = $id";
        cmd.Parameters.AddWithValue("$id", id);
        using var r = cmd.ExecuteReader();
        return r.Read()
            ? new Invoice(r.GetString(0), r.GetString(1), r.GetString(2), (decimal)r.GetDouble(3), (decimal)r.GetDouble(4), r.IsDBNull(5) ? null : r.GetString(5), r.GetString(6))
            : null;
    }

    public void SetInvoiceNumber(string id, string number)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "UPDATE invoices SET invoice_number = $n WHERE id = $id";
        cmd.Parameters.AddWithValue("$n", number);
        cmd.Parameters.AddWithValue("$id", id);
        cmd.ExecuteNonQuery();
    }

    /// <summary>The next number for a bill made on this PC while it can't ask the server (shown as provisional).</summary>
    public string NextLocalBillNumber(DateTimeOffset now)
    {
        var day = now.ToString("yyMMdd");
        var key = $"local_bill_seq_{day}";
        var next = (int.TryParse(GetMeta(key), out var n) ? n : 0) + 1;
        SetMeta(key, next.ToString());
        return $"L-{day}-{next:0000}";
    }

    public void AddPayment(LocalPayment p)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "INSERT INTO payments (id, invoice_id, amount, method, transaction_id, notes, paid_at, synced) VALUES ($id,$inv,$amt,$m,$t,$n,$at,$s) ON CONFLICT(id) DO NOTHING";
        cmd.Parameters.AddWithValue("$id", p.Id);
        cmd.Parameters.AddWithValue("$inv", p.InvoiceId);
        cmd.Parameters.AddWithValue("$amt", (double)p.Amount);
        cmd.Parameters.AddWithValue("$m", p.Method);
        cmd.Parameters.AddWithValue("$t", (object?)p.TransactionId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$n", (object?)p.Notes ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$at", p.PaidAt);
        cmd.Parameters.AddWithValue("$s", p.Synced ? 1 : 0);
        cmd.ExecuteNonQuery();
    }

    public IReadOnlyList<LocalPayment> PaymentsFor(string invoiceId)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "SELECT id, invoice_id, amount, method, transaction_id, notes, paid_at, synced FROM payments WHERE invoice_id = $inv ORDER BY paid_at";
        cmd.Parameters.AddWithValue("$inv", invoiceId);
        var list = new List<LocalPayment>();
        using var r = cmd.ExecuteReader();
        while (r.Read())
            list.Add(new LocalPayment(r.GetString(0), r.GetString(1), (decimal)r.GetDouble(2), r.GetString(3),
                r.IsDBNull(4) ? null : r.GetString(4), r.IsDBNull(5) ? null : r.GetString(5), r.GetString(6), r.GetInt32(7) == 1));
        return list;
    }

    public void MarkPaymentSynced(string id)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "UPDATE payments SET synced = 1 WHERE id = $id";
        cmd.Parameters.AddWithValue("$id", id);
        cmd.ExecuteNonQuery();
    }

    /// <summary>Sets a bill's paid amount and the status the server would work out from it.</summary>
    public void SetInvoicePaid(string id, decimal paid)
    {
        var bill = GetInvoice(id);
        if (bill is null) return;
        var status = paid >= bill.TotalAmount ? "paid" : paid > 0 ? "partial" : "pending";
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "UPDATE invoices SET paid_amount = $p, payment_status = $s WHERE id = $id";
        cmd.Parameters.AddWithValue("$p", (double)paid);
        cmd.Parameters.AddWithValue("$s", status);
        cmd.Parameters.AddWithValue("$id", id);
        cmd.ExecuteNonQuery();
    }

    /// <summary>Payments taken on this PC that the server hasn't confirmed yet.</summary>
    public decimal UnsyncedPaymentTotal(string invoiceId)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "SELECT COALESCE(SUM(amount), 0) FROM payments WHERE invoice_id = $inv AND synced = 0";
        cmd.Parameters.AddWithValue("$inv", invoiceId);
        return Convert.ToDecimal(cmd.ExecuteScalar());
    }

    public void RemovePayment(string id)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "DELETE FROM payments WHERE id = $id";
        cmd.Parameters.AddWithValue("$id", id);
        cmd.ExecuteNonQuery();
    }

    /// <summary>Every payment in a time window with its bill and patient, oldest first.</summary>
    public IReadOnlyList<PaymentRow> PaymentsBetween(string fromIso, string toIso)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "SELECT pay.id, pay.paid_at, COALESCE(i.invoice_number,''), COALESCE(pt.full_name,''), pay.method, pay.amount, pay.synced " +
                          "FROM payments pay LEFT JOIN invoices i ON i.id = pay.invoice_id LEFT JOIN patients pt ON pt.id = i.patient_id " +
                          "WHERE pay.paid_at >= $a AND pay.paid_at < $b ORDER BY pay.paid_at";
        cmd.Parameters.AddWithValue("$a", fromIso);
        cmd.Parameters.AddWithValue("$b", toIso);
        var list = new List<PaymentRow>();
        using var r = cmd.ExecuteReader();
        while (r.Read()) list.Add(new PaymentRow(r.GetString(0), r.GetString(1), r.GetString(2), r.GetString(3), r.GetString(4), (decimal)r.GetDouble(5), r.GetInt32(6) == 1));
        return list;
    }

    /// <summary>Takings between two instants (ISO text), grouped by payment method: the daily cash book.</summary>
    public IReadOnlyList<(string Method, decimal Total, int Count)> TakingsBetween(string fromIso, string toIso)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "SELECT method, SUM(amount), COUNT(*) FROM payments WHERE paid_at >= $a AND paid_at < $b GROUP BY method ORDER BY method";
        cmd.Parameters.AddWithValue("$a", fromIso);
        cmd.Parameters.AddWithValue("$b", toIso);
        var list = new List<(string, decimal, int)>();
        using var r = cmd.ExecuteReader();
        while (r.Read()) list.Add((r.GetString(0), (decimal)r.GetDouble(1), r.GetInt32(2)));
        return list;
    }

    /// <summary>Rewrites the patient details inside visits still waiting to be sent (a new patient travels with its visit).</summary>
    public void UpdateWaitingVisitPatient(string patientId, string name, string phone, string? gender, string? dob, IReadOnlyList<string> phoneVariants)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = """
            UPDATE outbox SET payload = json_set(payload,
                '$.patient.new.full_name', $n, '$.patient.new.phone', $p, '$.patient.new.gender', $g,
                '$.patient.new.date_of_birth', $d, '$.patient.new.phone_variants', json($v),
                '$.patient.new.no_phone', json($nophone), '$.patient.new.allow_duplicate_phone', json('true'))
            WHERE kind = 'visit' AND status = 'pending' AND json_extract(payload, '$.patient.new.id') = $id
            """;
        cmd.Parameters.AddWithValue("$n", name);
        cmd.Parameters.AddWithValue("$p", phone);
        cmd.Parameters.AddWithValue("$g", (object?)gender ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$d", (object?)dob ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$v", System.Text.Json.JsonSerializer.Serialize(phoneVariants));
        cmd.Parameters.AddWithValue("$nophone", phone.Length == 0 ? "true" : "false");
        cmd.Parameters.AddWithValue("$id", patientId);
        cmd.ExecuteNonQuery();
    }

    /// <summary>True when an edit of this patient is still waiting to be sent (so newer server data must not overwrite it).</summary>
    public bool HasWaitingPatientEdit(string patientId)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "SELECT COUNT(*) FROM outbox WHERE kind = 'patient' AND status IN ('pending','syncing') AND json_extract(payload, '$.id') = $id";
        cmd.Parameters.AddWithValue("$id", patientId);
        return (long)cmd.ExecuteScalar()! > 0;
    }

    /// <summary>Everything waiting to be sent or refused (not finished ones), failed first.</summary>
    public IReadOnlyList<OutboxEntry> ListOutbox()
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "SELECT visit_id, kind, status, attempts, last_error, patient_name, updated_at FROM outbox WHERE status <> 'done' ORDER BY CASE status WHEN 'failed' THEN 0 ELSE 1 END, created_at";
        var list = new List<OutboxEntry>();
        using var r = cmd.ExecuteReader();
        while (r.Read())
            list.Add(new OutboxEntry(r.GetString(0), r.GetString(1), r.GetString(2), r.GetInt32(3), r.IsDBNull(4) ? null : r.GetString(4), r.GetString(5), r.GetInt64(6).ToString()));
        return list;
    }

    /// <summary>Puts a refused item back in the queue to be sent again (after the cause has been fixed).</summary>
    public void RetryOutboxEntry(string id)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "UPDATE outbox SET status = 'pending', attempts = 0, updated_at = $now WHERE visit_id = $id AND status = 'failed'";
        cmd.Parameters.AddWithValue("$id", id);
        cmd.Parameters.AddWithValue("$now", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        cmd.ExecuteNonQuery();
    }

    public string? GetOutboxPayload(string id)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "SELECT payload FROM outbox WHERE visit_id = $id";
        cmd.Parameters.AddWithValue("$id", id);
        return cmd.ExecuteScalar() as string;
    }

    public void DeleteOutboxEntry(string id)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "DELETE FROM outbox WHERE visit_id = $id";
        cmd.Parameters.AddWithValue("$id", id);
        cmd.ExecuteNonQuery();
    }

    /// <summary>Removes a bill and everything that hung off it on this PC (its tests, payments and their waiting items).</summary>
    public void DeleteLocalVisit(string visitId, IEnumerable<string> testIds)
    {
        InTransaction(() =>
        {
            foreach (var testId in testIds)
            {
                Run("DELETE FROM patient_tests WHERE id = $a", testId);
                Run("DELETE FROM outbox WHERE kind = 'result' AND json_extract(payload, '$.id') = $a", testId);
            }
            Run("DELETE FROM outbox WHERE kind = 'payment' AND json_extract(payload, '$.invoice_id') = $a", visitId);
            Run("DELETE FROM payments WHERE invoice_id = $a", visitId);
            Run("DELETE FROM invoices WHERE id = $a", visitId);
            Run("DELETE FROM outbox WHERE visit_id = $a", visitId);
        });
    }

    /// <summary>True when something other than this visit still refers to the patient.</summary>
    public bool PatientIsStillUsed(string patientId, string exceptVisitId)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = """
            SELECT (SELECT COUNT(*) FROM invoices WHERE patient_id = $p AND id <> $v)
                 + (SELECT COUNT(*) FROM patient_tests WHERE patient_id = $p)
                 + (SELECT COUNT(*) FROM outbox WHERE kind = 'visit' AND visit_id <> $v AND status <> 'done' AND json_extract(payload, '$.patient.new.id') = $p)
            """;
        cmd.Parameters.AddWithValue("$p", patientId);
        cmd.Parameters.AddWithValue("$v", exceptVisitId);
        return Convert.ToInt64(cmd.ExecuteScalar()) > 0;
    }

    private void Run(string sql, string a)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = sql;
        cmd.Parameters.AddWithValue("$a", a);
        cmd.ExecuteNonQuery();
    }

    public void DeletePatient(string id)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "DELETE FROM patients WHERE id = $id";
        cmd.Parameters.AddWithValue("$id", id);
        cmd.ExecuteNonQuery();
    }

    private static OutboxItem ReadOutbox(SqliteDataReader r) =>
        new(r.GetString(0), r.GetString(1), r.GetString(2), r.GetInt32(3), r.IsDBNull(4) ? null : r.GetString(4), r.GetString(5), (decimal)r.GetDouble(6), r.GetString(7));

    private void Exec(string sql)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = sql;
        cmd.ExecuteNonQuery();
    }

    public void Dispose() => _db.Dispose();
}
