using System.Text;

namespace LabShope.Core.Analyzers;

/// <summary>
/// One conversation with a machine. Bytes go in as they arrive (from a network socket or a serial cable); the bytes that must be sent
/// back (acknowledgements) come out, and completed results are reported through <see cref="ResultsReceived"/>.
/// No sockets in here, so every handshake can be tested with plain byte arrays.
/// </summary>
public abstract class InstrumentSession
{
    /// <summary>No real result message is anywhere near this big; a sender that never finishes must not fill the computer's memory.</summary>
    public const int MaxMessageBytes = 1_000_000;

    public event Action<IReadOnlyList<InstrumentResult>>? ResultsReceived;

    /// <summary>Feed received bytes; returns what to send back to the machine (possibly nothing).</summary>
    public abstract byte[] Feed(ReadOnlySpan<byte> data);

    protected void Report(IReadOnlyList<InstrumentResult> results)
    {
        if (results.Count > 0) ResultsReceived?.Invoke(results);
    }
}

/// <summary>ASTM E1381 low-level handshake: ENQ -> ACK, then numbered frames (each checked and acknowledged), then EOT.</summary>
public sealed class AstmSession : InstrumentSession
{
    public const byte Stx = 0x02, Etx = 0x03, Eot = 0x04, Enq = 0x05, Ack = 0x06, Nak = 0x15, Etb = 0x17, Cr = 0x0D, Lf = 0x0A;

    private readonly StringBuilder _message = new();
    private readonly List<byte> _frame = [];
    private bool _overflow;
    private bool _inFrame;

    public override byte[] Feed(ReadOnlySpan<byte> data)
    {
        var reply = new List<byte>();
        foreach (var b in data)
        {
            if (_inFrame)
            {
                _frame.Add(b);
                if (_frame.Count > InstrumentSession.MaxMessageBytes) { _frame.Clear(); _inFrame = false; _overflow = true; _message.Clear(); continue; } // a runaway sender
                if (b == Lf && _frame.Count >= 4 && _frame[^2] == Cr) { reply.Add(CompleteFrame()); _inFrame = false; }
                continue;
            }

            switch (b)
            {
                case Enq: _message.Clear(); _overflow = false; reply.Add(Ack); break;
                case Stx: _inFrame = true; _frame.Clear(); break;
                case Eot:
                    if (_message.Length > 0 && !_overflow) Report(AstmParser.Parse(_message.ToString()));
                    _message.Clear();
                    break;
            }
        }
        return reply.ToArray();
    }

    /// <summary>Checks a finished frame (FN text ETX/ETB C1 C2 CR LF); returns ACK when the checksum is right, otherwise NAK so the machine resends.</summary>
    private byte CompleteFrame()
    {
        // _frame = FN ... ETX|ETB C1 C2 CR LF
        var end = _frame.FindLastIndex(x => x is Etx or Etb);
        if (end < 1 || _frame.Count < end + 5) return Nak;

        var body = _frame.Take(end + 1).ToArray();
        var sent = Encoding.ASCII.GetString(_frame.Skip(end + 1).Take(2).ToArray());
        if (!string.Equals(sent, AstmParser.Checksum(Encoding.ASCII.GetString(body)), StringComparison.OrdinalIgnoreCase)) return Nak;

        if (_message.Length + body.Length > InstrumentSession.MaxMessageBytes) { _overflow = true; _message.Clear(); return Nak; }
        _message.Append(Encoding.ASCII.GetString(body, 1, body.Length - 2)); // drop the frame number and ETX/ETB
        return Ack;
    }
}

/// <summary>HL7 over MLLP: each message is wrapped in VT ... FS CR; we answer every message with an HL7 acknowledgement.</summary>
public sealed class MllpSession : InstrumentSession
{
    public const byte Vt = 0x0B, Fs = 0x1C, Cr = 0x0D;

    private readonly Func<DateTimeOffset> _now;
    private readonly List<byte> _buffer = [];
    private bool _inMessage, _afterFs;

    public MllpSession(Func<DateTimeOffset>? now = null) => _now = now ?? (() => DateTimeOffset.UtcNow);

    public override byte[] Feed(ReadOnlySpan<byte> data)
    {
        var reply = new List<byte>();
        foreach (var b in data)
        {
            if (!_inMessage)
            {
                if (b == Vt) { _inMessage = true; _afterFs = false; _buffer.Clear(); }
                continue; // anything between messages is ignored
            }

            if (b == Fs) { _afterFs = true; continue; }
            if (_afterFs && b == Cr)
            {
                var text = Encoding.UTF8.GetString(_buffer.ToArray());
                _inMessage = false; _afterFs = false;
                Report(Hl7Parser.Parse(text));
                reply.AddRange(Wrap(Hl7Parser.BuildAck(text, _now())));
                continue;
            }
            _afterFs = false;
            if (_buffer.Count >= InstrumentSession.MaxMessageBytes) { _inMessage = false; _buffer.Clear(); continue; } // a runaway sender: drop the message
            _buffer.Add(b);
        }
        return reply.ToArray();
    }

    private static byte[] Wrap(string message) => [Vt, .. Encoding.UTF8.GetBytes(message), Fs, Cr];
}

/// <summary>Works out the protocol from the first byte the machine sends (ENQ or STX = ASTM, VT = HL7).</summary>
public sealed class AutoSession : InstrumentSession
{
    private InstrumentSession? _inner;
    private readonly Func<DateTimeOffset> _now;

    public AutoSession(Func<DateTimeOffset>? now = null) => _now = now ?? (() => DateTimeOffset.UtcNow);

    public string? Protocol => _inner switch { AstmSession => "ASTM", MllpSession => "HL7", _ => null };

    public override byte[] Feed(ReadOnlySpan<byte> data)
    {
        if (_inner is null)
        {
            if (data.Length == 0) return [];
            _inner = data[0] switch
            {
                AstmSession.Enq or AstmSession.Stx or AstmSession.Eot => new AstmSession(),
                MllpSession.Vt => new MllpSession(_now),
                _ => null,
            };
            if (_inner is null) return []; // noise: wait for something we recognise
            _inner.ResultsReceived += Report;
        }
        return _inner.Feed(data);
    }
}
