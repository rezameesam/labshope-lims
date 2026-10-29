using LabShope.Core.Net;

namespace LabShope.Core.Tests;

public class ErrorClassifierTests
{
    [Theory]
    [InlineData(500, null, ErrorKind.Transient)]
    [InlineData(503, null, ErrorKind.Transient)]
    [InlineData(408, null, ErrorKind.Transient)]
    [InlineData(425, null, ErrorKind.Transient)]
    [InlineData(429, null, ErrorKind.Transient)] // rate limited: try again, never give up on the visit
    [InlineData(401, null, ErrorKind.Auth)]
    [InlineData(400, "23514", ErrorKind.Permanent)]
    [InlineData(403, "42501", ErrorKind.Permanent)]
    [InlineData(404, "PGRST202", ErrorKind.Transient)] // server function not installed yet
    [InlineData(400, "57014", ErrorKind.Transient)] // statement timeout
    public void SortsServerAnswersIntoRetryOrGiveUp(int status, string? code, ErrorKind expected) =>
        Assert.Equal(expected, ErrorClassifier.Classify(new ApiResult(status, null, code, "message")));
}
