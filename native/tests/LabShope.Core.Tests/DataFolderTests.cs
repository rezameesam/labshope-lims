namespace LabShope.Core.Tests;

public class DataFolderTests : IDisposable
{
    private readonly string _home = Path.Combine(Path.GetTempPath(), $"labshope-home-{Guid.NewGuid():N}");

    [Fact]
    public void UsesTheAppDataFolderWhenTheSystemGivesOne()
    {
        var appData = Path.Combine(_home, "AppData");
        Assert.Equal(Path.Combine(appData, "LabShope"), DataFolder.Resolve(appData, _home));
    }

    [Theory]
    [InlineData("")]     // a Mac without ~/.config: .NET hands back an empty string
    [InlineData(null)]
    [InlineData("relative")]
    public void NeverFallsBackToARelativeFolder(string? appData)
    {
        var dir = DataFolder.Resolve(appData, _home);
        Assert.True(Path.IsPathRooted(dir));
        Assert.Equal(Path.Combine(_home, ".config", "LabShope"), dir);
    }

    [Fact]
    public void WithNoHomeFolderItStillPicksAnAbsoluteFolder() =>
        Assert.True(Path.IsPathRooted(DataFolder.Resolve("", "")));

    [Fact]
    public void CurrentIsAlwaysAbsolute() => Assert.True(Path.IsPathRooted(DataFolder.Current()));

    [Fact]
    public void MovesDataLeftInTheHomeFolderToTheRightPlace()
    {
        var legacy = Path.Combine(_home, "LabShope");
        Directory.CreateDirectory(legacy);
        File.WriteAllText(Path.Combine(legacy, "instance.lock"), "");
        File.WriteAllText(Path.Combine(legacy, "lims-org1.db"), "data");
        var target = DataFolder.Resolve("", _home);

        Assert.True(DataFolder.AdoptLegacy(target, _home));

        Assert.False(Directory.Exists(legacy));
        Assert.Equal("data", File.ReadAllText(Path.Combine(target, "lims-org1.db")));
    }

    [Fact]
    public void LeavesAFolderThatIsNotTheAppsAlone()
    {
        var legacy = Path.Combine(_home, "LabShope");
        Directory.CreateDirectory(legacy);
        File.WriteAllText(Path.Combine(legacy, "notes.txt"), "mine");

        Assert.False(DataFolder.AdoptLegacy(DataFolder.Resolve("", _home), _home));
        Assert.True(File.Exists(Path.Combine(legacy, "notes.txt")));
    }

    [Fact]
    public void NeverOverwritesDataAlreadyInTheRightPlace()
    {
        var legacy = Path.Combine(_home, "LabShope");
        Directory.CreateDirectory(legacy);
        File.WriteAllText(Path.Combine(legacy, "instance.lock"), "");
        File.WriteAllText(Path.Combine(legacy, "account.json"), "old");
        var target = DataFolder.Resolve("", _home);
        Directory.CreateDirectory(target);
        File.WriteAllText(Path.Combine(target, "account.json"), "new");

        Assert.False(DataFolder.AdoptLegacy(target, _home));
        Assert.Equal("new", File.ReadAllText(Path.Combine(target, "account.json")));
        Assert.True(Directory.Exists(legacy));
    }

    [Fact]
    public void TheOverrideVariableWins()
    {
        var before = Environment.GetEnvironmentVariable(DataFolder.OverrideVariable);
        try
        {
            Environment.SetEnvironmentVariable(DataFolder.OverrideVariable, _home);
            Assert.Equal(_home, DataFolder.Current());
            Environment.SetEnvironmentVariable(DataFolder.OverrideVariable, "relative"); // ignored: it would depend on the start folder again
            Assert.NotEqual("relative", DataFolder.Current());
        }
        finally { Environment.SetEnvironmentVariable(DataFolder.OverrideVariable, before); }
    }

    public void Dispose() { try { Directory.Delete(_home, true); } catch { } }
}
