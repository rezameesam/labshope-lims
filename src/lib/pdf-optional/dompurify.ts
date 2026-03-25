const dompurifyStub = {
  sanitize() {
    throw new Error("dompurify support is disabled in this app build.");
  },
};

export default dompurifyStub;
