/* The entry point. No logic here. */
import { handle } from './platform/router.js';

export default { fetch: (req, env, exec) => handle(req, env, exec) };
