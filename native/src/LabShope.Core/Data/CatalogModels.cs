namespace LabShope.Core.Data;

public sealed record CatalogTest(
    string Id, string? TestCode, string Name, decimal Price, string? CategoryId,
    string? Unit = null, string? NormalRangeText = null, decimal? NormalMin = null, decimal? NormalMax = null)
{
    /// <summary>The range as shown in a list: the written range if there is one, otherwise min - max.</summary>
    public string Range => !string.IsNullOrWhiteSpace(NormalRangeText) ? NormalRangeText! : NormalMin is { } lo && NormalMax is { } hi ? $"{lo:0.##} - {hi:0.##}" : "";
}
public sealed record TestPackage(string Id, string Name, decimal Price, IReadOnlyList<string> TestIds)
{
    public int TestCount => TestIds.Count;
}
public sealed record Doctor(string Id, string Name, string? Specialization, decimal CommissionPercentage);
public sealed record LabRef(string Id, string Name, string LabCode);
public sealed record CenterRef(string Id, string Name, string Code, string LabId);

/// <summary>Everything the front desk picks from, copied to the PC so registration never waits on the network.</summary>
public sealed record Catalog(
    IReadOnlyList<CatalogTest> Tests,
    IReadOnlyList<TestPackage> Packages,
    IReadOnlyList<Doctor> Doctors,
    IReadOnlyList<LabRef> Labs,
    IReadOnlyList<CenterRef> Centers,
    IReadOnlyList<TestCategory>? Categories = null,
    IReadOnlyList<ReportTemplate>? Templates = null)
{
    public IReadOnlyList<TestCategory> CategoryList => Categories ?? [];
    public IReadOnlyList<ReportTemplate> TemplateList => Templates ?? [];
}

public sealed record TestCategory(string Id, string Name);

/// <summary>The lab's report layout settings (the website's Templates tab): header and footer text with {markers}, and what to show.</summary>
public sealed record ReportTemplate(
    string Id, string Name, string? OrganizationId, string? TestCategory, string? TestId,
    string? HeaderTemplate, string? FooterTemplate, string ResultFormat,
    bool IncludeNormalRange, bool IncludeAbnormalFlag, bool IncludeNotes, bool IsDefault);

/// <summary>A member of staff, as shown on the Team tab (read from the server).</summary>
public sealed record TeamMember(string Id, string EmployeeId, string FullName, string? Email, string? Phone, string? Designation, string? Department, string? LabId, bool IsActive)
{
    public string Status => IsActive ? "active" : "inactive";
}
