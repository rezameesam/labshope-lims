const canvgStub = {
  fromString() {
    return Promise.reject(new Error("canvg support is disabled in this app build."));
  },
};

export default canvgStub;
