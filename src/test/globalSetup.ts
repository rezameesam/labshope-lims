/**
 * The app is for India and formats times in IST. Pin the test process to that timezone so results
 * do not depend on where the tests run (a developer laptop in India vs. a UTC CI runner).
 */
export default function setup() {
  process.env.TZ = "Asia/Kolkata";
}
