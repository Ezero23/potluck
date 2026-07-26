// Keep Node-only startup dependencies out of instrumentation's edge/client
// compilation graph. Importing this module runs the guarded bootstrap side
// effect once for each Node.js server process.
import "./shared/services/bootstrap.js";
