using System;
using LabShope.Core.Account;
using LabShope.Core.Data;
using LabShope.Core.Sync;

namespace LabShope.App;

/// <summary>Everything a signed-in lab needs: its local database, sync, and who is signed in.</summary>
public sealed class AppSession : IDisposable
{
    public Workspace Workspace { get; }
    public LocalStore Store { get; }
    public SyncRunner Sync { get; }
    public AccountService Account { get; }
    public LabShope.Core.Net.SupabaseApi? Api { get; }

    public AppSession(Workspace workspace, LocalStore store, SyncRunner sync, AccountService account, LabShope.Core.Net.SupabaseApi? api = null)
    {
        Api = api;
        Workspace = workspace;
        Store = store;
        Sync = sync;
        Account = account;
    }

    public void Dispose() => Store.Dispose();
}
