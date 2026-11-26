/* What the kernel keeps about a request that a handler must not reach: the raw request, the bindings,
   a door with another scope. Kernel files only. A group never imports this file (the build checks). */
const BAG = new WeakMap();

export function stash(ctx, parts) { BAG.set(ctx, parts); }

export function inner(ctx) {
  const parts = BAG.get(ctx);
  if (!parts) throw new Error('this is not a request the kernel built');
  return parts;
}
