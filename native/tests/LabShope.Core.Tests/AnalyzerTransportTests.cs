using System.Net.Sockets;
using System.Text;
using LabShope.Core.Analyzers;

namespace LabShope.Core.Tests;

public class AnalyzerTransportTests
{
    private const byte Stx = 0x02, Etx = 0x03, Eot = 0x04, Enq = 0x05, Ack = 0x06, Nak = 0x15, Vt = 0x0B, Fs = 0x1C, Cr = 0x0D;

    /// <summary>A real ASTM frame: STX, frame number, text, ETX, two-digit checksum, CR LF.</summary>
    private static byte[] Frame(int number, string text, bool corrupt = false)
    {
        var body = $"{number % 8}{text}\u0003";
        var checksum = AstmParser.Checksum(body);
        if (corrupt) checksum = checksum == "00" ? "01" : "00";
        return [Stx, .. Encoding.ASCII.GetBytes(body), .. Encoding.ASCII.GetBytes(checksum), Cr, 0x0A];
    }

    private static readonly string[] AstmRecords =
    [
        "H|\\^&|||BC-5000\r", "P|1||||Rao^Asha\r", "O|1|IRM-0007||^^^CBC\r",
        "R|1|^^^HGB^Haemoglobin|9.8|g/dL|11.5-16.5|L||F\r", "R|2|^^^WBC^White cells|6.1|10^9/L|3.5-10.0|N||F\r", "L|1|N\r",
    ];

    [Fact]
    public void AstmHandshakeAcknowledgesEveryGoodFrameAndDeliversTheResultAtEndOfTransmission()
    {
        var session = new AstmSession();
        var got = new List<InstrumentResult>();
        session.ResultsReceived += r => got.AddRange(r);

        Assert.Equal([Ack], session.Feed([Enq]));
        for (var i = 0; i < AstmRecords.Length; i++)
            Assert.Equal([Ack], session.Feed(Frame(i + 1, AstmRecords[i])));
        Assert.Empty(got); // nothing is final until the machine says it is done
        Assert.Empty(session.Feed([Eot]));

        var result = got.Single();
        Assert.Equal("IRM-0007", result.SampleId);
        Assert.Equal(["HGB", "WBC"], result.Parameters.Select(p => p.Code));
    }

    [Fact]
    public void ABadChecksumIsRefusedSoTheMachineSendsTheFrameAgain()
    {
        var session = new AstmSession();
        var got = new List<InstrumentResult>();
        session.ResultsReceived += r => got.AddRange(r);
        session.Feed([Enq]);

        Assert.Equal([Nak], session.Feed(Frame(1, AstmRecords[0], corrupt: true)));
        Assert.Equal([Ack], session.Feed(Frame(1, AstmRecords[0])));      // the resend
        for (var i = 1; i < AstmRecords.Length; i++) session.Feed(Frame(i + 1, AstmRecords[i]));
        session.Feed([Eot]);

        Assert.Single(got); // the corrupted copy did not add anything twice
    }

    [Fact]
    public void AFrameArrivingInSmallPiecesIsStillHandled()
    {
        var session = new AstmSession();
        var got = new List<InstrumentResult>();
        session.ResultsReceived += r => got.AddRange(r);
        var stream = new List<byte> { Enq };
        for (var i = 0; i < AstmRecords.Length; i++) stream.AddRange(Frame(i + 1, AstmRecords[i]));
        stream.Add(Eot);

        var acks = new List<byte>();
        foreach (var b in stream) acks.AddRange(session.Feed([b])); // one byte at a time, like a slow serial cable

        Assert.Equal(1 + AstmRecords.Length, acks.Count(x => x == Ack));
        Assert.Single(got);
    }

    private static byte[] Mllp(string message) => [Vt, .. Encoding.UTF8.GetBytes(message), Fs, Cr];

    private const string Hl7 = "MSH|^~\\&|BC-6800|LAB|LIS|HOSP|20261029120000||ORU^R01|MSG1|P|2.3.1\rPID|1||PAT1||Rao^Asha\rOBR|1||IRM-0007\rOBX|1|NM|HGB^Haemoglobin||9.8|g/dL|11.5-16.5|L|||F\r";

    [Fact]
    public void Hl7MessagesAreAnsweredWithAnAcknowledgementAndDelivered()
    {
        var session = new MllpSession(() => new DateTimeOffset(2026, 10, 29, 12, 0, 5, TimeSpan.Zero));
        var got = new List<InstrumentResult>();
        session.ResultsReceived += r => got.AddRange(r);

        var reply = session.Feed(Mllp(Hl7));

        Assert.Equal(Vt, reply[0]);
        Assert.Equal([Fs, Cr], reply[^2..]);
        Assert.Contains("MSA|AA|MSG1", Encoding.UTF8.GetString(reply));
        Assert.Equal("IRM-0007", got.Single().SampleId);
    }

    [Fact]
    public void TwoHl7MessagesBackToBackAreBothHandled()
    {
        var session = new MllpSession();
        var got = new List<InstrumentResult>();
        session.ResultsReceived += r => got.AddRange(r);
        session.Feed([.. Mllp(Hl7), .. Mllp(Hl7.Replace("IRM-0007", "IRM-0008").Replace("MSG1", "MSG2"))]);
        Assert.Equal(["IRM-0007", "IRM-0008"], got.Select(r => r.SampleId));
    }

    [Fact]
    public void TheProtocolIsRecognisedFromTheFirstByte()
    {
        var astm = new AutoSession(); Assert.Equal([Ack], astm.Feed([Enq])); Assert.Equal("ASTM", astm.Protocol);
        var hl7 = new AutoSession(); hl7.Feed(Mllp(Hl7)); Assert.Equal("HL7", hl7.Protocol);
        var noise = new AutoSession(); Assert.Empty(noise.Feed([0x00, 0x7F])); Assert.Null(noise.Protocol);
    }

    // ── a real network listener with a pretend analyzer connecting to it ─────────────────

    private static async Task<byte[]> ReadAtLeast(NetworkStream s, int count)
    {
        var buf = new byte[count]; var got = 0;
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        while (got < count) got += await s.ReadAsync(buf.AsMemory(got), cts.Token);
        return buf;
    }

    [Fact]
    public void ASenderThatNeverStopsIsCutOffInsteadOfFillingMemory()
    {
        var results = 0;

        var hl7 = new MllpSession();
        hl7.ResultsReceived += _ => results++;
        hl7.Feed([Vt]);
        for (var i = 0; i < 300; i++) hl7.Feed(new byte[10_000].Select(_ => (byte)'A').ToArray()); // 3 MB and no end of message
        Assert.Equal(0, results);
        hl7.Feed(Mllp(Hl7).AsSpan(0)); // and the next proper message still works
        Assert.Equal(1, results);

        var astm = new AstmSession();
        astm.ResultsReceived += _ => results++;
        astm.Feed([Enq]);
        astm.Feed([Stx]);
        for (var i = 0; i < 300; i++) astm.Feed(new byte[10_000].Select(_ => (byte)'B').ToArray()); // a frame that never ends
        astm.Feed([Eot]);
        Assert.Equal(1, results); // nothing was reported from the runaway
    }

    [Fact]
    public async Task OnlyListedAddressesMayConnectWhenAnAllowListIsSet()
    {
        using var server = new AnalyzerServer(0) { AllowedAddresses = [System.Net.IPAddress.Parse("10.99.99.99")] };
        var received = 0;
        server.ResultReceived += _ => Interlocked.Increment(ref received);
        server.Start();

        using var stranger = new TcpClient("127.0.0.1", server.Port);
        var net = stranger.GetStream();
        try { await net.WriteAsync(Mllp(Hl7)); } catch (IOException) { }
        await Task.Delay(300);
        Assert.Equal(0, received); // refused: this machine is not on the list
    }

    [Fact]
    public async Task ANetworkAnalyzerCanSendAnAstmResultAndAnHl7ResultToTheListener()
    {
        using var server = new AnalyzerServer(0);
        var received = new List<InstrumentResult>();
        server.ResultReceived += r => { lock (received) received.Add(r); };
        server.Start();

        // ASTM machine
        using (var astm = new TcpClient("127.0.0.1", server.Port))
        {
            var net = astm.GetStream();
            await net.WriteAsync(new byte[] { Enq });
            Assert.Equal(Ack, (await ReadAtLeast(net, 1))[0]);
            for (var i = 0; i < AstmRecords.Length; i++)
            {
                await net.WriteAsync(Frame(i + 1, AstmRecords[i]));
                Assert.Equal(Ack, (await ReadAtLeast(net, 1))[0]);
            }
            await net.WriteAsync(new byte[] { Eot });
        }

        // HL7 machine
        using (var hl7 = new TcpClient("127.0.0.1", server.Port))
        {
            var net = hl7.GetStream();
            await net.WriteAsync(Mllp(Hl7.Replace("IRM-0007", "IRM-0009")));
            var reply = await ReadAtLeast(net, 10);
            Assert.Equal(Vt, reply[0]);
        }

        for (var i = 0; i < 50 && received.Count < 2; i++) await Task.Delay(50);
        lock (received) Assert.Equal(["ASTM:IRM-0007", "HL7:IRM-0009"], received.Select(r => $"{r.Protocol}:{r.SampleId}").OrderBy(x => x));
    }
}
