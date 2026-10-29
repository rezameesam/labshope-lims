namespace LabShope.Core.Data;

public sealed record CatalogTest(string Id, string? TestCode, string Name, decimal Price, string? CategoryId);
public sealed record TestPackage(string Id, string Name, decimal Price, IReadOnlyList<string> TestIds);
public sealed record Doctor(string Id, string Name, string? Specialization, decimal CommissionPercentage);
public sealed record LabRef(string Id, string Name, string LabCode);
public sealed record CenterRef(string Id, string Name, string Code, string LabId);

/// <summary>Everything the front desk picks from, copied to the PC so registration never waits on the network.</summary>
public sealed record Catalog(
    IReadOnlyList<CatalogTest> Tests,
    IReadOnlyList<TestPackage> Packages,
    IReadOnlyList<Doctor> Doctors,
    IReadOnlyList<LabRef> Labs,
    IReadOnlyList<CenterRef> Centers);
