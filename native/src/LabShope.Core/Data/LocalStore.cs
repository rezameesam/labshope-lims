using Microsoft.Data.Sqlite;

namespace LabShope.Core.Data;

/// <summary>
/// The lab's local database (one SQLite file per organisation). Every screen reads from here, so the
/// app is fast and works offline; sync fills it from the server and sends local changes back.
/// </summary>
public sealed record OutboxItem(string VisitId, string PayloadJson, string Status, int Attempts, string? LastError, string PatientName, decimal TotalAmount);

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
            CREATE TABLE IF NOT EXISTS outbox (
              visit_id TEXT PRIMARY KEY, payload TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
              last_error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
              patient_name TEXT NOT NULL, total_amount REAL NOT NULL, result TEXT);
            CREATE INDEX IF NOT EXISTS ix_outbox_status ON outbox(status, created_at);
            """);
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
        return invoice is not null
            ? new ScanMatch.FoundInvoice(invoice, GetPatient(invoice.PatientId))
            : new ScanMatch.NotFound(code);
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

    /// <summary>Runs several writes as one all-or-nothing, much faster than separate commits.</summary>
    public void InTransaction(Action work)
    {
        using var tx = _db.BeginTransaction();
        try { work(); tx.Commit(); }
        catch { tx.Rollback(); throw; }
    }

    // ── outbox ─────────────────────────────────────────────────────────────

    public void EnqueueVisit(OutboxItem item)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = """
            INSERT INTO outbox (visit_id, payload, status, attempts, last_error, created_at, updated_at, patient_name, total_amount, result)
            VALUES ($id, $payload, 'pending', 0, NULL, $now, $now, $name, $total, NULL)
            ON CONFLICT(visit_id) DO NOTHING;
            """;
        cmd.Parameters.AddWithValue("$id", item.VisitId);
        cmd.Parameters.AddWithValue("$payload", item.PayloadJson);
        cmd.Parameters.AddWithValue("$now", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        cmd.Parameters.AddWithValue("$name", item.PatientName);
        cmd.Parameters.AddWithValue("$total", (double)item.TotalAmount);
        cmd.ExecuteNonQuery();
    }

    public OutboxItem? NextPendingVisit()
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "SELECT visit_id, payload, status, attempts, last_error, patient_name, total_amount FROM outbox WHERE status = 'pending' ORDER BY created_at LIMIT 1";
        using var r = cmd.ExecuteReader();
        return r.Read() ? ReadOutbox(r) : null;
    }

    public OutboxItem? GetVisit(string visitId)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "SELECT visit_id, payload, status, attempts, last_error, patient_name, total_amount FROM outbox WHERE visit_id = $id";
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

    public void DeletePatient(string id)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "DELETE FROM patients WHERE id = $id";
        cmd.Parameters.AddWithValue("$id", id);
        cmd.ExecuteNonQuery();
    }

    private static OutboxItem ReadOutbox(SqliteDataReader r) =>
        new(r.GetString(0), r.GetString(1), r.GetString(2), r.GetInt32(3), r.IsDBNull(4) ? null : r.GetString(4), r.GetString(5), (decimal)r.GetDouble(6));

    private void Exec(string sql)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = sql;
        cmd.ExecuteNonQuery();
    }

    public void Dispose() => _db.Dispose();
}
