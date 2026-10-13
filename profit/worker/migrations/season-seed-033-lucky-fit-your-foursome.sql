-- Lucky Golf, 2026-10-13 (Cole, via the Lucky website chat): giveaway named Fit Your Foursome, prize changed,
-- entries Oct 14 to Nov 16 (draw Nov 17), entry rules, buy-now code, and NO AI-GENERATED PRODUCTS in its creative.
-- Brief: C:/Users/wetzl/Lucky Golf/Website/v9/giveaway/CREATIVE-BRIEF.md. Run once.
UPDATE p_season_phase SET
 name='Fit Your Foursome giveaway',
 end='2026-11-16',
 offer='Fit Your Foursome: one winner plus the 3 buddies they pick. Each gets 3 Carver 02 Gold wedges, an Eclipse putter (mallet or blade), the Stryker hybrid, 2 Classic Polos and 2 hats. Enter free by Nov 16.',
 detail='Approved Oct 13 (Cole). About $927 a set, about $3,700 total, kept under $5k (no NY/FL registration), no gift card. Entries Oct 14 to Nov 16, 11:59 pm MT; draw Nov 17. Email = 1 entry; phone with text opt-in = +2; each buddy who enters through your personal link = +3. Instagram follows and tags earn nothing (reach only, "enter at the link in bio"). Entrants get code FOURSOME: free hat with any club, once per customer, ends Nov 16 MT; a winner is refunded for prize items they bought. Page luckygolf.com/pages/giveaway (template in theme v4.7; page unpublished until Cole says go). Entries to Klaviyo list WgdRYU with gw_code/gw_ref and a "Giveaway Entered" event; draw method in Website/v9/giveaway/DRAW.md. CREATIVE: no AI-generated products (Cole, Oct 13); real cutouts and real photos only (Air library, Products > By SKU). The prize putter is the gold Eclipse; the black Eclipse stays out of frame until Nov 9. Starter ads in Website/v9/giveaway/ads/out. Hero shot (four full bags on the first tee) not shot yet.'
WHERE act_id='brand_lucky_golf' AND season='2026' AND key='early';
