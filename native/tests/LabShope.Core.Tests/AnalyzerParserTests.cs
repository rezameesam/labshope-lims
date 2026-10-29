using LabShope.Core.Analyzers;

namespace LabShope.Core.Tests;

public class AnalyzerParserTests
{
    // What a hematology analyzer sends over ASTM: header, patient, order (sample id), results, end.
    private const string Astm =
        "H|\\^&|||BC-5000|||||LIS||P|1|20261029120000\r" +
        "P|1||||Rao^Asha||19900501|F\r" +
        "O|1|IRM-0007||^^^CBC|R|20261029115900\r" +
        "R|1|^^^WBC^White cells|6.1|10^9/L|3.5-10.0|N||F\r" +
        "R|2|^^^HGB^Haemoglobin|9.8|g/dL|11.5-16.5|L||F\r" +
        "R|3|^^^PLT^Platelets|250|10^9/L|100-400|N||F\r" +
        "L|1|N\r";

    [Fact]
    public void ReadsAnAstmMessageIntoSampleAndParameters()
    {
        var result = AstmParser.Parse(Astm).Single();

        Assert.Equal(("IRM-0007", "ASTM"), (result.SampleId, result.Protocol));
        Assert.Equal("Asha Rao", result.PatientName);
        Assert.Equal(["WBC", "HGB", "PLT"], result.Parameters.Select(p => p.Code));
        var hgb = result.Parameters[1];
        Assert.Equal(("Haemoglobin", "9.8", "g/dL", "11.5-16.5", "L"), (hgb.Name, hgb.Value, hgb.Unit, hgb.Reference, hgb.Flag));
        Assert.True(hgb.FlaggedAbnormal);
        Assert.False(result.Parameters[0].FlaggedAbnormal); // N means normal
    }

    [Fact]
    public void SeveralSamplesInOneAstmTransmissionStaySeparate()
    {
        var text = "H|\\^&\rP|1\rO|1|S1\rR|1|^^^HGB|12|g/dL\rP|2\rO|1|S2\rR|1|^^^HGB|14|g/dL\rL|1\r";
        var results = AstmParser.Parse(text);
        Assert.Equal([("S1", "12"), ("S2", "14")], results.Select(r => (r.SampleId, r.Parameters.Single().Value)));
    }

    [Fact]
    public void AstmIsForgivingAboutFrameNumbersAndMissingFields()
    {
        var result = AstmParser.Parse("1H|\\^&\r2O|1|X9\r3R|1|WBC|7.0\r4L|1\r").Single(); // frame digits glued on, no unit/range/flag, code in the first component
        Assert.Equal(("X9", "WBC", "7.0", null, null), (result.SampleId, result.Parameters[0].Code, result.Parameters[0].Value, result.Parameters[0].Unit, result.Parameters[0].Flag));
    }

    [Fact]
    public void ChecksumMatchesTheStandardsWorkedExample()
    {
        // Frame "1H|\^&|||...\r\u0003": the sum of every byte from the frame number to ETX, low 8 bits, two hex digits.
        var body = "1H|\\^&\r\u0003";
        var expected = (body.Sum(c => (int)c) & 0xFF).ToString("X2");
        Assert.Equal(expected, AstmParser.Checksum(body));
        Assert.Equal(2, AstmParser.Checksum(body).Length);
    }

    private const string Hl7 =
        "MSH|^~\\&|BC-6800|LAB|LIS|HOSP|20261029120000||ORU^R01|MSG0001|P|2.3.1\r" +
        "PID|1||PAT1||Rao^Asha||19900501|F\r" +
        "OBR|1||IRM-0007|CBC^Complete Blood Count|||20261029115900\r" +
        "OBX|1|NM|WBC^White cells||6.1|10^9/L|3.5-10.0|N|||F\r" +
        "OBX|2|NM|HGB^Haemoglobin||9.8|g/dL|11.5-16.5|L|||F\r";

    [Fact]
    public void ReadsAnHl7MessageUsingTheOrderNumberAsTheSampleId()
    {
        var result = Hl7Parser.Parse(Hl7).Single();

        Assert.Equal(("IRM-0007", "HL7", "Asha Rao"), (result.SampleId, result.Protocol, result.PatientName));
        Assert.Equal(["WBC", "HGB"], result.Parameters.Select(p => p.Code));
        Assert.Equal(("9.8", "g/dL", "11.5-16.5", "L"), (result.Parameters[1].Value, result.Parameters[1].Unit, result.Parameters[1].Reference, result.Parameters[1].Flag));
    }

    [Fact]
    public void Hl7FallsBackToThePlacerNumberThenThePatientId()
    {
        var placer = Hl7Parser.Parse("MSH|^~\\&|X\rOBR|1|PLC-5|\rOBX|1|NM|HGB^Hb||12|g/dL\r").Single();
        Assert.Equal("PLC-5", placer.SampleId);
        var patient = Hl7Parser.Parse("MSH|^~\\&|X\rPID|1||PAT77\rOBX|1|NM|HGB^Hb||12|g/dL\r").Single();
        Assert.Equal("PAT77", patient.SampleId);
    }

    [Fact]
    public void BuildsTheAcknowledgementTheMachineWaitsFor()
    {
        var ack = Hl7Parser.BuildAck(Hl7, new DateTimeOffset(2026, 10, 29, 12, 0, 5, TimeSpan.Zero));
        Assert.Contains("MSA|AA|MSG0001", ack);
        Assert.StartsWith("MSH|^~\\&|LABSHOPE|LAB|BC-6800|LAB|20261029120005||ACK^R01|MSG0001", ack);
    }

    [Fact]
    public void NoResultsInAMessageMeansNothingIsReturned()
    {
        Assert.Empty(Hl7Parser.Parse("MSH|^~\\&|X\rPID|1||P1\r"));
        Assert.Empty(AstmParser.Parse("H|\\^&\rL|1\r"));
        Assert.Empty(AstmParser.Parse(""));
    }
}
