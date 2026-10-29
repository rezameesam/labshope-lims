using System;
using Avalonia.Controls;
using LabShope.Core.Data;

namespace LabShope.App;

public partial class BillsView : UserControl
{
    private readonly LocalStore _store;

    public BillsView() => throw new InvalidOperationException("Use the constructor with a store.");

    public BillsView(LocalStore store)
    {
        _store = store;
        InitializeComponent();
        SearchBox.TextChanged += (_, _) => Refresh();
        Refresh();
    }

    public void Refresh()
    {
        var rows = _store.SearchInvoices(SearchBox.Text ?? "");
        Grid.ItemsSource = rows;
        CountText.Text = $"{rows.Count} shown of {_store.InvoiceCount()}";
    }
}
