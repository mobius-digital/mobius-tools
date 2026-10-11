// The Kept spot's arithmetic. The bites must take the balance exactly to the
// kept number, or the hero number lies, so the render refuses to start.
import { keptNumbers } from '../../brand';

const sum = keptNumbers.bites.reduce((a, b) => a + b.amount, 0);
if (keptNumbers.inBank - sum !== keptNumbers.kept) {
  throw new Error(
    `brand.ts: the bites add up to ${sum}, but inBank (${keptNumbers.inBank}) minus kept (${keptNumbers.kept}) is ${
      keptNumbers.inBank - keptNumbers.kept
    }. Fix the amounts so the number on screen is true.`,
  );
}

// The balance after each bite: [18400, 14200, 7300, 4800, 3120].
export const balances = keptNumbers.bites.reduce<number[]>(
  (acc, b) => [...acc, acc[acc.length - 1] - b.amount],
  [keptNumbers.inBank],
);
