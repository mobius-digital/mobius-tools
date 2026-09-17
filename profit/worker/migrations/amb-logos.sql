-- Ambassadors: brand logos for the creator link header and the brief PDF (2026-09-17).
-- Each is the store's own header logo on Shopify's CDN (allows cross-origin reads).
UPDATE p_amb_brand SET logo_url = 'https://darteegolf.com/cdn/shop/files/logo-primary.webp?v=1784015313&width=600' WHERE slug = 'dartee';
UPDATE p_amb_brand SET logo_url = 'https://grunkdolfer.com/cdn/shop/files/GD_Cursive-1.png?v=1640394866&width=620' WHERE slug = 'grunk-dolfer';
UPDATE p_amb_brand SET logo_url = 'https://partypatch.com/cdn/shop/files/DF315C07-B387-465B-9D89-8893A1B631E8.png?v=1686841882' WHERE slug = 'party-patch';
-- Dartee's accent matched to its teal logo, darkened for white button text.
UPDATE p_amb_brand SET accent = '#0F7F73', season_json = json_set(season_json, '$.color', '#0F7F73') WHERE slug = 'dartee';
