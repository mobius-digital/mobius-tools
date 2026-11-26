/* Registers the kernel's own statements once, for every kernel file that reads the database. */
import { register } from './db.js';
import { queries } from './queries.js';

register('platform', queries);
